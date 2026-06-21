const TWO_PI = 2 * Math.PI;

function dbToA(db) {
  return Math.pow(10, db / 40);
}

function toRad(deg) {
  return deg * Math.PI / 180;
}

const FILTER_TYPES = {
  lowpass_1st: {
    name: '1st Order Lowpass',
    params: [
      { key: 'f0', label: 'Frequency (Hz)', default: 1000, min: 1, max: 100000, step: 1 }
    ],
    calc: (p, fs) => {
      const w0 = TWO_PI * p.f0 / fs;
      const gamma = Math.cos(w0) / (1 + Math.sin(w0));
      return {
        b0: (1 - gamma) / 2,
        b1: (1 - gamma) / 2,
        b2: 0,
        a1: -gamma,
        a2: 0
      };
    }
  },

  highpass_1st: {
    name: '1st Order Highpass',
    params: [
      { key: 'f0', label: 'Frequency (Hz)', default: 1000, min: 1, max: 100000, step: 1 }
    ],
    calc: (p, fs) => {
      const w0 = TWO_PI * p.f0 / fs;
      const gamma = Math.cos(w0) / (1 + Math.sin(w0));
      return {
        b0: (1 + gamma) / 2,
        b1: -(1 + gamma) / 2,
        b2: 0,
        a1: -gamma,
        a2: 0
      };
    }
  },

  allpass_1st: {
    name: '1st Order Allpass',
    params: [
      { key: 'f0', label: 'Frequency (Hz)', default: 1000, min: 1, max: 100000, step: 1 }
    ],
    calc: (p, fs) => {
      const t = Math.tan(Math.PI * p.f0 / fs);
      const delta = (t - 1) / (t + 1);
      return {
        b0: delta,
        b1: 1,
        b2: 0,
        a1: delta,
        a2: 0
      };
    }
  },

  lowshelf_1st: {
    name: '1st Order Low Shelf',
    params: [
      { key: 'f0', label: 'Frequency (Hz)', default: 1000, min: 1, max: 100000, step: 1 },
      { key: 'db', label: 'Gain (dB)', default: 6, min: -40, max: 40, step: 0.5 }
    ],
    calc: (p, fs) => {
      const A = dbToA(p.db);
      const f1 = p.f0 / A;
      const f2 = p.f0 * A;
      const L1 = -Math.exp(-TWO_PI * f1 / fs);
      const K1 = -Math.exp(-TWO_PI * f2 / fs);
      const norm = (1 + K1) / (1 + L1);
      const correction = Math.pow(10, p.db / 20) / norm;
      return {
        b0: correction,
        b1: K1 * correction,
        b2: 0,
        a1: L1,
        a2: 0
      };
    }
  },

  highshelf_1st: {
    name: '1st Order High Shelf',
    params: [
      { key: 'f0', label: 'Frequency (Hz)', default: 1000, min: 1, max: 100000, step: 1 },
      { key: 'db', label: 'Gain (dB)', default: 6, min: -40, max: 40, step: 0.5 }
    ],
    calc: (p, fs) => {
      const A = dbToA(p.db);
      const f1 = p.f0 * A;
      const f2 = p.f0 / A;
      const L1 = -Math.exp(-TWO_PI * f1 / fs);
      const K1 = -Math.exp(-TWO_PI * f2 / fs);
      const norm = (1 + L1) / (1 + K1);
      return {
        b0: norm,
        b1: K1 * norm,
        b2: 0,
        a1: L1,
        a2: 0
      };
    }
  },

  lowpass_2nd: {
    name: '2nd Order Lowpass',
    params: [
      { key: 'f0', label: 'Frequency (Hz)', default: 1000, min: 1, max: 100000, step: 1 },
      { key: 'q', label: 'Q', default: 0.707, min: 0.01, max: 100, step: 0.01 }
    ],
    calc: (p, fs) => {
      const w0 = TWO_PI * p.f0 / fs;
      const alpha = Math.sin(w0) / (2 * p.q);
      const cos_w0 = Math.cos(w0);
      const a0 = 1 + alpha;
      return {
        b0: ((1 - cos_w0) / 2) / a0,
        b1: (1 - cos_w0) / a0,
        b2: ((1 - cos_w0) / 2) / a0,
        a1: (-2 * cos_w0) / a0,
        a2: (1 - alpha) / a0
      };
    }
  },

  highpass_2nd: {
    name: '2nd Order Highpass',
    params: [
      { key: 'f0', label: 'Frequency (Hz)', default: 1000, min: 1, max: 100000, step: 1 },
      { key: 'q', label: 'Q', default: 0.707, min: 0.01, max: 100, step: 0.01 }
    ],
    calc: (p, fs) => {
      const w0 = TWO_PI * p.f0 / fs;
      const alpha = Math.sin(w0) / (2 * p.q);
      const cos_w0 = Math.cos(w0);
      const a0 = 1 + alpha;
      const bp = (1 + cos_w0) / 2;
      return {
        b0: bp / a0,
        b1: (-(1 + cos_w0)) / a0,
        b2: bp / a0,
        a1: (-2 * cos_w0) / a0,
        a2: (1 - alpha) / a0
      };
    }
  },

  allpass_2nd: {
    name: '2nd Order Allpass',
    params: [
      { key: 'f0', label: 'Frequency (Hz)', default: 1000, min: 1, max: 100000, step: 1 },
      { key: 'q', label: 'Q', default: 0.707, min: 0.01, max: 100, step: 0.01 }
    ],
    calc: (p, fs) => {
      const w0 = TWO_PI * p.f0 / fs;
      const alpha = Math.sin(w0) / (2 * p.q);
      const cos_w0 = Math.cos(w0);
      const a0 = 1 + alpha;
      return {
        b0: (1 - alpha) / a0,
        b1: (-2 * cos_w0) / a0,
        b2: (1 + alpha) / a0,
        a1: (-2 * cos_w0) / a0,
        a2: (1 - alpha) / a0
      };
    }
  },

  lowshelf_2nd: {
    name: '2nd Order Low Shelf',
    params: [
      { key: 'f0', label: 'Frequency (Hz)', default: 1000, min: 1, max: 100000, step: 1 },
      { key: 'q', label: 'Q', default: 0.707, min: 0.01, max: 100, step: 0.01 },
      { key: 'db', label: 'Gain (dB)', default: 6, min: -40, max: 40, step: 0.5 }
    ],
    calc: (p, fs) => {
      const A = dbToA(p.db);
      const w0 = TWO_PI * p.f0 / fs;
      const sin_w0 = Math.sin(w0);
      const cos_w0 = Math.cos(w0);
      const beta = Math.sqrt(A) / p.q;
      const a0 = (A + 1) + (A - 1) * cos_w0 + beta * sin_w0;
      return {
        b0: (A * ((A + 1) - (A - 1) * cos_w0 + beta * sin_w0)) / a0,
        b1: (2 * A * ((A - 1) - (A + 1) * cos_w0)) / a0,
        b2: (A * ((A + 1) - (A - 1) * cos_w0 - beta * sin_w0)) / a0,
        a1: (-2 * ((A - 1) + (A + 1) * cos_w0)) / a0,
        a2: ((A + 1) + (A - 1) * cos_w0 - beta * sin_w0) / a0
      };
    }
  },

  highshelf_2nd: {
    name: '2nd Order High Shelf',
    params: [
      { key: 'f0', label: 'Frequency (Hz)', default: 1000, min: 1, max: 100000, step: 1 },
      { key: 'q', label: 'Q', default: 0.707, min: 0.01, max: 100, step: 0.01 },
      { key: 'db', label: 'Gain (dB)', default: 6, min: -40, max: 40, step: 0.5 }
    ],
    calc: (p, fs) => {
      const A = dbToA(p.db);
      const w0 = TWO_PI * p.f0 / fs;
      const sin_w0 = Math.sin(w0);
      const cos_w0 = Math.cos(w0);
      const beta = Math.sqrt(A) / p.q;
      const a0 = (A + 1) - (A - 1) * cos_w0 + beta * sin_w0;
      return {
        b0: (A * ((A + 1) + (A - 1) * cos_w0 + beta * sin_w0)) / a0,
        b1: (-2 * A * ((A - 1) + (A + 1) * cos_w0)) / a0,
        b2: (A * ((A + 1) + (A - 1) * cos_w0 - beta * sin_w0)) / a0,
        a1: (2 * ((A - 1) - (A + 1) * cos_w0)) / a0,
        a2: ((A + 1) - (A - 1) * cos_w0 - beta * sin_w0) / a0
      };
    }
  },

  peaking_eq: {
    name: 'Peaking EQ',
    params: [
      { key: 'f0', label: 'Frequency (Hz)', default: 1000, min: 1, max: 100000, step: 1 },
      { key: 'q', label: 'Q', default: 1.0, min: 0.01, max: 100, step: 0.01 },
      { key: 'db', label: 'Gain (dB)', default: 6, min: -40, max: 40, step: 0.5 }
    ],
    calc: (p, fs) => {
      const A = dbToA(p.db);
      const w0 = TWO_PI * p.f0 / fs;
      const alpha = Math.sin(w0) / (2 * p.q);
      const cos_w0 = Math.cos(w0);
      const a0 = 1 + alpha / A;
      return {
        b0: (1 + alpha * A) / a0,
        b1: (-2 * cos_w0) / a0,
        b2: (1 - alpha * A) / a0,
        a1: (-2 * cos_w0) / a0,
        a2: (1 - alpha / A) / a0
      };
    }
  },

  bandpass_skirt: {
    name: 'Bandpass (Skirt Gain)',
    params: [
      { key: 'f0', label: 'Frequency (Hz)', default: 1000, min: 1, max: 100000, step: 1 },
      { key: 'q', label: 'Q', default: 1.0, min: 0.01, max: 100, step: 0.01 }
    ],
    calc: (p, fs) => {
      const w0 = TWO_PI * p.f0 / fs;
      const alpha = Math.sin(w0) / (2 * p.q);
      const cos_w0 = Math.cos(w0);
      const a0 = 1 + alpha;
      return {
        b0: (p.q * alpha) / a0,
        b1: 0,
        b2: (-p.q * alpha) / a0,
        a1: (-2 * cos_w0) / a0,
        a2: (1 - alpha) / a0
      };
    }
  },

  bandpass_peak: {
    name: 'Bandpass (Peak Gain)',
    params: [
      { key: 'f0', label: 'Frequency (Hz)', default: 1000, min: 1, max: 100000, step: 1 },
      { key: 'q', label: 'Q', default: 1.0, min: 0.01, max: 100, step: 0.01 }
    ],
    calc: (p, fs) => {
      const w0 = TWO_PI * p.f0 / fs;
      const alpha = Math.sin(w0) / (2 * p.q);
      const cos_w0 = Math.cos(w0);
      const a0 = 1 + alpha;
      return {
        b0: alpha / a0,
        b1: 0,
        b2: (-alpha) / a0,
        a1: (-2 * cos_w0) / a0,
        a2: (1 - alpha) / a0
      };
    }
  },

  notch: {
    name: 'Notch',
    params: [
      { key: 'f0', label: 'Frequency (Hz)', default: 1000, min: 1, max: 100000, step: 1 },
      { key: 'q', label: 'Q', default: 1.0, min: 0.01, max: 100, step: 0.01 }
    ],
    calc: (p, fs) => {
      const w0 = TWO_PI * p.f0 / fs;
      const alpha = Math.sin(w0) / (2 * p.q);
      const cos_w0 = Math.cos(w0);
      const a0 = 1 + alpha;
      return {
        b0: 1 / a0,
        b1: (-2 * cos_w0) / a0,
        b2: 1 / a0,
        a1: (-2 * cos_w0) / a0,
        a2: (1 - alpha) / a0
      };
    }
  },

  linkwitz_transform: {
    name: 'Linkwitz Transform',
    params: [
      { key: 'f0', label: 'Input Frequency f0 (Hz)', default: 200, min: 1, max: 100000, step: 1 },
      { key: 'q0', label: 'Input Q (Q0)', default: 0.707, min: 0.01, max: 100, step: 0.01 },
      { key: 'fp', label: 'Target Frequency fp (Hz)', default: 100, min: 1, max: 100000, step: 1 },
      { key: 'qp', label: 'Target Q (Qp)', default: 1.0, min: 0.01, max: 100, step: 0.01 }
    ],
    calc: (p, fs) => {
      const fc = (p.f0 + p.fp) / 2;
      const d0i = Math.pow(TWO_PI * p.f0, 2);
      const d1i = (TWO_PI * p.f0) / p.q0;
      const c0i = Math.pow(TWO_PI * p.fp, 2);
      const c1i = (TWO_PI * p.fp) / p.qp;
      const gn = (TWO_PI * fc) / Math.tan(Math.PI * fc / fs);
      const gn2 = gn * gn;

      const b0 = d0i + gn * d1i + gn2;
      const b1 = 2 * (d0i - gn2);
      const b2 = d0i - gn * d1i + gn2;
      const a0 = c0i + gn * c1i + gn2;
      const a1 = 2 * (c0i - gn2);
      const a2 = c0i - gn * c1i + gn2;

      return {
        b0: b0 / a0,
        b1: b1 / a0,
        b2: b2 / a0,
        a1: a1 / a0,
        a2: a2 / a0
      };
    }
  }
};

function getDefaultParams(typeKey) {
  const def = FILTER_TYPES[typeKey];
  if (!def) return {};
  const params = {};
  for (const p of def.params) {
    params[p.key] = p.default;
  }
  return params;
}

function calcCoeffs(typeKey, params, fs) {
  const def = FILTER_TYPES[typeKey];
  if (!def) return null;
  return def.calc(params, fs);
}
