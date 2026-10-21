/**
 * Simulates the Instagram Growth Automation sending one lead to POST /api/integrations/leads.
 *
 *   npm run lead:simulate                                   # fixture -> http://localhost:3000, fresh event id
 *   npm run lead:simulate -- --replay                       # resend the fixture's own id (expect 200 duplicate)
 *   npm run lead:simulate -- --url https://host --file my-lead.json
 *
 * Signs the body with INSTAGRAM_INGESTION_SHARED_SECRET (from the environment or .env.local).
 */
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { signLeadPayload } from "../src/server/ingestion";
import { loadEnvFile } from "./env";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  loadEnvFile();
  const secret = process.env.INSTAGRAM_INGESTION_SHARED_SECRET;
  if (!secret) {
    console.error("Set INSTAGRAM_INGESTION_SHARED_SECRET (in .env.local for local dev) to the same value the app uses.");
    process.exit(1);
  }
  const url = `${(arg("url") ?? "http://localhost:3000").replace(/\/$/, "")}/api/integrations/leads`;
  const file = arg("file") ?? path.join("tests", "fixtures", "instagram-lead.json");
  const payload = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
  if (!process.argv.includes("--replay")) {
    payload.external_event_id = `sim-${randomUUID()}`;
    payload.created_at = new Date().toISOString();
  }
  const body = JSON.stringify(payload);
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-rh-signature": signLeadPayload(body, secret) },
    body,
  });
  console.log(`POST ${url} -> ${res.status}`);
  console.log(await res.text());
  if (!res.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
