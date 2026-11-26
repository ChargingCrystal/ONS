import { PGlite } from '@electric-sql/pglite'
import { createClient } from '@supabase/supabase-js'
import { createApp, getValidatedQuery, toWebHandler } from 'h3'
import { afterAll, beforeAll, expect, test, vi } from 'vitest'
import { result } from '../server/utils/backend'

const cases = [
  ['*', 'A * night'],
  ['%', 'A 100% night'],
  ['_', 'A film_night'],
  ['\\', 'A path\\night'],
  [',', 'A dinner, then a film'],
  ['(', 'A (matinee) film'],
  [')', 'A (matinee) film'],
  ['"', 'A "classic" film'],
  ["'", "A director's film"],
  ['dInNeR', 'A dinner, then a film'],
] as const

const db = new PGlite()
let handle: ReturnType<typeof toWebHandler>

beforeAll(async () => {
  await db.exec('create table dates (title text not null)')
  const titles = new Set(cases.map(([, title]) => title))
  for (const title of titles) {
    await db.query('insert into dates values ($1)', [title])
  }
  await db.query('insert into dates values ($1)', ['A board game'])

  const client = createClient('http://postgrest.test', 'public-key', {
    global: {
      fetch: async input => {
        const filter = new URL(String(input)).searchParams.get('title')
        if (!filter) throw new Error('Expected a title filter')
        const separator = filter.indexOf('.')
        const operator = filter.slice(0, separator)
        const pattern = filter.slice(separator + 1)
        // PostgREST translates the asterisk alias for ilike before passing the value to PostgreSQL.
        if (operator === 'ilike') {
          const { rows } = await db.query('select title from dates where title ilike $1', [pattern.replaceAll('*', '%')])
          return Response.json(rows)
        }
        if (operator === 'imatch') {
          const { rows } = await db.query('select title from dates where title ~* $1', [pattern])
          return Response.json(rows)
        }
        throw new Error('Unexpected PostgREST operator: ' + operator)
      },
    },
  })
  vi.stubGlobal('getValidatedQuery', getValidatedQuery)
  vi.stubGlobal('client', () => client)
  vi.stubGlobal('result', result)
  const { default: route } = await import('../server/api/dates/index.get')
  handle = toWebHandler(createApp().use('/api/dates', route))
})

afterAll(async () => {
  vi.unstubAllGlobals()
  await db.close()
})

test.each(cases)('matches %j as a literal case-insensitive substring', async (term, title) => {
  const url = new URL('http://ons.test/api/dates')
  url.searchParams.set('q', term)
  const response = await handle(new Request(url))
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual([{ title }])
})
