import type { SpaceResponse } from '../shared/api-contract'
import type { ApiErrorCode } from '../shared/api-errors'

export interface Outcome {
  ok: boolean
  // Message key to show at the field the person typed into.
  fieldError?: string
}

// What one error code means for one action.
interface Reaction {
  fieldError?: string
  notice?: SpaceNotice
  // The screen is out of date and has to be loaded again.
  reload?: boolean
}

type Reactions = Partial<Record<ApiErrorCode, Reaction>>

const alreadyInSpace: Reaction = {
  notice: { messageKey: 'errors.space.alreadyInSpace', tone: 'error' },
  reload: true,
}

const createReactions: Reactions = {
  already_paired: alreadyInSpace,
}

const joinReactions: Reactions = {
  already_paired: alreadyInSpace,
  invite_invalid: { fieldError: 'errors.space.inviteInvalid' },
  validation_failed: { fieldError: 'errors.form.inviteCodeShape' },
}

const inviteReactions: Reactions = {
  // For this route the code means that the second place is taken.
  already_paired: { notice: { messageKey: 'errors.space.partnerJoined', tone: 'info' }, reload: true },
  no_space: { notice: { messageKey: 'errors.space.noLongerInSpace', tone: 'error' }, reload: true },
}

const nameReactions: Reactions = {
  validation_failed: { fieldError: 'errors.form.displayNameInvalid' },
}

function messageKeyOf(error: unknown) {
  return error instanceof ApiError ? error.messageKey : 'errors.unexpected'
}

// Everything a person can do with their space.
//   const { state, notice, join } = useSpace()
export function useSpace() {
  const api = useApi()
  const session = useSessionStore()
  const store = useSpaceStore()

  const state = computed(() => store.state)
  const notice = computed(() => store.notice)

  // Loads the space. Returns false if that failed; the state then says why.
  async function load({ discardOld = false } = {}) {
    const request = store.startRequest()
    try {
      // The answer is empty (204) for somebody without a space.
      const answer = await api<SpaceResponse | ''>('/api/space')
      request.loaded(answer || null)
      return true
    }
    catch (error) {
      request.failed(messageKeyOf(error), { discardOld })
      return false
    }
  }

  function refresh() {
    return load()
  }

  // After a change, the old picture must not stay if the new one cannot be loaded.
  function reload() {
    return load({ discardOld: true })
  }

  // Runs one request that changes something, and turns failures into messages.
  async function act(request: () => Promise<void>, reactions: Reactions = {}): Promise<Outcome> {
    store.notice = undefined
    await session.init()
    const person = session.user?.id
    try {
      await request()
      return { ok: true }
    }
    catch (error) {
      // Signed out meanwhile: the message would be meant for somebody else.
      if (session.user?.id !== person) {
        return { ok: false }
      }
      const code = error instanceof ApiError ? error.code : undefined
      const reaction = code ? reactions[code] : undefined
      if (reaction?.reload) {
        await reload()
      }
      if (reaction?.fieldError) {
        return { ok: false, fieldError: reaction.fieldError }
      }
      store.notice = reaction?.notice ?? { messageKey: messageKeyOf(error), tone: 'error' }
      return { ok: false }
    }
  }

  function create() {
    return act(async () => {
      await api('/api/space', { method: 'POST' })
      await reload()
    }, createReactions)
  }

  async function join(code: string): Promise<Outcome> {
    const fieldError = inviteCodeError(code)
    if (fieldError) {
      return { ok: false, fieldError }
    }
    return act(async () => {
      await api('/api/space/join', { method: 'POST', body: { code: normalizeInviteCode(code) } })
      await reload()
    }, joinReactions)
  }

  function renewInvite() {
    return act(async () => {
      await api('/api/space/invite', { method: 'POST' })
      await reload()
    }, inviteReactions)
  }

  async function saveName(name: string): Promise<Outcome> {
    const fieldError = displayNameError(name)
    if (fieldError) {
      return { ok: false, fieldError }
    }
    return act(async () => {
      await api('/api/profile', { method: 'PUT', body: { display_name: name.trim() } })
      await reload()
    }, nameReactions)
  }

  function leave() {
    return act(async () => {
      await api('/api/space/membership', { method: 'DELETE' })
      // The empty answer already says that there is no space now.
      store.startRequest().loaded(null)
      store.notice = { messageKey: 'space.notice.left', tone: 'info' }
    })
  }

  // The warning before leaving depends on whether somebody stays behind.
  // Returns true if it can be shown.
  async function checkBeforeLeaving() {
    store.notice = undefined
    const request = store.startRequest()
    try {
      const answer = await api<SpaceResponse | ''>('/api/space')
      request.loaded(answer || null)
    }
    catch (error) {
      store.notice = { messageKey: messageKeyOf(error), tone: 'error' }
      return false
    }
    return store.state.status === 'waiting' || store.state.status === 'paired'
  }

  return { state, notice, refresh, create, join, renewInvite, saveName, leave, checkBeforeLeaving }
}
