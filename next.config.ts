import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite (local Postgres-in-WASM) and postgres.js must run as native Node packages.
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  // getDb() applies pending migrations on first connection, reading the SQL files at runtime.
  // Ship them with every server function (serverless hosts only get traced files).
  outputFileTracingIncludes: { "/**": ["./database/migrations/*.sql"] },
};

export default nextConfig;
