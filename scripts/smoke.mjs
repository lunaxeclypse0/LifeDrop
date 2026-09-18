import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'fs'
import { PNG } from 'pngjs'

const OUT = process.argv[2]
const BASE = 'http://localhost:4173'
mkdirSync(OUT, { recursive: true })

// A believable "screenshot of a Globe bill" — the filename is what the mock reads.
const png = new PNG({ width: 600, height: 900 })
for (let i = 0; i < png.data.length; i += 4) {
  png.data[i] = 240; png.data[i + 1] = 244; png.data[i + 2] = 252; png.data[i + 3] = 255
}
const FILE = `${OUT}/globe-fiber-bill.png`
writeFileSync(FILE, PNG.sync.write(png))

const errors = []
const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 400, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
})
const page = await ctx.newPage()
page.on('console', (m) => m.type() === 'error' && errors.push(`[console] ${m.text()}`))
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))

const step = async (name) => {
  await page.screenshot({ path: `${OUT}/${name}.png` })
  console.log('  ->', name)
}

await page.goto(BASE + '/#/', { waitUntil: 'networkidle' })
await page.waitForTimeout(2600)

// 1. open the Drop sheet from the nav
await page.goto(BASE + '/#/home', { waitUntil: 'networkidle' })
await page.waitForTimeout(600)
await page.getByRole('button', { name: 'Drop something' }).click()
await page.waitForTimeout(500)
await step('1-drop-sheet')

// 2. pick "Photo, screenshot or PDF"
await page.getByText('Photo, screenshot or PDF').click()
await page.waitForTimeout(500)
await step('2-upload')

// 3. choose the file
await page.setInputFiles('input[type=file]', FILE)
await page.waitForTimeout(1000)
await step('3-processing')

// 4. wait for Review
await page.waitForFunction(() => location.hash.startsWith('#/review'), null, { timeout: 15000 })
await page.waitForTimeout(600)
await step('4-review')

const title = await page.inputValue('input[placeholder="Internet Bill"]')
const merchant = await page.inputValue('input[placeholder="Globe Fiber"]')
console.log(`  extracted: title="${title}" merchant="${merchant}"`)

// 5. save
await page.getByRole('button', { name: /Save to LifeDrop/ }).click()
await page.waitForFunction(() => location.hash.startsWith('#/saved/'), null, { timeout: 10000 })
await page.waitForTimeout(1100)
await step('5-saved')

// 6. it should now be a real item in the inbox
await page.goto(BASE + '/#/inbox', { waitUntil: 'networkidle' })
await page.waitForTimeout(700)
const count = await page.locator('.dropcard').count()
console.log('  inbox cards:', count, '(a fresh install starts at 0)')
await step('6-inbox')

// 7. survives a reload (IndexedDB, not memory)
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
const after = await page.locator('.dropcard').count()
console.log('  inbox cards after reload:', after)

// 8. detail of the new drop, then mark paid
await page.locator('.dropcard').first().click()
await page.waitForTimeout(700)
await step('7-detail')

await browser.close()
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors')
