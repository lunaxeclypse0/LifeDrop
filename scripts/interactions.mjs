import { chromium } from 'playwright'
import { mkdirSync } from 'fs'

const OUT = process.argv[2] || '.interactions'
const BASE = 'http://localhost:4173'
mkdirSync(OUT, { recursive: true })

const errors = []
const browser = await chromium.launch()
const ctx = await browser.newContext({
  viewport: { width: 400, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
})
const page = await ctx.newPage()
page.on('console', (m) => m.type() === 'error' && errors.push(`[console] ${m.text()}`))
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))

const dump = async (n) => page.screenshot({ path: `${OUT}/${n}.png` })

await page.goto(BASE + '/#/', { waitUntil: 'networkidle' })
await page.waitForTimeout(2600)

// A fresh install is empty by design, so load the demo vault to have
// something to act on.
await page.goto(BASE + '/#/home', { waitUntil: 'networkidle' })
await page.waitForTimeout(600)
await page.getByRole('button', { name: /sample data/i }).click()
await page.waitForTimeout(900)
console.log('  loaded samples:', await page.locator('.dropcard').count(), 'cards on Home')

// --- mark a monthly bill paid: it should roll forward, not vanish ---
await page.goto(BASE + '/#/item/globe', { waitUntil: 'networkidle' })
await page.waitForTimeout(600)
const before = await page.locator('.kv', { hasText: 'Date' }).first().innerText()
await page.getByRole('button', { name: 'Mark Paid' }).click()
await page.waitForTimeout(800)
const after = await page.locator('.kv', { hasText: 'Date' }).first().innerText()
console.log('  bill date before:', before.replace(/\n/g, ' '))
console.log('  bill date after :', after.replace(/\n/g, ' '))
console.log('  rolled forward  :', before !== after ? 'YES' : 'NO — BUG')
await dump('markpaid')

// --- a one-off receipt should just settle ---
await page.goto(BASE + '/#/item/nike', { waitUntil: 'networkidle' })
await page.waitForTimeout(500)
await page.getByRole('button', { name: 'Mark Done' }).click()
await page.waitForTimeout(700)
const status = await page.locator('.badge').first().innerText()
console.log('  receipt status  :', status)

// --- archive + undo from the inbox ---
await page.goto(BASE + '/#/inbox', { waitUntil: 'networkidle' })
await page.waitForTimeout(700)
const start = await page.locator('.dropcard').count()
const row = page.locator('.swipe').first()
const box = await row.boundingBox()
await page.mouse.move(box.x + box.width - 40, box.y + box.height / 2)
await page.mouse.down()
await page.mouse.move(box.x + 40, box.y + box.height / 2, { steps: 10 })
await page.mouse.up()
await page.waitForTimeout(500)
await dump('swiped')
await page.getByRole('button', { name: 'Archive' }).first().click()
await page.waitForTimeout(600)
const archived = await page.locator('.dropcard').count()
await dump('archived-toast')
await page.getByRole('button', { name: 'Undo' }).click()
await page.waitForTimeout(600)
const restored = await page.locator('.dropcard').count()
console.log(`  inbox ${start} -> archive ${archived} -> undo ${restored}`)
console.log('  archive/undo    :', archived === start - 1 && restored === start ? 'OK' : 'BUG')

// --- search ---
await page.goto(BASE + '/#/search', { waitUntil: 'networkidle' })
await page.waitForTimeout(400)
await page.fill('input[type=search]', 'meralco')
await page.waitForTimeout(500)
console.log('  search "meralco":', await page.locator('.dropcard').count(), 'result(s)')
await dump('search')

// --- manual entry ---
await page.goto(BASE + '/#/review?manual=1', { waitUntil: 'networkidle' })
await page.waitForTimeout(500)
await page.getByRole('button', { name: 'Save to LifeDrop' }).click()
await page.waitForTimeout(500)
const blocked = await page.locator('.errmsg').count()
console.log('  empty title blocked:', blocked > 0 ? 'OK' : 'BUG — saved a blank drop')
await dump('manual-validation')

await browser.close()
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors')
