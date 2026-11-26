import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { emailError, newPasswordError, PASSWORD_MIN_LENGTH, passwordError } from '../formRules'

describe('PASSWORD_MIN_LENGTH', () => {
  // Supabase recommends at least 8 characters.
  test('is 8', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(8)
  })

  // The browser check alone can be bypassed, so Supabase has to require the same length.
  // supabase/ belongs to the backend: if this fails, ask for the change there.
  test('is also required by the local Supabase configuration', () => {
    const config = readFileSync(new URL('../../supabase/config.toml', import.meta.url), 'utf8')
    // The key only counts inside the [auth] section.
    const authSection = config.split(/^\[/m).find(section => section.startsWith('auth]')) ?? ''
    const configured = authSection.match(/^minimum_password_length\s*=\s*(\d+)/m)?.[1]

    const hint = `supabase/config.toml must set minimum_password_length = ${PASSWORD_MIN_LENGTH} under [auth]`
    expect(Number(configured), hint).toBe(PASSWORD_MIN_LENGTH)
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
