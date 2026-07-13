# Mobile performance baseline

Measured for [#240](https://github.com/JMAN730/OPENCRM/issues/240), part of the
[Mobile performance map (#238)](https://github.com/JMAN730/OPENCRM/issues/238).
Budgets referenced below were locked in
[#239](https://github.com/JMAN730/OPENCRM/issues/239):
**LCP ≤ 2.5 s · INP ≤ 200 ms · CLS ≤ 0.1 · First Load JS ≤ 250 KB gzip · real data ≤ 3.5 s with ≤ 1 batched tRPC round-trip.**

## Run conditions

| Condition | Value |
|---|---|
| Date / commit | 2026-07-11, `c6984c7` |
| Build | `next build` (Next.js 16.2.3, Turbopack), served with `next start` on `http://localhost:3000`, Windows 10 |
| Database | Neon PostgreSQL (us-east-1, pooled) — dedicated branch `perf-baseline-240` of the CRM project |
| Seed data | `npm run seed`: 1 org, 463 leads, 280 calls, demo user (ADMIN) |
| Redis | not running (all caches fail open — every request hits the DB) |
| Lighthouse | 13.4.0, standard mobile profile (Moto G Power emulation, simulated 4G / 4× CPU throttling), headless Chrome 145, performance category only, **single run per route** (expect ±5–10 pts variance) |
| Auth | authenticated routes measured with a real `next-auth.session-token` cookie injected via `--extra-headers`; sign-in measured unauthenticated |

Caveats: localhost serving means no CDN/TLS/network latency on assets — real-world
LCP will be *worse* than these numbers. Lab TBT stands in for INP (no real
interaction is simulated). Observed request timings quoted below are unthrottled;
Lighthouse metric values are simulated-throttled.

## 1. Lighthouse mobile — core routes

| Route | Perf score | LCP | FCP | TBT | CLS | Speed Index | Total transfer | Script transfer |
|---|---|---|---|---|---|---|---|---|
| /auth/signin (unauth) | **91** | 3.5 s | — | — | **0** | 1.8 s | 308 KB / 27 req | 234 KB / 16 req |
| /dashboard | **58** | 4.4 s | 2.4 s | 70 ms | **0.733** | 2.7 s | 454 KB / 52 req | 244 KB / 16 req |
| /leads | **50** | 5.5 s | 2.4 s | **240 ms** | 0.394 | 5.6 s | 645 KB / 56 req | **349 KB** / 20 req |
| /pipeline | **62** | 5.0 s | 1.4 s | 120 ms | 0.292 | 5.1 s | 549 KB / 56 req | **348 KB** / 20 req |
| /map | **61** | 5.6 s | 1.7 s | 80 ms | 0.255 | 5.3 s | 587 KB / 62 req | 286 KB / 18 req |
| /tasks | **59** | 4.7 s | 2.4 s | 80 ms | 0.319 | 5.5 s | 463 KB / 67 req | 246 KB / 17 req |

### Against the budgets

| Budget | Status |
|---|---|
| LCP ≤ 2.5 s | **Fail on every route** (3.5–5.6 s). Content only paints after JS download → hydrate → tRPC fetch. |
| INP ≤ 200 ms (TBT proxy) | Pass everywhere except **/leads (240 ms TBT)** — 100 unvirtualized rows hydrating. |
| CLS ≤ 0.1 | **Fail on every authenticated route** (0.25–0.73). Skeleton→content swaps don't reserve space; dashboard is the worst at 0.733. |
| First Load JS ≤ 250 KB gzip | /dashboard 244 KB and /tasks 246 KB scrape under; **/leads 349 KB and /pipeline 348 KB fail by ~40%**; /map 286 KB fails. |
| Real data ≤ 3.5 s, ≤ 1 batched round-trip | **2–3 round-trips on every route** (see §3). Data timing not directly lab-measured, but LCP (which on these routes *is* the data paint) exceeds 3.5 s everywhere except sign-in. |

## 2. Bundle weight per route

Computed from the Turbopack client-reference manifests (gzip level 9), cross-checked
against Lighthouse's measured script transfer (numbers agree within ~3%). The
static figures below include lazily-loaded chunks referenced by the route, so
Lighthouse's transfer column above is the ground truth for *first load*.

| Route | Client JS (gzip) | CSS (gzip) |
|---|---|---|
| /leads | 339.5 KB | 33.9 KB |
| /pipeline | 339.5 KB | 33.9 KB |
| /scraper | 269.0 KB | 33.9 KB |
| /outreach | 266.8 KB | 33.9 KB |
| /tasks | 238.8 KB | 33.9 KB |
| /calendar | 237.1 KB | 33.9 KB |
| /dashboard | 236.7 KB | 33.9 KB |
| /settings | 229.8 KB | 33.9 KB |
| /analytics | 227.1 KB | 33.9 KB |
| /auth/signin | 226.8 KB | 33.9 KB |
| /map | 225.2 KB | 33.9 KB |

**Framework baseline (rootMainFiles, on every page): 128.8 KB gzip** — React DOM +
Next runtime (70.9 KB), plus 38.4 KB and smaller runtime chunks. Another
~48 KB gzip of app-shared chunks (tRPC client + React Query, 25.6 KB; layout/UI
primitives) load on every authenticated route, putting the effective shared
floor near **195 KB gzip** before any route code.

### Heaviest route-specific chunks

| Chunk (gzip) | Routes | Contents (fingerprinted) |
|---|---|---|
| 38.6 KB | pipeline | drag-and-drop board (Draggable/virtual/dialog markers) |
| 35.9 KB | leads | **PapaParse + CSV import** — `ImportLeadsDialog` is statically imported by `LeadsList.tsx`, so the CSV parser ships in the leads first load even though it's only needed when importing |
| 32.0 KB | leads | `LeadModal` + dialogs (statically imported, needed only on row click) |
| 31.8 KB | pipeline | pipeline dialogs/detail |
| 22.5 KB | leads+pipeline | shared lead UI |
| 18.0 KB ×2 | 5 routes each | two near-identical UI-primitive bundles (sonner/lucide markers) that split by route group instead of deduplicating |

`framer-motion` is **not** in any bundle (earlier "framer" hit was a false positive
on `FrameRoot` component names) — removing it from package.json saves install
time only, not bytes. `@tanstack/react-virtual` is likewise absent (installed,
never bundled).

## 3. tRPC waterfall

`httpBatchLink` **does** collapse concurrent queries. Observed on load
(unthrottled timings; procedure lists are the actual batch URLs):

| Route | Round-trips | Batches |
|---|---|---|
| /dashboard | 2 | [tasks.getAll, dashboard.getKpiStats] · [dashboard.sidebarCounts] |
| /leads | 2 | [9 procedures: teams.myTeam, leads.listOrgTags, leads.getAll, leads.getStatusCounts, tasks.getDueToday, tasks.getOverdue, tasks.getUpcomingFollowUps, leads.customOutcomes.list, scoring.getRules] · [dashboard.sidebarCounts, teams.organizationMembers] |
| /pipeline | 2 | [pipeline.getBoard, teams.organizationMembers] (556 ms) · [dashboard.sidebarCounts] |
| /map | 3 | [discoveryCategories, missingCoordinatesCount] · [leadsInBounds] · [sidebarCounts] |
| /tasks | 2 | [tasks.getAll, teams.organizationMembers] (439 ms) · [sidebarCounts] |

So the waterfall problem is **not** N unbatched queries — it's that the *first*
batch can't start until JS has downloaded and hydrated (~260–400 ms in even on
unthrottled localhost; several seconds on throttled mobile), and the sidebar's
`sidebarCounts` consistently lands in a second batch tick. The ≤ 1 round-trip
budget needs either query-timing alignment (one batch tick) or server-side
prefetch; the ≤ 3.5 s-to-data budget mainly needs first paint to not wait for
the download→hydrate→fetch chain.

Also observed: the shared `QueryClient` has **no defaults** (`staleTime: 0`,
`refetchOnWindowFocus: true`) — every tab return on a phone refires every
mounted query.

## 4. Font & CSS blocking

- **JetBrains Mono via Google Fonts `<link>` in `layout.tsx`**: the CSS request
  (`fonts.googleapis.com/css2`, ~137–155 ms unthrottled) is render-blocking on
  every page; the woff2 itself is 31 KB. On throttled mobile the blocking
  stylesheet costs roughly 750 ms of the critical path (Lighthouse
  render-blocking estimate). `next/font` would inline the CSS at build time and
  self-host the font.
- **Global CSS**: one 171 KB raw / **31.3 KB gzip** stylesheet (all Tailwind v4
  output) + 2.6 KB, render-blocking on every route. Not the main problem, but
  it is 100% of styles for all 30+ routes shipped everywhere.

## 5. Reading for the rendering-strategy decision (#242)

1. **LCP failure is architectural, not asset-weight.** FCP (skeleton) lands at
   1.4–2.4 s; LCP (real content) at 4.4–5.6 s. The 2–3 s gap is
   hydrate-then-fetch. Shrinking bundles alone cannot close a gap that exists
   because data fetching starts after hydration — server-prefetched data (or RSC)
   attacks the gap directly.
2. **CLS is a co-equal failure** (0.25–0.73 vs ≤ 0.1 budget) and is fixable
   cheaply regardless of rendering strategy: skeletons must reserve final layout
   dimensions.
3. **Quick wins with measurable byte impact:** lazy-load `ImportLeadsDialog`
   (−36 KB on /leads) and `LeadModal` (−32 KB); `next/font` (kills a
   render-blocking cross-origin request); React Query defaults. The
   package.json-only removals (framer-motion) move zero bytes.
4. /leads and /pipeline cannot meet the 250 KB JS budget without splitting
   their modal/import/board chunks; the other core routes are already at or
   under budget.

---

## 6. Re-measure after the quick-wins package (#250)

Re-run under the baseline's conditions after landing
[#251](https://github.com/JMAN730/OPENCRM/issues/251)–[#256](https://github.com/JMAN730/OPENCRM/issues/256).
Measured on the combined integration branch
`JMAN730/implement-issues-251-254` at commit `6e7a0b2`; the same changes
ship as per-ticket PRs #259–#264.

Run-condition deltas from §"Run conditions": date 2026-07-11 (same day),
commit `6e7a0b2`, served on `http://localhost:3100` (port 3000 was held by a
sibling checkout — localhost port does not affect metrics), same Neon branch
`perf-baseline-240` (463 leads / 280 calls, unchanged), Redis not running,
Lighthouse 13.4.0 standard mobile profile, headless Chrome, performance
category only, single run per route (±5–10 pts variance applies to both
columns).

### Before → after

| Route | Perf score | LCP | TBT | CLS | Total transfer | Script transfer |
|---|---|---|---|---|---|---|
| /auth/signin | 91 → **91** | 3.5 → 3.6 s | — → 30 ms | 0 → **0** | 308 → 339 KB | 234 → 234 KB |
| /dashboard | 58 → **57** | 4.4 → 4.6 s | 70 → **32 ms** | 0.733 → 0.699 | 454 → 454 KB | 244 → 245 KB |
| /leads | 50 → **56** | 5.5 → 5.2 s | **240 → 180 ms** | 0.394 → 0.389 | 645 → **566 KB** | **349 → 267 KB** |
| /pipeline | 62 → **66** | 5.0 → 5.2 s | 120 → **63 ms** | 0.292 → 0.247 | 549 → 548 KB | 348 → 349 KB |
| /map | 61 → **58** | 5.6 → 5.7 s | 80 → 135 ms | 0.255 → 0.302 | 587 → 584 KB | 286 → 286 KB |
| /tasks | 59 → **63** | 4.7 → 4.9 s | 80 → **59 ms** | 0.319 → 0.296 | 463 → 466 KB | 246 → 247 KB |

### Package acceptance checks (#257)

- **/leads TBT < 200 ms**: pass — 240 → **180 ms**. The 100-row page now
  virtualizes (both focus cards and the classic table), and the import/modal
  chunks no longer hydrate on first load.
- **/leads script transfer down ~68 KB predicted**: pass — **−82 KB**
  (349 → 267 KB): PapaParse import dialog (~36 KB) + lead modal (~32 KB) now
  load on demand, plus the removed font stylesheet round-trip and smaller
  first-load graph.
- **No cross-origin font request on any route**: pass — zero requests to
  `fonts.googleapis.com` / `fonts.gstatic.com` in all six network traces;
  JetBrains Mono self-hosts via `next/font` from `/_next/static/media`.

### Notes

- LCP and CLS are essentially unchanged, as the baseline predicted (§5):
  they are architectural (hydrate-then-fetch, unreserved skeletons) and belong
  to the rendering-strategy (#242) and CLS (#249) decisions, not this package.
- /pipeline script transfer is flat by design — its weight is the board chunk;
  the package only targeted /leads chunks. Its TBT halving (120 → 63 ms) and
  score gain come from the shared wins (font, query defaults).
- /map's score dip (61 → 58) and TBT rise (80 → 135 ms) sit inside the
  documented single-run variance; its script transfer is byte-identical.
- Idle-tab behavior (not visible in Lighthouse): the scraper job list no
  longer polls when no job is RUNNING/PENDING, and `refetchOnWindowFocus` is
  off with a 30 s `staleTime` app-wide — tab returns no longer refire every
  mounted query.
