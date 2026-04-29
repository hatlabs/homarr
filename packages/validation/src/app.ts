import { z } from "zod/v4";

// `appHrefSchema` accepts:
//   - empty string -> null
//   - absolute URL with http/https scheme (or any non-javascript scheme)
//   - path-only URL starting with "/" followed by a non-"/" character
//
// Path-only hrefs are resolved against the current origin in the browser, and
// against the request origin server-side via `resolveServerUrl`. This lets a
// single dashboard work across multiple hostnames (mDNS, VPN FQDN, DHCP DNS).
//
// Rejects: javascript: scheme, protocol-relative ("//host/..."), single-slash
// root ("/"), bare strings without scheme or leading slash.
const absoluteHrefSchema = z
  .string()
  .trim()
  .url()
  .regex(/^(?!javascript)[a-zA-Z]*:\/\//i);

const pathOnlyHrefSchema = z
  .string()
  .trim()
  // Leading slash followed by a non-slash character. Rejects "/" alone and
  // protocol-relative "//host/...".
  .regex(/^\/[^/]/);

export const appHrefSchema = absoluteHrefSchema
  .or(pathOnlyHrefSchema)
  .or(z.literal(""))
  .transform((value) => (value.length === 0 ? null : value))
  .nullable();

export const appManageSchema = z.object({
  name: z.string().trim().min(1).max(64),
  description: z
    .string()
    .trim()
    .max(512)
    .transform((value) => (value.length === 0 ? null : value))
    .nullable(),
  iconUrl: z.string().trim().min(1),
  href: appHrefSchema,
  pingUrl: z
    .string()
    .trim()
    .url()
    .regex(/^https?:\/\//) // Only allow http and https for security reasons (javascript: is not allowed)
    .or(z.literal(""))
    .transform((value) => (value.length === 0 ? null : value))
    .nullable(),
});

export const appCreateManySchema = z
  .array(appManageSchema.omit({ iconUrl: true }).and(z.object({ iconUrl: z.string().min(1).nullable() })))
  .min(1);

export const appEditSchema = appManageSchema.and(z.object({ id: z.string() }));
