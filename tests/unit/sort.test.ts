import { describe, expect, it } from "vitest";
import { sortRows } from "@/lib/sort";

describe("sortRows", () => {
  const rows = [
    { name: "beta", n: 2, d: new Date("2026-02-01") },
    { name: "Alpha", n: 10, d: null },
    { name: "gamma", n: null, d: new Date("2026-01-01") },
  ];
  const acc = { name: (r: (typeof rows)[number]) => r.name, n: (r: (typeof rows)[number]) => r.n, d: (r: (typeof rows)[number]) => r.d };

  it("sorts text case-insensitively and numbers numerically, keeping empty values last in both directions", () => {
    expect(sortRows(rows, acc, "name", "asc").map((r) => r.name)).toEqual(["Alpha", "beta", "gamma"]);
    expect(sortRows(rows, acc, "n", "desc").map((r) => r.n)).toEqual([10, 2, null]);
    expect(sortRows(rows, acc, "n", "asc").map((r) => r.n)).toEqual([2, 10, null]);
    expect(sortRows(rows, acc, "d", "asc").map((r) => r.name)).toEqual(["gamma", "beta", "Alpha"]);
  });

  it("ignores unknown sort keys", () => {
    expect(sortRows(rows, acc, "nope", "asc")).toBe(rows);
  });
});

import { containsPattern } from "@/server/context";

describe("containsPattern", () => {
  it("matches search terms literally", () => {
    // input: 50%_off\   expected: %50\%\_off\\%
    expect(containsPattern("50%_off\\")).toBe("%50\\%\\_off\\\\%");
  });
});
