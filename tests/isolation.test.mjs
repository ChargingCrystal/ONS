import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeEach, test } from 'vitest'
import { DATE_CATEGORIES } from '../shared/date-categories'

let pg
let users

const migrations = new URL('../supabase/migrations/', import.meta.url)

beforeEach(async () => {
  pg = new PGlite()
  // Model the Supabase-owned tables and roles that the project migrations depend on.
  await pg.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
    grant usage on schema auth to authenticated;
    insert into auth.users select gen_random_uuid() from generate_series(1, 3);

    create schema storage;
    create table storage.buckets (
      id text primary key,
      name text not null,
      public boolean not null default false,
      file_size_limit bigint,
      allowed_mime_types text[]
    );
    create table storage.objects (
      bucket_id text not null references storage.buckets(id),
      name text not null,
      metadata jsonb,
      owner_id text,
      created_at timestamptz not null default now(),
      primary key (bucket_id, name)
    );
    create function storage.foldername(name text) returns text[] language sql immutable as $$
      select parts[1:cardinality(parts) - 1]
      from (select string_to_array(name, '/') as parts) as path
    $$;
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated;
    grant select on storage.buckets to authenticated;
    grant select, insert, delete on storage.objects to authenticated;

    create schema realtime;
    create table realtime.messages (
      topic text not null,
      extension text not null,
      event text,
      payload jsonb,
      private boolean not null default true
    );
    alter table realtime.messages enable row level security;
    grant usage on schema realtime to anon, authenticated;
    grant select, insert on realtime.messages to anon, authenticated;
    create function realtime.topic() returns text language sql stable as
      $$select nullif(current_setting('realtime.topic', true), '')$$;
    create function realtime.send(payload jsonb, event text, topic text, private boolean)
    returns void language sql as $$
      insert into realtime.messages(payload, event, topic, private, extension)
      values (payload, event, topic, private, 'broadcast')
    $$;
  `)
  users = (await pg.query('select id from auth.users order by id')).rows
}, 15_000)

async function migrate(seedLegacyRows) {
  const migrationFiles = (await readdir(migrations))
    .filter(name => /^\d+_.+\.sql$/.test(name))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
  for (const filename of migrationFiles) {
    await pg.exec(await readFile(new URL(filename, migrations), 'utf8'))
    if (filename === '002_private_gallery.sql' && seedLegacyRows) {
      await seedLegacyRows()
    }
  }

  await pg.exec('set role authenticated')
}

afterEach(async () => {
  await pg.close()
})

const login = i => pg.query("select set_config('request.jwt.claim.sub',$1,false)", [users[i].id])

const userTopic = index => 'ons:user:' + users[index].id
const setTopic = topic => pg.query("select set_config('realtime.topic',$1,false)", [topic])

async function pairForRealtime() {
  await migrate()
  await login(0)
  await pg.query('select create_space()')
  const { invite } = (await pg.query('select invite from spaces')).rows[0]
  await login(1)
  await pg.query('select join_space($1)', [invite])
  await login(2)
  await pg.query('select create_space()')
  await login(0)
}

async function assertBroadcast(event, recipients) {
  await pg.exec('reset role')
  const { rows } = await pg.query('select topic, event, payload, private from realtime.messages order by topic')
  assert.deepEqual(rows, recipients.map(index => ({ topic: userTopic(index), event, payload: {}, private: true })))
  await pg.exec('delete from realtime.messages; set role authenticated')
}

test('Realtime grants only owner access to private Broadcast topics and denies client sends', async () => {
  await migrate()
  await pg.exec('reset role')
  await pg.query("insert into realtime.messages(topic, extension) values ($1, 'broadcast'), ($1, 'presence')", [userTopic(0)])
  await pg.exec('set role authenticated')
  await login(0)
  await setTopic(userTopic(0))
  assert.deepEqual((await pg.query('select extension from realtime.messages')).rows, [{ extension: 'broadcast' }])
  await assert.rejects(pg.query("insert into realtime.messages(topic, extension) values ($1, 'broadcast')", [userTopic(0)]), { code: '42501' })
  await setTopic(userTopic(1))
  assert.deepEqual((await pg.query('select extension from realtime.messages')).rows, [])
  await login(2)
  await setTopic(userTopic(0))
  assert.deepEqual((await pg.query('select extension from realtime.messages')).rows, [])
  await pg.exec('set role anon')
  assert.deepEqual((await pg.query('select extension from realtime.messages')).rows, [])
})

test('Realtime emits empty private refresh signals for date, location and photo changes to both partners only', async () => {
  await pairForRealtime()
  for (const sql of [
    "insert into dates(title, category) values ('Private title', 'movie')",
    "update dates set status = 'done'",
    'delete from dates',
  ]) {
    await pg.query(sql)
    await assertBroadcast('dates.changed', [0, 1])
  }
  for (const sql of [
    'insert into locations(lat, lon) values (52, 12)',
    'update locations set lat = 53',
    'select delete_my_location()',
  ]) {
    await pg.query(sql)
    await assertBroadcast('locations.changed', [0, 1])
  }

  const { uploadId, path } = (await pg.query("select reserve_photo_upload('image/png', 10) as data")).rows[0].data
  await pg.query("insert into storage.objects(bucket_id, name, metadata) values ('gallery', $1, $2)", [path, { size: 10, mimetype: 'image/png' }])
  await assertBroadcast('photos.changed', [])
  await pg.query('select confirm_photo($1)', [uploadId])
  await assertBroadcast('photos.changed', [0, 1])
  await pg.exec('reset role')
  await pg.query('update photos set uploaded_by = null where id = $1', [uploadId])
  await assertBroadcast('photos.changed', [0, 1])
  await pg.query("delete from storage.objects where bucket_id = 'gallery' and name = $1", [path])
  await pg.query('select forget_photo($1)', [uploadId])
  await assertBroadcast('photos.changed', [0, 1])
})

test('Realtime stops routing space changes to a former partner and rolls back aborted notifications', async () => {
  await pairForRealtime()
  await login(1)
  await pg.query('insert into locations(lat, lon) values (52, 12)')
  await assertBroadcast('locations.changed', [0, 1])
  await pg.query('select leave_space()')
  await assertBroadcast('locations.changed', [0])

  await login(0)
  await pg.exec("begin; insert into dates(title, category) values ('Canceled', 'movie'); rollback")
  await assertBroadcast('dates.changed', [])
  await pg.query("insert into dates(title, category) values ('New plan', 'movie')")
  await assertBroadcast('dates.changed', [0])
})

test('a user cannot forge notifications by reusing the Realtime trigger on a temporary table', async () => {
  await pairForRealtime()
  await pg.exec(`
    create temp table spoof(space_id uuid);
    create trigger forge_broadcast after insert on spoof
      for each row execute function public.broadcast_space_change();
  `)
  await assert.rejects(pg.query('insert into spoof values (public.my_space())'), { code: '42501' })
  await assertBroadcast('spoof.changed', [])
})

test('reserves the maximum upload size before allocating signed paths', async () => {
  await migrate()
  await login(0)
  await pg.query('select create_space()')
  const { data: initial } = (await pg.query("select reserve_photo_upload('image/png', 1) as data")).rows[0]
  for (let index = 1; index < 10; index++) {
    await pg.query("select reserve_photo_upload('image/png', 1)")
  }
  await assert.rejects(pg.query("select reserve_photo_upload('image/png', 1)"), { code: 'PT409' })
  await pg.query("insert into storage.objects(bucket_id, name, metadata) values ('gallery', $1, $2)", [
    initial.path, { size: 1, mimetype: 'image/png' },
  ])
  await pg.query('select confirm_photo($1)', [initial.uploadId])
  await pg.query("delete from storage.objects where bucket_id = 'gallery' and name = $1", [initial.path])
  await pg.query('select forget_photo($1)', [initial.uploadId])
  await assert.rejects(pg.query("select reserve_photo_upload('image/png', 1)"), { code: 'PT409' })
  await pg.exec('reset role')
  await pg.query("update photo_upload_reservations set hold_until = now() - interval '1 second' where id = $1", [initial.uploadId])
  await pg.exec('set role authenticated')
  await pg.query("select reserve_photo_upload('image/png', 1)")
  await login(2)
  await pg.query('select create_space()')
  await pg.query("select reserve_photo_upload('image/png', 1)")
})

test('confirms stored photo metadata at most once and isolates foreign spaces', async () => {
  await migrate()
  await login(0)
  const { id: space } = (await pg.query('select create_space() as id')).rows[0]
  const { uploadId, path } = (await pg.query("select reserve_photo_upload('image/png', 10) as data")).rows[0].data
  assert.equal(path, space + '/' + uploadId)
  await assert.rejects(pg.query('select confirm_photo($1)', [uploadId]), { code: 'PT404' })
  await pg.query("insert into storage.objects(bucket_id, name, metadata) values ('gallery', $1, $2)", [path, { size: 11, mimetype: 'image/png' }])
  await assert.rejects(pg.query('select confirm_photo($1)', [uploadId]), { code: 'PT400' })
  await pg.exec('reset role')
  await pg.query('update storage.objects set metadata = $2 where name = $1', [path, { size: 10, mimetype: 'image/png' }])
  await pg.exec('set role authenticated')
  const { photo } = (await pg.query('select confirm_photo($1) as photo', [uploadId])).rows[0]
  assert.equal(photo.id, uploadId)
  assert.equal(photo.size, 10)
  assert.deepEqual((await pg.query('select confirm_photo($1) as photo', [uploadId])).rows[0].photo, photo)
  await login(2)
  await pg.query('select create_space()')
  assert.deepEqual((await pg.query('select id from photos')).rows, [])
  await assert.rejects(pg.query('select confirm_photo($1)', [uploadId]), { code: 'PT404' })
  await assert.rejects(pg.query('select forget_photo($1)', [uploadId]), { code: 'PT404' })
})

test('preserves compatible legacy gallery objects and charges incompatible objects to the quota', async () => {
  const id = '11111111-1111-4111-8111-111111111111'
  let path
  await migrate(async () => {
    await pg.exec('set role authenticated')
    await login(0)
    const { space } = (await pg.query('select create_space() as space')).rows[0]
    path = space + '/' + id
    await pg.query("insert into storage.objects(bucket_id, name, metadata, owner_id) values ('gallery', $1, $2, $3)", [
      path, { size: 10, mimetype: 'image/png' }, users[0].id,
    ])
    await pg.query("insert into storage.objects(bucket_id, name) values ('gallery', $1)", [space + '/legacy-missing-metadata'])
    await pg.exec('reset role')
  })
  await login(0)
  assert.deepEqual((await pg.query('select id, path, size, uploaded_by from photos')).rows, [
    { id, path, size: 10, uploaded_by: users[0].id },
  ])
  for (let index = 0; index < 8; index++) {
    await pg.query("select reserve_photo_upload('image/png', 1)")
  }
  await assert.rejects(pg.query("select reserve_photo_upload('image/png', 1)"), { code: 'PT409' })
})

test('profiles are visible to the owner and current partner, with owner-only writes', async () => {
  await migrate()
  await login(0)
  await pg.query("insert into profiles(display_name) values ('Alex')")
  await pg.query('select create_space()')
  const { invite } = (await pg.query('select invite from spaces')).rows[0]
  await login(1)
  await pg.query('select join_space($1)', [invite])
  assert.deepEqual((await pg.query('select display_name from profiles')).rows, [{ display_name: 'Alex' }])
  const { data } = (await pg.query('select space_details() as data')).rows[0]
  assert.deepEqual(data.members, [
    { user_id: users[0].id, slot: 1, display_name: 'Alex' },
    { user_id: users[1].id, slot: 2, display_name: null },
  ])
  assert.deepEqual((await pg.query("update profiles set display_name = 'Changed' returning display_name")).rows, [])
  await assert.rejects(pg.query("insert into profiles(display_name) values (' Sam ')"), { code: '23514' })
  await pg.query("insert into profiles(display_name) values ('Sam')")
  await pg.query("insert into profiles(display_name) values ('Sammy') on conflict (user_id) do update set display_name = excluded.display_name")
  assert.deepEqual((await pg.query('select my_profile() as data')).rows[0].data, { display_name: 'Sammy' })
  await login(2)
  assert.deepEqual((await pg.query('select display_name from profiles')).rows, [])
  await pg.exec('set role anon')
  await assert.rejects(pg.query('select display_name from profiles'), { code: '42501' })
})

test('a sole member can rotate the invite and a full space cannot issue another', async () => {
  await migrate()
  await login(0)
  await assert.rejects(pg.query('select regenerate_invite()'), { code: 'PT403' })
  await pg.query('select create_space()')
  const { invite: oldInvite } = (await pg.query('select invite from spaces')).rows[0]
  const { invite } = (await pg.query('select regenerate_invite() as invite')).rows[0]
  assert.notEqual(invite, oldInvite)
  await login(1)
  await assert.rejects(pg.query('select join_space($1)', [oldInvite]), { code: '22023' })
  await pg.query('select join_space($1)', [invite])
  await assert.rejects(pg.query('select regenerate_invite()'), { code: 'PT409' })
})

test('leaving removes membership and location and lets the remaining partner re-invite', async () => {
  await migrate()
  await login(0)
  await pg.query('select create_space()')
  const { invite } = (await pg.query('select invite from spaces')).rows[0]
  await pg.query("insert into dates(title, category) values ('Shared walk', 'walk')")
  const { path: photo } = (await pg.query("select reserve_photo_upload('image/png', 10) as data")).rows[0].data
  await pg.query("insert into storage.objects(bucket_id, name) values ('gallery', $1)", [photo])
  await pg.query('insert into locations(lat, lon) values (52, 12)')
  await pg.query("insert into profiles(display_name) values ('Alex')")
  await login(1)
  await pg.query('select join_space($1)', [invite])
  await pg.query('insert into locations(lat, lon) values (53, 13)')
  await login(0)
  await pg.query('select leave_space()')
  await pg.query('select leave_space()')
  assert.deepEqual((await pg.query('select title from dates')).rows, [])
  assert.deepEqual((await pg.query('select name from storage.objects')).rows, [])
  await login(1)
  assert.deepEqual((await pg.query('select title from dates')).rows, [{ title: 'Shared walk' }])
  assert.deepEqual((await pg.query('select name from storage.objects')).rows, [{ name: photo }])
  assert.deepEqual((await pg.query('select user_id from locations')).rows, [{ user_id: users[1].id }])
  assert.deepEqual((await pg.query('select display_name from profiles')).rows, [])
  const { invite: replacement } = (await pg.query('select regenerate_invite() as invite')).rows[0]
  await login(2)
  await pg.query('select join_space($1)', [replacement])
  await pg.query('select leave_space()')
  await login(1)
  const { invite: finalInvite } = (await pg.query('select regenerate_invite() as invite')).rows[0]
  await pg.query('select leave_space()')
  await login(2)
  await assert.rejects(pg.query('select join_space($1)', [finalInvite]), { code: '22023' })
})

test('a user can delete only their own location and can repeat the deletion', async () => {
  await migrate()
  await login(0)
  await pg.query('select create_space()')
  const { invite } = (await pg.query('select invite from spaces')).rows[0]
  await pg.query('insert into locations(lat, lon) values (52, 12)')
  await login(1)
  await pg.query('select join_space($1)', [invite])
  await pg.query('insert into locations(lat, lon) values (53, 13)')
  assert.deepEqual((await pg.query('delete from locations where user_id = $1 returning user_id', [users[0].id])).rows, [])
  await pg.query('select delete_my_location()')
  await pg.query('select delete_my_location()')
  assert.deepEqual((await pg.query('select user_id from locations')).rows, [{ user_id: users[0].id }])
})

test('operator Auth deletion removes personal rows while the surviving partner can pair again', async () => {
  await migrate()
  await login(0)
  await pg.query('select create_space()')
  const { invite } = (await pg.query('select invite from spaces')).rows[0]
  await pg.query("insert into profiles(display_name) values ('Alex')")
  await pg.query('insert into locations(lat, lon) values (52, 12)')
  await login(1)
  await pg.query('select join_space($1)', [invite])
  await pg.exec('reset role')
  await pg.query('delete from auth.users where id = $1', [users[0].id])
  for (const table of ['profiles', 'members', 'locations']) {
    assert.deepEqual((await pg.query('select user_id from ' + table + ' where user_id = $1', [users[0].id])).rows, [])
  }
  await pg.exec('set role authenticated')
  const { invite: replacement } = (await pg.query('select regenerate_invite() as invite')).rows[0]
  await login(2)
  await pg.query('select join_space($1)', [replacement])
  await pg.query('select leave_space()')
  await login(1)
  const { invite: finalInvite } = (await pg.query('select regenerate_invite() as invite')).rows[0]
  await pg.exec('reset role')
  await pg.query('delete from auth.users where id = $1', [users[1].id])
  await pg.exec('set role authenticated')
  await login(2)
  await assert.rejects(pg.query('select join_space($1)', [finalInvite]), { code: '22023' })
})

test('pairing, one-time invite, shared dates, private locations and outsider isolation', async () => {
  await migrate()
  await login(0)
  await pg.query('select create_space()')
  const { invite } = (await pg.query('select invite from spaces')).rows[0]
  await pg.query("insert into dates(title,category) values('Cinema','movie')")
  await pg.query('insert into locations(lat,lon) values(52,12)')
  await login(1)
  await pg.query('select join_space($1)', [invite])
  assert.equal((await pg.query('select title from dates')).rows[0].title, 'Cinema')
  assert.equal((await pg.query('update locations set lat=0 returning *')).rows.length, 0)
  await pg.query("update dates set status='done'")
  assert.equal((await pg.query('select dashboard() as data')).rows[0].data.categoriesByMonth[0].total, 1)
  await assert.rejects(pg.query('select create_space()'))
  await login(2)
  await assert.rejects(pg.query('select join_space($1)', [invite]))
  await pg.query('select create_space()')
  for (const table of ['dates', 'locations']) {
    assert.equal((await pg.query('select * from ' + table)).rows.length, 0)
  }
  assert.equal((await pg.query('select * from members')).rows.length, 1)
  assert.equal((await pg.query('select * from spaces')).rows.length, 1)
})

test('a partner can read the other partner’s location', async () => {
  await migrate()
  await login(0)
  await pg.query('select create_space()')
  const { invite } = (await pg.query('select invite from spaces')).rows[0]
  await pg.query('insert into locations(lat, lon) values (52, 12)')

  await login(1)
  await pg.query('select join_space($1)', [invite])
  const { rows } = await pg.query('select user_id, lat, lon from locations')
  assert.deepEqual(rows, [{ user_id: users[0].id, lat: 52, lon: 12 }])
})

test('dashboard returns the earliest upcoming planned meeting in the caller’s space', async () => {
  await migrate()
  await login(1)
  await pg.query('select create_space()')
  await pg.query("insert into dates(title, category, meeting_at) values ('Other space', 'movie', now() + interval '1 hour')")

  await login(0)
  await pg.query('select create_space()')
  await pg.query(`insert into dates(title, category, status, meeting_at) values
    ('Past', 'movie', 'planned', now() - interval '1 day'),
    ('Done', 'movie', 'done', now() + interval '2 hours'),
    ('Next', 'movie', 'planned', now() + interval '1 day'),
    ('Later', 'movie', 'planned', now() + interval '2 days')`)
  const { data } = (await pg.query('select dashboard() as data')).rows[0]
  assert.equal(data.nextMeeting.title, 'Next')
})

test('the private gallery allows shared access and enforces space boundaries for reads, uploads and deletions', async () => {
  await migrate()
  await login(0)
  const { id } = (await pg.query('select create_space() as id')).rows[0]
  const { invite } = (await pg.query('select invite from spaces')).rows[0]
  assert.deepEqual((await pg.query("select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'gallery'")).rows, [
    { public: false, file_size_limit: 5242880, allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp'] }
  ])
  const { path: photo } = (await pg.query("select reserve_photo_upload('image/png', 10) as data")).rows[0].data
  const insertPhoto = name => pg.query("insert into storage.objects(bucket_id, name) values ('gallery', $1)", [name])
  const listPhotos = () => pg.query("select name from storage.objects where bucket_id = 'gallery'")
  const removePhoto = () => pg.query("delete from storage.objects where bucket_id = 'gallery' and name = $1 returning name", [photo])
  await assert.rejects(insertPhoto(id + '/11111111-1111-4111-8111-111111111111'), { code: '42501' })
  await insertPhoto(photo)

  await login(2)
  await pg.query('select create_space()')
  assert.deepEqual((await listPhotos()).rows, [])
  await assert.rejects(insertPhoto(id + '/22222222-2222-4222-8222-222222222222'), { code: '42501' })
  assert.deepEqual((await removePhoto()).rows, [])

  await login(1)
  await pg.query('select join_space($1)', [invite])
  assert.deepEqual((await listPhotos()).rows, [{ name: photo }])
  assert.deepEqual((await removePhoto()).rows, [{ name: photo }])
  assert.deepEqual((await listPhotos()).rows, [])
})

test('migrates legacy dates and combines localized aliases in the dashboard', async () => {
  const mapping = [
    ['dinner', 'dinner'],
    [' Abendessen ', 'dinner'],
    ['AVONDETEN', 'dinner'],
    ['movie', 'movie'],
    ['film', 'movie'],
    ['cinema', 'movie'],
    ['\tKiNo\n', 'movie'],
    ['bioscoop', 'movie'],
    ['walk', 'walk'],
    ['Spaziergang', 'walk'],
    ['wandeling', 'walk'],
    ['trip', 'trip'],
    ['Ausflug', 'trip'],
    ['uitstapje', 'trip'],
    ['video_call', 'video_call'],
    ['video call', 'video_call'],
    ['Videoanruf', 'video_call'],
    ['videobellen', 'video_call'],
    ['game', 'game'],
    ['Spiel', 'game'],
    ['spel', 'game'],
    ['other', 'other'],
    ['Unknown legacy category', 'other'],
  ]
  const legacyDates = mapping.map(([category], index) => ({
    title: 'Legacy date ' + String(index).padStart(2, '0'),
    category,
  }))
  await migrate(async () => {
    await pg.exec('set role authenticated')
    await login(0)
    await pg.query('select create_space()')
    for (const { title, category } of legacyDates) {
      await pg.query("insert into dates(title, category, meeting_at) values ($1, $2, '2099-01-01T00:00:00Z')", [title, category])
    }
    await pg.exec('reset role')
  })

  await login(0)
  const { rows } = await pg.query('select title, category from dates order by title')
  assert.deepEqual(rows, legacyDates.map(({ title }, index) => ({ title, category: mapping[index][1] })))
  const { data } = (await pg.query('select dashboard() as data')).rows[0]
  assert.equal(data.categoriesByMonth.find(({ category }) => category === 'movie')?.total, 5)
  assert.ok(mapping.some(([, category]) => category === data.nextMeeting.category))
})

test('Postgres rejects unsupported categories on insert and update', async () => {
  await migrate()
  await login(0)
  await pg.query('select create_space()')
  const { rows } = await pg.query(`
    insert into dates(title, category)
    select 'Date ' || category, category from unnest($1::text[]) as category
    returning category
  `, [DATE_CATEGORIES])
  assert.deepEqual(rows.map(row => row.category).sort(), [...DATE_CATEGORIES].sort())
  await assert.rejects(pg.query("insert into dates(title, category) values ('Cinema', 'cinema')"), { code: '23514' })
  await assert.rejects(pg.query("update dates set category = 'Movie'"), { code: '23514' })
})
