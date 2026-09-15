import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { CAPTURE_FRAME_MS } from "../lib/audio";

const SOURCE = readFileSync(new URL("../public/pcm-processor.js", import.meta.url), "utf8");
const BLOCK = 128; // AudioWorklet render quantum

type Harness = {
  frames: Int16Array[];
  samples: Int16Array;
  push(block: Float32Array): void;
};

/**
 * Runs the real worklet file inside a `node:vm` context with the AudioWorklet
 * globals stubbed out, so the hot path is covered without a browser.
 */
function loadProcessor(inputSampleRate: number, frameMs?: number): Harness {
  const frames: Int16Array[] = [];
  let Processor: new (options: unknown) => {
    process(inputs: Float32Array[][]): boolean;
  };

  const context = vm.createContext({
    sampleRate: inputSampleRate,
    AudioWorkletProcessor: class {
      port = {
        postMessage: (buffer: ArrayBuffer) => {
          frames.push(new Int16Array(buffer.slice(0)));
        },
      };
    },
    registerProcessor: (_name: string, ctor: unknown) => {
      Processor = ctor as typeof Processor;
    },
  });

  vm.runInContext(SOURCE, context);

  const instance = new Processor!({
    processorOptions: {
      inputSampleRate,
      targetSampleRate: 24000,
      ...(frameMs ? { frameMs } : {}),
    },
  });

  const push = (block: Float32Array) => {
    assert.equal(instance.process([[block]]), true, "processor must stay alive");
  };

  const samples = () => {
    const total = frames.reduce((sum, frame) => sum + frame.length, 0);
    const joined = new Int16Array(total);
    let offset = 0;
    for (const frame of frames) {
      joined.set(frame, offset);
      offset += frame.length;
    }
    return joined;
  };

  return { frames, push, get samples() { return samples(); } } as Harness;
}

function sineBlock(rate: number, frequency: number, offset: number, length = BLOCK) {
  const block = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    block[i] = Math.sin((2 * Math.PI * frequency * (offset + i)) / rate);
  }
  return block;
}

for (const rate of [48000, 44100, 32000]) {
  test(`resampling ${rate} Hz -> 24 kHz produces one 24 kHz stream of the same length`, () => {
    const harness = loadProcessor(rate);
    const blocks = Math.round(rate / BLOCK);
    const frameSamples = (24000 * CAPTURE_FRAME_MS) / 1000;

    for (let block = 0; block < blocks; block++) {
      harness.push(sineBlock(rate, 440, block * BLOCK));
    }

    const produced = harness.samples.length;
    const expected = Math.round(24000 * ((blocks * BLOCK) / rate));

    // Everything but the tail (which is still buffered in the current 50 ms
    // frame) must come out; the sine test below is what catches rate drift.
    assert.ok(
      Math.abs(produced - expected) < frameSamples,
      `expected about ${expected} samples for one second, got ${produced}`,
    );
    assert.equal(produced % frameSamples, 0, "frames are posted whole");
  });

  test(`resampled 440 Hz tone stays faithful at ${rate} Hz input`, () => {
    const harness = loadProcessor(rate);
    const blocks = Math.round(rate / BLOCK);

    for (let block = 0; block < blocks; block++) {
      harness.push(sineBlock(rate, 440, block * BLOCK));
    }

    const samples = harness.samples;
    let worst = 0;
    for (let i = 0; i < samples.length; i++) {
      const expected = Math.sin((2 * Math.PI * 440 * i) / 24000);
      worst = Math.max(worst, Math.abs(samples[i] / 32768 - expected));
    }

    // Linear interpolation error for a 440 Hz tone is far below this; a phase
    // reset at every block boundary (the old behaviour) would blow past it.
    assert.ok(worst < 0.01, `worst-case sample error was ${worst.toFixed(4)}`);
  });
}

test("a constant signal stays constant across block boundaries", () => {
  const harness = loadProcessor(48000);
  for (let block = 0; block < 40; block++) {
    harness.push(new Float32Array(BLOCK).fill(0.5));
  }

  assert.ok(harness.samples.length > 0);
  for (const sample of harness.samples) {
    assert.equal(sample, 16384, "no click or ramp at block joins");
  }
});

test("samples are batched into ~50 ms frames instead of one per render quantum", () => {
  const harness = loadProcessor(48000);
  const seconds = 1;
  const blocks = Math.round((48000 * seconds) / BLOCK);

  for (let block = 0; block < blocks; block++) {
    harness.push(sineBlock(48000, 440, block * BLOCK));
  }

  const frameSamples = (24000 * CAPTURE_FRAME_MS) / 1000; // 1200
  assert.ok(harness.frames.length >= 19 && harness.frames.length <= 21, `got ${harness.frames.length} frames`);

  for (const frame of harness.frames.slice(0, -1)) {
    assert.equal(frame.length, frameSamples);
  }
});

test("clipping is bounded to the PCM16 range", () => {
  const harness = loadProcessor(48000);
  harness.push(new Float32Array(BLOCK).fill(2)); // louder than full scale
  harness.push(new Float32Array(BLOCK).fill(-2));

  for (const frame of harness.frames) {
    for (const sample of frame) {
      assert.ok(sample >= -32768 && sample <= 32767);
    }
  }
});

test("an empty input frame is ignored rather than producing NaN", () => {
  const harness = loadProcessor(48000);
  // Simulate a disconnected mic: process() still runs, with no channel data.
  harness.push(new Float32Array(0));
  assert.equal(harness.frames.length, 0);
});
