import { describe, expect, it } from "vitest";
import { dbMode } from "@/lib/db";

describe("database selection per environment", () => {
  it("uses Postgres whenever DATABASE_URL is set", () => {
    expect(dbMode({ DATABASE_URL: "postgres://x", VERCEL: "1", VERCEL_ENV: "production" })).toBe("postgres");
  });
  it("never lets production fall back to a throwaway database", () => {
    expect(() => dbMode({ VERCEL: "1", VERCEL_ENV: "production" })).toThrow(/required in production/);
  });
  it("gives Vercel previews an isolated in-memory demo database", () => {
    expect(dbMode({ VERCEL: "1", VERCEL_ENV: "preview" })).toBe("preview-memory");
  });
  it("uses the local file database in development", () => {
    expect(dbMode({})).toBe("local-file");
  });
});
