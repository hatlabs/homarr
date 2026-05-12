---
title: Selectively rethrow tRPC errors in widgets inside an ErrorBoundary
date: 2026-04-30
module: packages/widgets/src/app
problem_type: best_practice
component: tooling
severity: medium
applies_when:
  - "Widget uses tRPC + react-query inside a React ErrorBoundary"
  - "One specific TRPCError code is a normal/expected condition, not a real failure"
  - "Other error codes from the same query should still surface as the widget's error UI"
  - "Replacing useSuspenseQuery with useQuery to gain access to query.error before render"
tags:
  - trpc
  - react-query
  - error-boundary
  - use-suspense-query
  - use-query
  - widget-pattern
  - graceful-degradation
---

# Selectively rethrow tRPC errors in widgets inside an ErrorBoundary

## Context

The fork adds path-only hrefs (`/cockpit/`) so app cards work across multiple origins (mDNS, VPN FQDN, raw LAN IP). The browser resolves them against whatever origin the user is currently on. The server cannot follow that href to ping the app — synthesising an absolute URL from `X-Forwarded-Host` would be a header-spoofing / SSRF surface — so the ping router throws `TRPCError({code: "CONFLICT"})` when no explicit `pingUrl` is configured. That is a *valid* config, not a failure.

The friction: Homarr's ping indicator was originally written with `useSuspenseQuery`, and the widget sits inside a parent React `ErrorBoundary`. Every thrown tRPC error — including this expected CONFLICT — escaped Suspense and replaced the entire app card with a loud "Try again" error panel. Genuine misconfig (FORBIDDEN, NOT_FOUND) deserves that treatment; an intentionally non-pingable app does not.

## Guidance

When a tRPC query lives inside an outer error boundary and *some* of its error codes represent expected, normal configuration rather than faults, switch the call site from `useSuspenseQuery` to `useQuery` and discriminate on `error.data.code`:

1. **Replace `useSuspenseQuery` with `useQuery`** and disable retries (`retry: false`) so the expected error doesn't trigger backoff churn.
2. **Inspect `query.error.data?.code`** — render an in-place degraded UI for the known-good code(s), `throw query.error` for everything else so the outer boundary still catches genuine faults.
3. **Move the loading state inside the component.** Since you're no longer suspending, drop the parent `<Suspense fallback>` and render your own placeholder when `query.data` is undefined.
4. **Prefer derivation over `useState` + `useEffect`** when merging query data with an override stream (e.g. a websocket subscription): `const result = override ?? query.data ?? null`. This avoids the one-render lag described in tradeoffs.

The discriminator pattern:

```tsx
if (query.error) {
  if (query.error.data?.code === "CONFLICT") {
    return <DegradedView tooltip={query.error.message} />;
  }
  throw query.error; // FORBIDDEN, NOT_FOUND, INTERNAL_SERVER_ERROR → boundary
}
```

## Why This Matters

- **Preserves the safety net.** The error boundary still catches genuinely broken state — auth failures, missing resources, server crashes — exactly as it did before. We narrow what's swallowed, we don't disable the boundary.
- **Turns expected config into normal UI.** A path-only href without `pingUrl` is a deliberate deployment choice, not a fault. Treating it as one is the bug; rendering a calm indeterminate dot is the fix.
- **Keeps the failure mode legible.** A typed code check (`error.data.code === "CONFLICT"`) is greppable, fails loudly if the server changes the code, and survives message rewording. Matching on `error.message` substrings would not.
- **Avoids worse alternatives.** Server-side "never throw, return null" loses the typed discriminator at the boundary and forces every consumer to recheck. An error-boundary reset button forces user interaction for a non-error.

## When to Apply

Apply this pattern when **all** of:

- The query runs inside a React `ErrorBoundary` (directly or via a parent widget framework).
- At least one tRPC error code returned by the procedure represents *expected, valid* runtime state (config-driven, not a fault).
- The component can render a meaningful degraded UI for that case.

Do **not** apply when:

