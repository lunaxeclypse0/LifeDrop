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
| **Accounts** | Optional Supabase auth. Each user's drops are isolated by row-level security. |
| **Sync** | Offline-first: local write, outbox, flush when online. Originals go to a private bucket. |
| **Data** | JSON export of everything; permanent delete. |
| **Theme** | Light / dark / system, with a one-tap switch in the Home top bar. Honours `prefers-color-scheme` and `prefers-reduced-motion`. |
| **First run** | Empty. No invented drops, no fake numbers — a new install shows the empty states and one thing to do. |
| **Voice** | Ask questions, speak a drop, or search by voice. Browser speech in and out — no key, no quota. |

### About the first run

A fresh install has **no data at all**: empty Home, empty Inbox, empty Vault. Nothing
is invented on the user's behalf.

A demo vault of 18 Philippine bills, receipts and bookings is available, but only
when asked for — from the Home empty state ("Or look around with sample data") or
**Settings > Help & Support > Load sample data**. Every demo row carries
`sample: true`, so "Remove sample data" deletes exactly those and never touches a
real drop.

### About voice

The mic uses the browser's own `SpeechRecognition`, so it costs nothing and needs
no key. It works in Chrome (desktop and Android) and in **Safari** on iPhone —
Chrome on iOS has no access to it, and Firefox keeps it behind a flag.

Three things can be said:

| Said | Routed to |
|---|---|
| "How much have I spent this month?" | an answer, computed locally, read aloud |
| "Meralco bill 3420 due September 30" | the Review screen, pre-filled |
| "Find my Nike receipt" | Search |

**Only the transcript reaches the model.** `/api/voice` returns *what was asked* —
never the answer — and `src/lib/assistant.ts` computes every figure on the device
from the local store. Asking what you owe does not send your finances anywhere.

### About accounts

Accounts are optional. With no Supabase project connected the app is device-only
and never offers a sign-in; with one, drops sync to the signed-in user.

Sign-up asks for a **username**, not an email. Supabase has no username-only
mode, so a username is mapped to a synthetic address — `lance@lifedrop.invalid`
— and that is what is stored. `.invalid` is reserved by RFC 6761 and can never
resolve, so nothing is ever delivered to a real inbox. Uniqueness comes free,
because Supabase already refuses a duplicate address.

The cost is stated on the sign-up screen: with no real email there is no
password reset. The domain in `src/lib/username.ts` must never change once
anyone has signed up — it is how their account is found.

Turn **Confirm email** off in Supabase (Authentication → Sign In / Providers →
Email), or sign-up will wait forever for a confirmation that cannot arrive.

**Setting it up**

1. Create a project at [supabase.com](https://supabase.com) (free tier).
2. Run `supabase/schema.sql` in the SQL editor. **Do this before anything else** —
   it creates the tables *and* the row-level security.

   Use a project of its own. The file creates a `profiles` table and an
   `on_auth_user_created` trigger on `auth.users`; both names are common, so
   running it in a project that already has them will overwrite them.
   `supabase/uninstall.sql` backs the whole thing out if that happens.
3. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (Settings → API), then redeploy.

**Why the SQL file matters more than the key.** The anon key is public: it ships in
the JavaScript bundle and anyone can read it. That is by design. The only thing
standing between one user's bills and another's is the row-level security in that
file, where every policy is scoped to `auth.uid()`. Without it, the app is not safe
to hand to a second person.

**How sync works.** The device stays the fast path — every screen reads IndexedDB,
so the app opens instantly and works offline. Writes land locally first and go into
an outbox that flushes when the network allows, so nothing the user does is blocked
on a request. Conflicts resolve last-write-wins on `updatedAt`.

Signing out wipes the local vault, because the drops belong to the account rather
than the device and the next person to open the app should not find them.

### About the lock

What protects the vault on the device itself is **Settings > Privacy & Security > PIN lock**.
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

## Deploy to Vercel

The repo is ready to deploy as-is: the Vite build is the site, and `api/extract.ts`
becomes a serverless function at `/api/extract` automatically.

**1. Push to GitHub**, then in Vercel: *Add New → Project → Import*. Vercel detects
Vite; leave the build settings alone.

**2. Get a free Gemini key** at [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
No credit card.

**3. Set the environment variables** (Project → Settings → Environment Variables):

| Name | Value | Why |
|---|---|---|
| `GEMINI_API_KEY` | your key | Server-side only. Never reaches the browser. Also read from `API_KEY_LIFEDROP`, `GOOGLE_API_KEY` or `GEMINI_KEY`, whichever is set. |
| `VITE_EXTRACT_ENDPOINT` | `/api/extract` | Switches the app off the mock. Build-time, so it ends up in the bundle — never put a secret behind a `VITE_` name. |
| `GEMINI_MODEL` | *(optional)* `gemini-3.6-flash` | Override if the model id changes. |

**4. Redeploy.** `VITE_*` values are baked in at build time, so a deploy that ran
before you set it will still use the mock.

Leaving `VITE_EXTRACT_ENDPOINT` unset is a safe default — the app runs on the mock
extractor rather than breaking.

### What HTTPS unlocks

These only work on a real HTTPS origin, which is why a LAN address is not enough:

- the **Install app** button (`beforeinstallprompt` needs a secure context)
- the **camera**
- **notifications**

## AI extraction

`api/extract.ts` takes the drop, asks Gemini to read it, and returns an
`Extraction`. The prompt is tuned for Philippine bills and receipts — peso amounts,
local date conventions, and which date actually matters per category (due date for a
bill, renewal for a subscription, expiry for a warranty).

The image is downscaled to 1600px on the device before upload (`src/lib/image.ts`),
which keeps requests small, fast and well inside the free tier. Your full-size
original is still kept locally.

Status codes the client understands:

| Code | Meaning | What the user sees |
|---|---|---|
| 200 | a reading | Review screen, every field editable |
| 422 | genuinely unreadable | "We could not read this one" + retry / enter by hand |
| 429 | free tier exhausted | "The free limit was reached" + retry / enter by hand |
| 503 | `GEMINI_API_KEY` not set | "AI reading is not set up yet" + enter by hand |
| 502 | upstream or network failure | "That upload did not finish" + retry |

Free-tier limits move, so check
[ai.google.dev/gemini-api/docs/pricing](https://ai.google.dev/gemini-api/docs/pricing)
rather than trusting a number written here.

### Using a different provider

Nothing in the app knows about Gemini. `src/lib/extract.ts` defines one interface:

```ts
interface Extractor {
  extract(source: DropSource, onStep?, signal?): Promise<Extraction>
}
```

`getExtractor()` picks `HttpExtractor` when `VITE_EXTRACT_ENDPOINT` is set and
`MockExtractor` otherwise. To swap in Groq, OpenRouter, Claude or anything else,
rewrite the body of `api/extract.ts` and keep its status codes. No screen changes.

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
    assistant.ts   answers spoken questions from the local store
    icons.ts       the 24px icon grid
    image.ts       downscales a capture before upload
    install.ts     PWA install prompt, per platform
    lock.ts        PIN hashing, attempt limiting, WebAuthn enrolment
    speech.ts      browser speech in and out
    supabase.ts    client and row mapping
    username.ts    username <-> synthetic address, and validation
    sync.ts        outbox, pull/push, image upload
supabase/
  schema.sql     tables, triggers and the row-level security policies
  uninstall.sql  removes them again, cautiously, if run in the wrong project
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
npm test                   # both suites below
npm run test:api           # api/extract.ts against a stubbed Gemini, no key needed
npm run test:voice         # intent routing + the locally computed answers

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
