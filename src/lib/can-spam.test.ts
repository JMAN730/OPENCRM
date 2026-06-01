import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { trackedDemoUrl, unsubscribeUrl, validateCanSpam } from "./can-spam";

describe("can-spam URL helpers", () => {
  const original = process.env.NEXT_PUBLIC_APP_URL;

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = original;
  });

  it("fails closed when NEXT_PUBLIC_APP_URL is unset", () => {
    expect(() => trackedDemoUrl("tok")).toThrow(/NEXT_PUBLIC_APP_URL/);
    expect(() => unsubscribeUrl("tok")).toThrow(/NEXT_PUBLIC_APP_URL/);
  });

  it("builds links from the configured base URL, stripping a trailing slash", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com/";
    expect(trackedDemoUrl("abc123")).toBe("https://app.example.com/t/abc123");
    expect(unsubscribeUrl("abc123")).toBe("https://app.example.com/unsubscribe/abc123");
  });
});

describe("validateCanSpam", () => {
  it("flags a missing subject, address, and unsubscribe link", () => {
    const errors = validateCanSpam({
      subject: "   ",
      body: "hello",
      physicalAddress: "1 Main St",
      unsubscribeUrl: "https://app.example.com/unsubscribe/x",
    });
    expect(errors).toHaveLength(3);
  });

  it("passes when the body contains the address and unsubscribe link", () => {
    const unsub = "https://app.example.com/unsubscribe/x";
    const errors = validateCanSpam({
      subject: "Quick question",
      body: `Hello\n1 Main St\nUnsubscribe: ${unsub}`,
      physicalAddress: "1 Main St",
      unsubscribeUrl: unsub,
    });
    expect(errors).toEqual([]);
  });
});
