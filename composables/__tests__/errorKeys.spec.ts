import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { apiErrorCodeSchema } from '../../shared/api-errors'
import { apiErrorKey, authErrorKey } from '../errorKeys'

const german = JSON.parse(readFileSync(new URL('../../i18n/locales/de.json', import.meta.url), 'utf8'))

// Finds the text of a key such as "errors.api.no_space". messages.spec.ts covers en and nl.
function textFor(key: string): unknown {
  return key.split('.').reduce<any>((node, part) => node?.[part], german)
}

// Codes from Supabase Auth, plus "network" and "unavailable" from the session store.
const authCodes = [
  'invalid_credentials',
  'email_not_confirmed',
  'user_already_exists',
  'email_exists',
  'email_address_invalid',
  'weak_password',
  'signup_disabled',
  'email_provider_disabled',
  'provider_disabled',
  'oauth_provider_not_supported',
  'validation_failed',
  'over_request_rate_limit',
  'over_email_send_rate_limit',
  'network',
  'unavailable',
]

describe('apiErrorKey', () => {
  // The list comes from the backend contract, so a new code makes this test fail.
  test.each(apiErrorCodeSchema.options)('the backend code %s has its own message', (code) => {
    const key = apiErrorKey(code)
    expect(key).not.toBe('errors.unexpected')
    expect(textFor(key)).toBeTypeOf('string')
  })

  test.each([undefined, 'something_new', 'toString'])('%s gets the general message', (code) => {
    expect(apiErrorKey(code)).toBe('errors.unexpected')
    expect(textFor('errors.unexpected')).toBeTypeOf('string')
  })

  test('network problems have a message', () => {
    expect(textFor('errors.network')).toBeTypeOf('string')
  })
})

describe('authErrorKey', () => {
  test.each(authCodes)('%s has a message', (code) => {
    const key = authErrorKey(code)
    expect(key).not.toBe('errors.unexpected')
    expect(textFor(key)).toBeTypeOf('string')
  })

  test.each([undefined, 'unknown', 'constructor'])('%s gets the general message', (code) => {
    expect(authErrorKey(code)).toBe('errors.unexpected')
  })
})