- *Every* error from the procedure is genuinely a fault — `useSuspenseQuery` + boundary is simpler and correct.
- The component relies on React 18 streaming SSR for above-the-fold / SEO-critical content. `useQuery` is client-first; you lose the streaming integration. Dashboard widgets behind auth don't care; public landing-page content does.
- You'd be tempted to catch *all* errors generically. That defeats the boundary. Discriminate on a specific known code.

Alternatives considered and why they're worse:

- **Server returns `null` instead of throwing CONFLICT.** Loses the typed signal; every client must re-derive "is this a real null or a config-degraded null". Erodes the procedure's contract.
- **Error boundary with reset on CONFLICT.** Forces the user to click through a non-error. Also fragile: the boundary has to introspect the error to decide whether to auto-reset, which is the same discriminator logic in a worse place.
- **Try/catch around `useSuspenseQuery`.** Doesn't work — Suspense throws promises during render; you cannot catch the eventual error synchronously at the call site.

## Examples

Before — `packages/widgets/src/app/ping/ping-indicator.tsx`:

```tsx
const [ping] = clientApi.widget.app.ping.useSuspenseQuery(
  { id: appId },
  { refetchOnMount: false, refetchOnWindowFocus: false },
);
const [pingResult, setPingResult] = useState<RouterOutputs["widget"]["app"]["ping"]>(ping);
```

…wrapped at the call site in `packages/widgets/src/app/component.tsx` with `<Suspense fallback={<PingDot icon={IconLoader} … />}>`.

After:

```tsx
const query = clientApi.widget.app.ping.useQuery(
  { id: appId },
  {
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: false,
  },
);

const [pingResult, setPingResult] = useState<RouterOutputs["widget"]["app"]["ping"] | null>(
  query.data ?? null,
);

useEffect(() => {
  if (query.data) setPingResult(query.data);
}, [query.data]);

clientApi.widget.app.updatedPing.useSubscription(
  { id: appId },
  { onData(data) { setPingResult(data); } },
);

// Apps without a server-pingable URL (e.g. path-only href without an explicit
// pingUrl) yield a CONFLICT. Render an indeterminate dot for that case so the
// card stays usable. Other tRPC errors (FORBIDDEN, NOT_FOUND) still bubble to
// the widget error boundary as before.
if (query.error) {
  if (query.error.data?.code === "CONFLICT") {
    return <PingDot icon={IconLoader} color="blue" tooltip={query.error.message} />;
  }
  throw query.error;
}

if (!pingResult) {
  return <PingDot icon={IconLoader} color="blue" tooltip="Pinging…" />;
}
```

In `component.tsx`, the `<Suspense>` wrapper around `<PingIndicator>` is removed along with the now-unused `IconLoader` / `useI18n` / `PingDot` imports — loading state lives inside `PingIndicator` now.

A cleaner variant that avoids the one-render lag (see tradeoffs):

```tsx
const query = clientApi.widget.app.ping.useQuery(/* … */);
const [override, setOverride] = useState<RouterOutputs["widget"]["app"]["ping"] | null>(null);

clientApi.widget.app.updatedPing.useSubscription(
  { id: appId },
  { onData: setOverride },
);

const pingResult = override ?? query.data ?? null;
// no useEffect needed; render is a pure derivation
```

## Tradeoffs

- **One-render visual lag on initial data.** With `useState(query.data ?? null)` + `useEffect`, the first render after `query.data` resolves shows the loading placeholder; the synced state lands one render later. Mitigation: derive `pingResult = override ?? query.data ?? null` instead of using `useState` + `useEffect`. The shipped code uses the useEffect form for symmetry with the subscription override; the derived form is preferable in new code.
- **Lost streaming-SSR integration.** `useSuspenseQuery` participates in React 18 streaming SSR; `useQuery` is client-first and renders the loading placeholder on the server. Irrelevant for authenticated dashboard widgets, material for public SEO-critical content.
- **`data` becomes nullable.** Consumers must handle `query.data === undefined` (loading) and the discriminated error case explicitly. The Suspense version made `data` non-null by construction; this version trades that ergonomic guarantee for the ability to keep rendering on expected errors.
