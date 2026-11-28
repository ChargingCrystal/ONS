import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { createFakeAuth } from '../../composables/__tests__/fake-auth'
import { ANN, BEN, CODE, NEW_CODE, fakeSpaceApi, member, spaceOf } from '../../composables/__tests__/fake-space-api'
import { button, description, field } from '../../composables/__tests__/form-helpers'
import { resetSpace } from '../../composables/__tests__/reset-space'
import SpacePage from '../space.vue'

const supabase = vi.hoisted(() => ({ auth: undefined as unknown }))
mockNuxtImport('useSupabaseAuth', () => () => supabase.auth)

// The pages are attached to the document so that focus works.
enableAutoUnmount(afterEach)

let backend: ReturnType<typeof fakeSpaceApi>

const alone = (name: string | null = 'Ann', invite: string | null = CODE) => spaceOf([member(ANN, name)], invite)
const paired = (myName: string | null = 'Ann', partnerName: string | null = 'Ben') =>
  spaceOf([member(BEN, partnerName, 1), member(ANN, myName, 2)])

beforeEach(async () => {
  supabase.auth = createFakeAuth({ signedInAs: 'ann@example.org' }).auth
  resetSpace()
  backend = fakeSpaceApi()
  await useNuxtApp().$i18n.setLocale('de')
  await useRouter().push('/')
})

afterEach(() => {
  backend.remove()
  vi.restoreAllMocks()
})

type Page = Awaited<ReturnType<typeof mountSuspended>>

async function open(route = '/space') {
  return await mountSuspended(SpacePage, { route, attachTo: document.body })
}

// Waits until the page shows the text, because answers arrive a moment later.
function shows(page: Page, text: string) {
  return vi.waitFor(() => expect(page.text()).toContain(text))
}

async function openWith(text: string) {
  const page = await open()
  await shows(page, text)
  return page
}

const alertText = (page: Page) => page.find('[role="alert"]').text()
const dialog = (page: Page) => page.get('dialog').element as HTMLDialogElement
const hasField = (page: Page, label: string) => page.findAll('label').some(candidate => candidate.text() === label)
const hasButton = (page: Page, text: string) => page.findAll('button').some(candidate => candidate.text() === text)

// The coming back of the person is what makes the page load again.
async function comeBack() {
  window.dispatchEvent(new Event('focus'))
  await flushPromises()
}

describe('loading', () => {
  test('says that it is loading', async () => {
    const release = backend.holdNext('GET /api/space')
    const page = await open()

    expect(page.text()).toContain('Euer Bereich wird geladen')
    release()
    await shows(page, 'Neuen Bereich erstellen')
  })

  test('offers to try again when loading fails', async () => {
    backend.failLoading()
    const page = await openWith('Der Server hat gerade ein Problem')

    await button(page, 'Erneut versuchen').trigger('click')

    await shows(page, 'Neuen Bereich erstellen')
  })
})

