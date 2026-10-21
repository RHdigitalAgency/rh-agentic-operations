import { describe, expect, it } from "vitest";
import { safeLocalPath } from "@/app/actions/run";

describe("safeLocalPath", () => {
  it("keeps same-origin paths", () => {
    expect(safeLocalPath("/followups?mine=1", "/x")).toBe("/followups?mine=1");
    expect(safeLocalPath("/", "/x")).toBe("/");
  });

  it("rejects anything a browser could resolve to another host", () => {
    for (const bad of ["//evil.com", "/\\evil.com", "\\\\evil.com", "https://evil.com", "evil.com", "/ok\nLocation: x", "/a\u0000b", "", "/%20 x"]) {
      expect(safeLocalPath(bad, "/fallback")).toBe("/fallback");
    }
  });
});
