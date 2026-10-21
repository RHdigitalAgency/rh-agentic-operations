/**
 * Creates the first ADMIN_MANAGER on a fresh environment.
 *   ADMIN_EMAIL=... ADMIN_NAME="..." ADMIN_PASSWORD=... npm run user:create-admin
 * Uses DATABASE_URL when set, otherwise the local PGlite directory.
 */
import { openDb } from "../src/lib/db";
import { migrate } from "../src/lib/db/migrate";
import { hashPassword } from "../src/lib/auth/password";

async function main() {
  const { ADMIN_EMAIL: email, ADMIN_NAME: name, ADMIN_PASSWORD: password } = process.env;
  if (!email || !name || !password) {
    console.error("Set ADMIN_EMAIL, ADMIN_NAME and ADMIN_PASSWORD (10+ chars).");
    process.exit(1);
  }
  const db = await openDb();
  try {
    await migrate(db);
    const [exists] = await db.query("select 1 from app_users where lower(email) = lower($1)", [email]);
    if (exists) throw new Error(`User ${email} already exists`);
    await db.query("insert into app_users(email, full_name, role, password_hash) values (lower($1), $2, 'ADMIN_MANAGER', $3)", [email, name, hashPassword(password)]);
    console.log(`Created admin ${email}`);
  } finally {
    await db.close();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
