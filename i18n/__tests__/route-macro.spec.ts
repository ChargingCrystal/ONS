import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

// The route macro of @nuxtjs/i18n rewrites a page and leaves two versions of its source
// behind. On Linux the test build then stops with "Multiple conflicting contents for
// sourcemap source". Windows does not show this, so this check reads the files.
// To leave a page without language prefixes, list it under i18n.pages in nuxt.config.ts.

// The plugin also rewrites a call that only appears in a comment.
const macroCall = /\bdefineI18nRoute\s*\(/

const root = fileURLToPath(new URL('../../', import.meta.url))

const vueFiles = [
  'app.vue',
  ...['components', 'layouts', 'pages'].flatMap(folder =>
    readdirSync(join(root, folder), { recursive: true, encoding: 'utf8' })
      .filter(name => name.endsWith('.vue'))
      .map(name => `${folder}/${name.replaceAll('\\', '/')}`),
  ),
]

test('no page or component calls the i18n route macro', () => {
  // Makes sure the search really looked at the pages.
  expect(vueFiles).toContain('pages/auth/callback.vue')

  const callers = vueFiles.filter(file => macroCall.test(readFileSync(join(root, file), 'utf8')))
  expect(callers, 'list the page under i18n.pages in nuxt.config.ts instead').toEqual([])
})
