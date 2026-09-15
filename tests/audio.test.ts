import assert from "node:assert/strict";
import test from "node:test";
import {
  bytesToBase64,
  base64ToPcm16,
  hasSocketHeadroom,
  MAX_SOCKET_BUFFER_BYTES,
  pcm16ToFloat32,
} from "../lib/audio";

test("bytes round-trip through base64 for frames larger than the spread limit", () => {
  // 50 ms of 24 kHz PCM16 is 2400 bytes; use 200 kB to cross the 32 kB chunking
  // boundary inside bytesToBase64 and the argument limit it avoids.
  const bytes = new Uint8Array(200_000);
  for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251;

  const encoded = bytesToBase64(bytes);
  const decoded = new Uint8Array(atob(encoded).split("").map((char) => char.charCodeAt(0)));

  assert.deepEqual(decoded, bytes);
});

test("base64 PCM16 decodes signed little-endian samples", () => {
  const samples = new Int16Array([0, 1, -1, 32767, -32768, 1234]);
  const encoded = bytesToBase64(new Uint8Array(samples.buffer));

  assert.deepEqual(Array.from(base64ToPcm16(encoded)), Array.from(samples));
});

test("base64ToPcm16 ignores a trailing odd byte instead of emitting NaN", () => {
  const encoded = btoa("\x01\x02\x03");
  assert.deepEqual(Array.from(base64ToPcm16(encoded)), [0x0201]);
});

test("pcm16ToFloat32 maps the signed range into [-1, 1)", () => {
  const floats = pcm16ToFloat32(new Int16Array([0, 32767, -32768]));
  assert.equal(floats[0], 0);
  assert.ok(floats[1] < 1 && floats[1] > 0.999);
  assert.equal(floats[2], -1);
});

test("hasSocketHeadroom only blocks once the socket is genuinely congested", () => {
  assert.equal(hasSocketHeadroom(0), true);
  assert.equal(hasSocketHeadroom(MAX_SOCKET_BUFFER_BYTES - 1), true);
  assert.equal(hasSocketHeadroom(MAX_SOCKET_BUFFER_BYTES), false);
});
