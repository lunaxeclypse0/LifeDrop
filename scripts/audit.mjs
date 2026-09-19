/**
 * Layout and health audit across every screen, in both themes.
 *
 * Measures rather than eyeballs: horizontal overflow, touch targets under
 * 44px, controls that sit too close together, text clipped without an
 * ellipsis, and anything the console complains about.
 *
 *   npm run preview &   (or have it running)
 *   node scripts/audit.mjs .audit
 */
import { chromium } from 'playwright'
import { mkdirSync } from 'fs'

const OUT = process.argv[2] || '.audit'
const BASE = 'http://localhost:4173'
mkdirSync(OUT, { recursive: true })

const ROUTES = [
  ['home', '/#/home'],
  ['inbox', '/#/inbox'],
  ['calendar', '/#/calendar'],
  ['vault', '/#/vault'],
  ['vault-bills', '/#/vault/bill'],
  ['search', '/#/search'],
  ['voice', '/#/voice'],
  ['spending', '/#/spending'],
  ['subscriptions', '/#/subscriptions'],
  ['notifications', '/#/notifications'],
  ['profile', '/#/profile'],
  ['settings-notifs', '/#/settings/notifications'],
  ['settings-privacy', '/#/settings/privacy'],
  ['settings-appearance', '/#/settings/appearance'],
  ['settings-help', '/#/settings/help'],
  ['settings-pin', '/#/settings/pin'],
  ['capture-upload', '/#/capture/upload'],
  ['review-manual', '/#/review?manual=1'],
  ['detail', '/#/item/globe'],
  ['edit', '/#/item/globe/edit'],
  ['account', '/#/account'],
  ['onboarding', '/#/onboarding'],
  ['setup', '/#/setup?edit=1'],
]

