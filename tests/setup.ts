import { afterAll } from "vitest";
import { closeTestDbs } from "./helpers";

// Drops the disposable schemas created in TEST_DATABASE_URL mode (no-op on PGlite).
afterAll(closeTestDbs);
