import type { ApiErrorCode } from '../shared/api-errors'

// Maps error codes to message keys. Text sent by a server is never shown.
const unexpected = 'errors.unexpected'

// Codes of our backend (shared/api-errors.ts). Only the type is imported,
// so the validation library behind it stays out of the browser bundle.
// quota_exceeded is named separately until the photos branch adds it to the shared list.
const apiMessages: Record<ApiErrorCode | 'quota_exceeded', string> = {
  invite_invalid: 'errors.api.inviteInvalid',
  already_paired: 'errors.api.alreadyPaired',
  no_space: 'errors.api.noSpace',
  not_found: 'errors.api.notFound',
  quota_exceeded: 'errors.api.quotaExceeded',
  validation_failed: 'errors.api.validationFailed',
  unauthorized: 'errors.api.unauthorized',
  internal: 'errors.api.internal',
}

// Codes of Supabase Auth, plus "network" and "unavailable" from the session store.
const authMessages: Record<string, string> = {
  invalid_credentials: 'errors.auth.invalidCredentials',
  email_not_confirmed: 'errors.auth.emailNotConfirmed',
  user_already_exists: 'errors.auth.userExists',
  email_exists: 'errors.auth.userExists',
  email_address_invalid: 'errors.auth.emailInvalid',
  weak_password: 'errors.auth.weakPassword',
  signup_disabled: 'errors.auth.signupDisabled',
  email_provider_disabled: 'errors.auth.methodDisabled',
  provider_disabled: 'errors.auth.methodDisabled',
  oauth_provider_not_supported: 'errors.auth.methodDisabled',
  validation_failed: 'errors.auth.rejected',
  over_request_rate_limit: 'errors.auth.tooManyAttempts',
  over_email_send_rate_limit: 'errors.auth.tooManyAttempts',
  network: 'errors.network',
  unavailable: 'errors.auth.unavailable',
}

function lookUp(messages: Record<string, string>, code: string | undefined) {
  // hasOwn keeps names such as "toString" from matching.
  return code && Object.hasOwn(messages, code) ? messages[code]! : unexpected
}

export function apiErrorKey(code: string | undefined) {
  return lookUp(apiMessages, code)
}

export function authErrorKey(code: string | undefined) {
  return lookUp(authMessages, code)
}
