let ctx: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  if (!ctx || ctx.state === "closed") {
    ctx = new AudioContext({ latencyHint: "interactive" });
  }
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
  return ctx;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function makeDistortionCurve(amount: number): Float32Array {
  const samples = 44100;
  const curve = new Float32Array(samples);
  const k = Math.max(0, amount);
  const deg = Math.PI / 180;
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
  }
  return curve;
}

function makeAbsCurve(): Float32Array {
  const n = 256;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    curve[i] = Math.abs((2 * i) / n - 1);
  }
  return curve;
}

function setWetDry(dry: GainNode, wet: GainNode, mix: number) {
  const m = clamp(mix, 0, 1);
  dry.gain.value = 1 - m;
  wet.gain.value = m;
}

export type ModType = "off" | "chorus" | "flanger" | "ensemble" | "phaser";
export type DelayType = "mono" | "stereo" | "cross" | "lr";

export interface FxOptions {
  playbackRate?: number;
  inputGain?: number;
  outputGain?: number;
  highpassHz?: number;
  toneHz?: number;
  distortionAmount?: number;
  delayTime?: number;
  delayFeedback?: number;
  mix?: number;
  modType?: ModType;
  modRate?: number;
  modDepth?: number;
  delayType?: DelayType;
  delayTimeR?: number;
  eqLow?: number;
  eqHigh?: number;
  vocoderEnabled?: boolean;
  vocoderFormant?: number;
}

export interface EchoNode {
  source: AudioBufferSourceNode;
  analyser: AnalyserNode;
  inputGain: GainNode;
  outputGain: GainNode;
  dryGain: GainNode;
  wetGain: GainNode;
  highpass: BiquadFilterNode;
  tone: BiquadFilterNode;
  distortion: WaveShaperNode;
  delay: DelayNode;
  feedbackGain: GainNode;
  feedbackFilter: BiquadFilterNode;
  compressor: DynamicsCompressorNode;
  limiter: DynamicsCompressorNode;
  eqLow: BiquadFilterNode;
  eqHigh: BiquadFilterNode;
  buffer: AudioBuffer;
  _extras: AudioNode[];
  _oscillators: OscillatorNode[];
}

const VOCODER_BANDS = [200, 400, 800, 1200, 2000, 3500, 5500, 8000];

function buildModFx(
  ac: BaseAudioContext,
  modType: ModType,
  rate: number,
  depth: number,
): { input: GainNode; output: GainNode; extras: AudioNode[]; oscs: OscillatorNode[]; startOscs: () => void } {
  const input = ac.createGain();
  input.gain.value = 1;
  const output = ac.createGain();
  output.gain.value = 1;
  const extras: AudioNode[] = [input, output];
  const oscs: OscillatorNode[] = [];

  if (modType === "chorus") {
    const chorusDelay = ac.createDelay(0.05);
    chorusDelay.delayTime.value = 0.015;
    const lfo = ac.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = rate;
    const lfoG = ac.createGain();
    lfoG.gain.value = depth * 0.01;
    lfo.connect(lfoG);
    lfoG.connect(chorusDelay.delayTime);
    const chorusGain = ac.createGain();
    chorusGain.gain.value = 0.7;
    input.connect(chorusDelay);
    chorusDelay.connect(chorusGain);
    chorusGain.connect(output);
    input.connect(output);
    extras.push(chorusDelay, lfo, lfoG, chorusGain);
    oscs.push(lfo);
  } else if (modType === "flanger") {
    const flangeDelay = ac.createDelay(0.02);
    flangeDelay.delayTime.value = 0.003;
    const lfo = ac.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = rate;
    const lfoG = ac.createGain();
    lfoG.gain.value = depth * 0.003;
    lfo.connect(lfoG);
    lfoG.connect(flangeDelay.delayTime);
    const fb = ac.createGain();
    fb.gain.value = 0.7;
    flangeDelay.connect(fb);
    fb.connect(flangeDelay);
    const flangeGain = ac.createGain();
    flangeGain.gain.value = 0.7;
    input.connect(flangeDelay);
    flangeDelay.connect(flangeGain);
    flangeGain.connect(output);
    input.connect(output);
    extras.push(flangeDelay, lfo, lfoG, fb, flangeGain);
    oscs.push(lfo);
  } else if (modType === "ensemble") {
    const compGain = ac.createGain();
    compGain.gain.value = 0.4;
    input.connect(output);
    for (let v = 0; v < 3; v++) {
      const d = ac.createDelay(0.05);
      d.delayTime.value = 0.012 + v * 0.005;
      const lfo = ac.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = rate * (0.9 + v * 0.1);
      const lfoG = ac.createGain();
      lfoG.gain.value = depth * 0.008;
      lfo.connect(lfoG);
      lfoG.connect(d.delayTime);
      input.connect(d);
      d.connect(compGain);
      extras.push(d, lfo, lfoG);
      oscs.push(lfo);
    }
    compGain.connect(output);
    extras.push(compGain);
  } else if (modType === "phaser") {
    let prev: AudioNode = input;
    const lfo = ac.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = rate;
    const lfoG = ac.createGain();
    lfoG.gain.value = depth * 800;
    lfo.connect(lfoG);
    extras.push(lfo, lfoG);
    oscs.push(lfo);
    for (let s = 0; s < 4; s++) {
      const ap = ac.createBiquadFilter();
      ap.type = "allpass";
      ap.frequency.value = 1000;
      ap.Q.value = 0.707;
      lfoG.connect(ap.frequency);
      prev.connect(ap);
      prev = ap;
      extras.push(ap);
    }
    (prev as AudioNode).connect(output);
    input.connect(output);
  } else {
    input.connect(output);
  }

  return {
    input,
    output,
    extras,
    oscs,
    startOscs: () => { for (const o of oscs) { try { o.start(); } catch {} } },
  };
}

