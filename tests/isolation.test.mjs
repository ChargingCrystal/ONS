import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeEach, test } from 'vitest'

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
  `)
  users = (await pg.query('select id from auth.users order by id')).rows
}, 15_000)

async function migrate(seedLegacyDates) {
  const migrationFiles = (await readdir(migrations))
    .filter(name => /^\d+_.+\.sql$/.test(name))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
  for (const filename of migrationFiles) {
    await pg.exec(await readFile(new URL(filename, migrations), 'utf8'))
    if (filename === '002_private_gallery.sql' && seedLegacyDates) {
      await seedLegacyDates()
    }
  }

  await pg.exec('set role authenticated')
}

afterEach(async () => {
  await pg.close()
})

const login = i => pg.query("select set_config('request.jwt.claim.sub',$1,false)", [users[i].id])

test('pairing, one-time invite, shared dates, private locations and outsider isolation', async () => {
  await migrate()
  await login(0)
  await pg.query('select create_space()')
  const { invite } = (await pg.query('select invite from spaces')).rows[0]
  await pg.query("insert into dates(title,category) values('Cinema','film')")
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
  await pg.query("insert into dates(title, category, meeting_at) values ('Other space', 'film', now() + interval '1 hour')")

  await login(0)
  await pg.query('select create_space()')
  await pg.query(`insert into dates(title, category, status, meeting_at) values
    ('Past', 'film', 'planned', now() - interval '1 day'),
    ('Done', 'film', 'done', now() + interval '2 hours'),
    ('Next', 'film', 'planned', now() + interval '1 day'),
    ('Later', 'film', 'planned', now() + interval '2 days')`)
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
  const photo = id + '/11111111-1111-4111-8111-111111111111'
  const insertPhoto = name => pg.query("insert into storage.objects(bucket_id, name) values ('gallery', $1)", [name])
  const listPhotos = () => pg.query("select name from storage.objects where bucket_id = 'gallery'")
  const removePhoto = () => pg.query("delete from storage.objects where bucket_id = 'gallery' and name = $1 returning name", [photo])
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
  await pg.query("insert into dates(title, category) values ('Cinema', 'movie')")
  await assert.rejects(pg.query("insert into dates(title, category) values ('Cinema', 'cinema')"), { code: '23514' })
  await assert.rejects(pg.query("update dates set category = 'Movie'"), { code: '23514' })
})
