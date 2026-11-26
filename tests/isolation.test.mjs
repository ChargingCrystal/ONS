import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeEach, test } from 'vitest'

let pg
let users

beforeEach(async () => {
    pg = new PGlite()
    await pg.exec(`create schema auth; create role anon; create role authenticated;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
      $$select current_setting('request.jwt.claim.sub')::uuid$$;
      grant usage on schema auth to authenticated;
      insert into auth.users select gen_random_uuid() from generate_series(1,3);`)
    users = (await pg.query('select id from auth.users order by id')).rows
    await pg.exec(await readFile(new URL('../supabase/migrations/001_couple_planner.sql',import.meta.url),'utf8'))
    await pg.exec('set role authenticated')
}, 15_000)

afterEach(async () => {
  await pg.close()
})

const login = i => pg.query("select set_config('request.jwt.claim.sub',$1,false)", [users[i].id])

test('pairing, one-time invite, shared dates, private locations and outsider isolation', async () => {
    await login(0)
    await pg.query('select create_space()')
    const {invite} = (await pg.query('select invite from spaces')).rows[0]
    await pg.query("insert into dates(title,category) values('Cinema','film')")
    await pg.query('insert into locations(lat,lon) values(52,12)')
    await login(1)
    await pg.query('select join_space($1)',[invite])
    assert.equal((await pg.query('select title from dates')).rows[0].title,'Cinema')
    assert.equal((await pg.query('update locations set lat=0 returning *')).rows.length,0)
    await pg.query("update dates set status='done'")
    assert.equal((await pg.query('select dashboard() as data')).rows[0].data.categoriesByMonth[0].total,1)
    await assert.rejects(pg.query('select create_space()'))
    await login(2)
    await assert.rejects(pg.query('select join_space($1)',[invite]))
    await pg.query('select create_space()')
    for (const table of ['dates','locations']) assert.equal((await pg.query('select * from '+table)).rows.length,0)
    assert.equal((await pg.query('select * from members')).rows.length,1)
    assert.equal((await pg.query('select * from spaces')).rows.length,1)
})

test('a partner can read the other partner’s location', async () => {
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
