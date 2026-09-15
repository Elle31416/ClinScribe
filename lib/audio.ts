/** Audio constants and conversions shared by the capture pipeline and playback. */

/** Voice Agent API PCM16 mono sample rate for both directions. */
export const OUTPUT_RATE = 24000;

/** Capture frame size posted by the AudioWorklet. AssemblyAI recommends ~50 ms. */
export const CAPTURE_FRAME_MS = 50;

/**
 * If this much audio is queued behind a slow socket, frames are dropped instead
 * of buffered. The server drops audio that arrives faster than real time anyway
 * (about one second of audio per second of wall clock), so queueing locally only
 * turns a network hiccup into permanently late transcriptions.
 */
export const MAX_SOCKET_BUFFER_BYTES = 256 * 1024;

/** Base64-encode bytes without blowing the argument limit of `String.fromCharCode`. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

/** Decode base64 PCM16 (little-endian, mono) into signed samples. */
export function base64ToPcm16(base64: string): Int16Array {
  const binary = atob(base64);
  const samples = new Int16Array(binary.length >> 1);
  for (let i = 0; i < samples.length; i++) {
    const value = binary.charCodeAt(i * 2) | (binary.charCodeAt(i * 2 + 1) << 8);
    samples[i] = value >= 0x8000 ? value - 0x10000 : value;
  }
  return samples;
}

/** Convert PCM16 samples to the [-1, 1] range an AudioBuffer expects. */
export function pcm16ToFloat32(samples: Int16Array): Float32Array {
  const floats = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) floats[i] = samples[i] / 32768;
  return floats;
}

/** Whether the socket has room for another audio frame. */
export function hasSocketHeadroom(bufferedAmount: number): boolean {
  return bufferedAmount < MAX_SOCKET_BUFFER_BYTES;
}
