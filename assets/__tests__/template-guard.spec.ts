import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
// Part of Vue, which Nuxt installs.
import { parse } from 'vue/compiler-sfc'
import { describe, expect, test } from 'vitest'

// Checks .vue files in pages/, components/ and layouts/ for three things:
// text that is not translated, raw colours, and one-off class values such as p-[13px].
const folders = ['pages', 'components', 'layouts']

// Exceptions. Keep these lists short and give every entry a reason.
// Symbols that read the same in every language.
const allowedText = ['–', '·', '|', '/', '×']
// Bracket class values that do not introduce a new design value.
const allowedClassValues = [
  /-\[var\(--ons-[\w-]+\)\]$/, // refers to a token
  /-\[env\(safe-area-inset-[a-z]+\)\]$/, // device safe area
  /^grid-(cols|rows)-\[[\da-z_]*(fr|auto)[\da-z_]*\]$/, // grid proportions
]

// Attributes whose text people see or hear.
const textAttributes = ['alt', 'aria-label', 'aria-description', 'placeholder', 'title', 'label']

const rawColour = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b|\b(?:rgba?|hsla?|oklch|oklab)\(/i
const quotedHexColour = /(['"`])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\1/i
// "p-[13px]", but not variants such as "data-[state=open]:p-2": there a colon follows
// before the class name ends.
const bracketValue = /[^\s'"`{}:,]*-\[[^\]\s]+\](?![^\s'"`[\]]*:)/g
// "[margin:13px]"
const bracketProperty = /(?<=^|[\s'"`])\[[a-z-]+:[^\]\s]+\](?!:)/g

// Node type numbers of the Vue template parser.
const ELEMENT = 1
const TEXT = 2
const ATTRIBUTE = 6
const DIRECTIVE = 7

function findViolations(source: string): string[] {
  const { descriptor } = parse(source)
  const violations: string[] = []

  function checkClasses(value: string) {
    for (const match of [...value.matchAll(bracketValue), ...value.matchAll(bracketProperty)]) {
      if (!allowedClassValues.some(allowed => allowed.test(match[0]))) {
        violations.push(`one-off class value: ${match[0]}`)
      }
    }
    if (rawColour.test(value)) {
      violations.push(`raw colour: ${value}`)
    }
  }

  function walk(node: any) {
    if (node.type === TEXT) {
      const text = node.content.trim()
      if (text && !allowedText.includes(text)) {
        violations.push(`untranslated text: ${text}`)
      }
    }
    if (node.type === ELEMENT) {
      for (const property of node.props) {
        if (property.type === ATTRIBUTE) {
          const value = property.value?.content ?? ''
          if (textAttributes.includes(property.name) && value.trim()) {
            violations.push(`untranslated attribute: ${property.name}="${value}"`)
          }
          if (property.name === 'class' || property.name === 'style') {
            checkClasses(value)
          }
        }
        // Bound classes and styles, for example :class="{ 'p-[13px]': open }".
        if (property.type === DIRECTIVE && ['class', 'style'].includes(property.arg?.content)) {
          checkClasses(property.exp?.content ?? '')
        }
      }
    }
    for (const child of node.children ?? []) {
      walk(child)
    }
  }

  if (descriptor.template?.ast) {
    walk(descriptor.template.ast)
  }
  for (const style of descriptor.styles) {
    if (rawColour.test(style.content)) {
      violations.push('raw colour in a <style> block')
    }
  }
  const script = `${descriptor.script?.content ?? ''}\n${descriptor.scriptSetup?.content ?? ''}`
  if (quotedHexColour.test(script)) {
    violations.push('raw colour in <script>')
  }
  return violations
}

const root = new URL('../../', import.meta.url)

const files = folders.flatMap((folder) => {
  const directory = new URL(`${folder}/`, root)
  let names: string[] = []
  try {
    names = readdirSync(fileURLToPath(directory), { recursive: true, encoding: 'utf8' })
  }
  catch {
    // The folder does not exist yet. The test below reports missing files.
  }
  return names
    .filter(name => name.endsWith('.vue'))
    .map(name => `${folder}/${name.replaceAll('\\', '/')}`)
})

// The checker itself is tested first, so that "no violations" means something.
describe('template checker', () => {
  test.each([
    ['text', '<template><p>Hello</p></template>'],
    ['attribute text', '<template><img src="a.png" alt="Logo"></template>'],
    ['bracket value', '<template><div class="p-[13px]" /></template>'],
    ['bracket value with a variant', '<template><div class="md:w-[320px]" /></template>'],
    ['bracket value with a modifier', '<template><div class="text-[13px]/tight" /></template>'],
    ['bracket property', '<template><div class="[margin:13px]" /></template>'],
    ['bound class', '<template><div :class="{ \'mt-[3px]\': true }" /></template>'],
    ['colour in a class', '<template><div class="text-[#fff]" /></template>'],
    ['colour in a style attribute', '<template><div style="color: rgb(0 0 0)" /></template>'],
    ['colour in a style block', '<template><div /></template><style>div { color: #123456; }</style>'],
    ['colour in a script', '<script setup>const line = \'#ff0000\'</script><template><div /></template>'],
  ])('reports %s', (_name, source) => {
    expect(findViolations(source)).not.toEqual([])
  })

  test.each([
    ['translated text', '<template><p :title="t(\'a\')">{{ t(\'a\') }} · {{ count }}</p></template>'],
    ['anchors and slots', '<template><a href="#main"><slot /></a><Card><template #default /></Card></template>'],
    ['token classes', '<template><div class="p-4 current:text-accent md:max-w-content" /></template>'],
    ['bracket variants', '<template><div class="data-[state=open]:p-2 aria-[current=page]:underline" /></template>'],
    ['listed exceptions', '<template><div class="grid-cols-[1fr_auto] pb-[env(safe-area-inset-bottom)]" /></template>'],
    ['array class binding', '<template><div :class="[open && \'p-2\', extra]" /></template>'],
  ])('accepts %s', (_name, source) => {
    expect(findViolations(source)).toEqual([])
  })
})

describe('pages, components and layouts', () => {
  test('are found by the checker', () => {
    expect(files).toEqual(expect.arrayContaining([
      'components/LanguageSwitcher.vue',
      'layouts/default.vue',
      'pages/index.vue',
    ]))
  })

  test.each(files)('%s uses translations and tokens only', (file) => {
    expect(findViolations(readFileSync(new URL(file, root), 'utf8'))).toEqual([])
  })
})
