import { chromium } from 'playwright'
import { mkdirSync } from 'fs'
mkdirSync('.glass', { recursive: true })
const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 400, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const p = await ctx.newPage()
await p.goto('http://localhost:4173/#/home', { waitUntil: 'networkidle' })
await p.evaluate(() => localStorage.setItem('lifedrop.theme', 'dark'))
for (const [name, hash] of [['home', '/#/home'], ['inbox', '/#/inbox'], ['settings', '/#/settings/notifications'], ['vault', '/#/vault']]) {
  await p.goto('http://localhost:4173' + hash, { waitUntil: 'networkidle' })
  await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
  await p.waitForTimeout(900)
  await p.screenshot({ path: `.glass/${name}.png` })
}
// load samples so cards are visible
await p.goto('http://localhost:4173/#/home', { waitUntil: 'networkidle' })
await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
await p.waitForTimeout(500)
const sample = p.getByText(/sample data/i).first()
if (await sample.count()) { await sample.click(); await p.waitForTimeout(1200) }
await p.screenshot({ path: '.glass/home-full.png' })
await p.goto('http://localhost:4173/#/inbox', { waitUntil: 'networkidle' })
await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
await p.waitForTimeout(900)
await p.screenshot({ path: '.glass/inbox-full.png' })
await b.close()
