import type { NextConfig } from "next";

const dev = process.env.NODE_ENV !== "production";

// Next.js App Router inlines bootstrap scripts and styles, so script/style need 'unsafe-inline' without a nonce
// setup. The policy still blocks framing, plugins, foreign scripts/connections and <base> hijacking.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${dev ? " ws:" : ""}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self' https://checkout.stripe.com",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // PGlite (local Postgres-in-WASM) and postgres.js must run as native Node packages.
  serverExternalPackages: ["@electric-sql/pglite", "postgres"],
  // getDb() applies pending migrations on first connection, reading the SQL files at runtime.
  // Ship them with every server function (serverless hosts only get traced files).
  outputFileTracingIncludes: { "/**": ["./database/migrations/*.sql"] },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
