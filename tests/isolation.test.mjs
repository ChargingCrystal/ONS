import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

test('pairing, one-time invite, shared dates, private locations and outsider isolation', async () => {
  const pg = new PGlite()
  try {
    await pg.exec(`create schema auth; create role anon; create role authenticated;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
      $$select current_setting('request.jwt.claim.sub')::uuid$$;
      grant usage on schema auth to authenticated;
      insert into auth.users select gen_random_uuid() from generate_series(1,3);`)
    const users = (await pg.query('select id from auth.users')).rows
    await pg.exec(await readFile(new URL('../supabase/migrations/001_couple_planner.sql',import.meta.url),'utf8'))
    const login = async i => pg.query("select set_config('request.jwt.claim.sub',$1,false)",[users[i].id])
    await pg.exec('set role authenticated')
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
  } finally { await pg.close() }
})
