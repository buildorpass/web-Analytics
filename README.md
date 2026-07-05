# Local Analytics

Privacy-focused, **cookieless** web analytics that runs entirely on your machine. No cloud deployment, no accounts, no billing — just a Next.js dashboard backed by SQLite.

```
tracker.js  →  POST /api/event  →  data/analytics.db  →  dashboard at /
```

## Features

- **Cookieless tracking** — no cookies, localStorage, or fingerprinting
- **Daily rotating visitor hashes** — IPs and user agents are never stored; visitors cannot be linked across days
- **Real-time dashboard** — KPIs, charts, ranked tables, period-over-period comparison
- **SPA support** — tracks `pushState`, `replaceState`, and `popstate` navigation
- **Custom events and outbound clicks** — via `localAnalytics.track()` and automatic link tracking
- **UTM campaign tracking** — source, medium, and campaign from URL parameters
- **CSV export** — aggregated counts only, no raw visitor hashes
- **Built-in test lab** — interactive checklist at `/test.html` to verify every metric
- **Optional AI daily report** — plain-English summary of day-over-day changes (requires OpenAI API key)

## Quick start

**Requirements:** Node.js 18+, [pnpm](https://pnpm.io/) 9+

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) — the demo site `abc123` is seeded automatically on first boot.

To populate a week of sample traffic:

```bash
pnpm seed
```

## Add tracking to a site

Paste this snippet before `</body>` on any page you want to track:

```html
<script
  src="http://localhost:3000/tracker.js"
  data-site="abc123"
  data-exclude="/admin,/preview"
  defer
></script>
```

| Attribute | Description |
|-----------|-------------|
| `data-site` | Required. Site ID from the dashboard site switcher. |
| `data-exclude` | Optional. Comma-separated path prefixes to skip. |

The dashboard **Snippet panel** generates this code for your selected site.

### Custom events

```js
localAnalytics.track("signup_clicked");
```

Outbound clicks on external links are tracked automatically as `outbound:hostname`.

## Dashboard

| Section | What it shows |
|---------|---------------|
| **KPI cards** | Pageviews, unique visitors, views/visitor, bounce rate, avg sessions/visitor |
| **Insight bars** | Direct vs referred traffic; new vs returning visitors |
| **Charts hub** | Traffic, pages, sources, visitors, technology, campaigns |
| **Ranked tables** | Top pages, referrers, entry/exit pages, UTMs, custom events, browsers, OS, devices, screen sizes |
| **Toolbar** | Auto-refresh (30s), CSV export, link to test lab |

Click the **i** icon next to any metric for a plain-language explanation.

Date ranges: **Today** (hourly), **Last 7 days**, **Last 30 days** — each with % change vs the previous equivalent period.

## Test lab

Open [http://localhost:3000/test.html](http://localhost:3000/test.html) for a guided checklist that exercises all tracking features. Each section tells you exactly which dashboard widgets to verify.

Referrer landing pages live under `public/test/` (e.g. `from-google.html`, `from-hn.html`) for testing traffic sources.

## Optional: AI daily report

The app can generate a cached, AI-written summary of day-over-day metric changes. This is optional — the core analytics work without it.

Copy `.env.example` to `.env.local` and set your API key (uses `gpt-4o-mini` by default):

```env
OPENAI_API_KEY=sk-...
```

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/daily-report?site=abc123&date=2026-07-05` | GET | Fetch cached report |
| `/api/daily-report` | POST | Generate report (`{ "siteId": "abc123", "date": "2026-07-05" }`) |

Inspect the underlying classified delta JSON without calling OpenAI:

```bash
pnpm dump-report abc123 2026-07-05
```

## Commands

```bash
pnpm install       # Install dependencies
pnpm dev           # Dev server at http://localhost:3000
pnpm build         # Production build
pnpm start         # Production server
pnpm seed          # Seed 7 days of sample data for abc123
pnpm dump-report   # Print classified daily change JSON
pnpm lint          # ESLint
pnpm clean         # Delete .next (fixes stale webpack chunk errors)
```

**Troubleshooting:** Run only one `pnpm dev` at a time. If you see `Cannot find module './XX.js'`, run `pnpm clean && pnpm dev`.

## Privacy model

Visitor identity is a **16-character daily hash**:

```
sha256(daily_salt + site_id + truncated_ip + user_agent).slice(0, 16)
```

- IPv4 addresses are truncated to /24; IPv6 to /48 — raw IPs are never stored
- Salt rotates at UTC midnight — yesterday's visitors cannot be linked to today
- Sessions are inferred from gaps under 30 minutes within the same UTC day
- Respects DNT, Global Privacy Control, and `<meta name="local-analytics" content="disabled">`
- 90-day automatic data retention

See the **Privacy panel** on the dashboard for the full collected / never collected breakdown.

## Tech stack

| Layer | Choice |
|-------|--------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript (strict) |
| Database | SQLite via better-sqlite3 (raw SQL, no ORM) |
| Charts | Recharts |
| UA parsing | ua-parser-js |
| Package manager | pnpm |

## Project structure

```
src/
  app/                  # Dashboard page + API routes
  components/           # Dashboard UI (charts, cards, panels)
  lib/                  # DB, queries, privacy, analytics logic
public/
  tracker.js            # ~150-line vanilla tracking script
  test.html             # Feature test lab
scripts/
  seed-week.ts          # Sample data generator
  dump-daily-report.ts  # Daily change report CLI
data/
  analytics.db          # SQLite database (gitignored, created on boot)
```

## Developer reference

For the complete feature inventory, database schema, API contracts, and AI prompt templates, see **[FEATURES.md](./FEATURES.md)**.

## License

Private / local use. Not intended for production deployment without additional hardening (rate limiting, bot filtering, ingest auth).