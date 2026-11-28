import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'

test('runs CI on the Node major documented for Vercel', () => {
  const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8')
  const deploymentGuide = readFileSync(new URL('../docs/DEPLOY.md', import.meta.url), 'utf8')
  const ciMajor = workflow.match(/^\s+node-version:\s*['"]?(\d+)/m)?.[1]
  const vercelMajor = deploymentGuide.match(/\*\*Node\.js Version\*\* is \*\*(\d+)\.x\*\*/)?.[1]

  expect(vercelMajor).toBeDefined()
  expect(ciMajor).toBe(vercelMajor)
})
