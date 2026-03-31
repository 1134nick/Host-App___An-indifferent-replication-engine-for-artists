const PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47];

export type ConstantKey = "0" | "1" | "2" | "3" | "π" | "φ" | "√2" | "e" | "i" | "ℙ";

export interface ConstantDef {
  value: number | null;
  name: string;
  label: string;
  concept: string;
  color: string;
  desc: string;
}

export const MATH_CONSTANTS: Record<ConstantKey, ConstantDef> = {
  "0":  { value: 0,              name: "Nullity",     label: "0",  concept: "silence",     color: "#444440", desc: "Pure silence. The null state. No physics applied." },
  "1":  { value: 1,              name: "Identity",    label: "1",  concept: "identity",    color: "#d0d0c8", desc: "Bit-perfect reference. All adjustments are unity." },
  "2":  { value: 2,              name: "Octave",      label: "2",  concept: "octave",      color: "#90c890", desc: "Doubling. Every parameter scaled by powers of two." },
  "3":  { value: 3,              name: "Triad",       label: "3",  concept: "triad",       color: "#90b0c0", desc: "Harmonic thirds. The root of chord structure." },
  "π":  { value: Math.PI,        name: "Cycle",       label: "π",  concept: "cycle",       color: "#c0a098", desc: "Circular motion. Parameters oscillate on π-derived curves." },
  "φ":  { value: 1.6180339887,   name: "Spiral",      label: "φ",  concept: "spiral",      color: "#c0b898", desc: "Golden ratio. Every adjustment scaled toward φ-proportion." },
  "√2": { value: Math.SQRT2,     name: "Temperament", label: "√2", concept: "temperament", color: "#a8a0c0", desc: "Equal temperament. The irrational at the heart of Western tuning." },
  "e":  { value: Math.E,         name: "Decay",       label: "e",  concept: "decay",       color: "#c0a0b0", desc: "Natural exponential. Parameters follow e-curve decay." },
  "i":  { value: null,           name: "Phase",       label: "i",  concept: "phase",       color: "#98b8c0", desc: "Imaginary unit. Phase rotation in a perpendicular dimension." },
  "ℙ":  { value: null,           name: "Primes",      label: "ℙ",  concept: "primes",      color: "#b0c098", desc: "Prime number sequence. Parameters step through irregular but patterned intervals." },
};

export const CONSTANT_KEYS: ConstantKey[] = ["0", "1", "2", "3", "π", "φ", "√2", "e", "i", "ℙ"];

export interface FxParamSet {
  speed: number;
  distortion: number;
  delayTime: number;
  delayFeedback: number;
  inputGain: number;
  outputGain: number;
  mix: number;
  toneHz: number;
  highpassHz: number;
  modType: string;
  modRate: number;
  modDepth: number;
  delayType: string;
  delayTimeR: number;
  eqLow: number;
  eqHigh: number;
  vocoderEnabled: boolean;
  vocoderFormant: number;
}

export const IDENTITY_FX: FxParamSet = {
  speed: 1, distortion: 0, delayTime: 0, delayFeedback: 0,
  inputGain: 1, outputGain: 0.9, mix: 0.28, toneHz: 2800, highpassHz: 80,
  modType: "off", modRate: 1, modDepth: 0.5,
  delayType: "mono", delayTimeR: 0,
  eqLow: 0, eqHigh: 0,
  vocoderEnabled: false, vocoderFormant: 0,
};

