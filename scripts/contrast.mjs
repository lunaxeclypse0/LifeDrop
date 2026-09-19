/**
 * Text contrast in both themes, measured from rendered pixels.
 *
 * A translucent panel has no single background colour: what sits behind the
 * text is the aurora plus the panel fill plus whatever the panel is sitting on.
 * Computed styles cannot answer that, so this samples the actual painted pixels
 * beside each label and measures against the text's own colour.
 *
 *   node scripts/contrast.mjs
 */
import { chromium } from 'playwright'
import { PNG } from 'pngjs'

const BASE = 'http://localhost:4173'
const ROUTES = [
  ['home', '/#/home'],
  ['inbox', '/#/inbox'],
  ['settings', '/#/settings/notifications'],
  ['vault', '/#/vault'],
  ['spending', '/#/spending'],
  ['detail', '/#/item/globe'],
]

// WCAG 2.1 relative luminance.
const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const lum = ([r, g, b]) => 0.2126 * lin(r / 255) + 0.7152 * lin(g / 255) + 0.0722 * lin(b / 255)
const ratio = (a, b) => {
  const [hi, lo] = lum(a) > lum(b) ? [lum(a), lum(b)] : [lum(b), lum(a)]
  return (hi + 0.05) / (lo + 0.05)
}
const parse = (css) => (css.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number)

let worst = { r: 99 }
let failed = 0
let checked = 0

const b = await chromium.launch()
const ctx = await b.newContext({ viewport: { width: 400, height: 860 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const page = await ctx.newPage()

await page.goto(BASE + '/#/home', { waitUntil: 'networkidle' })
await page.waitForTimeout(500)
const sample = page.getByText(/sample data/i).first()
if (await sample.count()) { await sample.click(); await page.waitForTimeout(1400) }

for (const theme of ['dark', 'light'])
for (const [name0, hash] of ROUTES) {
  const name = `${name0} (${theme})`
  await page.goto(BASE + hash, { waitUntil: 'networkidle' })
  await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)
  await page.waitForTimeout(700)

  const shot = PNG.sync.read(await page.screenshot())
  const at = (x, y) => {
    const i = (shot.width * y + x) << 2
    return [shot.data[i], shot.data[i + 1], shot.data[i + 2]]
  }

  const targets = await page.evaluate(() => {
    const out = []
    // Every run of text that carries meaning, not decoration.
    for (const el of document.querySelectorAll('.t, .s, .d, .v, .amt, .when, .caption, .body2, p, h1, h2, .seclabel')) {
      const r = el.getBoundingClientRect()
      const text = el.textContent?.trim() ?? ''
      if (!text || r.width < 8 || r.height < 6) continue
      if (r.top < 0 || r.bottom > innerHeight || r.left < 0 || r.right > innerWidth) continue
      const cs = getComputedStyle(el)
      if (cs.visibility === 'hidden' || cs.opacity === '0') continue
      out.push({
        color: cs.color,
        size: parseFloat(cs.fontSize),
        weight: Number(cs.fontWeight) || 400,
        label: `${el.className || el.tagName}: ${text.slice(0, 28)}`,
        box: { x: r.x, y: r.y, w: r.width, h: r.height },
      })
    }
    return out.slice(0, 40)
  })

  for (const t of targets) {
    // Sample just above the text box: inside the same panel, clear of glyphs.
    const px = Math.round((t.box.x + 3) * 2)
    const py = Math.round((t.box.y - 3) * 2)
    if (px < 0 || py < 0 || px >= shot.width || py >= shot.height) continue
    const bg = at(px, py)
    const fg = parse(t.color)
    if (fg.length < 3) continue

    const r = ratio(fg, bg)
    checked++
    // WCAG AA: 3:1 for large text (>=18.66px bold or >=24px), else 4.5:1.
    const large = t.size >= 24 || (t.size >= 18.66 && t.weight >= 700)
    const need = large ? 3 : 4.5
    if (r < worst.r) worst = { r, need, name, label: t.label }
    if (r < need) {
      failed++
      console.log(`  LOW  ${name}  ${r.toFixed(2)}:1 (needs ${need})  ${t.label}`)
    }
  }
}

await b.close()
console.log(`\n${checked} text runs measured across both themes, ${failed} below WCAG AA.`)
console.log(`Lowest: ${worst.r.toFixed(2)}:1 (needs ${worst.need}) — ${worst.name} ${worst.label}`)
process.exit(failed ? 1 : 0)
