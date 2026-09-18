import { chromium } from 'playwright'
import { mkdirSync } from 'fs'

const OUT = process.argv[2] || '.lock'
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

const dump = (n) => page.screenshot({ path: `${OUT}/${n}.png` })
const type = async (digits) => {
  for (const d of digits) await page.getByRole('button', { name: d, exact: true }).click()
}

await page.goto(BASE + '/#/', { waitUntil: 'networkidle' })
await page.waitForTimeout(2600)

// --- turn the PIN on ---
await page.goto(BASE + '/#/settings/privacy', { waitUntil: 'networkidle' })
await page.waitForTimeout(600)
await dump('1-privacy-before')
await page.getByRole('switch', { name: 'PIN lock' }).click()
await page.waitForTimeout(600)
await dump('2-choose')
await type('246810')
await page.waitForTimeout(700)
await dump('3-confirm')
await type('246810')
await page.waitForTimeout(1400)
console.log('  after set, hash:', await page.evaluate(() => location.hash))
await dump('4-privacy-after')

// the stored record must not contain the PIN
const stored = await page.evaluate(async () => {
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('lifedrop')
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
  })
  return await new Promise((res, rej) => {
    const r = db.transaction('settings').objectStore('settings').get('app')
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
  })
})
const blob = JSON.stringify(stored.lock)
console.log('  stored lock:', blob.slice(0, 96) + '…')
console.log('  PIN in storage:', blob.includes('246810') ? 'YES — BUG' : 'no')

// --- reload: it must demand the PIN ---
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1600)
const gated = await page.locator('.pinpad').count()
console.log('  locked on reload:', gated ? 'YES' : 'NO — BUG')
await dump('5-locked')

// --- wrong PIN ---
await type('111111')
await page.waitForTimeout(900)
const stillLocked = await page.locator('.pinpad').count()
console.log('  wrong PIN rejected:', stillLocked ? 'YES' : 'NO — BUG')
await dump('6-wrong')

// --- right PIN ---
await type('246810')
await page.waitForTimeout(1200)
const inApp = await page.evaluate(() => location.hash)
console.log('  right PIN opens app:', (await page.locator('.pinpad').count()) === 0 ? 'YES' : 'NO — BUG', inApp)
await dump('7-unlocked')

// --- lockout after repeated failures ---
await page.evaluate(() => { localStorage.removeItem('lifedrop.lockAttempts') })
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
for (let i = 0; i < 5; i++) { await type('000000'); await page.waitForTimeout(500) }
const body = await page.locator('.lock-top p').innerText()
console.log('  after 5 wrong:', JSON.stringify(body))
await dump('8-lockout')

await browser.close()
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors')
