import { randomBytes, scrypt, scryptSync, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number, options: { N: number; maxmem: number }) => Promise<Buffer>;

const KEYLEN = 64;
const N = 16384;
export const MIN_PASSWORD_LENGTH = 10;

export function hashPassword(password: string): string {
  if (password.length < MIN_PASSWORD_LENGTH) throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEYLEN, { N });
  return `scrypt$${N}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

// Used when the user does not exist, so login timing does not reveal valid emails.
const DUMMY_HASH = `scrypt$${N}$${Buffer.alloc(16).toString("base64")}$${Buffer.alloc(KEYLEN).toString("base64")}`;

/** Async (runs on the libuv pool) so concurrent sign-ins never block the server's event loop. */
export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  const [algo, n, saltB64, hashB64] = (stored || DUMMY_HASH).split("$");
  const cost = Number(n);
  if (algo !== "scrypt" || !Number.isInteger(cost) || cost < 2 || cost > 1 << 20 || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  // maxmem: 128 * N * r(8) plus headroom, so higher-cost hashes are accepted too.
  const actual = await scryptAsync(password, Buffer.from(saltB64, "base64"), expected.length, { N: cost, maxmem: 256 * cost * 8 + 1024 * 1024 });
  return Boolean(stored) && actual.length === expected.length && timingSafeEqual(actual, expected);
}
