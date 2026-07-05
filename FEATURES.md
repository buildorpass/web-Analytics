# Local Analytics — Complete Feature Reference

> **Use this file as context when asking Claude (or any AI) for the next feature.**  
> Paste or attach `FEATURES.md` plus your new request, e.g. *"Read FEATURES.md. Add country-level geo using MaxMind."*

---

## 1. Project summary

**Local Analytics** is a privacy-focused, **cookieless** web analytics MVP that runs **entirely on the local machine**. No deployment, no auth, no billing.

**Core flow:** `public/tracker.js` → `POST /api/event` → SQLite (`data/analytics.db`) → dashboard at `/`.

**Demo site:** `abc123` (seeded on first boot).

---

## 2. Non-negotiable constraints

| Rule | Detail |
|------|--------|
| Package manager | **pnpm only** (`pnpm install`, `pnpm dev`, `pnpm seed`) |
| Language | TypeScript **strict** mode |
| Framework | Next.js **App Router** (latest 15.x) |
| Database | SQLite via **better-sqlite3** — synchronous, **raw SQL**, no ORM |
| Charts | **Recharts** (default; swappable) |
| Privacy | **No cookies**, **no localStorage**, **no fingerprinting** in tracking path |
| Identity | Daily rotating salted hash — **no cross-day visitor linking** |

**Approved dependencies:** `next`, `react`, `react-dom`, `better-sqlite3`, `recharts`, `ua-parser-js`, dev: `tsx`, `@eslint/eslintrc`.

---

## 3. Commands

```bash
pnpm install          # install deps (pnpm-workspace.yaml allowBuilds: better-sqlite3, esbuild)
pnpm dev              # http://localhost:3000
pnpm build            # production build
pnpm start            # production server
pnpm clean            # delete .next (fix stale webpack "Cannot find module './XX.js'")
pnpm seed             # seed 7 days of sample data for abc123
pnpm lint             # eslint
```

**Troubleshooting:** Only one `pnpm dev` at a time. If runtime chunk errors: `pnpm clean && pnpm dev`.

---

## 4. Project structure

```
src/
  app/
    page.tsx                 # Dashboard (SSR)
    layout.tsx
    globals.css
    api/
      event/route.ts         # Ingest POST/OPTIONS
      export/route.ts        # CSV export GET
  components/
    charts-hub.tsx           # Tabbed Recharts (client)
    stat-card.tsx
    insight-cards.tsx        # Direct vs referred, new vs returning bars
    ranked-list.tsx
    dashboard-controls.tsx   # Site + date range (client)
    dashboard-toolbar.tsx    # Auto-refresh, export, test lab link
    info-tip.tsx             # (i) help popovers (client)
    section-heading.tsx
    privacy-panel.tsx
    snippet-panel.tsx
  lib/
    db.ts                    # SQLite singleton + boot migrate
    migrations.ts            # Schema + column migrations
    salt.ts                  # Daily UTC salt
    analytics.ts             # Hash, sessions, bots, screen bucket
    privacy.ts               # IP truncate, path exclude, UTM sanitize
    retention.ts             # Auto-purge old events/salts
    queries.ts               # All dashboard SQL aggregations
    cors.ts                  # CORS for file:// test pages
    help-text.ts             # Info-tip copy
    chart-theme.ts           # Recharts colors/tooltip
    chart-data.ts            # Pie/bar data transforms
  middleware.ts              # CORS preflight for /api/event
public/
  tracker.js                 # ~150 lines vanilla JS
  test.html                  # Feature test lab (10 sections)
  test/from-*.html           # Referrer landing pages
scripts/
  seed-week.ts               # 7-day seed script
data/
  analytics.db               # gitignored
```

---

## 5. Database schema

### `sites`
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | Short slug, e.g. `abc123` |
| name | TEXT | Display name |
| domain | TEXT | e.g. `localhost` |
| created_at | INTEGER | Unix ms |
| retention_days | INTEGER | Default 90 |
| path_exclusions | TEXT | JSON array, e.g. `["/admin","/preview"]` |

### `events`
| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | Autoincrement |
| site_id | TEXT FK | |
| timestamp | INTEGER | Unix ms |
| pathname | TEXT | |
| hostname | TEXT | |
| referrer_hostname | TEXT | Nullable, host only |
| visitor_hash | TEXT | 16-char hex |
| browser, os, device | TEXT | From UA parser |
| screen_class | TEXT | `sm` / `md` / `lg` |
| is_new_visitor | INTEGER | 0/1 |
| is_new_session | INTEGER | 0/1 |
| event_type | TEXT | `pageview` (default) or `custom` |
| event_name | TEXT | Nullable, for custom events |
| utm_source, utm_medium, utm_campaign | TEXT | Nullable |

