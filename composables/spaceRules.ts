// Checks that run in the browser before anything is sent. The API checks again.
// Each error function returns a message key, or undefined if the value is fine.
// A test compares both checks with the schemas in shared/api-contract.ts.

export const DISPLAY_NAME_MAX = 60

// An invite code is 32 lowercase hexadecimal characters.
const inviteShape = /^[a-f0-9]{32}$/

// Pasted codes often carry spaces, line breaks or capital letters.
export function normalizeInviteCode(value: string) {
  return value.replace(/\s+/g, '').toLowerCase()
}

export function inviteCodeError(value: string) {
  const code = normalizeInviteCode(value)
  if (!code) {
    return 'errors.form.inviteCodeRequired'
  }
  return inviteShape.test(code) ? undefined : 'errors.form.inviteCodeShape'
}

export function displayNameError(value: string) {
  const name = value.trim()
  if (!name) {
    return 'errors.form.displayNameRequired'
  }
  // Spreading counts characters like the API does. "length" would count most emoji twice.
  const characters = [...name].length
  return characters > DISPLAY_NAME_MAX ? 'errors.form.displayNameTooLong' : undefined
}
