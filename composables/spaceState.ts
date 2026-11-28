import type { SpaceResponse } from '../shared/api-contract'

export type SpaceMember = SpaceResponse['members'][number]

// Everything the pairing screens can be in. Exactly one applies at a time.
export type SpaceState =
  | { status: 'loading' }
  | { status: 'failed', messageKey: string }
  | { status: 'none' }
  | { status: 'waiting', invite: string | null, me: SpaceMember }
  | { status: 'paired', me: SpaceMember, partner: SpaceMember }

interface Known {
  // undefined: not loaded yet. null: the person has no space.
  space: SpaceResponse | null | undefined
  // The signed-in person.
  userId: string | undefined
  // Message key of a failed load.
  loadError?: string
}

export function spaceState({ space, userId, loadError }: Known): SpaceState {
  if (space === undefined) {
    return loadError ? { status: 'failed', messageKey: loadError } : { status: 'loading' }
  }
  if (space === null) {
    return { status: 'none' }
  }
  const me = space.members.find(member => member.user_id === userId)
  // A space without the signed-in person is never shown.
  if (!me) {
    return { status: 'loading' }
  }
  const partner = space.members.find(member => member.user_id !== userId)
  if (!partner) {
    return { status: 'waiting', invite: space.invite, me }
  }
  return { status: 'paired', me, partner }
}
