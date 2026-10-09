# randpierce.com: build brief

Personal brand + splash page for screenwriter **Rand Pierce**. One page, one job: get visitors to enter an email and download the screenplay **POP POP** (PDF), and notify the owner of every download.

`index.html` in this folder is the finished, approved front-end design (static HTML/CSS/vanilla JS, no framework, no build step). Treat it as the source of truth for the look. **Do not redesign it.** The work left is the backend, the content gaps, and deployment.

## Stack and hosting

- Static site + Vercel serverless functions (`/api/*`, Node). No frontend framework needed.
- GitHub repo (make it **private**, see "Protecting the PDF") deployed with Vercel's Git integration.
- Domain: `randpierce.com` (apex) and `www` redirecting to the apex.

Suggested layout:

```
/index.html
/assets/            rand-pierce-logo.png, pop-pop-poster.jpg, pop-pop-poster-full.jpg, desk-bg.jpg
/api/download.js    POST: validate email, store it, notify owner, return a short-lived link
/api/script.js      GET: verify the link token, stream the PDF
/private/           POP-POP.pdf (never inside the static/public root)
/CLAUDE.md
```

## What the page does (already built in index.html)

1. Visitor sees the logo, SCREENWRITER, the POP POP panel, a line about new screenplays, and footer links.
2. Clicking the **READ NOW** page icon (only that, not the whole panel) opens a modal asking for an email address. Returning visitors **re-enter** their email every time. Do not remember them.
3. On submit the page `POST`s JSON `{ "email": "...", "website": "" }` to `/api/download` and expects `200` with `{ "downloadUrl": "..." }`. On success the modal swaps, in place, to a **DOWNLOAD PDF** link. Any non-200 shows "Something went wrong. Please try again."
4. `website` is a honeypot field humans never fill. If it is non-empty, the server should pretend success and do nothing.
5. When `index.html` is opened from disk (`file://`) it skips the network call and shows a placeholder link, so the flow can be previewed without a server. That branch is inert in production.
6. ABOUT and TERMS open native `<dialog>` overlays. The ABOUT dialog holds the bio and the contact email (bold, not a link). The footer has a Bluesky icon between ABOUT and TERMS linking to https://bsky.app/profile/randpierce.bsky.social.

## Backend to build

### `POST /api/download`
- Validate: JSON body, `email` is a string, trimmed, lowercased, max 254 chars, simple format check. Reject otherwise with 400.
- Honeypot: if `website` is non-empty, return `200 { "downloadUrl": "#" }` and do nothing else.
- Rate limit per IP (for example 5 requests per 10 minutes) using the same store. Return 429 when exceeded. Store only a salted hash of the IP, never the raw IP.
- Store a record: `{ email, createdAt, ipHash }`. Keep a running total of downloads and a count of unique emails.
- Email the owner via **Resend**: subject like `New POP POP download: someone@example.com (#42)`, body with the email, timestamp, total downloads and unique emails. If the email send fails, log it and **still return the link** (the stored record is the source of truth).
- Return `{ "downloadUrl": "/api/script?t=<token>" }`.
- The token is `base64url(JSON {exp})` + `.` + HMAC-SHA256 signature using `DOWNLOAD_SECRET`, valid about 15 minutes. Use a constant-time comparison to verify.

### `GET /api/script?t=...`
- Verify the token and expiry, else 403.
- Stream the PDF with `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="POP POP - Rand Pierce.pdf"`, `Cache-Control: private, no-store`.

### Protecting the PDF
The goal is that every download corresponds to an email the owner receives, so the PDF must **never** be reachable at a public URL.
- Do not put it in `/assets` or any static/public path.
- Either keep it in **private Vercel Blob** storage (check the current Vercel docs for private access or signed URLs), or keep it in `/private` in a **private** GitHub repo and include it in the function bundle (`includeFiles` in `vercel.json`).
- If the repo is ever made public, the PDF must move to private storage first.

### Storage for the list
Pick one small option and say why in the PR. Check what Vercel currently offers in its Marketplace: for example Upstash Redis, or a Neon Postgres table. Requirements: append a record, count total and unique, rate-limit counters, and export. Add `GET /api/export` (protected by `ADMIN_TOKEN` in an `Authorization: Bearer` header) that returns the list as CSV with the counts, so the owner can see who and how many.