export function getConstantBase(key: ConstantKey): FxParamSet {
  switch (key) {
    case "0":
      return { ...IDENTITY_FX, outputGain: 0.2, mix: 0, distortion: 0 };
    case "1":
      return { ...IDENTITY_FX };
    case "2":
      return { ...IDENTITY_FX, inputGain: 1.4, toneHz: 5600, highpassHz: 160, eqLow: 2, eqHigh: 2 };
    case "3":
      return { ...IDENTITY_FX, eqLow: 2, eqHigh: 1, mix: 0.33, modType: "chorus", modRate: 3, modDepth: 0.33 };
    case "π":
      return { ...IDENTITY_FX, mix: 0.314, delayTime: 0.314, delayFeedback: 0.314, modType: "phaser", modRate: 3.14, modDepth: 0.618, toneHz: 3142, delayType: "stereo", delayTimeR: 0.159, eqLow: 3, eqHigh: -1 };
    case "φ":
      return { ...IDENTITY_FX, speed: 0.618, inputGain: 1, eqLow: 1.6, eqHigh: 1, mix: 0.382, delayTime: 0.618, delayFeedback: 0.382, modType: "chorus", modRate: 1.618, modDepth: 0.382, delayType: "lr", delayTimeR: 0.382, toneHz: 2584 };
    case "√2":
      return { ...IDENTITY_FX, highpassHz: 113, toneHz: 3960, mix: 0.293, distortion: 7, delayTime: 0.141, delayFeedback: 0.293, modType: "flanger", modRate: 1.414, modDepth: 0.707, eqLow: -1, eqHigh: 1 };
    case "e":
      return { ...IDENTITY_FX, speed: 0.718, delayTime: 0.272, delayFeedback: 0.632, mix: 0.368, eqLow: 2, toneHz: 2718, modType: "chorus", modRate: 0.368, modDepth: 0.632, delayType: "cross", eqHigh: -2 };
    case "i":
      return { ...IDENTITY_FX, mix: 0.5, modType: "phaser", modRate: 0.25, modDepth: 1, delayTime: 0.25, delayFeedback: 0.25, delayType: "lr", delayTimeR: 0.25, eqHigh: -3 };
    case "ℙ":
      return { ...IDENTITY_FX, speed: 0.97, inputGain: 1.1, outputGain: 0.83, highpassHz: 97, toneHz: 2300, mix: 0.47, distortion: 11, delayTime: 0.230, delayFeedback: 0.53, modType: "ensemble", modRate: 2.3, modDepth: 0.59, delayType: "lr", delayTimeR: 0.370, eqLow: 2, eqHigh: -3, vocoderEnabled: true, vocoderFormant: 5 };
    default:
      return { ...IDENTITY_FX };
  }
}

const PARAM_ORDER = ["speed", "distortion", "delayTime", "delayFeedback", "inputGain", "outputGain", "mix", "toneHz", "highpassHz", "modRate", "modDepth", "delayTimeR", "eqLow", "eqHigh", "vocoderFormant"];

export function getPhysicsScale(constKey: ConstantKey, param: string, rawDelta: number): number {
  switch (constKey) {
    case "0":  return 0;
    case "1":  return rawDelta;
    case "2":  return rawDelta * 2;
    case "3":  return rawDelta * 1.5;
    case "π":  return rawDelta * (Math.PI / 3);
    case "φ":  return rawDelta * 1.6180339887;
    case "√2": return rawDelta * Math.SQRT2;
    case "e":  return rawDelta * (Math.E / 2);
    case "i":  return rawDelta * -1;
    case "ℙ": {
      const idx = PARAM_ORDER.indexOf(param) % PRIMES.length;
      return rawDelta * (PRIMES[Math.max(0, idx)] / 10);
    }
    default:   return rawDelta;
  }
}

const PERCEPTUAL_DISTANCES: Record<ConstantKey, number> = {
  "0": 0.0, "1": 0.0, "2": 0.35, "3": 0.25,
  "π": 0.45, "φ": 0.38, "√2": 0.28, "e": 0.30,
  "i": 0.55, "ℙ": 0.75,
};

export function getPerceptualDistance(key: ConstantKey): number {
  return PERCEPTUAL_DISTANCES[key] ?? 0;
}

export function scaleParam(constKey: ConstantKey, param: string, rawValue: number, identityValue: number, min: number, max: number): number {
  if (constKey === "1") return rawValue;
  const rawDelta = rawValue - identityValue;
  const scaled = getPhysicsScale(constKey, param, rawDelta);
  return Math.min(max, Math.max(min, identityValue + scaled));
}
