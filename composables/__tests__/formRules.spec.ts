import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { emailError, newPasswordError, PASSWORD_MIN_LENGTH, passwordError } from '../formRules'

// What Supabase Auth uses when config.toml does not set minimum_password_length.
const authServerDefault = 6

describe('PASSWORD_MIN_LENGTH', () => {
  test('matches minimum_password_length of the local Supabase configuration', () => {
    const config = readFileSync(new URL('../../supabase/config.toml', import.meta.url), 'utf8')
    const configured = config.match(/^\s*minimum_password_length\s*=\s*(\d+)/m)?.[1]
    expect(PASSWORD_MIN_LENGTH).toBe(configured ? Number(configured) : authServerDefault)
  })
})

describe('emailError', () => {
  test.each(['', '   '])('asks for an address when the field is %j', (value) => {
    expect(emailError(value)).toBe('errors.form.emailRequired')
  })

  test.each(['ann', 'ann@', '@example.org', 'ann@example', 'ann smith@example.org'])('rejects %s', (value) => {
    expect(emailError(value)).toBe('errors.form.emailInvalid')
  })

  test.each(['ann@example.org', ' ann+ons@mail.example.nl '])('accepts %j', (value) => {
    expect(emailError(value)).toBeUndefined()
  })
})

describe('passwords', () => {
  test('an existing password only has to be filled in', () => {
    expect(passwordError('')).toBe('errors.form.passwordRequired')
    // The server decides whether it is right, also for short old passwords.
    expect(passwordError('a')).toBeUndefined()
  })

  test('a new password needs the minimum length', () => {
    expect(newPasswordError('')).toBe('errors.form.passwordRequired')
    expect(newPasswordError('a'.repeat(PASSWORD_MIN_LENGTH - 1))).toBe('errors.form.passwordTooShort')
    expect(newPasswordError('a'.repeat(PASSWORD_MIN_LENGTH))).toBeUndefined()
  })
})
