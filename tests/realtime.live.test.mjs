import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { createClient } from '@supabase/supabase-js'
import { expect, test } from 'vitest'

const key = process.env.ONS_REALTIME_TEST_KEY
const url = 'http://127.0.0.1:54321'
const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aE1sAAAAASUVORK5CYII=', 'base64')

async function checked(request) {
  const { data, error } = await request
  if (error) throw new Error(error.message, { cause: error })
  return data
}

function subscribe(client, topic, onMessage = () => {}) {
  const channel = client.channel(topic, { config: { private: true } })
    .on('broadcast', { event: '*' }, onMessage)
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Realtime subscription timed out')), 6_000)
    channel.subscribe(status => {
      clearTimeout(timer)
      resolve(status)
    })
  })
}

test.skipIf(!key)('local Realtime isolates live events from outsiders and a former partner', async () => {
  const clients = Array.from({ length: 3 }, () => createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }))
  const [owner, partner, outsider] = clients
  const inboxes = clients.map(() => [])

  try {
    const users = await Promise.all(clients.map(async client => {
      const { user, session } = await checked(client.auth.signUp({
        email: `realtime-${randomUUID()}@example.com`,
        password: `Local!${randomUUID()}`,
      }))
      if (!session) throw new Error('The local test stack must allow signup without confirmation')
      await client.realtime.setAuth(session.access_token)
      return user
    }))
    const topics = users.map(user => 'ons:user:' + user.id)
    const space = await checked(owner.rpc('create_space'))
    const { invite } = await checked(owner.from('spaces').select('invite').eq('id', space).single())
    await checked(partner.rpc('join_space', { code: invite }))
    await checked(outsider.rpc('create_space'))

    const statuses = await Promise.all(clients.map((client, index) => subscribe(client, topics[index], message => {
      inboxes[index].push({ event: message.event, payload: message.payload })
    })))
    expect(statuses).toEqual(['SUBSCRIBED', 'SUBSCRIBED', 'SUBSCRIBED'])
    expect(await subscribe(outsider, topics[0])).toBe('CHANNEL_ERROR')

    async function expectRefresh(event, change, recipients = [0, 1]) {
      for (const inbox of inboxes) inbox.length = 0
      await change()
      for (const index of recipients) {
        await expect.poll(() => inboxes[index].map(message => message.event), { timeout: 6_000 }).toEqual([event])
        const { id, ...payload } = inboxes[index][0].payload
        expect(payload).toEqual({})
        if (id !== undefined) expect(id).toMatch(/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i)
      }
      // Let delivery settle across all three open sockets before checking the outsiders.
      await delay(350)
      for (const [index, inbox] of inboxes.entries()) {
        expect(inbox.map(message => message.event)).toEqual(recipients.includes(index) ? [event] : [])
      }
    }

    const dates = owner.from('dates')
    let dateId
    await expectRefresh('dates.changed', async () => {
      const date = await checked(dates.insert({ title: 'Realtime test', category: 'movie' }).select('id').single())
      dateId = date.id
    })
    await expectRefresh('dates.changed', () => checked(dates.delete().eq('id', dateId)))
    await expectRefresh('locations.changed', () => checked(partner.from('locations').insert({ lat: 52, lon: 12 })))

    const bucket = owner.storage.from('gallery')
    const { uploadId, path } = await checked(owner.rpc('reserve_photo_upload', { upload_mime: 'image/png', upload_size: image.length }))
    const { token } = await checked(bucket.createSignedUploadUrl(path))
    await checked(bucket.uploadToSignedUrl(path, token, image, { contentType: 'image/png' }))
    await expectRefresh('photos.changed', () => checked(owner.rpc('confirm_photo', { photo_upload_id: uploadId })))
    await checked(bucket.remove([path]))
    await expectRefresh('photos.changed', () => checked(owner.rpc('forget_photo', { photo_id: uploadId })))

    await expectRefresh('locations.changed', () => checked(partner.rpc('leave_space')), [0])
    await expectRefresh('dates.changed', () => checked(dates.insert({ title: 'After leaving', category: 'walk' })), [0])
  } finally {
    await Promise.all(clients.map(client => client.removeAllChannels()))
  }
}, 65_000)
