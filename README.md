# LifeDrop

**Drop it. LifeDrop remembers.**

A personal AI-powered life organizer, built as an installable PWA. Drop a screenshot,
bill, receipt, booking or document; LifeDrop reads out the title, merchant, amount,
dates, category and reminder, shows you everything, and files it once you confirm.

Built from the LifeDrop Mobile UX System — tokens, motion spec and icon grid — with
the supplied LifeDrop logo as the mark and the source of the colour palette.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173, also served on your LAN IP
```

```bash
npm run build    # type-check + production bundle into dist/
npm run preview  # serve dist/ on http://localhost:4173
```

## Put it on your phone

`npm run dev` prints a `Network:` address. Open that on your phone (same Wi-Fi), then:

- **Android / Chrome** — menu → *Add to Home screen*
- **iOS / Safari** — Share → *Add to Home Screen*

It then launches full-screen with no browser chrome, works offline, and keeps its
own storage. To put it somewhere permanent, deploy `dist/` to any static host
(Vercel, Netlify, Cloudflare Pages, GitHub Pages) — `base` is `./`, so it works
from a subpath too.

**Camera and notifications need HTTPS.** `localhost` is exempt, but a raw LAN IP is
not — so on a phone, the camera only works once the app is on a real HTTPS host.
Uploading a photo or screenshot works everywhere.

## What actually works

Nothing here is a mock-up. Every screen reads and writes the same store.

| | |
|---|---|
| **Storage** | IndexedDB — drops, original images, settings. Survives reload and offline. |
| **Capture** | Live camera (`getUserMedia`), file picker, drag-and-drop, clipboard paste, manual entry. |
| **Extraction** | Pluggable — see below. The mock reads the file name and returns a plausible Philippine-merchant reading. |
| **Review** | Every extracted field is editable, and validated, before anything is saved. |
| **Reminders** | Real `Notification`s, per-drop offsets (0–90 days), category preferences, quiet hours, lock-screen privacy. |
| **Repeats** | Marking a monthly bill paid rolls it to next month instead of ending it. |
| **Inbox** | Category filters, sort, swipe-to-archive with undo. |
| **Calendar** | Real month grid with category dots, day agenda, and a grouped agenda view. |
| **Vault** | Per-category browsing, list/grid, expiring-soon, archive. |
| **Spending** | Six-month trend and per-category breakdown from your own drops. |
| **Search** | Across title, merchant, reference, notes, category and file name. |
| **Lock** | Real PIN (PBKDF2-SHA256, salted, never stored in the clear), escalating lockout after 5 wrong tries, optional Face ID / fingerprint via WebAuthn. |
| **Data** | JSON export of everything; permanent delete. |
| **Theme** | Light / dark / system, with a one-tap switch in the Home top bar. Honours `prefers-color-scheme` and `prefers-reduced-motion`. |
| **First run** | Empty. No invented drops, no fake numbers — a new install shows the empty states and one thing to do. |

### About the first run

A fresh install has **no data at all**: empty Home, empty Inbox, empty Vault. Nothing
is invented on the user's behalf.

A demo vault of 18 Philippine bills, receipts and bookings is available, but only
when asked for — from the Home empty state ("Or look around with sample data") or
**Settings > Help & Support > Load sample data**. Every demo row carries
`sample: true`, so "Remove sample data" deletes exactly those and never touches a
real drop.

### About accounts and the lock

There is no account and no server, so there is no sign-in — a password box would
be theatre, since nothing could check it. First run sets up a **local profile**
(name, optional email) and everything lives in this browser's storage on this one
device. Nothing syncs.

What actually protects the vault is **Settings > Privacy & Security > PIN lock**.
The PIN is never stored; only a salted PBKDF2-SHA256 hash is. Five wrong tries
starts a lockout that doubles from 30s. Face ID / Touch ID / Windows Hello can be
enrolled as a faster path, with the PIN always available as fallback.

Its limit, stated plainly: the PIN gates the **UI**. It does not encrypt IndexedDB.
It stops someone who picks up your phone; it does not stop someone who controls the
machine and opens developer tools. Encrypting the store with a key derived from the
PIN is the next step up, and it trades away recovery — forget the PIN and the data
is gone.

### About reminders

LifeDrop is a web app with no server, so it cannot wake itself while your phone is
asleep. Reminders are evaluated when the app is open and each time you return to it,
and each one fires at most once per occurrence. Keeping it on your home screen and
opening it daily is what makes it reliable. A real push backend would call
`dueReminders()` from `src/lib/reminders.ts` on a schedule instead.

## Wiring real AI extraction

Everything that reads a drop goes through one interface in `src/lib/extract.ts`:

```ts
interface Extractor {
  extract(source: DropSource, onStep?, signal?): Promise<Extraction>
}
```

`getExtractor()` returns `MockExtractor` unless `VITE_EXTRACT_ENDPOINT` is set, in
which case it returns `HttpExtractor` pointed at your backend. No screen imports an
implementation directly, so this is the only switch.

```bash
# .env.local
VITE_EXTRACT_ENDPOINT=https://your-api.example.com/extract
```

Your endpoint receives `multipart/form-data` with `file`, `kind`
(`camera` | `upload` | `paste` | `manual`) and `today` (`yyyy-mm-dd`), and returns:

```json
{
  "title": "Internet Bill",
  "merchant": "Globe Fiber",
  "amount": 1899,
  "category": "bill",
  "date": "2026-09-28",
  "time": null,
  "repeat": "monthly",
  "remindDaysBefore": 2,
  "reference": "Account ending 4421",
  "notes": "Plan 1899 · unlimited",
  "confidence": 0.94,
  "uncertain": []
}
```

Return **422** when the drop is genuinely unreadable — the app has a designed state
for that. `confidence` below `REVIEW_THRESHOLD` (0.82) flags the drop for review and
highlights the fields named in `uncertain`.

Keep the model key on the server. The backend is where you would call a vision model
with the image and this schema; the client never holds a credential.

## Layout

```
src/
  lib/
    types.ts       Drop, Extraction, categories, statuses
    db.ts          IndexedDB (drops, image blobs, settings, export, wipe)
    store.ts       Zustand store + selectors
    extract.ts     Extractor interface, MockExtractor, HttpExtractor
    reminders.ts   due-reminder evaluation and notification sweep
    format.ts      peso, dates, urgency, repeat arithmetic
    icons.ts       the 24px icon grid
    lock.ts        PIN hashing, attempt limiting, WebAuthn enrolment
    seed.ts        sample vault, built on dates relative to first open
  components/      Icon, Brand, UI kit, DropCard, DropForm, PinPad, Sheet, Toast, States
  screens/         one file per screen
  styles/          tokens.css (design system) + global.css
  assets/          lifedrop-mark.png — the logo mark, ground removed
