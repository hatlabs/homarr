import type { ReadonlyHeaders } from "next/dist/server/web/spec-extension/adapters/headers";
import { describe, expect, test } from "vitest";

import { getPortFromUrl, resolveServerUrl } from "../url";

const fakeHeaders = (entries: Record<string, string>): ReadonlyHeaders =>
  new Headers(entries) as unknown as ReadonlyHeaders;

describe("getPortFromUrl", () => {
  test.each([
    [80, "http"],
    [443, "https"],
  ])("should return %s for %s protocol without port", (expectedPort, protocol) => {
    // Arrange
    const url = new URL(`${protocol}://example.com`);

    // Act
    const port = getPortFromUrl(url);

    // Assert
    expect(port).toBe(expectedPort);
  });
  test.each([["http"], ["https"], ["anything"]])("should return the specified port for %s protocol", (protocol) => {
    // Arrange
    const expectedPort = 3000;
    const url = new URL(`${protocol}://example.com:${expectedPort}`);

    // Act
    const port = getPortFromUrl(url);

    // Assert
    expect(port).toBe(expectedPort);
  });
  test("should throw an error for unsupported protocol", () => {
    // Arrange
    const url = new URL("ftp://example.com");

    // Act
    const act = () => getPortFromUrl(url);

    // Act & Assert
    expect(act).toThrowError("Unsupported protocol: ftp:");
  });
});

describe("resolveServerUrl", () => {
  const headers = fakeHeaders({
    "x-forwarded-host": "halosdev.example.com",
    "x-forwarded-proto": "https",
  });

  test("returns explicit pingUrl when set (step 1)", () => {
    expect(resolveServerUrl({ pingUrl: "http://x.local/ping", href: "/anything/" }, headers)).toBe("http://x.local/ping");
  });

  test("returns absolute href as-is (step 2, byte-identical)", () => {
    expect(resolveServerUrl({ pingUrl: null, href: "https://abs.example.com/x" }, headers)).toBe(
      "https://abs.example.com/x",
    );
  });

  test("expands path-only href against request headers (step 3)", () => {
    expect(resolveServerUrl({ pingUrl: null, href: "/cockpit/" }, headers)).toBe("https://halosdev.example.com/cockpit/");
  });

  test("returns null for path-only href without headers (step 4)", () => {
    expect(resolveServerUrl({ pingUrl: null, href: "/cockpit/" }, null)).toBeNull();
  });

  test("returns null when both pingUrl and href are null", () => {
    expect(resolveServerUrl({ pingUrl: null, href: null }, headers)).toBeNull();
  });

  test("absolute href short-circuits even without headers (regression guard)", () => {
    expect(resolveServerUrl({ pingUrl: null, href: "https://abs.example.com/x" }, null)).toBe("https://abs.example.com/x");
  });

  test("does not treat protocol-relative '//host' as path-only", () => {
    // Schema rejects this shape, but if it slips through we never
    // accidentally expand it through the request-header branch.
    expect(resolveServerUrl({ pingUrl: null, href: "//evil.example.com/x" }, headers)).toBe("//evil.example.com/x");
  });
});
