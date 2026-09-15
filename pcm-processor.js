class PCMProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const config = options.processorOptions || {};
    this.inputRate = config.inputSampleRate || sampleRate;
    this.targetRate = config.targetSampleRate || 24000;
    this.ratio = this.inputRate / this.targetRate;
    this.pending = [];
  }

  process(inputs) {
    const input = inputs[0]?.[0];
    if (!input?.length) return true;

    const outputLength = Math.floor(input.length / this.ratio);
    if (outputLength < 1) return true;

    const pcm = new Int16Array(outputLength);
    for (let i = 0; i < outputLength; i++) {
      const position = i * this.ratio;
      const left = Math.floor(position);
      const right = Math.min(left + 1, input.length - 1);
      const fraction = position - left;
      const sample =
        (input[left] || 0) * (1 - fraction) +
        (input[right] || 0) * fraction;
      const clipped = Math.max(-1, Math.min(1, sample));
      pcm[i] = clipped < 0 ? clipped * 32768 : clipped * 32767;
    }

    this.port.postMessage(pcm.buffer, [pcm.buffer]);
    return true;
  }
}

registerProcessor("pcm-processor", PCMProcessor);