/** Runs in the page. Returns everything measurable that could be wrong. */
const PROBE = () => {
  const issues = []
  const seen = (el) => {
    const r = el.getBoundingClientRect()
    const s = getComputedStyle(el)
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.opacity !== '0'
  }
  const label = (el) => {
    const t = (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ')
    return t.slice(0, 40) || `<${el.tagName.toLowerCase()}>`
  }

  // 1. the page must never scroll sideways
  const doc = document.documentElement
  if (doc.scrollWidth > doc.clientWidth + 1) {
    issues.push({ kind: 'overflow-x', detail: `page scrolls ${doc.scrollWidth - doc.clientWidth}px sideways` })
  }
  for (const el of document.querySelectorAll('.scrollhost, .device, .screen')) {
    if (el.scrollWidth > el.clientWidth + 1) {
      issues.push({ kind: 'overflow-x', detail: `${el.className.split(' ')[0]} scrolls ${el.scrollWidth - el.clientWidth}px sideways` })
    }
  }

  // 2. touch targets — measured by what actually responds to a tap, not by the
  //    painted size, because several controls grow their hit area with a
  //    transparent ::after and stay visually small on purpose.
  const controls = [...document.querySelectorAll('button, a[href], input, select, [role="switch"]')]
    .filter(seen)
    .filter((el) => !el.closest('.swipe-actions'))
  const hits = (el, x, y) => {
    const at = document.elementFromPoint(x, y)
    return !!at && (at === el || el.contains(at) || at.parentElement === el)
  }
  for (const el of controls) {
    const r = el.getBoundingClientRect()
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    // Reachable across a 40px-tall band centred on the control?
    const tall = hits(el, cx, cy - 19) && hits(el, cx, cy + 19)
    const wide = hits(el, cx - 19, cy) && hits(el, cx + 19, cy)
    if (!tall && r.height < 40) {
      issues.push({ kind: 'small-target', detail: `${label(el)} is only ${Math.round(r.height)}px tall to tap` })
    } else if (!wide && r.width < 40) {
      issues.push({ kind: 'small-target', detail: `${label(el)} is only ${Math.round(r.width)}px wide to tap` })
    }
  }

  // 3. controls that nearly touch. Scrolling content passing behind the fixed
  //    nav is expected, so pairs that straddle it are not a finding.
  const boxes = controls.map((el) => ({ el, r: el.getBoundingClientRect() }))
  const zone = (el) => (el.closest('.nav') ? 'nav' : el.closest('.scrollhost') ? 'scroll' : 'chrome')
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j]
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue
      if (zone(a.el) !== zone(b.el)) continue
      const overlapY = a.r.top < b.r.bottom - 2 && b.r.top < a.r.bottom - 2
      const overlapX = a.r.left < b.r.right - 2 && b.r.left < a.r.right - 2
      if (overlapY && overlapX) {
        issues.push({ kind: 'overlap', detail: `${label(a.el)} overlaps ${label(b.el)}` })
        continue
      }
      if (overlapY) {
        const gap = b.r.left > a.r.right ? b.r.left - a.r.right : a.r.left - b.r.right
        if (gap >= 0 && gap < 6) {
          issues.push({ kind: 'tight-gap', detail: `${label(a.el)} / ${label(b.el)} only ${gap.toFixed(1)}px apart` })
        }
      }

      // The same check the other way round. It is limited to full-width
      // buttons because stacked list rows are meant to sit flush against
      // their dividers, while two stacked buttons touching read as one odd
      // control — and put two different outcomes a thumb's width apart.
      if (overlapX && a.el.classList.contains('btn') && b.el.classList.contains('btn')) {
        const gap = b.r.top > a.r.bottom ? b.r.top - a.r.bottom : a.r.top - b.r.bottom
        if (gap >= 0 && gap < 8) {
          issues.push({
            kind: 'tight-gap',
            detail: `${label(a.el)} / ${label(b.el)} stacked only ${gap.toFixed(1)}px apart`,
          })
        }
      }
    }
  }

  // 3b. text squeezed into a vertical column. A control stretched by a CSS rule
  //     it was never meant to match starves its neighbour, and every check
  //     above misses it: the control is too big rather than too small, and the
  //     text it crushes is not a control at all.
  //     `seen()` is deliberately not used here: it requires a non-zero width,
  //     and a fully collapsed container is the worst version of this bug.
  for (const el of document.querySelectorAll('div, span, p, h1, h2, h3, label')) {
    const s = getComputedStyle(el)
    if (s.visibility === 'hidden' || s.opacity === '0' || s.display === 'none') continue
    const r = el.getBoundingClientRect()
    const text = el.textContent?.trim() ?? ''
    if (!text) continue

    // Two shapes, both unmistakable. A stat column is legitimately narrow —
    // 32px wide and 51px tall — so the thresholds are set to leave it alone.
    // A one-glyph adornment like the ₱ in front of an amount is narrow on
    // purpose; a label is not.
    const collapsed = r.width < 12 && r.height > 20 && text.length > 3
    const column = r.width < 60 && r.height > r.width * 2.5 && text.length > 8
    if (!collapsed && !column) continue

    // A wide parent with a starved child is the symptom; a narrow parent is
    // just a narrow layout.
    const parent = el.parentElement?.getBoundingClientRect()
    if (!parent || parent.width < Math.max(r.width * 3, 80)) continue
    issues.push({
      kind: 'crushed-text',
      detail: `${label(el)} is squeezed to ${Math.round(r.width)}px inside a ${Math.round(parent.width)}px parent`,
    })
  }

  // 4. text cut off with no ellipsis
  for (const el of document.querySelectorAll('h1, h2, h3, p, span, div')) {
    if (!seen(el) || el.children.length) continue
    const s = getComputedStyle(el)
    if (s.overflow === 'visible' || s.textOverflow === 'ellipsis') continue
    if (el.scrollWidth > el.clientWidth + 2) {
      issues.push({ kind: 'clipped-text', detail: `"${label(el)}" clipped by ${el.scrollWidth - el.clientWidth}px` })
    }
  }

  // 5. anything sticking out past the frame
  const frame = document.querySelector('.device')?.getBoundingClientRect()
  if (frame) {
    for (const el of document.querySelectorAll('.card, .dropcard, .btn, .rows, .gradcard')) {
      if (!seen(el)) continue
      const r = el.getBoundingClientRect()
      if (r.left < frame.left - 1 || r.right > frame.right + 1) {
        issues.push({ kind: 'out-of-frame', detail: `${el.className.split(' ')[0]} extends past the screen edge` })
      }
    }
  }

  // de-duplicate, they repeat a lot
  const key = (i) => `${i.kind}|${i.detail}`
  return [...new Map(issues.map((i) => [key(i), i])).values()]
}

const browser = await chromium.launch()
const report = {}
let consoleErrors = []

for (const scheme of ['light', 'dark']) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    colorScheme: scheme,
  })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => consoleErrors.push(`[${scheme}] pageerror: ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(`[${scheme}] ${m.text().slice(0, 120)}`)
  })

  await page.goto(BASE + '/#/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(2500)

  // give every screen something to render
  await page.goto(BASE + '/#/home', { waitUntil: 'networkidle' })
  await page.waitForTimeout(600)
  const seed = page.getByRole('button', { name: /sample data/i })
  if (await seed.count()) {
    await seed.click()
    await page.waitForTimeout(900)
  }

  for (const [name, path] of ROUTES) {
    await page.goto(BASE + path, { waitUntil: 'networkidle' })
    await page.waitForTimeout(650)
    const found = await page.evaluate(PROBE)
    const k = `${name} (${scheme})`
    if (found.length) report[k] = found
    await page.screenshot({ path: `${OUT}/${name}-${scheme}.png`, fullPage: false })
  }
  await ctx.close()
}

await browser.close()

const keys = Object.keys(report)
if (!keys.length) {
  console.log('No layout issues found across', ROUTES.length, 'screens x 2 themes.')
} else {
  let total = 0
  for (const k of keys) {
    console.log(`\n${k}`)
    for (const i of report[k]) {
      total++
      console.log(`   ${i.kind.padEnd(14)} ${i.detail}`)
    }
  }
  console.log(`\n${total} issue(s) across ${keys.length} screen/theme combinations.`)
}

console.log(
  consoleErrors.length
    ? `\nCONSOLE:\n${[...new Set(consoleErrors)].join('\n')}`
    : '\nNo console errors.',
)
