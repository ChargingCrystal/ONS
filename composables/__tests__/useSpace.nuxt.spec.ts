import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { useSessionStore } from '../../stores/session'
import { useSpace } from '../useSpace'
import { createFakeAuth } from './fake-auth'
import { ANN, BEN, CODE, NEW_CODE, fakeSpaceApi, member, spaceOf } from './fake-space-api'
import { resetSpace } from './reset-space'

const supabase = vi.hoisted(() => ({ auth: undefined as unknown }))
mockNuxtImport('useSupabaseAuth', () => () => supabase.auth)

let fake: ReturnType<typeof createFakeAuth>
let backend: ReturnType<typeof fakeSpaceApi>

const waiting = () => spaceOf([member(ANN, 'Ann')], CODE)
const paired = () => spaceOf([member(BEN, 'Ben', 1), member(ANN, 'Ann', 2)])

const currentPath = () => useRouter().currentRoute.value.path

beforeEach(async () => {
  await useNuxtApp().$i18n.setLocale('de')
  fake = createFakeAuth({ signedInAs: 'ann@example.org' })
  supabase.auth = fake.auth
  resetSpace()
  backend = fakeSpaceApi()
  await useRouter().push('/map')
})

afterEach(() => backend.remove())

// A composable that already knows the current space.
async function loaded() {
  const space = useSpace()
  await space.refresh()
  return space
}

describe('loading', () => {
  test('starts without knowing anything', () => {
    expect(useSpace().state.value).toEqual({ status: 'loading' })
  })

  test('learns from an empty answer that there is no space', async () => {
    const space = await loaded()
    expect(space.state.value).toEqual({ status: 'none' })
  })

  test.each([
    ['waiting', waiting],
    ['paired', paired],
  ])('recognizes a %s space', async (status, build) => {
    backend.space = build()
    const space = await loaded()
    expect(space.state.value.status).toBe(status)
  })

  test('works before anybody has read the session', async () => {
    resetSpace()
    backend.space = waiting()

    const space = await loaded()

    expect(space.state.value.status).toBe('waiting')
  })

  test('reports a first load that fails', async () => {
    backend.failOnce('GET /api/space', 500, 'internal')

    const space = useSpace()

    await expect(space.refresh()).resolves.toBe(false)
    expect(space.state.value).toEqual({ status: 'failed', messageKey: 'errors.api.internal' })
  })

  test('keeps what it knows when a later load fails', async () => {
    backend.space = waiting()
    const space = await loaded()
    backend.failOnce('GET /api/space', 500, 'internal')

    await space.refresh()

    expect(space.state.value.status).toBe('waiting')
    expect(space.notice.value).toBeUndefined()
  })

  test('ignores an older answer that arrives last', async () => {
    const release = backend.holdNext('GET /api/space')
    const space = useSpace()
    const slow = space.refresh()
    await vi.waitFor(() => expect(backend.requests['GET /api/space']).toHaveBeenCalledTimes(1))
    backend.space = waiting()
    await space.refresh()

    release()
    await slow

    expect(space.state.value.status).toBe('waiting')
  })
})

describe('another person on the same device', () => {
  test('forgets the space when somebody signs out', async () => {
    backend.space = waiting()
    const space = await loaded()

    fake.endSession()
    await useSessionStore().signIn('ann@example.org', 'secret-12')

    expect(space.state.value).toEqual({ status: 'loading' })
  })

  test('drops an answer that was meant for the previous person', async () => {
    backend.space = waiting()
    const release = backend.holdNext('GET /api/space')
    const space = useSpace()
    const slow = space.refresh()
    await vi.waitFor(() => expect(backend.requests['GET /api/space']).toHaveBeenCalledTimes(1))

    fake.endSession()
    await useSessionStore().signIn('ann@example.org', 'secret-12')
    release()
    await slow

    expect(space.state.value).toEqual({ status: 'loading' })
  })

  test('leaves no message behind when the session has expired', async () => {
    const space = await loaded()
    // Twice, because useApi tries once more with a renewed token.
    backend.failOnce('POST /api/space', 401, 'unauthorized')
    backend.failOnce('POST /api/space', 401, 'unauthorized')

    await expect(space.create()).resolves.toEqual({ ok: false })

    expect(currentPath()).toBe('/login')
    expect(space.notice.value).toBeUndefined()
  })
})

