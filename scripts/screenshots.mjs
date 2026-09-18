import { chromium } from 'playwright'
import { mkdirSync } from 'fs'

const OUT = process.argv[2]
const BASE = 'http://localhost:4173'
mkdirSync(OUT, { recursive: true })

const SHOTS = [
  ['home', '/#/home', 1200],
  ['inbox', '/#/inbox', 700],
  ['calendar', '/#/calendar', 700],
  ['vault', '/#/vault', 700],
  ['detail', '/#/item/globe', 700],
  ['spending', '/#/spending', 1300],
  ['subs', '/#/subscriptions', 700],
  ['upload', '/#/capture/upload', 600],
  ['notifications', '/#/notifications', 600],
  ['appearance', '/#/settings/appearance', 600],
]

const errors = []

const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 400, height: 860 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  permissions: [],
})
const page = await ctx.newPage()
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`[console] ${m.text()}`)
})
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))

// Skip splash/onboarding: mark the profile as set up before the app boots.
await page.goto(BASE + '/#/', { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)

for (const [name, path, wait] of SHOTS) {
  await page.goto(BASE + path, { waitUntil: 'networkidle' })
  await page.waitForTimeout(wait)
  await page.screenshot({ path: `${OUT}/${name}.png` })
}

// dark mode
await page.emulateMedia({ colorScheme: 'dark' })
await page.goto(BASE + '/#/home', { waitUntil: 'networkidle' })
await page.waitForTimeout(900)
await page.screenshot({ path: `${OUT}/home-dark.png` })

await browser.close()
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors')
