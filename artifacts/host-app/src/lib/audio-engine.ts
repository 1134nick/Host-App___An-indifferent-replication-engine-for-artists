let ctx: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  if (!ctx || ctx.state === "closed") {
    ctx = new AudioContext();
  }
  if (ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
  return ctx;
}

export interface EchoNode {
  source: AudioBufferSourceNode;
  gain: GainNode;
  analyser: AnalyserNode;
  distortion: WaveShaperNode;
  delay: DelayNode;
  delayGain: GainNode;
  buffer: AudioBuffer;
}

function makeDistortionCurve(amount: number): Float32Array {
  const samples = 8192;
  const curve = new Float32Array(samples);
  const k = amount * amount;
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1;
    curve[i] = (Math.sign(x) * (1 - Math.pow(Math.abs(1 - Math.abs(x)), 1 + k))) ;
  }
  return curve;
}

export function createEchoNode(
  buffer: AudioBuffer,
  opts: {
    playbackRate?: number;
    distortionAmount?: number;
    delayTime?: number;
    delayFeedback?: number;
  } = {}
): EchoNode {
  const ac = getAudioContext();

  const source = ac.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = opts.playbackRate ?? 1;

  const distortion = ac.createWaveShaper();
  const amt = opts.distortionAmount ?? 0;
  if (amt > 0) {
    distortion.curve = makeDistortionCurve(amt);
    distortion.oversample = "4x";
  }

  const preGain = ac.createGain();
  preGain.gain.value = amt > 0 ? 1 / (1 + amt * 0.3) : 1;

  const delay = ac.createDelay(2.0);
  delay.delayTime.value = opts.delayTime ?? 0;

  const delayGain = ac.createGain();
  delayGain.gain.value = opts.delayFeedback ?? 0;

  const gain = ac.createGain();
  gain.gain.value = 1;

  const analyser = ac.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.6;

  if (amt > 0) {
    source.connect(preGain);
    preGain.connect(distortion);
    distortion.connect(delay);
    delay.connect(delayGain);
    delayGain.connect(delay);
    distortion.connect(gain);
    delay.connect(gain);
  } else {
    source.connect(delay);
    delay.connect(delayGain);
    delayGain.connect(delay);
    source.connect(gain);
    delay.connect(gain);
  }
  gain.connect(analyser);
  analyser.connect(ac.destination);

  return { source, gain, analyser, distortion, delay, delayGain, buffer };
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
        ac.currentTime + 0.5
      );
      filter.frequency.linearRampToValueAtTime(
        200 + newIntensity * 400,
        ac.currentTime + 1
      );
    },
  };
}