### `salts`
| Column | Type |
|--------|------|
| date | TEXT PK (YYYY-MM-DD UTC) |
| salt | TEXT (32-byte hex) |

### Indexes
- `events(site_id, timestamp)`
- `events(site_id, visitor_hash, timestamp)`
- `events(site_id, event_type, timestamp)`

---

## 6. Privacy & identity model

### Visitor hash (core mechanic)
```
visitor_hash = sha256(daily_salt + site_id + truncated_ip + user_agent).slice(0, 16)
```
- **IP truncated** before hash: IPv4 last octet → 0; IPv6 → /48 prefix
- **IP and raw UA never stored** — hash only
- **Salt rotates at UTC midnight** — yesterday's hashes cannot link to today's
- `is_new_visitor` = first event that UTC day for this hash
- **Session** = events from same hash with **< 30 min** gaps; `is_new_session` computed at ingest

### Active privacy protections
- No cookies / localStorage / fingerprinting
- Referrer → hostname only; self-referrals nulled
- UTM values sanitized (alphanumeric + limited chars, max 100 chars)
- 90-day retention purge on boot (`retention.ts`)
- DNT + `navigator.globalPrivacyControl` + meta `local-analytics=disabled`
- Path exclusions via `data-exclude` on script tag + site DB config
- `Sec-GPC: 1` header → 204 at ingest
- CSV export = aggregated counts only, no raw hashes

---

## 7. Tracking script (`public/tracker.js`)

### Install snippet
```html
<script src="http://localhost:3000/tracker.js" data-site="abc123" data-exclude="/admin,/preview" defer></script>
```

### Attributes
| Attribute | Purpose |
|-----------|---------|
| `data-site` | Required site ID |
| `data-exclude` | Comma-separated path prefixes to skip |

### Behavior
- Sends on: page load, `pushState`, `replaceState`, `popstate` (300ms debounce)
- Delivery: `sendBeacon` → `fetch` with `keepalive`
- Payload: `site_id`, `pathname`, `hostname`, `referrer` (hostname), `screen_width`, UTMs from URL
- **Custom events:** `localAnalytics.track("event_name")` → `event_type: custom`
- **Outbound clicks:** auto-tracks `outbound:hostname` on external `<a>` clicks
- Opt-out checks before any send

### Global API
```js
window.localAnalytics = { track: function(name) { ... } };
```

---

## 8. Ingest API (`POST /api/event`)