describe('creating a space', () => {
  test('creates it and waits for a partner', async () => {
    const space = await loaded()

    await expect(space.create()).resolves.toEqual({ ok: true })

    expect(space.state.value).toMatchObject({ status: 'waiting', invite: CODE })
  })

  test('shows the existing space when there already is one', async () => {
    const space = await loaded()
    backend.space = waiting()
    backend.failOnce('POST /api/space', 409, 'already_paired')

    await expect(space.create()).resolves.toEqual({ ok: false })

    expect(space.state.value.status).toBe('waiting')
    expect(space.notice.value).toEqual({ messageKey: 'errors.space.alreadyInSpace', tone: 'error' })
  })

  test('reports an unexpected failure and changes nothing', async () => {
    const space = await loaded()
    backend.failOnce('POST /api/space', 500, 'internal')

    await space.create()

    expect(space.state.value).toEqual({ status: 'none' })
    expect(space.notice.value).toEqual({ messageKey: 'errors.api.internal', tone: 'error' })
  })

  // Showing the old state would invite a second attempt.
  test('does not keep the old state when reloading fails afterwards', async () => {
    const space = await loaded()
    backend.failOnce('GET /api/space', 500, 'internal')

    await expect(space.create()).resolves.toEqual({ ok: true })

    expect(space.state.value).toEqual({ status: 'failed', messageKey: 'errors.api.internal' })
  })

  test('removes an earlier message when the next action starts', async () => {
    const space = await loaded()
    backend.failOnce('POST /api/space', 500, 'internal')
    await space.create()

    await space.create()

    expect(space.notice.value).toBeUndefined()
  })
})

describe('joining a space', () => {
  test('sends a cleaned-up code and shows both members', async () => {
    const space = await loaded()

    await expect(space.join(`  ${CODE.toUpperCase()} `)).resolves.toEqual({ ok: true })

    expect(backend.requests['POST /api/space/join']).toHaveBeenCalledWith({ code: CODE })
    expect(space.state.value).toMatchObject({ status: 'paired', partner: { display_name: 'Ben' } })
  })

  test.each([
    ['', 'errors.form.inviteCodeRequired'],
    ['abc', 'errors.form.inviteCodeShape'],
  ])('does not send %j', async (code, fieldError) => {
    const space = await loaded()

    await expect(space.join(code)).resolves.toEqual({ ok: false, fieldError })

    expect(backend.requests['POST /api/space/join']).not.toHaveBeenCalled()
  })

  test.each([
    [400, 'invite_invalid', 'errors.space.inviteInvalid'],
    [400, 'validation_failed', 'errors.form.inviteCodeShape'],
  ])('puts the %i %s error at the field', async (status, code, fieldError) => {
    const space = await loaded()
    backend.failOnce('POST /api/space/join', status, code)

    await expect(space.join(CODE)).resolves.toEqual({ ok: false, fieldError })

    expect(space.state.value).toEqual({ status: 'none' })
    expect(space.notice.value).toBeUndefined()
  })

  test('shows the existing space when there already is one', async () => {
    const space = await loaded()
    backend.space = paired()
    backend.failOnce('POST /api/space/join', 409, 'already_paired')

    await space.join(CODE)

    expect(space.state.value.status).toBe('paired')
    expect(space.notice.value).toEqual({ messageKey: 'errors.space.alreadyInSpace', tone: 'error' })
  })
})

