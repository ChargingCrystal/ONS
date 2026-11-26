// Checks that run in the browser before anything is sent. Supabase checks again.
// Each function returns a message key, or undefined if the value is fine.

// Keep in step with minimum_password_length in supabase/config.toml. It is not set there,
// so the default of Supabase Auth applies. A test compares both.
export const PASSWORD_MIN_LENGTH = 6

// Something, an @, something, a dot, something; no spaces.
const emailShape = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function emailError(value: string) {
  const email = value.trim()
  if (!email) {
    return 'errors.form.emailRequired'
  }
  return emailShape.test(email) ? undefined : 'errors.form.emailInvalid'
}

// For signing in: old passwords are not measured against today's rules.
export function passwordError(value: string) {
  return value ? undefined : 'errors.form.passwordRequired'
}

// For choosing a password.
export function newPasswordError(value: string) {
  return passwordError(value)
    ?? (value.length < PASSWORD_MIN_LENGTH ? 'errors.form.passwordTooShort' : undefined)
}
