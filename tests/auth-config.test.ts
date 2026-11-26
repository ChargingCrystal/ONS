import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'

const config = readFileSync(new URL('../supabase/config.toml', import.meta.url), 'utf8')

test('enables the local email provider using the current Supabase CLI setting', () => {
  const email = config.split(/^\[/m).find(section => section.startsWith('auth.email]')) ?? ''
  expect(email).toMatch(/^enabled\s*=\s*true\s*$/m)
  expect(email).not.toMatch(/^enable_signup\s*=/m)
})

test('allows the unlocalized local auth callback', () => {
  const auth = config.split(/^\[/m).find(section => section.startsWith('auth]')) ?? ''
  const redirects = auth.match(/^additional_redirect_urls\s*=\s*(\[[^\r\n]*\])/m)?.[1]
  expect(JSON.parse(redirects ?? '[]')).toContain('http://localhost:3000/auth/callback')
})
