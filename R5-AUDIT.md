# R5 audit — `app.href` consumers in Homarr v1.59.3

Performed on the `feat/path-only-app-hrefs` branch of `hatlabs/homarr` (cut from
`v1.59.3`). Each finding is classified as one of:

- **Navigation-only** — value is handed to the browser as an `href`, so a
  path-only string is resolved against the current origin natively. No code
  change needed.
- **Server-internal** — value is consumed server-side (HTTP request, persisted
  field, integration call). Must be resolved through `resolveServerUrl` so
  path-only inputs become absolute URLs against the request origin or are
  handled as `null` when no request context is available.
- **Storage** — value is persisted as-is (CRUD, import). The schema relaxation
  in R1 lets the path-only form pass through; no further change needed.
- **Display** — value is rendered as text (UI label). Path-only renders as the
  raw path; bookmarks widget gets explicit fallback for `new URL(...).hostname`
  parsing failure (R3).

| # | Path | Description | Class |
|---|------|-------------|-------|
| 1 | `packages/validation/src/app.ts:3-10` | `appHrefSchema` definition | **R1 target** — relaxed to accept path-only |
| 2 | `packages/api/src/router/widgets/app.ts:32` | Ping query: `pingUrl ?? href` | **Server-internal** — route through `resolveServerUrl` |
| 3 | `packages/api/src/router/widgets/app.ts:73` | Ping subscription: `pingUrl ?? href` | **Server-internal** — route through `resolveServerUrl` |
| 4 | `packages/api/src/router/widgets/app.ts:73,82,88,94` | Subscription channel key (was URL-based) | **Architectural** — switch to `app.id` (F3 mitigation) |
| 5 | `packages/cron-jobs/src/jobs/ping.ts:28-46` | Cron-job dedup + publish | **Architectural** — adapt to new `{id,url}` channel shape |
| 6 | `packages/redis/src/index.ts:21-24` | `pingChannel` / `pingUrlChannel` types | **Architectural** — message gains `id`, list carries `{id,url}` |
| 7 | `packages/request-handler/src/lib/cached-request-integration-job-handler.ts:97` | `externalUrl: integration.app?.href ?? null` | **Server-internal** — background job, no headers; resolves to `null` for path-only |
| 8 | `packages/api/src/middlewares/integration.ts:69` | `externalUrl: rest.app?.href ?? null` (one) | **Server-internal** — route via `resolveServerUrl(app, ctx.headers)` |
| 9 | `packages/api/src/middlewares/integration.ts:131` | `externalUrl: rest.app?.href ?? null` (many) | **Server-internal** — route via `resolveServerUrl(app, ctx.headers)` |
| 10 | `packages/api/src/router/app.ts:122,141,168` | App CRUD persistence | **Storage** — pass through; relaxation propagates via schema |
| 11 | `packages/api/src/router/integration/integration-router.ts:686-701` | App creation during integration setup | **Storage** — pass through |
| 12 | `packages/old-import/src/mappers/map-app.ts:26` | Old-Marr import mapper | **Storage** — pass through; uses `appCreateManySchema` downstream |
| 13 | `packages/old-import/src/import/import-single-oldmarr.ts:20` | Old-Marr import filter (`href !== null`) | **Storage** — null-tolerant; no change |
| 14 | `packages/widgets/src/app/component.tsx:38,49,64,82,132` | App widget `<a href={app.href}>` and conditional rendering | **Navigation-only** — no change (R4 verified — `UnstyledButton component="a"`, no `next/link`) |
| 15 | `packages/widgets/src/bookmarks/component.tsx:36,103,161` | Bookmarks widget `<a href={app.href}>` | **Navigation-only** — no change |
| 16 | `packages/widgets/src/bookmarks/component.tsx:235,282` | Bookmarks widget sub-label `new URL(app.href).hostname` | **Display (R3)** — try/catch fallback to trailing-slash-trimmed path |
| 17 | `apps/nextjs/src/app/[locale]/manage/apps/page.tsx:109-111` | Admin apps list — Anchor display + navigation | **Navigation-only / Display** — works with path-only (anchor resolves; text shows path) |
| 18 | `apps/nextjs/src/components/board/sections/category/category-menu-actions.tsx:119,122` | "Open all" — `window.open(app.href)` | **Navigation-only** — `window.open` accepts relative URLs (resolved against current document) |

Coverage of the audit scope mandated by the plan:

- `packages/api/src/router/` — ✅
- `packages/integrations/**` — ✅ (no `app.href` consumers found)
- `packages/request-handler/**` — ✅
- `packages/widgets/**` — ✅
- `packages/validation/**` — ✅ (schemas)
- `packages/auth/**` — ✅ (no `app.href` consumers found)
- `packages/db/**` — ✅ (drizzle schema only; no consumers)
- Import/export flows — ✅ (`packages/old-import/`)
- `apps/nextjs/**` — ✅

No deeply-coupled consumer was discovered that resists path-only migration. The
architectural change in items 4–6 (subscription channel keying) is the only
non-trivial behavioral change; it is a small correctness improvement
independent of HaLOS use cases.