describe('a new invite code', () => {
  test('replaces the old one', async () => {
    backend.space = waiting()
    const space = await loaded()

    await expect(space.renewInvite()).resolves.toEqual({ ok: true })

    expect(space.state.value).toMatchObject({ status: 'waiting', invite: NEW_CODE })
  })

  // For this route, already_paired means that the second place is taken.
  test('tells that the partner has joined meanwhile', async () => {
    backend.space = waiting()
    const space = await loaded()
    backend.space = paired()
    backend.failOnce('POST /api/space/invite', 409, 'already_paired')

    await space.renewInvite()

    expect(space.state.value.status).toBe('paired')
    expect(space.notice.value).toEqual({ messageKey: 'errors.space.partnerJoined', tone: 'info' })
  })

  test('tells that there is no space any more', async () => {
    backend.space = waiting()
    const space = await loaded()
    backend.space = null
    backend.failOnce('POST /api/space/invite', 403, 'no_space')

    await space.renewInvite()

    expect(space.state.value).toEqual({ status: 'none' })
    expect(space.notice.value).toEqual({ messageKey: 'errors.space.noLongerInSpace', tone: 'error' })
  })
})

describe('the display name', () => {
  test('is saved without surrounding spaces and shown', async () => {
    backend.space = spaceOf([member(ANN)], CODE)
    const space = await loaded()

    await expect(space.saveName('  Ann  ')).resolves.toEqual({ ok: true })

    expect(backend.requests['PUT /api/profile']).toHaveBeenCalledWith({ display_name: 'Ann' })
    expect(space.state.value).toMatchObject({ me: { display_name: 'Ann' } })
  })

  test.each([
    ['   ', 'errors.form.displayNameRequired'],
    ['a'.repeat(61), 'errors.form.displayNameTooLong'],
  ])('is not sent when it is %j', async (name, fieldError) => {
    backend.space = waiting()
    const space = await loaded()

    await expect(space.saveName(name)).resolves.toEqual({ ok: false, fieldError })

    expect(backend.requests['PUT /api/profile']).not.toHaveBeenCalled()
  })

  test('puts a rejection by the server at the field', async () => {
    backend.space = waiting()
    const space = await loaded()
    backend.failOnce('PUT /api/profile', 400, 'validation_failed')

    await expect(space.saveName('Ann')).resolves
      .toEqual({ ok: false, fieldError: 'errors.form.displayNameInvalid' })
  })
})

describe('leaving a space', () => {
  test('leaves and says so', async () => {
    backend.space = paired()
    const space = await loaded()

    await expect(space.leave()).resolves.toEqual({ ok: true })

    expect(backend.requests['DELETE /api/space/membership']).toHaveBeenCalledTimes(1)
    expect(space.state.value).toEqual({ status: 'none' })
    expect(space.notice.value).toEqual({ messageKey: 'space.notice.left', tone: 'info' })
  })

  test('stays when leaving fails', async () => {
    backend.space = paired()
    const space = await loaded()
    backend.failOnce('DELETE /api/space/membership', 500, 'internal')

    await expect(space.leave()).resolves.toEqual({ ok: false })

    expect(space.state.value.status).toBe('paired')
    expect(space.notice.value).toEqual({ messageKey: 'errors.api.internal', tone: 'error' })
  })

  // The warning depends on whether somebody stays behind, so it needs fresh data.
  test('checks the current state before asking for confirmation', async () => {
    backend.space = paired()
    const space = await loaded()
    backend.space = spaceOf([member(ANN, 'Ann', 2)])

    await expect(space.checkBeforeLeaving()).resolves.toBe(true)

    expect(space.state.value.status).toBe('waiting')
  })

  test('does not ask when the current state cannot be read', async () => {
    backend.space = paired()
    const space = await loaded()
    backend.failOnce('GET /api/space', 500, 'internal')

    await expect(space.checkBeforeLeaving()).resolves.toBe(false)

    expect(space.notice.value).toEqual({ messageKey: 'errors.api.internal', tone: 'error' })
  })

  test('does not ask when there is nothing left to leave', async () => {
    backend.space = paired()
    const space = await loaded()
    backend.space = null

    await expect(space.checkBeforeLeaving()).resolves.toBe(false)

    expect(space.state.value).toEqual({ status: 'none' })
  })
})
