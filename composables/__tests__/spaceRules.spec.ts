import { describe, expect, test } from 'vitest'
import { joinSpaceRequestSchema, updateProfileRequestSchema } from '../../shared/api-contract'
import { DISPLAY_NAME_MAX, displayNameError, inviteCodeError, normalizeInviteCode } from '../spaceRules'

const code = 'a1'.repeat(16)

describe('invite codes', () => {
  test.each([
    ['spaces around it', `  ${code}  `],
    ['spaces inside it', `${code.slice(0, 8)} ${code.slice(8)}`],
    ['line breaks', `${code.slice(0, 16)}\n${code.slice(16)}`],
    ['capital letters', code.toUpperCase()],
  ])('are cleaned up after pasting: %s', (_name, pasted) => {
    expect(normalizeInviteCode(pasted)).toBe(code)
    expect(inviteCodeError(pasted)).toBeUndefined()
  })

  test.each(['', '   '])('have to be entered (%j)', (value) => {
    expect(inviteCodeError(value)).toBe('errors.form.inviteCodeRequired')
  })

  test.each([
    ['too short', code.slice(1)],
    ['too long', `${code}a`],
    ['not hexadecimal', `g${code.slice(1)}`],
  ])('are rejected when %s', (_name, value) => {
    expect(inviteCodeError(value)).toBe('errors.form.inviteCodeShape')
  })

  // The browser check must not drift from the API contract.
  test.each(['', code, code.slice(1), `${code}a`, `g${code.slice(1)}`])('agree with the contract (%j)', (value) => {
    const accepted = joinSpaceRequestSchema.safeParse({ code: normalizeInviteCode(value) }).success
    expect(inviteCodeError(value) === undefined).toBe(accepted)
  })
})

describe('display names', () => {
  test.each(['A', 'Ann', '  Ann  ', 'a'.repeat(DISPLAY_NAME_MAX)])('accept %j', (name) => {
    expect(displayNameError(name)).toBeUndefined()
  })

  test.each(['', '   '])('have to be entered (%j)', (name) => {
    expect(displayNameError(name)).toBe('errors.form.displayNameRequired')
  })

  test('are limited in length, ignoring spaces around them', () => {
    expect(displayNameError('a'.repeat(DISPLAY_NAME_MAX + 1))).toBe('errors.form.displayNameTooLong')
    expect(displayNameError(` ${'a'.repeat(DISPLAY_NAME_MAX)} `)).toBeUndefined()
  })

  // "length" counts most emoji twice, but the contract and the database count them once.
  test('count an emoji as one character', () => {
    expect(displayNameError('💜'.repeat(DISPLAY_NAME_MAX))).toBeUndefined()
    expect(displayNameError('💜'.repeat(DISPLAY_NAME_MAX + 1))).toBe('errors.form.displayNameTooLong')
  })

  test.each([
    '',
    '   ',
    'Ann',
    'a'.repeat(60),
    'a'.repeat(61),
    '💜'.repeat(30),
    '💜'.repeat(31),
    '💜'.repeat(60),
    '💜'.repeat(61),
  ])('agree with the contract (%j)', (name) => {
    const accepted = updateProfileRequestSchema.safeParse({ display_name: name }).success
    expect(displayNameError(name) === undefined).toBe(accepted)
  })
})
