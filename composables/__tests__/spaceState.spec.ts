import { describe, expect, test } from 'vitest'
import type { SpaceResponse } from '../../shared/api-contract'
import { spaceState } from '../spaceState'

const ann = { user_id: 'ann', slot: 1 as const, display_name: 'Ann' }
const ben = { user_id: 'ben', slot: 2 as const, display_name: null }

function spaceOf(members: SpaceResponse['members'], invite: string | null = null): SpaceResponse {
  return { id: 'space', invite, members }
}

describe('spaceState', () => {
  test('is loading as long as nothing is known', () => {
    expect(spaceState({ space: undefined, userId: 'ann' })).toEqual({ status: 'loading' })
  })

  test('has failed when the first load did not work', () => {
    expect(spaceState({ space: undefined, userId: 'ann', loadError: 'errors.network' }))
      .toEqual({ status: 'failed', messageKey: 'errors.network' })
  })

  test('knows that somebody has no space', () => {
    expect(spaceState({ space: null, userId: 'ann' })).toEqual({ status: 'none' })
  })

  test('waits for a partner and offers the invite code', () => {
    expect(spaceState({ space: spaceOf([ann], 'code'), userId: 'ann' }))
      .toEqual({ status: 'waiting', invite: 'code', me: ann })
  })

  test('waits without a code after a partner has left', () => {
    expect(spaceState({ space: spaceOf([ann]), userId: 'ann' }))
      .toEqual({ status: 'waiting', invite: null, me: ann })
  })

  test('is paired with two members', () => {
    expect(spaceState({ space: spaceOf([ann, ben]), userId: 'ann' }))
      .toEqual({ status: 'paired', me: ann, partner: ben })
  })

  // The slot says nothing about who is looking.
  test('tells me and my partner apart by the user id, not by the order', () => {
    expect(spaceState({ space: spaceOf([ann, ben]), userId: 'ben' }))
      .toEqual({ status: 'paired', me: ben, partner: ann })
  })

  test.each([
    ['somebody else', 'cleo'],
    ['nobody', undefined],
  ])('never shows a space to %s', (_who, userId) => {
    expect(spaceState({ space: spaceOf([ann, ben]), userId })).toEqual({ status: 'loading' })
  })

  test('keeps showing what it knows when a later load fails', () => {
    expect(spaceState({ space: null, userId: 'ann', loadError: 'errors.network' }))
      .toEqual({ status: 'none' })
  })
})
