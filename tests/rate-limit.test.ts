import assert from "node:assert/strict";
import test from "node:test";
import { checkRateLimit, resetRateLimits, trackedKeyCount } from "../lib/rate-limit";

test("allows requests up to the limit, then blocks with a retry hint", async (t) => {
  resetRateLimits();
  t.after(resetRateLimits);

  for (let i = 0; i < 3; i++) {
    assert.deepEqual(checkRateLimit("203.0.113.7", 3, 60_000), {
      allowed: true,
      retryAfterSeconds: 0,
    });
  }

  const blocked = checkRateLimit("203.0.113.7", 3, 60_000);
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSeconds >= 1 && blocked.retryAfterSeconds <= 60);
});

test("limits are per key", (t) => {
  resetRateLimits();
  t.after(resetRateLimits);

  checkRateLimit("first", 1, 60_000);
  assert.equal(checkRateLimit("second", 1, 60_000).allowed, true);
  assert.equal(checkRateLimit("first", 1, 60_000).allowed, false);
});

test("the window resets after it elapses", async (t) => {
  resetRateLimits();
  t.after(resetRateLimits);

  assert.equal(checkRateLimit("key", 1, 5).allowed, true);
  assert.equal(checkRateLimit("key", 1, 5).allowed, false);

  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(checkRateLimit("key", 1, 5).allowed, true);
});

test("a flood of distinct keys stays bounded and keeps the limiter working", (t) => {
  resetRateLimits();
  t.after(resetRateLimits);

  // Windows of 0 ms expire immediately, so every call exercises the eviction path.
  for (let i = 0; i < 12_000; i++) {
    assert.equal(checkRateLimit(`key-${i}`, 5, 0).allowed, true);
  }

  assert.ok(trackedKeyCount() <= 5_001, `tracked ${trackedKeyCount()} keys`);

  resetRateLimits();
  assert.equal(checkRateLimit("fresh", 5, 60_000).allowed, true);
});
