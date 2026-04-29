import { describe, expect, test } from "vitest";

import { appHrefSchema } from "../app";

describe("appHrefSchema", () => {
  test.each([
    ["https://example.com/path", "https://example.com/path"],
    ["http://example.com/path", "http://example.com/path"],
    ["https://example.com", "https://example.com"],
    ["/cockpit/", "/cockpit/"],
    ["/signalk-server/@signalk/freeboard-sk/", "/signalk-server/@signalk/freeboard-sk/"],
    ["/x", "/x"],
  ])("accepts %s", (input, expected) => {
    expect(appHrefSchema.parse(input)).toBe(expected);
  });

  test("transforms empty string to null", () => {
    expect(appHrefSchema.parse("")).toBeNull();
  });

  test("accepts null", () => {
    expect(appHrefSchema.parse(null)).toBeNull();
  });

  test.each([
    ["javascript:alert(1)"],
    ["JavaScript:alert(1)"],
    ["//evil.example.com/path"],
    ["/"],
    ["cockpit/"],
    ["not-a-url"],
    ["./relative"],
    ["../relative"],
  ])("rejects %s", (input) => {
    expect(() => appHrefSchema.parse(input)).toThrow();
  });
});