function buildDelaySection(
  ac: BaseAudioContext,
  delayType: DelayType,
  timeL: number,
  timeR: number,
  feedback: number,
): { input: GainNode; output: GainNode; delayL: DelayNode; feedbackGain: GainNode; feedbackFilter: BiquadFilterNode; extras: AudioNode[] } {
  const input = ac.createGain();
  input.gain.value = 1;
  const output = ac.createGain();
  output.gain.value = 1;
  const extras: AudioNode[] = [input, output];

  const delayL = ac.createDelay(2.0);
  delayL.delayTime.value = clamp(timeL, 0, 1.2);

  const feedbackFilter = ac.createBiquadFilter();
  feedbackFilter.type = "lowpass";
  feedbackFilter.frequency.value = 2400;
  feedbackFilter.Q.value = 0.7;

  const feedbackGain = ac.createGain();
  feedbackGain.gain.value = clamp(feedback, 0, 0.75);

  extras.push(delayL, feedbackFilter, feedbackGain);

  if (delayType === "mono" || delayType === "lr" && timeR <= 0) {
    input.connect(delayL);
    delayL.connect(output);
    delayL.connect(feedbackFilter);
    feedbackFilter.connect(feedbackGain);
    feedbackGain.connect(delayL);
  } else if (delayType === "stereo") {
    const delayR = ac.createDelay(2.0);
    delayR.delayTime.value = clamp(timeL, 0, 1.2);
    const panL = ac.createStereoPanner();
    panL.pan.value = -0.8;
    const panR = ac.createStereoPanner();
    panR.pan.value = 0.8;
    const fbGainR = ac.createGain();
    fbGainR.gain.value = clamp(feedback, 0, 0.75);
    const fbFilterR = ac.createBiquadFilter();
    fbFilterR.type = "lowpass";
    fbFilterR.frequency.value = 2400;
    fbFilterR.Q.value = 0.7;

    input.connect(delayL);
    delayL.connect(panL);
    panL.connect(output);
    delayL.connect(feedbackFilter);
    feedbackFilter.connect(feedbackGain);
    feedbackGain.connect(delayR);
    delayR.connect(panR);
    panR.connect(output);
    delayR.connect(fbFilterR);
    fbFilterR.connect(fbGainR);
    fbGainR.connect(delayL);

    extras.push(delayR, panL, panR, fbGainR, fbFilterR);
  } else if (delayType === "cross") {
    const delayR = ac.createDelay(2.0);
    delayR.delayTime.value = clamp(timeL, 0, 1.2);
    const panL = ac.createStereoPanner();
    panL.pan.value = 0.8;
    const panR = ac.createStereoPanner();
    panR.pan.value = -0.8;
    const fbGainR = ac.createGain();
    fbGainR.gain.value = clamp(feedback, 0, 0.75);
    const fbFilterR = ac.createBiquadFilter();
    fbFilterR.type = "lowpass";
    fbFilterR.frequency.value = 2400;
    fbFilterR.Q.value = 0.7;

    input.connect(delayL);
    input.connect(delayR);
    delayL.connect(panL);
    panL.connect(output);
    delayR.connect(panR);
    panR.connect(output);
    delayL.connect(feedbackFilter);
    feedbackFilter.connect(feedbackGain);
    feedbackGain.connect(delayR);
    delayR.connect(fbFilterR);
    fbFilterR.connect(fbGainR);
    fbGainR.connect(delayL);

    extras.push(delayR, panL, panR, fbGainR, fbFilterR);
  } else if (delayType === "lr") {
    const delayR = ac.createDelay(2.0);
    delayR.delayTime.value = clamp(timeR, 0, 1.2);
    const panL = ac.createStereoPanner();
    panL.pan.value = -0.9;
    const panR = ac.createStereoPanner();
    panR.pan.value = 0.9;
    const fbGainR = ac.createGain();
    fbGainR.gain.value = clamp(feedback, 0, 0.75);
    const fbFilterR = ac.createBiquadFilter();
    fbFilterR.type = "lowpass";
    fbFilterR.frequency.value = 2400;
    fbFilterR.Q.value = 0.7;

    input.connect(delayL);
    input.connect(delayR);
    delayL.connect(panL);
    panL.connect(output);
    delayR.connect(panR);
    panR.connect(output);
    delayL.connect(feedbackFilter);
    feedbackFilter.connect(feedbackGain);
    feedbackGain.connect(delayL);
    delayR.connect(fbFilterR);
    fbFilterR.connect(fbGainR);
    fbGainR.connect(delayR);

    extras.push(delayR, panL, panR, fbGainR, fbFilterR);
  }

  return { input, output, delayL, feedbackGain, feedbackFilter, extras };
}