public/
  favicon.png
  icons/           PWA icons, generated from the same mark
```

## Checks

```bash
npm run typecheck
npm run build

npm run preview &          # the two browser checks need it running
npm run smoke              # drop -> process -> review -> save -> persists
node scripts/interactions.mjs   # mark-paid rollover, archive/undo, search, validation
node scripts/lock.mjs           # PIN set -> reload gate -> wrong PIN -> lockout
npm run shots              # screenshots of every main screen, light and dark
```

## Notes on the design

- The mark is the supplied logo artwork, not a re-trace. Only the ground *outside*
  the silhouette was made transparent; the whites *inside* the ribbon are part of the
  design and are kept, which is why the app icon sits on a white plate. The palette
  tokens (`#12D5FD` cyan, `#1A94FD` blue, `#683CFC` violet, `#061A3C` ink) were
  sampled from that artwork.
- Light mode is a white canvas held together by 1px hairlines rather than by shadows
  and grey panels. Weight is carried by type and by one accent, used sparingly. Dark
  mode is the same restraint on a near-black navy ground — not an inversion.
- Category colours come from the brand system. They are used as tinted tiles that
  always carry an icon **and** a text label — they are not separable enough to work
  as a chart palette on their own (subscription and booking sit 1.3 ΔE apart under
  deuteranopia), so Spending uses labelled meter rows and a single-hue trend rather
  than a donut or a stacked bar.
- Status is always icon + word + colour, never colour alone.
- Touch targets are 44px or larger; `prefers-reduced-motion` collapses every
  animation and the processing sequence still completes.
- No raster imagery ships with the app. Where a real photo belongs and none exists,
  a labelled document placeholder is drawn instead.
