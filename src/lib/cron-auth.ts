// Constant-time comparison for cron tokens. A plain `got !== expected`
// short-circuits on the first differing byte, which in principle lets an
// attacker recover the token byte-by-byte from response timing. Hashing both
// sides first also sidesteps timingSafeEqual's equal-length requirement.
import { createHash, timingSafeEqual } from "node:crypto";

export function cronTokenMatches(got: string | null, expected: string): boolean {
  if (!got) return false;
  const a = createHash("sha256").update(got).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