| Item | Detail |
|------|--------|
| Success | `204 No Content` |
| CORS | Middleware + route; echoes `Origin` (incl. `null` for file://) |
| Bots | Basic regex on UA → silent 204 |
| Validation | Requires `site_id`, `pathname`, `hostname` |
| Custom events | Require `event_name` |
| Unknown site | `404` |
| Excluded paths | Silent `204` for pageviews |

**Production note:** IP from `x-forwarded-for` first hop; fallback `127.0.0.1`.

---

## 9. Dashboard (`/`)

### Controls
- **Site switcher** — all rows in `sites` table
- **Date range:** Today (hourly) / Last 7 days / Last 30 days
- **Period comparison:** % change vs previous equivalent period on KPI cards
- **Auto-refresh** every 30s (client, `router.refresh()`)
- **Export CSV** → `/api/export?site=&range=`
- **Info buttons (i)** on every metric — copy in `help-text.ts`

### KPI cards (5)
Pageviews · Unique visitors · Views/visitor · Bounce rate · Avg sessions/visitor

### Insight bars (2)
- Traffic source: direct vs referred
- Visitors in period: new vs returning (UTC-day bounded)

### Charts hub (6 tabs) — `ChartsHub` client component
| Tab | Chart type | Data |
|-----|------------|------|
| Traffic | Composed bar + line | Pageviews + unique visitors per hour/day |
| Pages | Horizontal bar | Top 8 pathnames |
| Sources | Donut | Direct + top 5 referrers + Other |
| Visitors | Donut | New vs returning |
| Technology | 2×2 grid | Devices donut, browsers bar, OS bar, screen donut |
| Campaigns | Bars | UTM sources, UTM campaigns, custom events |

### Tables (ranked lists, top 10)
Top pages · Top referrers · Entry pages · Exit pages · UTM sources · UTM campaigns · Custom events · Browsers · OS · Devices · Screen sizes

### Panels
- **Snippet panel** — copy-paste install code
- **Privacy panel** — collected / never collected / protections

### Query functions (`src/lib/queries.ts`)
`getDashboardStats`, `getTrafficTimeSeries`, `getTimeSeries`, `getTrafficSplit`, `getVisitorTypeSplit`, `getTopPages`, `getEntryPages`, `getExitPages`, `getTopReferrers`, `getUtmSources`, `getUtmCampaigns`, `getCustomEvents`, `getBrowserBreakdown`, `getOsBreakdown`, `getDeviceBreakdown`, `getScreenClassBreakdown`, `getExportSummary`

---

## 10. Test lab (`public/test.html`)

Sidebar checklist (10 features, localStorage progress):

| # | Feature | Dashboard verify |
|---|---------|------------------|
| 1 | Pageviews & SPA | Charts Traffic, KPIs, Top pages |
| 2 | Top pages | Charts Pages tab |
| 3 | Referrers & direct | Charts Sources, Top referrers |
| 4 | Screen classes | Charts Technology → Screen sizes |
| 5 | UTM campaigns | Charts Campaigns |
| 6 | Custom events | Charts Campaigns, Custom events table |
| 7 | Sessions & bounce | Bounce rate, Entry/Exit pages |
| 8 | Browser/OS/device | Charts Technology |
| 9 | Export & refresh | Toolbar CSV + auto-refresh |
| 10 | Chart views tour | All 6 chart tabs |

Referrer landings: `public/test/from-google.html`, `from-hn.html`, `from-reddit.html`, etc.

---

## 11. Seed data (`pnpm seed`)

- Script: `scripts/seed-week.ts`
- Clears `abc123` events from last 7 days, inserts ~150 realistic events
- 15 visitor personas, weekday/weekend patterns, UTMs, custom events, sessions

---

## 12. Explicitly NOT built (do not add without discussion)

| Feature | Why / hook location |
|---------|---------------------|
| Geo/country | Needs MaxMind GeoIP — country-level only if added |
| Authentication / multi-user | No tenancy model |
| Billing | Out of scope |
| Production bot filtering | TODO in `api/event/route.ts` |
| Real-time live view | SSE/WebSocket — polling via auto-refresh only |
| Cross-day returning visitors | **Breaks privacy model** |
| Cookies / localStorage IDs | **Breaks privacy model** |
| Site CRUD UI | Only demo site seeded; no add-site form |
| Rate limiting on ingest | Not implemented |
| Event hostname validation vs site.domain | Not enforced |

---

## 13. Suggested next features (good prompt starters)

Copy one of these when asking for the next iteration:

1. **Geo (country only)** — MaxMind GeoLite2, store country code only, never IP, chart on dashboard
2. **Site management UI** — add/edit/delete sites, generate IDs, set retention + exclusions
3. **Funnel chart** — same-day path flows using visitor_hash (privacy-safe, no cross-day)
4. **Comparison mode** — overlay two date ranges on charts
5. **Goals / conversions** — mark custom events as goals, conversion rate KPI
6. **Rate limiting** — per-IP ingest throttle (still no IP storage)
7. **Live view** — SSE stream of last N events (hashed, no PII)
8. **Email/Slack weekly report** — local cron script reading SQLite
9. **Dark/light theme toggle** on dashboard
10. **Path drill-down** — click a page in chart → filtered detail view
11. **Retention cohort chart** — within-period only (same-day sessions)
12. **API keys** — optional ingest auth for non-local deploy
13. **Docker compose** — single-container local deploy (still no cloud)
14. **Playwright E2E** — test lab → dashboard assertions

---

## 14. Example prompt template

```
Read FEATURES.md in this repo.

Context: Local Analytics — cookieless SQLite analytics app (Next.js 15, pnpm, Recharts).

Task: [describe your feature]

Constraints:
- Keep cookieless model (no cookies, no cross-day identity)
- Raw SQL in queries.ts, no ORM
- Add info (i) help text for new UI
- Update test.html section if testable
- Do not add dependencies without asking

Deliverables: implementation + update FEATURES.md section 9/13 as needed.
```

---

## 15. Version snapshot

| Item | Value |
|------|-------|
| Next.js | 15.5.x |
| React | 19.x |
| better-sqlite3 | 11.x |
| recharts | 2.x |
| Last updated | 2026-07-05 |
