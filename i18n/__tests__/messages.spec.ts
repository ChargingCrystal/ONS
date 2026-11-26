import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

// German is the default language, so it defines which keys must exist.
const translations = ['en', 'nl'] as const

// Turns { nav: { home: 'Start' } } into a map from "nav.home" to "Start".
function flatten(node: object, prefix = ''): Map<string, unknown> {
  const result = new Map<string, unknown>()
  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (value !== null && typeof value === 'object') {
      for (const [childPath, childValue] of flatten(value, path)) {
        result.set(childPath, childValue)
      }
    }
    else {
      result.set(path, value)
    }
  }
  return result
}

function load(locale: string) {
  const file = new URL(`../locales/${locale}.json`, import.meta.url)
  return flatten(JSON.parse(readFileSync(file, 'utf8')))
}

// Named values such as {name} inside a message.
function placeholders(message: unknown) {
  return [...String(message).matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort()
}

describe('message files', () => {
  test.each(['de', ...translations])('%s has a non-empty text for every key', (locale) => {
    const messages = load(locale)
    expect(messages.size).toBeGreaterThan(0)
    for (const [key, value] of messages) {
      expect(typeof value, key).toBe('string')
      expect(String(value).trim(), key).not.toBe('')
    }
  })

  test.each(translations)('%s has exactly the same keys as de', (locale) => {
    expect([...load(locale).keys()].sort()).toEqual([...load('de').keys()].sort())
  })

  test.each(translations)('%s uses the same placeholders as de', (locale) => {
    const messages = load(locale)
    for (const [key, german] of load('de')) {
      expect(placeholders(messages.get(key)), key).toEqual(placeholders(german))
    }
  })
})
