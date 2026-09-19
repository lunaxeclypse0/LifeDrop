/**
 * The path a real user hit: the free tier refusing a scan.
 *
 * Drives a genuine capture against a stubbed /api/extract and checks the two
 * outcomes that matter — a per-minute limit is waited out and recovers without
 * the user doing anything, and a daily one stops honestly with two buttons that
 * are not touching.
 *
 * Needs a build made with VITE_EXTRACT_ENDPOINT=/api/extract, served on 4173:
 *   node scripts/ratelimit.mjs .ratelimit
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'fs'
import { PNG } from 'pngjs'

const OUT = process.argv[2] ?? '.ratelimit'
const BASE = 'http://localhost:4173'
mkdirSync(OUT, { recursive: true })

const png = new PNG({ width: 600, height: 900 })
for (let i = 0; i < png.data.length; i += 4) {
  png.data[i] = 240; png.data[i + 1] = 244; png.data[i + 2] = 252; png.data[i + 3] = 255
}
const FILE = `${OUT}/meralco-bill.png`
writeFileSync(FILE, PNG.sync.write(png))

let passed = 0, failed = 0
const check = (name, ok, detail) => {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; console.log(`  FAIL  ${name}`, detail ?? '') }
}

const limit = (scope, retryDelay) => ({
  status: 429,
  contentType: 'application/json',
  body: JSON.stringify({
    error: 'rate_limited',
    scope,
    retryAfter: retryDelay,
    message:
      scope === 'day'
        ? "Today's free allowance for this model is used up. It resets at midnight Pacific time."
        : 'The free tier allows only a few reads a minute.',
  }),
})

const READING = {
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({
    title: 'Electricity Bill', merchant: 'Meralco', amount: 3420.5, category: 'bill',
    date: '2026-09-30', time: null, repeat: 'monthly', remindDaysBefore: 3,
    reference: '', notes: '', confidence: 0.95, uncertain: [],
  }),
}

const browser = await chromium.launch()

async function scan(handler) {
  const ctx = await browser.newContext({
    viewport: { width: 400, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  })
  const page = await ctx.newPage()
  let calls = 0
  await page.route('**/api/extract', (route) => route.fulfill(handler(++calls)))

  await page.goto(BASE + '/#/home', { waitUntil: 'networkidle' })
  await page.waitForTimeout(700)
  await page.getByRole('button', { name: 'Drop something' }).click()
  await page.waitForTimeout(400)
  await page.getByText('Photo, screenshot or PDF').click()
  await page.waitForTimeout(400)
  await page.setInputFiles('input[type=file]', FILE)
  return { page, ctx, calls: () => calls }
}

// --- a busy minute: waited out, then it works -----------------------------
{
  console.log('\nper-minute limit')
  const { page, ctx, calls } = await scan((n) => (n === 1 ? limit('minute', 6) : READING))

  await page.waitForFunction(
    () => document.body.innerText.includes('Waiting for the AI'),
    null,
    { timeout: 15000 },
  ).catch(() => {})
  const waiting = await page.textContent('.screen')
  check('the wait is shown, not an error', /Waiting for the AI/.test(waiting ?? ''), waiting?.slice(0, 120))
  check('  and says how long', /Going again in \d+s/.test(waiting ?? ''), waiting?.slice(0, 200))
  check('  and promises nothing is lost', /Nothing is lost/.test(waiting ?? ''))
  await page.screenshot({ path: `${OUT}/1-waiting.png` })

  await page.waitForFunction(() => location.hash.startsWith('#/review'), null, { timeout: 25000 })
  check('recovers by itself, with no tap from the user', true)
  check('  and it did take a second attempt', calls() === 2, calls())
  const merchant = await page.inputValue('input[placeholder="Globe Fiber"]')
  check('  and the reading survives the retry', merchant === 'Meralco', merchant)
  await page.screenshot({ path: `${OUT}/2-recovered.png` })
  await ctx.close()
}

// --- a daily cap: stops honestly ------------------------------------------
{
  console.log('\ndaily limit')
  const { page, ctx, calls } = await scan(() => limit('day', 0))

  await page.waitForFunction(
    () => document.body.innerText.includes('out of free reads'),
    null,
    { timeout: 20000 },
  )
  const text = await page.textContent('.screen')
  check('says the day’s allowance is gone, not "wait a minute"', /resets at midnight/.test(text ?? ''), text?.slice(0, 200))
  check('  and does not burn retries on a limit that will not clear', calls() === 1, calls())
  check('  and offers to save it by hand', /type the details in now/.test(text ?? ''))

  // The defect in the screenshot the user sent: the two buttons were touching.
  const gaps = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.btn')].map((b) => b.getBoundingClientRect())
    return btns.slice(1).map((r, i) => Math.round(r.top - btns[i].bottom))
  })
  check(`stacked buttons are not touching (${gaps.join(', ')}px)`, gaps.every((g) => g >= 8), gaps)
  await page.screenshot({ path: `${OUT}/3-daily.png` })
  await ctx.close()
}

await browser.close()
console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
