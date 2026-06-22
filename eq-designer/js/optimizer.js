class ParamSpace {
  static build(eqModel, includeGain) {
    const names = [];
    const initial = [];
    const bounds = [];

    for (let i = 0; i < eqModel.filters.length; i++) {
      const f = eqModel.filters[i];
      if (f.bypassed) continue;
      const def = FILTER_TYPES[f.type];
      if (!def) continue;
      for (const p of def.params) {
        if (f.locked[p.key]) continue;
        const paramDef = def.params.find(d => d.key === p.key);
        names.push({ filterIndex: i, paramKey: p.key });
        const initVal = f.params[p.key] !== undefined ? f.params[p.key] : paramDef.default;
        initial.push(initVal);
        let lo, hi;
        if (p.key === 'db') {
          const offset = Math.max(Math.abs(initVal) / 2, 6);
          lo = initVal - offset;
          hi = initVal + offset;
        } else {
          lo = initVal / 2;
          hi = initVal * 2;
          if (lo > hi) { const t = lo; lo = hi; hi = t; }
        }
        bounds.push([lo, hi]);
      }
    }

    if (includeGain) {
      names.push({ filterIndex: -1, paramKey: 'output_gain' });
      initial.push(eqModel.outputGainDb);
      const gainOffset = Math.max(Math.abs(eqModel.outputGainDb) / 2, 6);
      bounds.push([Math.max(eqModel.outputGainDb - gainOffset, -20), Math.min(eqModel.outputGainDb + gainOffset, 20)]);
    }

    return { names, initial, bounds };
  }
}

function applyParamsToModel(eqModel, names, flat) {
  for (let i = 0; i < names.length; i++) {
    const n = names[i];
    if (n.filterIndex === -1) {
      eqModel.outputGainDb = flat[i];
    } else {
      eqModel.filters[n.filterIndex].params[n.paramKey] = flat[i];
    }
  }
}

class Optimizer {
  constructor(eqModel, paramSpace, targetFreqs, targetMag, inputInterp, mode) {
    this.eqModel = eqModel;
    this.paramSpace = paramSpace;
    this.targetFreqs = targetFreqs;
    this.targetMag = targetMag;
    this.inputInterp = inputInterp;
    this.mode = mode;
    this._aborted = false;
    this.bestParams = null;
    this.bestLoss = Infinity;
    this.initialLoss = Infinity;
    this._fs = eqModel.sampleRate;
  }

  abort() {
    this._aborted = true;
  }

  loss(flat) {
    const ps = this.paramSpace;
    const fs = this._fs;
    const nFreqs = this.targetFreqs.length;

    const mergedParams = this.eqModel.filters.map(f => ({ ...f.params }));
    for (let i = 0; i < ps.names.length; i++) {
      const n = ps.names[i];
      if (n.filterIndex >= 0) {
        mergedParams[n.filterIndex][n.paramKey] = flat[i];
      }
    }

    const activeFilters = [];
    for (let i = 0; i < this.eqModel.filters.length; i++) {
      if (this.eqModel.filters[i].bypassed) continue;
      activeFilters.push({
        type: this.eqModel.filters[i].type,
        params: mergedParams[i]
      });
    }

    const coeffs = activeFilters.map(f => {
      const c = calcCoeffs(f.type, f.params, fs);
      return c || { b0: 1, b1: 0, b2: 0, a1: 0, a2: 0 };
    });

    let outputGainDb = this.eqModel.outputGainDb;
    for (let i = 0; i < ps.names.length; i++) {
      if (ps.names[i].filterIndex === -1) {
        outputGainDb = flat[i];
        break;
      }
    }
    const gain = Math.pow(10, outputGainDb / 20);

    const magDb = new Float64Array(nFreqs);
    for (let fi = 0; fi < nFreqs; fi++) {
      const w = TWO_PI * this.targetFreqs[fi] / fs;
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

      magDb[fi] = 20 * Math.log10(Math.sqrt(H_re * H_re + H_im * H_im)) + 20 * Math.log10(gain);
    }

    let total = 0;
    for (let i = 0; i < nFreqs; i++) {
      const inputCurve = this.inputInterp ? this.inputInterp[i] : 0;
      const combined = inputCurve + magDb[i];
      if (this.mode === 'flatten') {
        total += Math.abs(combined);
      } else {
        total += Math.abs(this.targetMag[i] - combined);
      }
    }
    return total;
  }

  run(options, onProgress) {
    const ps = this.paramSpace;
    const n = ps.names.length;
    if (n === 0) return;

    this._aborted = false;
    this.eqModel._invalidate();

    const iterations = options.iterations || 100000;
    const initialDrift = options.initialDrift || 0.01;
    const patience = options.patience || 5000;

    const current = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      current[i] = ps.initial[i];
    }

    let currentLoss = this.loss(current);
    this.initialLoss = currentLoss;

    this.bestParams = current.slice();
    this.bestLoss = currentLoss;
    applyParamsToModel(this.eqModel, ps.names, this.bestParams);
    onProgress({ iteration: 0, bestLoss: this.bestLoss, phase: 'adaptive_mc', acceptanceRate: 0, done: false });

    let patienceCounter = 0;
    let accepted = 0;
    let total = 0;
    let patienceExceeded = false;
    const CHUNK = 1000;
    let iter = 1;

    const step = () => {
      const chunkEnd = Math.min(iter + CHUNK - 1, iterations);

      for (; iter <= chunkEnd && !this._aborted && !patienceExceeded; iter++) {
        const temperature = Math.max(1e-6, 1.0 - iter / iterations);
        const drift = initialDrift * (0.01 + 0.99 * temperature);

        const proposed = current.slice();
        for (let j = 0; j < n; j++) {
          const lo = ps.bounds[j][0];
          const hi = ps.bounds[j][1];
          const span = (hi - lo) * drift;
          const pert = (Math.random() * 2 - 1) * span;
          proposed[j] = Math.max(lo, Math.min(hi, current[j] + pert));
        }

        const proposedLoss = this.loss(proposed);
        const delta = proposedLoss - currentLoss;
        total++;

        if (proposedLoss < currentLoss ||
            Math.random() < Math.exp(-delta / (temperature * 0.01 + 1e-8))) {
          for (let j = 0; j < n; j++) current[j] = proposed[j];
          currentLoss = proposedLoss;
          accepted++;
        }

        if (currentLoss < this.bestLoss) {
          for (let j = 0; j < n; j++) this.bestParams[j] = current[j];
          this.bestLoss = currentLoss;
          applyParamsToModel(this.eqModel, ps.names, this.bestParams);
          patienceCounter = 0;
        } else {
          patienceCounter++;
        }

        if (patience > 0 && patienceCounter >= patience) {
          patienceExceeded = true;
          break;
        }
      }

      const done = iter > iterations || this._aborted || patienceExceeded;
      onProgress({
        iteration: Math.min(iter, iterations),
        bestLoss: this.bestLoss,
        phase: 'adaptive_mc',
        acceptanceRate: total > 0 ? accepted / total : 0,
        done,
        earlyStop: patienceExceeded
      });

      if (!done) {
        setTimeout(step, 0);
      }
    };

    setTimeout(step, 0);
  }
}