describe('without a space', () => {
  test('offers to create a space or to join one', async () => {
    const page = await openWith('Du hast noch keinen gemeinsamen Bereich.')

    expect(page.get('h1').text()).toBe('Unser Bereich')
    expect(hasButton(page, 'Bereich erstellen')).toBe(true)
    expect(hasField(page, 'Einladungscode')).toBe(true)
    expect(hasButton(page, 'Beitreten')).toBe(true)
    expect(hasButton(page, 'Bereich verlassen')).toBe(false)
  })

  test('creates a space and shows the invite code', async () => {
    const page = await openWith('Neuen Bereich erstellen')

    await button(page, 'Bereich erstellen').trigger('click')

    await shows(page, CODE)
    expect(page.text()).toContain('Noch fehlt die zweite Person.')
  })

  test('says so when there already is a space, and shows it', async () => {
    const page = await openWith('Neuen Bereich erstellen')
    backend.space = alone()
    backend.failOnce('POST /api/space', 409, 'already_paired')

    await button(page, 'Bereich erstellen').trigger('click')

    await shows(page, CODE)
    expect(alertText(page)).toBe('Du bist schon in einem Bereich.')
  })

  test('has a code field that leaves the input alone', async () => {
    const page = await openWith('Mit Code beitreten')

    expect(field(page, 'Einladungscode').attributes()).toMatchObject({
      autocomplete: 'off',
      autocapitalize: 'off',
      spellcheck: 'false',
    })
  })

  test('checks the code before sending it', async () => {
    const page = await openWith('Mit Code beitreten')
    await field(page, 'Einladungscode').setValue('abc')

    await page.get('form').trigger('submit')
    await flushPromises()

    expect(description(page, 'Einladungscode')).toContain('Ein Code hat 32 Zeichen')
    expect(field(page, 'Einladungscode').attributes('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(field(page, 'Einladungscode').element)
    expect(backend.requests['POST /api/space/join']).not.toHaveBeenCalled()
  })

  test('explains a code that does not work at the field', async () => {
    const page = await openWith('Mit Code beitreten')
    backend.failOnce('POST /api/space/join', 400, 'invite_invalid')
    await field(page, 'Einladungscode').setValue(CODE)

    await page.get('form').trigger('submit')

    await vi.waitFor(() => expect(description(page, 'Einladungscode')).toContain('Dieser Code funktioniert nicht'))
    expect(document.activeElement).toBe(field(page, 'Einladungscode').element)
  })

  test('joins with a pasted code and shows both names', async () => {
    const page = await openWith('Mit Code beitreten')
    await field(page, 'Einladungscode').setValue(` ${CODE.toUpperCase()} `)

    await page.get('form').trigger('submit')

    await shows(page, 'Ihr seid verbunden.')
    expect(page.text()).toContain('Ben')
    expect(backend.requests['POST /api/space/join']).toHaveBeenCalledWith({ code: CODE })
  })
})

describe('waiting for the second person', () => {
  beforeEach(() => {
    backend.space = alone()
  })

  test('copies the code', async () => {
    const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    const page = await openWith(CODE)

    await button(page, 'Code kopieren').trigger('click')

    await shows(page, 'Code kopiert.')
    expect(copy).toHaveBeenCalledWith(CODE)
  })

  test('explains how to copy by hand when copying does not work', async () => {
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('not allowed'))
    const page = await openWith(CODE)

    await button(page, 'Code kopieren').trigger('click')

    await shows(page, 'Kopieren hat nicht geklappt.')
    expect(page.text()).toContain(CODE)
  })

  test('replaces the code with a new one', async () => {
    const page = await openWith(CODE)

    await button(page, 'Neuen Code erzeugen').trigger('click')

    await shows(page, NEW_CODE)
    expect(page.text()).not.toContain(CODE)
  })

  test('offers a code after the other person has left', async () => {
    backend.space = alone('Ann', null)
    const page = await openWith('Zurzeit gibt es keinen gültigen Einladungscode.')
    expect(hasButton(page, 'Code kopieren')).toBe(false)

    await button(page, 'Code erzeugen').trigger('click')

    await shows(page, NEW_CODE)
  })

  test('tells somebody with their own code to leave this space first', async () => {
    const page = await openWith(CODE)

    expect(page.text()).toContain('Hast du selbst einen Code bekommen? Dann verlasse zuerst diesen Bereich.')
  })

  test('shows the second person joining without a reload', async () => {
    const page = await openWith(CODE)
    backend.space = paired()

    await comeBack()

    await shows(page, 'Ihr seid verbunden.')
    expect(page.text()).toContain('Ben')
    expect(page.text()).not.toContain(CODE)
  })

  test('says that somebody has joined when a new code is no longer possible', async () => {
    const page = await openWith(CODE)
    backend.space = paired()
    backend.failOnce('POST /api/space/invite', 409, 'already_paired')

    await button(page, 'Neuen Code erzeugen').trigger('click')

    await shows(page, 'Inzwischen ist jemand beigetreten.')
    expect(page.text()).toContain('Ben')
  })
})

describe('names', () => {
  test('asks for the own name while it is missing, without blocking the rest', async () => {
    backend.space = alone(null)
    const page = await openWith(CODE)

    expect(hasField(page, 'Dein Anzeigename')).toBe(true)
    expect(hasButton(page, 'Code kopieren')).toBe(true)
    expect(hasButton(page, 'Abbrechen')).toBe(false)
  })

  test('saves the name and closes the form', async () => {
    backend.space = alone(null)
    const page = await openWith(CODE)
    await field(page, 'Dein Anzeigename').setValue(' Ann ')

    await page.get('form').trigger('submit')

    await vi.waitFor(() => expect(hasField(page, 'Dein Anzeigename')).toBe(false))
    expect(page.text()).toContain('Ann')
    expect(backend.requests['PUT /api/profile']).toHaveBeenCalledWith({ display_name: 'Ann' })
    await vi.waitFor(() => expect(document.activeElement).toBe(button(page, 'Name ändern').element))
  })

  test('lets the name be changed later', async () => {
    backend.space = paired()
    const page = await openWith('Ihr seid verbunden.')
    expect(hasField(page, 'Dein Anzeigename')).toBe(false)

    await button(page, 'Name ändern').trigger('click')
    await flushPromises()

    const input = field(page, 'Dein Anzeigename').element as HTMLInputElement
    expect(input.value).toBe('Ann')
    expect(document.activeElement).toBe(input)

    await button(page, 'Abbrechen').trigger('click')
    await flushPromises()

    expect(hasField(page, 'Dein Anzeigename')).toBe(false)
    expect(document.activeElement).toBe(button(page, 'Name ändern').element)
  })

  test.each([
    ['  ', 'Bitte gib einen Namen ein.'],
    ['a'.repeat(61), 'Der Name darf höchstens 60 Zeichen lang sein.'],
  ])('shows an error at the field for %j', async (name, message) => {
    backend.space = alone(null)
    const page = await openWith(CODE)
    await field(page, 'Dein Anzeigename').setValue(name)

    await page.get('form').trigger('submit')
    await flushPromises()

    expect(description(page, 'Dein Anzeigename')).toContain(message)
    expect(document.activeElement).toBe(field(page, 'Dein Anzeigename').element)
    expect(backend.requests['PUT /api/profile']).not.toHaveBeenCalled()
  })

  test('shows both names', async () => {
    backend.space = paired()
    const page = await openWith('Ihr seid verbunden.')

    const entries = page.findAll('dl > div').map(entry => entry.text())
    expect(entries[0]).toContain('Du')
    expect(entries[0]).toContain('Ann')
    expect(entries[1]).toContain('Partnerperson')
    expect(entries[1]).toContain('Ben')
  })

  test('says when the other person has not set a name yet', async () => {
    backend.space = paired('Ann', null)
    const page = await openWith('Ihr seid verbunden.')

    expect(page.findAll('dl > div')[1]!.text()).toContain('Noch kein Name eingetragen')
  })

  test('keeps what is being typed when the second person joins', async () => {
    backend.space = alone(null)
    const page = await openWith(CODE)
    await field(page, 'Dein Anzeigename').setValue('An')
    ;(field(page, 'Dein Anzeigename').element as HTMLInputElement).focus()
    backend.space = paired(null)

    await comeBack()
    await shows(page, 'Ihr seid verbunden.')

    const input = field(page, 'Dein Anzeigename').element as HTMLInputElement
    expect(input.value).toBe('An')
    expect(document.activeElement).toBe(input)
  })
})

describe('leaving', () => {
  async function askToLeave(page: Page) {
    await button(page, 'Bereich verlassen').trigger('click')
    await vi.waitFor(() => expect(dialog(page).open).toBe(true))
  }

  test('asks first and says that shared things stay', async () => {
    backend.space = paired()
    const page = await openWith('Ihr seid verbunden.')

    await askToLeave(page)

    const question = page.get('dialog').text()
    expect(question).toContain('Gelöscht werden sie nicht')
    expect(question).toContain('wer ihm später beitritt, kann sie sehen')
    expect(question).toContain('Standort wird entfernt')
    expect(backend.requests['DELETE /api/space/membership']).not.toHaveBeenCalled()
  })

  test('warns the last person that nobody can come back', async () => {
    backend.space = alone()
    const page = await openWith(CODE)

    await askToLeave(page)

    const question = page.get('dialog').text()
    expect(question).toContain('Du bist allein in diesem Bereich.')
    expect(question).toContain('auch du nicht')
    expect(question).not.toContain('wer ihm später beitritt')
  })

  test('looks again before asking, so that the warning is current', async () => {
    backend.space = paired()
    const page = await openWith('Ihr seid verbunden.')
    backend.space = alone('Ann', null)

    await askToLeave(page)

    expect(page.get('dialog').text()).toContain('Du bist allein in diesem Bereich.')
  })

  test('does nothing when the person decides to stay', async () => {
    backend.space = paired()
    const page = await openWith('Ihr seid verbunden.')
    await askToLeave(page)

    await button(page, 'Bleiben').trigger('click')
    await flushPromises()

    expect(dialog(page).open).toBe(false)
    expect(backend.requests['DELETE /api/space/membership']).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(button(page, 'Bereich verlassen').element)
  })

  test('leaves after the confirmation and moves to the heading', async () => {
    backend.space = paired()
    const page = await openWith('Ihr seid verbunden.')
    await askToLeave(page)

    await button(page, 'Ja, verlassen').trigger('click')

    await shows(page, 'Du hast den Bereich verlassen.')
    expect(hasButton(page, 'Bereich erstellen')).toBe(true)
    expect(backend.requests['DELETE /api/space/membership']).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => expect(document.activeElement).toBe(page.get('h1').element))
  })

  test('stays and says why when leaving fails', async () => {
    backend.space = paired()
    const page = await openWith('Ihr seid verbunden.')
    await askToLeave(page)
    backend.failOnce('DELETE /api/space/membership', 500, 'internal')

    await button(page, 'Ja, verlassen').trigger('click')

    await shows(page, 'Der Server hat gerade ein Problem')
    expect(dialog(page).open).toBe(false)
    expect(page.text()).toContain('Ihr seid verbunden.')
  })
})

describe('other languages', () => {
  test.each([
    ['en', 'Our space', 'Create a new space'],
    ['nl', 'Onze ruimte', 'Een nieuwe ruimte aanmaken'],
  ] as const)('shows the page in %s', async (locale, heading, offer) => {
    await useNuxtApp().$i18n.setLocale(locale)
    const page = await open(`/${locale}/space`)

    await shows(page, offer)
    expect(page.get('h1').text()).toBe(heading)
  })
})