function buildVocoder(
  ac: BaseAudioContext,
  formant: number,
): { input: GainNode; output: GainNode; extras: AudioNode[]; oscs: OscillatorNode[]; startOscs: () => void } {
  const input = ac.createGain();
  input.gain.value = 1;
  const output = ac.createGain();
  output.gain.value = 1;
  const extras: AudioNode[] = [input, output];

  const carrier = ac.createOscillator();
  carrier.type = "sawtooth";
  carrier.frequency.value = 130.81;
  extras.push(carrier);

  const shift = Math.pow(2, formant / 12);
  const absCurve = makeAbsCurve();

  for (let b = 0; b < VOCODER_BANDS.length; b++) {
    const freq = VOCODER_BANDS[b] * shift;

    const analysisBP = ac.createBiquadFilter();
    analysisBP.type = "bandpass";
    analysisBP.frequency.value = freq;
    analysisBP.Q.value = 3;

    const absShaper = ac.createWaveShaper();
    absShaper.curve = absCurve;
    absShaper.oversample = "none";

    const smoother = ac.createBiquadFilter();
    smoother.type = "lowpass";
    smoother.frequency.value = 20;
    smoother.Q.value = 0.707;

    const synthBP = ac.createBiquadFilter();
    synthBP.type = "bandpass";
    synthBP.frequency.value = freq;
    synthBP.Q.value = 3;

    const bandGain = ac.createGain();
    bandGain.gain.value = 0;

    input.connect(analysisBP);
    analysisBP.connect(absShaper);
    absShaper.connect(smoother);
    smoother.connect(bandGain.gain);

    carrier.connect(synthBP);
    synthBP.connect(bandGain);
    bandGain.connect(output);

    extras.push(analysisBP, absShaper, smoother, synthBP, bandGain);
  }

  return {
    input,
    output,
    extras,
    oscs: [carrier],
    startOscs: () => { try { carrier.start(); } catch {} },
  };
}

