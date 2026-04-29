import type { ReadonlyHeaders } from "next/dist/server/web/spec-extension/adapters/headers";

export const removeTrailingSlash = (path: string) => {
  return path.at(-1) === "/" ? path.substring(0, path.length - 1) : path;
};

export const extractBaseUrlFromHeaders = (
  headers: ReadonlyHeaders,
  fallbackProtocol: "http" | "https" = "http",
): `${string}://${string}` => {
  // For empty string we also use the fallback protocol
  // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
  let protocol = headers.get("x-forwarded-proto") || fallbackProtocol;

  // @see https://support.glitch.com/t/x-forwarded-proto-contains-multiple-protocols/17219
  if (protocol.includes(",")) {
    protocol = protocol.includes("https") ? "https" : "http";
  }

  const host = headers.get("x-forwarded-host") ?? headers.get("host");

  return `${protocol}://${host}`;
};

/**
 * Resolution order for `app.href` / `app.pingUrl` server-side. Returns the
 * absolute URL to use, or null when no usable URL exists.
 *
 *   1. explicit `pingUrl` -> as-is (byte-identical to legacy `pingUrl ?? href`)
 *   2. absolute `href`    -> as-is (byte-identical)
 *   3. path-only `href` + headers -> base-from-headers + path
 *   4. otherwise          -> null
 *
 * Step 3 is the new branch that supports path-only hrefs in upstream Homarr
 * deployments where no explicit pingUrl is set. Callers receiving null from
 * step 4 must handle the absence of a URL (skip ping, leave externalUrl null).
 *
 * Server-only: imports `ReadonlyHeaders` (Next.js server type).
 */
export const resolveServerUrl = (
  app: { href: string | null; pingUrl: string | null },
  headers: ReadonlyHeaders | null,
): string | null => {
  if (app.pingUrl) {
    return app.pingUrl;
  }

  if (!app.href) {
    return null;
  }

  if (app.href.startsWith("/") && !app.href.startsWith("//")) {
    if (!headers) {
      return null;
    }
    return `${extractBaseUrlFromHeaders(headers, "https")}${app.href}`;
  }

  return app.href;
};

export const getPortFromUrl = (url: URL): number => {
  const port = url.port;
  if (port) {
    return Number(port);
  }

  if (url.protocol === "https:") {
    return 443;
  }

  if (url.protocol === "http:") {
    return 80;
  }

  throw new Error(`Unsupported protocol: ${url.protocol}`);
};
