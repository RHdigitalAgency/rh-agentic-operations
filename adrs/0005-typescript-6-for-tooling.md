# ADR-0005: Pin TypeScript 6 until typescript-eslint supports TS 7

Status: Accepted
Date: 2026-10-20

TypeScript 7.0 (native compiler) was the latest release, and Next.js 16 supports it, but `typescript-eslint` (used by `eslint-config-next`) refuses to load on TS ≥ 7 because TS 7 has no JavaScript compiler API. We pin `typescript@^6` so `npm run lint` works. Revert to TS 7 once typescript-eslint supports it (tracking: typescript-eslint#10940). No code changes are expected.