function buildFxGraph(
  ac: BaseAudioContext,
  source: AudioBufferSourceNode,
  opts: FxOptions,
  destination: AudioNode,
): Omit<EchoNode, "buffer"> {
  source.playbackRate.value = opts.playbackRate ?? 1;

  const allExtras: AudioNode[] = [];
  const allOscs: OscillatorNode[] = [];
  const startFns: (() => void)[] = [];

  const inputGain = ac.createGain();
  inputGain.gain.value = opts.inputGain ?? 1;

  const highpass = ac.createBiquadFilter();
  highpass.type = "highpass";
  highpass.frequency.value = opts.highpassHz ?? 80;
  highpass.Q.value = 0.707;

  const compressor = ac.createDynamicsCompressor();
  compressor.threshold.value = -20;
  compressor.knee.value = 18;
  compressor.ratio.value = 3;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.18;

  const eqLow = ac.createBiquadFilter();
  eqLow.type = "lowshelf";
  eqLow.frequency.value = 200;
  eqLow.gain.value = opts.eqLow ?? 0;

  const eqHigh = ac.createBiquadFilter();
  eqHigh.type = "highshelf";
  eqHigh.frequency.value = 3000;
  eqHigh.gain.value = opts.eqHigh ?? 0;

  const dryGain = ac.createGain();
  const wetGain = ac.createGain();
  setWetDry(dryGain, wetGain, opts.mix ?? 0.28);

  const modType = opts.modType ?? "off";
  const mod = buildModFx(ac, modType, opts.modRate ?? 1, opts.modDepth ?? 0.5);
  allExtras.push(...mod.extras);
  allOscs.push(...mod.oscs);
  startFns.push(mod.startOscs);

  const tone = ac.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = opts.toneHz ?? 2800;
  tone.Q.value = 0.8;

  const distortion = ac.createWaveShaper();
  const drive = opts.distortionAmount ?? 0;
  distortion.curve = drive > 0 ? makeDistortionCurve(drive) : null;
  distortion.oversample = "4x";

  const dType = opts.delayType ?? "mono";
  const delaySec = buildDelaySection(
    ac, dType,
    opts.delayTime ?? 0,
    opts.delayTimeR ?? (opts.delayTime ?? 0),
    opts.delayFeedback ?? 0,
  );
  allExtras.push(...delaySec.extras);

  const limiter = ac.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.08;

  const outputGain = ac.createGain();
  outputGain.gain.value = opts.outputGain ?? 0.9;

  const analyser = ac.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.75;

  source.connect(inputGain);
  inputGain.connect(highpass);
  highpass.connect(compressor);
  compressor.connect(eqLow);
  eqLow.connect(eqHigh);

  eqHigh.connect(dryGain);

  eqHigh.connect(mod.input);
  mod.output.connect(tone);
  tone.connect(distortion);
  distortion.connect(delaySec.input);
  delaySec.output.connect(wetGain);

  const vocoderEnabled = opts.vocoderEnabled === true;
  if (vocoderEnabled) {
    const voc = buildVocoder(ac, opts.vocoderFormant ?? 0);
    allExtras.push(...voc.extras);
    allOscs.push(...voc.oscs);
    startFns.push(voc.startOscs);

    dryGain.connect(voc.input);
    wetGain.connect(voc.input);
    voc.output.connect(limiter);
  } else {
    dryGain.connect(limiter);
    wetGain.connect(limiter);
  }

  limiter.connect(outputGain);
  outputGain.connect(analyser);
  analyser.connect(destination);

  for (const fn of startFns) fn();

  return {
    source,
    analyser,
    inputGain,
    outputGain,
    dryGain,
    wetGain,
    highpass,
    tone,
    distortion,
    delay: delaySec.delayL,
    feedbackGain: delaySec.feedbackGain,
    feedbackFilter: delaySec.feedbackFilter,
    compressor,
    limiter,
    eqLow,
    eqHigh,
    _extras: allExtras,
    _oscillators: allOscs,
  };
}

export function createEchoNode(
  buffer: AudioBuffer,
  opts: FxOptions = {},
): EchoNode {
  const ac = getAudioContext();
  const source = ac.createBufferSource();
  source.buffer = buffer;
  const nodes = buildFxGraph(ac, source, opts, ac.destination);
  return { ...nodes, buffer };
}

function encodeWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  const bytesPerSample = 2;
  const dataSize = length * numChannels * bytesPerSample;
  const headerSize = 44;
  const arrayBuffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(arrayBuffer);

  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  writeString(0, "RIFF");
  view.setUint32(4, headerSize - 8 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  const channels: Float32Array[] = [];
  for (let ch = 0; ch < numChannels; ch++) {
    channels.push(buffer.getChannelData(ch));
  }

  let offset = headerSize;
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

export async function renderWithFx(
  sourceBlob: Blob,
  opts: {
    playbackRate: number;
    inputGain: number;
    outputGain: number;
    highpassHz: number;
    toneHz: number;
    distortionAmount: number;
    delayTime: number;
    delayFeedback: number;
    mix: number;
    modType?: ModType;
    modRate?: number;
    modDepth?: number;
    delayType?: DelayType;
    delayTimeR?: number;
    eqLow?: number;
    eqHigh?: number;
    vocoderEnabled?: boolean;
    vocoderFormant?: number;
  },
): Promise<Blob> {
  const ac = getAudioContext();
  const arrayBuf = await sourceBlob.arrayBuffer();
  const inputBuffer = await ac.decodeAudioData(arrayBuf);

  const rate = opts.playbackRate ?? 1;
  const adjustedDuration = inputBuffer.duration / rate;
  const dt = opts.delayTime ?? 0;
  const fb = opts.delayFeedback ?? 0;
  const tailRepeats = dt > 0 && fb > 0
    ? Math.max(1, Math.ceil(Math.log(0.001) / Math.log(fb)))
    : 0;
  const tailTime = dt > 0 && fb > 0
    ? Math.min(dt * tailRepeats, 8)
    : 0;
  const totalDuration = adjustedDuration + tailTime + 0.5;

  const offlineCtx = new OfflineAudioContext(
    inputBuffer.numberOfChannels,
    Math.ceil(totalDuration * inputBuffer.sampleRate),
    inputBuffer.sampleRate,
  );

  const source = offlineCtx.createBufferSource();
  source.buffer = inputBuffer;

  buildFxGraph(offlineCtx, source, opts, offlineCtx.destination);

  source.start(0);
  const renderedBuffer = await offlineCtx.startRendering();
  return encodeWav(renderedBuffer);
}

export async function fetchAndDecode(src: string): Promise<AudioBuffer> {
  const ac = getAudioContext();
  const resp = await fetch(src);
  if (!resp.ok) throw new Error("fetch failed");
  const arrayBuf = await resp.arrayBuffer();
  return ac.decodeAudioData(arrayBuf);
}

export function getAnalyserData(analyser: AnalyserNode): {
  frequency: Uint8Array;
  waveform: Uint8Array;
} {
  const frequency = new Uint8Array(analyser.frequencyBinCount);
  const waveform = new Uint8Array(analyser.fftSize);
  analyser.getByteFrequencyData(frequency);
  analyser.getByteTimeDomainData(waveform);
  return { frequency, waveform };
}

export function createDroneOscillator(messageCount: number): {
  stop: () => void;
  setIntensity: (count: number) => void;
} {
  const ac = getAudioContext();

  const osc1 = ac.createOscillator();
  osc1.type = "sine";
  osc1.frequency.value = 55;

  const osc2 = ac.createOscillator();
  osc2.type = "sine";
  osc2.frequency.value = 55.3;

  const osc3 = ac.createOscillator();
  osc3.type = "triangle";
  osc3.frequency.value = 82.5;

  const lfo = ac.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 0.08;

  const lfoGain = ac.createGain();
  lfoGain.gain.value = 3;

  lfo.connect(lfoGain);
  lfoGain.connect(osc1.frequency);
  lfoGain.connect(osc2.frequency);

  const filter = ac.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 200;
  filter.Q.value = 2;

  const masterGain = ac.createGain();
  const intensity = Math.min(messageCount / 50, 1);
  masterGain.gain.value = 0.012 * intensity;

  const panner = ac.createStereoPanner();
  panner.pan.value = 0;

  const panLfo = ac.createOscillator();
  panLfo.type = "sine";
  panLfo.frequency.value = 0.03;

  const panLfoGain = ac.createGain();
  panLfoGain.gain.value = 0.3;

  panLfo.connect(panLfoGain);
  panLfoGain.connect(panner.pan);

  osc1.connect(filter);
  osc2.connect(filter);
  osc3.connect(filter);
  filter.connect(masterGain);
  masterGain.connect(panner);
  panner.connect(ac.destination);

  osc1.start();
  osc2.start();
  osc3.start();
  lfo.start();
  panLfo.start();

  return {
    stop: () => {
      const now = ac.currentTime;
      masterGain.gain.linearRampToValueAtTime(0, now + 2);
      setTimeout(() => {
        try {
          osc1.stop(); osc2.stop(); osc3.stop(); lfo.stop(); panLfo.stop();
          osc1.disconnect(); osc2.disconnect(); osc3.disconnect();
          lfo.disconnect(); lfoGain.disconnect();
          filter.disconnect(); masterGain.disconnect();
          panner.disconnect(); panLfo.disconnect(); panLfoGain.disconnect();
        } catch {}
      }, 2200);
    },
    setIntensity: (count: number) => {
      const newIntensity = Math.min(count / 50, 1);
      masterGain.gain.linearRampToValueAtTime(
        0.012 * newIntensity,
        ac.currentTime + 0.5,
      );
      filter.frequency.linearRampToValueAtTime(
        200 + newIntensity * 400,
        ac.currentTime + 1,
      );
    },
  };
}
