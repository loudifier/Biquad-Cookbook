class EQModel {
  constructor() {
    this.sampleRate = 48000;
    this.outputGainDb = 0;
    this.filters = [];
    this._freqs = null;
    this._freqResponses = null;
    this._phaseResponses = null;
    this._impulseResponse = null;
    this._groupDelay = null;
  }

  _defaultLocked(type) {
    const def = FILTER_TYPES[type];
    if (!def) return {};
    const locked = {};
    for (const p of def.params) locked[p.key] = false;
    return locked;
  }

  addFilter(type, params) {
    this.filters.push({ type, params: { ...params }, bypassed: false, locked: this._defaultLocked(type) });
    this._invalidate();
  }

  insertFilter(index, type, params) {
    this.filters.splice(index, 0, { type, params: { ...params }, bypassed: false, locked: this._defaultLocked(type) });
    this._invalidate();
  }

  removeFilter(index) {
    this.filters.splice(index, 1);
    this._invalidate();
  }

  moveFilter(from, to) {
    const item = this.filters.splice(from, 1)[0];
    this.filters.splice(to, 0, item);
    this._invalidate();
  }

  updateFilter(index, updates) {
    if (updates.type) {
      this.filters[index].type = updates.type;
      this.filters[index].locked = this._defaultLocked(updates.type);
    }
    if (updates.params) {
      Object.assign(this.filters[index].params, updates.params);
    }
    this._invalidate();
  }

  setLocked(index, paramKey, value) {
    this.filters[index].locked[paramKey] = !!value;
  }

  toggleBypass(index) {
    this.filters[index].bypassed = !this.filters[index].bypassed;
    this._invalidate();
  }

  setSampleRate(sr) {
    this.sampleRate = sr;
    this._invalidate();
  }

  setOutputGainDb(db) {
    this.outputGainDb = db;
    this._invalidate();
  }

  _invalidate() {
    this._freqs = null;
    this._freqResponses = null;
    this._phaseResponses = null;
    this._impulseResponse = null;
    this._groupDelay = null;
  }

  _ensureFreqs() {
    if (this._freqs) return;
    const nyquist = this.sampleRate / 2;
    const fMin = Math.max(1, 10);
    const fMax = Math.min(nyquist, 24000);
    const n = 300;
    this._freqs = new Float64Array(n);
    const logMin = Math.log10(fMin);
    const logMax = Math.log10(fMax);
    for (let i = 0; i < n; i++) {
      this._freqs[i] = Math.pow(10, logMin + (logMax - logMin) * i / (n - 1));
    }
  }

  _computeCoeffs() {
    return this.filters.filter(f => !f.bypassed).map(f => {
      const c = calcCoeffs(f.type, f.params, this.sampleRate);
      return c || { b0: 1, b1: 0, b2: 0, a1: 0, a2: 0 };
    });
  }

  _computeFreqResponses() {
    if (this._freqResponses) return;
    this._ensureFreqs();
    const freqs = this._freqs;
    const coeffs = this._computeCoeffs();
    const gain = Math.pow(10, this.outputGainDb / 20);
    const n = freqs.length;
    const magDb = new Float64Array(n);
    const phaseRad = new Float64Array(n);

    for (let i = 0; i < n; i++) {
      const w = TWO_PI * freqs[i] / this.sampleRate;
      const cos_w = Math.cos(w);
      const sin_w = Math.sin(w);
      const cos2w = Math.cos(2 * w);
      const sin2w = Math.sin(2 * w);

      let H_re = 1;
      let H_im = 0;

      for (const c of coeffs) {
        const num_re = c.b0 + c.b1 * cos_w + c.b2 * cos2w;
        const num_im = -c.b1 * sin_w - c.b2 * sin2w;
        const den_re = 1 + c.a1 * cos_w + c.a2 * cos2w;
        const den_im = -c.a1 * sin_w - c.a2 * sin2w;
        const den_mag2 = den_re * den_re + den_im * den_im;
        const h_re = (num_re * den_re + num_im * den_im) / den_mag2;
        const h_im = (num_im * den_re - num_re * den_im) / den_mag2;
        const new_re = H_re * h_re - H_im * h_im;
        const new_im = H_re * h_im + H_im * h_re;
        H_re = new_re;
        H_im = new_im;
      }

      magDb[i] = 20 * Math.log10(Math.sqrt(H_re * H_re + H_im * H_im)) + 20 * Math.log10(gain);
      phaseRad[i] = Math.atan2(H_im, H_re);
    }

    this._freqResponses = { magDb, phaseRad };
  }

  getFreqs() {
    this._ensureFreqs();
    return this._freqs;
  }

  getMagDb() {
    this._computeFreqResponses();
    return this._freqResponses.magDb;
  }

  getPhaseRad() {
    this._computeFreqResponses();
    return this._freqResponses.phaseRad;
  }

  getPhaseDeg() {
    this._computeFreqResponses();
    const phase = this._freqResponses.phaseRad;
    const n = phase.length;
    const deg = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      deg[i] = phase[i] * 180 / Math.PI;
    }
    return unwrapPhase(deg);
  }

  getImpulseResponse(length) {
    if (this._impulseResponse && this._impulseResponse.length >= length) {
      return this._impulseResponse.subarray(0, length);
    }

    const coeffs = this._computeCoeffs();
    const states = coeffs.map(() => ({ x1: 0, x2: 0, y1: 0, y2: 0 }));
    const response = new Float64Array(length);
    const gain = Math.pow(10, this.outputGainDb / 20);

    for (let n = 0; n < length; n++) {
      let input = (n === 0) ? 1 : 0;

      for (let i = 0; i < coeffs.length; i++) {
        const c = coeffs[i];
        const s = states[i];
        const output = c.b0 * input + c.b1 * s.x1 + c.b2 * s.x2 - c.a1 * s.y1 - c.a2 * s.y2;
        s.x2 = s.x1;
        s.x1 = input;
        s.y2 = s.y1;
        s.y1 = output;
        input = output;
      }

      response[n] = input * gain;
    }

    this._impulseResponse = response;
    return response;
  }

  getGroupDelay() {
    if (this._groupDelay) return this._groupDelay;
    this._ensureFreqs();
    const freqs = this._freqs;
    const n = freqs.length;

    const phaseRadFull = new Float64Array(n);
    const coeffs = this._computeCoeffs();

    for (let i = 0; i < n; i++) {
      const w = TWO_PI * freqs[i] / this.sampleRate;
      const cos_w = Math.cos(w);
      const sin_w = Math.sin(w);
      const cos2w = Math.cos(2 * w);
      const sin2w = Math.sin(2 * w);

      let H_re = 1;
      let H_im = 0;

      for (const c of coeffs) {
        const num_re = c.b0 + c.b1 * cos_w + c.b2 * cos2w;
        const num_im = -c.b1 * sin_w - c.b2 * sin2w;
        const den_re = 1 + c.a1 * cos_w + c.a2 * cos2w;
        const den_im = -c.a1 * sin_w - c.a2 * sin2w;
        const den_mag2 = den_re * den_re + den_im * den_im;
        const h_re = (num_re * den_re + num_im * den_im) / den_mag2;
        const h_im = (num_im * den_re - num_re * den_im) / den_mag2;
        const new_re = H_re * h_re - H_im * h_im;
        const new_im = H_re * h_im + H_im * h_re;
        H_re = new_re;
        H_im = new_im;
      }

      phaseRadFull[i] = Math.atan2(H_im, H_re);
    }

    const phaseDegArr = new Float64Array(n);
    for (let i = 0; i < n; i++) phaseDegArr[i] = phaseRadFull[i] * 180 / Math.PI;
    const phaseDeg = unwrapPhase(phaseDegArr);
    const gd = new Float64Array(n);

    for (let i = 1; i < n - 1; i++) {
      const df = freqs[i + 1] - freqs[i - 1];
      const dphi = phaseDeg[i + 1] - phaseDeg[i - 1];
      gd[i] = -(dphi / 360) / df * 1000;
    }
    gd[0] = gd[1];
    gd[n - 1] = gd[n - 2];

    this._groupDelay = gd;
    return gd;
  }

  toJSON() {
    return {
      sample_rate: this.sampleRate,
      output_gain_db: this.outputGainDb,
      filters: this.filters.map(f => ({
        type: f.type,
        bypassed: f.bypassed || false,
        locked: { ...f.locked },
        params: { ...f.params }
      }))
    };
  }

  fromJSON(obj) {
    this.sampleRate = obj.sample_rate || 48000;
    this.outputGainDb = obj.output_gain_db || 0;
    this.filters = [];
    if (obj.filters) {
      for (const f of obj.filters) {
        if (FILTER_TYPES[f.type]) {
          const params = { ...f.params };
          const locked = this._defaultLocked(f.type);
          if (f.locked) Object.assign(locked, f.locked);
          this.filters.push({ type: f.type, params, bypassed: f.bypassed || false, locked });
        }
      }
    }
    this._invalidate();
  }
}

function unwrapPhase(deg) {
  const n = deg.length;
  const out = new Float64Array(n);
  out[0] = deg[0];
  for (let i = 1; i < n; i++) {
    let d = deg[i] - out[i - 1];
    if (d > 180) {
      let k = Math.floor((d + 180) / 360);
      out[i] = deg[i] - 360 * k;
    } else if (d < -180) {
      let k = Math.floor((-d + 180) / 360);
      out[i] = deg[i] + 360 * k;
    } else {
      out[i] = deg[i];
    }
  }
  return out;
}
