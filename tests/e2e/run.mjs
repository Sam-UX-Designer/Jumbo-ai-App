#!/usr/bin/env node
/**
 * The end-to-end suite.
 *
 *   npm run build && npm test
 *
 * It serves the built app from `dist/` against a stand-in API and drives it
 * in a real browser. Every case carries a UC- number matching
 * docs/USE-CASES.md, so a failure names the promise that broke rather than
 * a line of code.
 *
 * Exit code is 0 only when every check passed.
 */
import { chromium } from 'playwright-core'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { startApi, findChrome, reporter } from './harness.mjs'

import onboarding from './cases/onboarding.mjs'
import logging from './cases/logging.mjs'
import settingsCases from './cases/settings.mjs'
import aiAndContent from './cases/ai-and-content.mjs'
import integrity from './cases/integrity.mjs'
import training from './cases/training.mjs'

const SUITES = {
  onboarding, logging, settings: settingsCases, ai: aiAndContent, training, integrity,
}

const ROOT = resolve(new URL('../..', import.meta.url).pathname)

const GREEN = '\x1b[32m', RED = '\x1b[31m', DIM = '\x1b[2m', BOLD = '\x1b[1m', OFF = '\x1b[0m'

async function main() {
  if (!existsSync(join(ROOT, 'dist', 'index.html'))) {
    console.error(`${RED}dist/ is missing. Run "npm run build" first.${OFF}`)
    process.exit(2)
  }

  const exe = findChrome()
  if (!exe) {
    console.error(`${RED}No Chrome or Chromium found.${OFF}`)
    console.error('Install one with "npx playwright install chromium", or set CHROME=/path/to/chrome.')
    process.exit(2)
  }

  const only = process.argv.slice(2).filter((a) => !a.startsWith('-'))
  const chosen = only.length ? only : Object.keys(SUITES)
  for (const name of chosen) {
    if (!SUITES[name]) {
      console.error(`${RED}Unknown suite "${name}". Known: ${Object.keys(SUITES).join(', ')}${OFF}`)
      process.exit(2)
    }
  }

  console.log(`${BOLD}JUMBO end-to-end suite${OFF}`)
  console.log(`${DIM}browser: ${exe}${OFF}`)

  const api = await startApi()
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] })
  const r = reporter()
  const started = Date.now()

  try {
    for (const name of chosen) {
      console.log(`\n${BOLD}${name}${OFF}`)
      const before = r.results.length
      await SUITES[name]({ browser, origin: api.origin, r })
      for (const c of r.results.slice(before)) {
        const bad = c.failures.length
        const mark = bad ? `${RED}FAIL${OFF}` : `${GREEN}pass${OFF}`
        console.log(`  ${mark}  ${c.id}  ${c.title}${DIM} (${c.checks.length} checks)${OFF}`)
        for (const f of c.failures) console.log(`        ${RED}✗${OFF} ${f}`)
      }
    }
  } finally {
    await browser.close()
    await api.close()
  }

  const s = r.summary()
  const secs = ((Date.now() - started) / 1000).toFixed(1)
  console.log(`\n${BOLD}${'─'.repeat(52)}${OFF}`)
  console.log(`use cases : ${s.cases - s.casesFailed}/${s.cases} passed`)
  console.log(`checks    : ${s.checks - s.checksFailed}/${s.checks} passed`)
  console.log(`time      : ${secs}s`)

  if (s.checksFailed) {
    console.log(`\n${RED}${BOLD}FAILED${OFF} — ${s.checksFailed} check(s) across ${s.casesFailed} use case(s).`)
    process.exit(1)
  }
  console.log(`\n${GREEN}${BOLD}All use cases passed.${OFF}`)
}

main().catch((err) => {
  console.error(`${RED}The suite could not run:${OFF}`, err)
  process.exit(2)
})
