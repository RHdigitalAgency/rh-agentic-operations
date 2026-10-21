import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

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

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  const [algo, n, saltB64, hashB64] = (stored || DUMMY_HASH).split("$");
  if (algo !== "scrypt" || !n || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = scryptSync(password, Buffer.from(saltB64, "base64"), expected.length, { N: Number(n) });
  return Boolean(stored) && actual.length === expected.length && timingSafeEqual(actual, expected);
}