### Environment variables
| Name | Purpose |
|---|---|
| `RESEND_API_KEY` | send owner notifications |
| `NOTIFY_EMAIL` | owner's inbox (**ask the owner**) |
| `MAIL_FROM` | for example `POP POP Downloads <downloads@randpierce.com>` |
| `DOWNLOAD_SECRET` | HMAC key for download tokens (long random string) |
| `ADMIN_TOKEN` | protects `/api/export` |
| storage vars | whatever the chosen store needs |

Never commit secrets. Add `.env*` to `.gitignore`. Provide `.env.example`.

## Domain and email DNS
1. Add `randpierce.com` and `www.randpierce.com` to the Vercel project. Follow the exact DNS records Vercel shows (typically an A record for the apex and a CNAME for `www`). Redirect `www` to the apex. HTTPS is automatic.
2. In Resend, add and verify `randpierce.com` so notifications send from the owner's own domain. Resend lists the SPF/DKIM DNS records to add at the registrar. Walk the owner through this step by step when you get there.

## Content gaps (placeholders still in the page)
- ABOUT bio, contact email and TERMS text are done (owner-supplied). The Terms say the email is used only to send the script, and that the owner sees the address and download time; if the list is ever used for anything else, update the modal copy and TERMS first.
- **The screenplay PDF itself**: the owner supplies it as `POP-POP.pdf`.
- **Favicon**: none yet. Ask the owner, or derive a simple one from the logo.
- `og:image` and `og:url`: make absolute once the domain is live.
- Consent wording is deliberately minimal ("I'll use your email to send you the script."). The owner said the list is **not** used for marketing for now. If that changes, update the modal copy and TERMS first.

## Design reference (all implemented in index.html)

**Intent:** premium, minimal, cinematic. Cool slate-blue, thin white hairlines, wide-tracked small caps, lots of air. No orange or gold accents.

**Palette**
- Page gradient (top to bottom): `#465c6d`, `#34485a` at 45%, `#1b2d42`
- Light haze from the upper left: `rgba(176,204,218,0.30)` fading out by 46%
- Text `#eef3f5`, strong `#f4f8fa`, muted `#d3dee4`, labels `#b9c9d2`, accent (ice white) `#E3EEF4`
- Hairlines `rgba(255,255,255,0.25)`, modal panel `#2a3946`

**Type**
- Cabin 400/500/600 (body, labels, footer); Montserrat 700 for the "POP POP" title (matches the geometric bold of the logo).
- Small labels are 9 to 11px with 0.2 to 0.4em tracking. SCREENWRITER is 21px with 0.6em tracking.

**Layout:** a single centered column, `max-width: 900px`, 32px side padding, so there is empty space on both sides. Logo spans the full column width. The feature panel sits between two hairlines: poster thumbnail (100px wide, 2:3), then title/logline/meta, then the READ NOW page icon (top aligned with the poster). GENRE and STATUS share a line; PAGES sits under GENRE. The "NEW AND ORIGINAL SCREENPLAYS IN DEVELOPMENT" line is an SVG with `textLength` so it always runs edge to edge of the column and scales down on small screens.

**Background layers (back to front):** gradient, the desk photo at 5% opacity (`desk-bg.jpg`, cover, positioned 50% 35%), a soft round pale-blue glow behind the logo, floating dust specks (50 on desktop, 30 on phones), then content.

**Logo:** `rand-pierce-logo.png` is white on transparent, 1398x152, shown at 85% opacity. A transparent SVG version would be better if the owner can supply one.

**Motion:** on load, in order: glow and dust fade in, logo rises, SCREENWRITER, the two hairlines draw left to right, poster, details, READ NOW icon, bottom line, footer links (about 3 seconds in total). READ NOW fills with a faint white tint on hover. All of it is disabled under `prefers-reduced-motion`.

**Mobile:** the panel wraps (poster, details and icon stack). Verify at 390px and 360px wide.

## Before calling it done
- Full flow works on a Vercel preview URL: email, record stored, owner notified, PDF downloads.
- The PDF is **not** reachable by any direct URL (try `/POP-POP.pdf`, `/private/POP-POP.pdf`, `/assets/...`). An expired or tampered token returns 403.
- Keyboard: Tab order sensible, Esc closes dialogs, focus lands in the email field when the modal opens.
- Mobile and reduced-motion checks; Lighthouse performance and accessibility.
- Image weight: convert the large images to WebP/AVIF and shrink `desk-bg.jpg` (it is only shown at 5% opacity, so 1200px at low quality is plenty). Consider self-hosting the two fonts.
- Add `robots.txt` and a canonical link once the domain is live.
