/**
 * AudioWorklet capture processor: mic Float32 -> PCM16 mono 24 kHz.
 *
 * This is the app's hottest path, so two things are handled here rather than
 * on the main thread:
 *
 * 1. Batching. `process()` is called with 128-frame blocks (about 2.7 ms at
 *    48 kHz). Posting one message per block means ~375 messages per second,
 *    each one a JSON frame plus a base64 payload on the WebSocket. AssemblyAI
 *    recommends ~50 ms chunks, so samples are accumulated here and posted as
 *    50 ms frames (~20/s).
 * 2. Resampling. Devices commonly run at 44.1 or 48 kHz. A linear interpolator
 *    carries its read position across blocks, so there is no rate drift and no
 *    click at block boundaries (resampling each block independently loses
 *    ~1% of the audio and introduces a discontinuity every 2.7 ms).
 *
 * Keep this file dependency-free: the AudioWorklet global scope has no imports.
 */
class PCMProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();

    const config = options?.processorOptions ?? {};
    const inputRate = config.inputSampleRate || sampleRate;
    const targetRate = config.targetSampleRate || 24000;
    const frameMs = config.frameMs || 50;

    this.ratio = inputRate / targetRate;
    this.frameSamples = Math.max(1, Math.round((targetRate * frameMs) / 1000));

    // Output frame being filled. It is reused until it is full, then a copy of
    // exactly `frameSamples` is transferred to the main thread.
    this.frame = new Int16Array(this.frameSamples);
    this.filled = 0;

    // Resampler state. `carry` holds the tail of the previous block so that an
    // interpolated sample can span a block boundary; `read` is a fractional
    // position in the coordinate space [carry..., currentBlock...].
    this.keep = Math.ceil(this.ratio) + 1;
    this.carry = new Float32Array(this.keep);
    this.carryLength = 0;
    this.read = 0;
  }

  process(inputs) {
    const channel = inputs[0]?.[0];
    if (!channel || channel.length === 0) return true;

    const carryLength = this.carryLength;
    const total = carryLength + channel.length;
    const frame = this.frame;
    let filled = this.filled;
    let read = this.read;

    while (Math.floor(read) + 1 < total) {
      const left = Math.floor(read);
      const fraction = read - left;
      const first = left < carryLength ? this.carry[left] : channel[left - carryLength];
      const second =
        left + 1 < carryLength ? this.carry[left + 1] : channel[left + 1 - carryLength];
      const scaled = Math.round((first * (1 - fraction) + second * fraction) * 32767);

      frame[filled++] = scaled > 32767 ? 32767 : scaled < -32768 ? -32768 : scaled;

      if (filled === frame.length) {
        const chunk = frame.slice(0, filled);
        this.port.postMessage(chunk.buffer, [chunk.buffer]);
        filled = 0;
      }

      read += this.ratio;
    }

    // Keep the tail of this block for the next call and rebase the read
    // position into the new coordinate space.
    const keep = Math.min(total, this.keep);
    const start = total - keep;
    for (let i = 0; i < keep; i++) {
      const index = start + i;
      // `index` is always >= carryLength here, so this never reads back into
      // the values being overwritten.
      this.carry[i] = index < carryLength ? this.carry[index] : channel[index - carryLength];
    }

    this.carryLength = keep;
    this.read = read - start;
    this.filled = filled;

    return true;
  }
}

registerProcessor("pcm-processor", PCMProcessor);
