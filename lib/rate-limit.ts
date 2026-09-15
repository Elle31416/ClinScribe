/**
 * Minimal in-memory fixed-window rate limiter.
 *
 * This exists to blunt trivial abuse of the token endpoint (every token mints a
 * billable session), not to be a real edge limiter: state lives in one process,
 * so on Vercel each instance — and each cold start — starts from zero. Put a
 * proper limiter in front of it before this is public, and note that anyone who
 * can reach the endpoint can still spend your AssemblyAI credit.
 */

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();
const MAX_TRACKED_KEYS = 5_000;

function evictExpired(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export type RateLimitResult = {
  allowed: boolean;
  retryAfterSeconds: number;
};

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    if (buckets.size >= MAX_TRACKED_KEYS) evictExpired(now);
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  bucket.count += 1;
  if (bucket.count > limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
    };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

/** Test seams. */
export function resetRateLimits() {
  buckets.clear();
}

export function trackedKeyCount() {
  return buckets.size;
}
