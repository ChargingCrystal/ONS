import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

// Guards a palette swap: every text and focus colour must stay readable (WCAG 2.1 AA).
const css = readFileSync(new URL('../css/tokens.css', import.meta.url), 'utf8')

// Matches "--palette-ink-900: #1f1a24;"
const paletteDeclaration = /--(palette-[\w-]+):\s*(#[0-9a-f]{6});/gi
// Matches "--ons-color-ink: light-dark(var(--palette-a), var(--palette-b));"
const roleDeclaration = /--ons-color-([\w-]+):\s*light-dark\(\s*var\(--(palette-[\w-]+)\),\s*var\(--(palette-[\w-]+)\)\s*\);/g

const palette = new Map<string, string>()
for (const [, name, hex] of css.matchAll(paletteDeclaration)) {
  palette.set(name!, hex!)
}

const roles = new Map<string, { light: string, dark: string }>()
for (const [, role, light, dark] of css.matchAll(roleDeclaration)) {
  roles.set(role!, { light: light!, dark: dark! })
}

function colourOf(role: string, theme: 'light' | 'dark'): string {
  const paletteName = roles.get(role)?.[theme]
  const hex = paletteName ? palette.get(paletteName) : undefined
  if (!hex) {
    throw new Error(`--ons-color-${role} (${theme}) does not resolve to a #rrggbb palette value`)
  }
  return hex
}

// Relative luminance as defined by WCAG.
function luminance(hex: string): number {
  const [red, green, blue] = [1, 3, 5].map((start) => {
    const channel = Number.parseInt(hex.slice(start, start + 2), 16) / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!
}

function contrast(first: string, second: string): number {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a)
  return (lighter! + 0.05) / (darker! + 0.05)
}

// [foreground role, background role, minimum ratio]
const pairs: [string, string, number][] = [
  ['ink', 'canvas', 4.5],
  ['ink', 'surface', 4.5],
  ['muted', 'canvas', 4.5],
  ['muted', 'surface', 4.5],
  ['accent', 'canvas', 4.5],
  ['accent', 'surface', 4.5],
  ['on-accent', 'accent', 4.5],
  // Focus rings are not text, so 3:1 is enough.
  ['focus', 'canvas', 3],
  ['focus', 'surface', 3],
]

describe('design tokens', () => {
  test('the contrast formula matches the known black and white ratio', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5)
  })

  test('every colour role is written as light-dark() of two palette values', () => {
    const declared = [...css.matchAll(/--ons-color-[\w-]+:/g)]
    expect(declared.length).toBeGreaterThan(0)
    expect(roles.size).toBe(declared.length)
  })

  test('raw colour values appear only in the palette', () => {
    const withoutPalette = css.replaceAll(paletteDeclaration, '')
    expect(withoutPalette).not.toMatch(/#[0-9a-f]{3,8}\b|\b(rgb|rgba|hsl|hsla|oklch)\(/i)
  })

  describe.each(['light', 'dark'] as const)('%s theme', (theme) => {
    test.each(pairs)('%s on %s reaches %s:1', (foreground, background, minimum) => {
      const ratio = contrast(colourOf(foreground, theme), colourOf(background, theme))
      expect(ratio).toBeGreaterThanOrEqual(minimum)
    })
  })
})
