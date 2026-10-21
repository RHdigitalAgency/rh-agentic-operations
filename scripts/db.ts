/**
 * Database CLI: `npm run db:migrate`, `npm run db:seed`, `npm run db:reset`.
 * Uses DATABASE_URL when set, otherwise the local PGlite directory (PGLITE_DATA_DIR, default ./.data/pglite).
 */
import fs from "node:fs";
import path from "node:path";
import { openDb } from "../src/lib/db";
import { migrate } from "../src/lib/db/migrate";
import { seedDemo } from "../src/server/seed";

function loadEnvFile() {
  for (const file of [".env.local", ".env"]) {
    const p = path.resolve(file);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

async function main() {
  loadEnvFile();
  const cmd = process.argv[2];
  if (!["migrate", "seed", "reset"].includes(cmd)) {
    console.error("Usage: tsx scripts/db.ts <migrate|seed|reset>");
    process.exit(1);
  }
  const usingPostgres = Boolean(process.env.DATABASE_URL);
  if (cmd !== "migrate" && process.env.NODE_ENV === "production") {
    console.error("Refusing to seed or reset with NODE_ENV=production.");
    process.exit(1);
  }
  if (cmd === "reset") {
    if (usingPostgres) {
      console.error("db:reset only wipes the local PGlite directory. For Postgres, drop/recreate the database explicitly.");
      process.exit(1);
    }
    const dir = path.resolve(process.env.PGLITE_DATA_DIR || "./.data/pglite");
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`Removed ${dir}`);
  }
  const db = await openDb();
  try {
    const ran = await migrate(db);
    console.log(ran.length ? `Applied migrations: ${ran.join(", ")}` : "Migrations up to date.");
    if (cmd === "seed" || cmd === "reset") {
      const password = process.env.SEED_DEMO_PASSWORD;
      if (!password || password.length < 10) {
        console.error("Set SEED_DEMO_PASSWORD (10+ chars) in .env.local to seed local demo users.");
        process.exit(1);
      }
      await seedDemo(db, password, (m) => console.log(`  seed: ${m}`));
      console.log("Demo data seeded. Users (all share SEED_DEMO_PASSWORD):");
      for (const u of await db.query<{ email: string; role: string }>("select email, role from app_users order by role")) console.log(`  ${u.role.padEnd(20)} ${u.email}`);
    }
  } finally {
    await db.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
