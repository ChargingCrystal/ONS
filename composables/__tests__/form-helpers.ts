import type { VueWrapper } from '@vue/test-utils'

// Finds things the way a person does: by the visible label or button text.

export function field(wrapper: VueWrapper, label: string) {
  const found = wrapper.findAll('label').find(candidate => candidate.text() === label)
  if (!found) {
    throw new Error(`No field is labelled "${label}"`)
  }
  return wrapper.get(`[id="${found.attributes('for')}"]`)
}

export function button(wrapper: VueWrapper, text: string) {
  const found = wrapper.findAll('button').find(candidate => candidate.text() === text)
  if (!found) {
    throw new Error(`There is no button "${text}"`)
  }
  return found
}

// The texts that screen readers announce for a field, taken from aria-describedby.
export function description(wrapper: VueWrapper, label: string) {
  const ids = field(wrapper, label).attributes('aria-describedby')?.split(' ') ?? []
  return ids.map(id => wrapper.get(`[id="${id}"]`).text()).join(' ')
}
