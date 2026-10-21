/**
 * Removable demo data on a hosted database (e.g. production before go-live):
 *   npm run demo:add      # adds the demo dataset; demo users cannot sign in
 *   npm run demo:remove   # deletes exactly what demo:add created
 * Targets DATABASE_URL (load .env.staging.local first for the hosted DB), otherwise local PGlite.
 */
import { openDb } from "../src/lib/db";
import { migrate } from "../src/lib/db/migrate";
import { addDemoData, removeDemoData } from "../src/server/demo-data";
import { loadEnvFile } from "./env";

async function main() {
  loadEnvFile();
  const cmd = process.argv[2];
  if (cmd !== "add" && cmd !== "remove") {
    console.error("Usage: tsx scripts/demo-data.ts <add|remove>");
    process.exit(1);
  }
  const db = await openDb();
  try {
    await migrate(db);
    if (cmd === "add") {
      const r = await addDemoData(db, (m) => console.log(`  demo: ${m}`));
      console.log(`Demo data added: ${r.company_ids.length} companies, ${r.user_ids.length} demo users (cannot sign in). Remove with: npm run demo:remove`);
    } else {
      const r = await removeDemoData(db);
      console.log(`Demo data removed: ${r.companies} companies and everything under them, ${r.users} demo users.`);
    }
  } finally {
    await db.close();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
