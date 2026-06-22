let appModel = null;
let referenceCurve = null;
let optTargetCurve = null;
let optOptimizer = null;
let optRunning = false;
let currentTab = 'freq';
let debounceTimer = null;
let plotRevision = 0;
const IMPULSE_LENGTH = 128;

document.addEventListener('DOMContentLoaded', () => {
  appModel = new EQModel();
  appModel.addFilter('peaking_eq', { f0: 1000, q: 1.0, db: 3 });

  setupGlobalControls();
  setupAddFilter();
  setupFilterList();
  setupTabs();
  setupSaveLoad();
  setupReferenceLoad();
  setupDarkMode();
  setupResetZoom();
  setupDivider();
  setupDisclosure();
  setupOptimizeMode();

  renderFilterList();
  updatePlot();
});

function setupGlobalControls() {
  const srInput = document.getElementById('sample-rate');
  const gainInput = document.getElementById('output-gain');

  srInput.addEventListener('input', () => {
    const v = parseFloat(srInput.value);
    if (v > 0) { appModel.setSampleRate(v); scheduleUpdate(); }
  });

  gainInput.addEventListener('input', () => {
    const v = parseFloat(gainInput.value);
    if (!isNaN(v)) { appModel.setOutputGainDb(v); scheduleUpdate(); }
  });
}

function setupAddFilter() {
  const select = document.getElementById('add-filter-select');
  select.addEventListener('change', () => {
    const type = select.value;
    if (!type) return;
    const params = getDefaultParams(type);
    appModel.addFilter(type, params);
    select.value = '';
    renderFilterList();
    updatePlot();
  });
}

function setupFilterList() {
  const list = document.getElementById('filter-list');

  list.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-bypass, .filter-move-up, .filter-move-down, .filter-delete');
    if (!btn) return;
    const li = btn.closest('.filter-item');
    const index = parseInt(li.dataset.index);

    if (btn.classList.contains('filter-bypass')) {
      appModel.toggleBypass(index);
      renderFilterList();
      updatePlot();
    } else if (btn.classList.contains('filter-move-up') && index > 0) {
      appModel.moveFilter(index, index - 1);
      renderFilterList();
      updatePlot();
    } else if (btn.classList.contains('filter-move-down') && index < appModel.filters.length - 1) {
      appModel.moveFilter(index, index + 1);
      renderFilterList();
      updatePlot();
    } else if (btn.classList.contains('filter-delete')) {
      appModel.removeFilter(index);
      renderFilterList();
      updatePlot();
    }
  });

  list.addEventListener('change', (e) => {
    const target = e.target;

    if (target.classList.contains('filter-type-select')) {
      const li = target.closest('.filter-item');
      const index = parseInt(li.dataset.index);
      const newType = target.value;
      const oldType = appModel.filters[index].type;
      if (newType === oldType) return;

      const newParams = getDefaultParams(newType);
      const oldParams = appModel.filters[index].params;
      for (const key of Object.keys(newParams)) {
        if (oldParams[key] !== undefined) newParams[key] = oldParams[key];
      }

      appModel.updateFilter(index, { type: newType, params: newParams });
      renderFilterList();
      updatePlot();
      return;
    }

    if (target.classList.contains('filter-param-input')) {
      const li = target.closest('.filter-item');
      const index = parseInt(li.dataset.index);
      const paramKey = target.dataset.paramKey;
      const value = parseFloat(target.value);
      if (!isNaN(value)) {
        appModel.updateFilter(index, { params: { [paramKey]: value } });
        const coeffs = calcCoeffs(appModel.filters[index].type, appModel.filters[index].params, appModel.sampleRate);
        if (coeffs) {
          const details = li.querySelector('.coeffs-details');
          if (details) {
            details.innerHTML = '<summary>Show coefficients</summary>' +
              `<code>b0 = ${coeffs.b0.toFixed(6)}</code>` +
              `<code>b1 = ${coeffs.b1.toFixed(6)}</code>` +
              `<code>b2 = ${coeffs.b2.toFixed(6)}</code>` +
              `<code>a1 = ${coeffs.a1.toFixed(6)}</code>` +
              `<code>a2 = ${coeffs.a2.toFixed(6)}</code>`;
          }
        }
        scheduleUpdate();
      }
    }
  });
}

function setupTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentTab = tab.dataset.plot;
      updatePlot();
    });
  });
}

function clearEQ() {
  if (!confirm('Clear all filters and reset to defaults?')) return;
  appModel.filters = [];
  appModel.setSampleRate(48000);
  appModel.setOutputGainDb(0);
  document.getElementById('sample-rate').value = 48000;
  document.getElementById('output-gain').value = 0;
  renderFilterList();
  document.dispatchEvent(new CustomEvent('eq-loaded'));
  plotRevision++;
  updatePlot();
}

function setupSaveLoad() {
  document.getElementById('clear-eq').addEventListener('click', clearEQ);

  document.getElementById('save-eq').addEventListener('click', () => {
    downloadYAML(appModel, 'biquad-eq.yaml');
  });

  document.getElementById('export-curve').addEventListener('click', () => {
    const freqs = appModel.getFreqs();
    const magDb = appModel.getMagDb();
    let csv = 'Frequency (Hz),Magnitude (dB)\n';
    for (let i = 0; i < freqs.length; i++) {
      csv += freqs[i].toFixed(6) + ',' + magDb[i].toFixed(6) + '\n';
    }
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'biquad-eq-curve.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  document.getElementById('load-eq').addEventListener('click', () => {
    document.getElementById('load-eq-input').click();
  });

  document.getElementById('load-eq-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const obj = await loadYAMLFromFile(file);
      appModel.fromJSON(obj);
      document.getElementById('sample-rate').value = appModel.sampleRate;
      document.getElementById('output-gain').value = appModel.outputGainDb;
      document.getElementById('clear-reference').style.display = 'none';
      renderFilterList();
      document.dispatchEvent(new CustomEvent('eq-loaded'));
      plotRevision++;
      updatePlot();
    } catch (err) {
      alert('Error loading EQ: ' + err.message);
    }
    e.target.value = '';
  });
}

function setupReferenceLoad() {
  document.getElementById('load-reference').addEventListener('click', () => {
    document.getElementById('load-reference-input').click();
  });

  document.getElementById('load-reference-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const curve = parseReferenceCSV(ev.target.result);
      if (curve) {
        referenceCurve = curve;
        document.getElementById('clear-reference').style.display = '';
        if (currentTab === 'freq') updatePlot();
      } else {
        alert('Could not parse CSV. Expected columns: frequency, magnitude (dB)');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  document.getElementById('clear-reference').addEventListener('click', () => {
    referenceCurve = null;
    document.getElementById('clear-reference').style.display = 'none';
    if (currentTab === 'freq') updatePlot();
  });
}

function setupDarkMode() {
  const btn = document.getElementById('toggle-dark');
  btn.addEventListener('click', () => {
    document.body.classList.toggle('dark');
    btn.textContent = document.body.classList.contains('dark') ? '\u2600' : '\u263E';
    updatePlot();
  });
}

function setupResetZoom() {
  document.getElementById('reset-zoom').addEventListener('click', () => {
    plotRevision++;
    updatePlot();
  });
}

function setupDisclosure() {
  const modal = document.getElementById('disclosure-modal');
  document.getElementById('btn-disclosure').addEventListener('click', () => {
    modal.hidden = false;
    modal.classList.add('open');
  });
  document.getElementById('btn-close-disclosure').addEventListener('click', () => {
    modal.hidden = true;
    modal.classList.remove('open');
  });
  modal.addEventListener('click', (e) => {
    if (e.target === modal) { modal.hidden = true; modal.classList.remove('open'); }
  });
}

function setupOptimizeMode() {
  const normalMode = document.getElementById('normal-mode');
  const optMode = document.getElementById('optimize-mode');
  const optParamList = document.getElementById('opt-param-list');
  const optProgress = document.getElementById('opt-progress');
  const optStart = document.getElementById('opt-start');
  const optStop = document.getElementById('opt-stop');
  const optToggle = document.getElementById('btn-optimize');
  const optLoadTarget = document.getElementById('opt-load-target');
  const optTargetInput = document.getElementById('opt-target-input');
  const optTargetName = document.getElementById('opt-target-name');
  const optIncludeGain = document.getElementById('opt-include-gain');
  const optFmin = document.getElementById('opt-fmin');
  const optFmax = document.getElementById('opt-fmax');
  let inOptimizeMode = false;

  function updateParentCheckbox(filterIndex) {
    const group = optParamList.querySelector(`.opt-filter-group[data-fi="${filterIndex}"]`);
    if (!group) return;
    const children = group.querySelectorAll('.opt-param-checkbox');
    const parentCb = group.querySelector('.opt-filter-checkbox');
    if (!parentCb) return;
    const allChecked = Array.from(children).every(cb => cb.checked);
    parentCb.checked = allChecked;
  }

  function renderOptParamList() {
    const html = [];
    for (let i = 0; i < appModel.filters.length; i++) {
      const f = appModel.filters[i];
      if (f.bypassed) continue;
      const def = FILTER_TYPES[f.type];
      if (!def) continue;

      const allLocked = def.params.every(p => f.locked[p.key]);
      const groupChecked = !allLocked;

      html.push(`<div class="opt-filter-group" data-fi="${i}">
        <label class="opt-filter-header">
          <input type="checkbox" class="opt-filter-checkbox" data-fi="${i}" ${groupChecked ? 'checked' : ''}>
          <span>#${i + 1} ${def.name}</span>
        </label>`);

      for (const p of def.params) {
        const val = f.params[p.key] !== undefined ? f.params[p.key] : p.default;
        const checked = !f.locked[p.key];
        const unit = p.key === 'f0' || p.key === 'fp' ? 'Hz' :
                     p.key === 'q' || p.key === 'q0' || p.key === 'qp' ? '' :
                     p.key === 'db' ? 'dB' : '';
        html.push(`<label class="opt-param-item">
          <input type="checkbox" class="opt-param-checkbox" data-fi="${i}" data-pk="${p.key}" ${checked ? 'checked' : ''}>
          <span class="opt-param-key">${p.label}</span>
          <span class="opt-param-val">${val}${unit}</span>
        </label>`);
      }

      html.push(`</div>`);
    }
    optParamList.innerHTML = html.join('');

    optParamList.querySelectorAll('.opt-param-checkbox').forEach(cb => {
      cb.addEventListener('change', () => {
        const fi = parseInt(cb.dataset.fi);
        const pk = cb.dataset.pk;
        appModel.setLocked(fi, pk, !cb.checked);
        updateParentCheckbox(fi);
      });
    });

    optParamList.querySelectorAll('.opt-filter-checkbox').forEach(cb => {
      cb.addEventListener('change', () => {
        const fi = parseInt(cb.dataset.fi);
        const group = optParamList.querySelector(`.opt-filter-group[data-fi="${fi}"]`);
        const children = group.querySelectorAll('.opt-param-checkbox');
        children.forEach(child => {
          child.checked = cb.checked;
          const pk = child.dataset.pk;
          appModel.setLocked(fi, pk, !cb.checked);
        });
      });
    });
  }

  function toggleOptimizeMode() {
    if (inOptimizeMode) {
      if (optRunning) { optOptimizer.abort(); optRunning = false; }
      inOptimizeMode = false;
      optMode.style.display = 'none';
      normalMode.style.display = '';
      optStart.style.display = '';
      optStop.style.display = 'none';
      optProgress.textContent = '';
      optToggle.textContent = 'Filter Optimization';
      renderFilterList();
      if (currentTab === 'freq') updatePlot();
    } else {
      if (appModel.filters.length === 0) {
        alert('Add at least one filter first.');
        return;
      }
      inOptimizeMode = true;
      normalMode.style.display = 'none';
      optMode.style.display = '';
      optProgress.textContent = '';
      optTargetName.textContent = optTargetCurve ? `Loaded (${optTargetCurve.freqs.length} pts)` : 'None';
      optToggle.textContent = 'Exit Optimization';
      renderOptParamList();
    }
  }

  optToggle.addEventListener('click', toggleOptimizeMode);

  document.addEventListener('eq-loaded', () => {
    if (inOptimizeMode) renderOptParamList();
  });

  optLoadTarget.addEventListener('click', () => optTargetInput.click());

  optTargetInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const curve = parseReferenceCSV(ev.target.result);
      if (curve) {
        optTargetCurve = curve;
        optTargetName.textContent = `${file.name} (${curve.freqs.length} pts)`;
        if (currentTab === 'freq') updatePlot();
      } else {
        alert('Could not parse target CSV');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  optStart.addEventListener('click', () => {
    const mode = document.querySelector('input[name="opt-mode"]:checked').value;
    if (mode === 'match' && !optTargetCurve) {
      alert('Load a target curve first.');
      return;
    }

    optRunning = true;
    optStart.style.display = 'none';
    optStop.style.display = '';

    const fmin = parseFloat(optFmin.value) || 20;
    const fmax = parseFloat(optFmax.value) || 20000;
    const includeGain = optIncludeGain.checked;

    const ps = ParamSpace.build(appModel, includeGain);
    if (ps.names.length === 0) {
      alert('No parameters available to optimize. Unlock some parameters first.');
      optRunning = false;
      optStart.style.display = '';
      optStop.style.display = 'none';
      return;
    }

    const { freqs: targetFreqsFloat, mags: targetMagRaw } = getOptimizationFreqs(
      appModel.sampleRate, fmin, fmax,
      mode === 'match' ? optTargetCurve : null
    );
    const targetMag = mode === 'flatten'
      ? new Float64Array(targetFreqsFloat.length)
      : targetMagRaw;

    const inputInterp = referenceCurve
      ? interpolateCurve(referenceCurve.freqs, referenceCurve.magDb, targetFreqsFloat)
      : null;

    optOptimizer = new Optimizer(appModel, ps, targetFreqsFloat, targetMag, inputInterp, mode);

    optOptimizer.run({ iterations: 100000, initialDrift: 0.01, patience: 5000 }, (progress) => {
      optProgress.textContent = `Iter ${progress.iteration.toLocaleString()} / Best loss: ${progress.bestLoss.toFixed(2)}`;
      document.getElementById('output-gain').value = appModel.outputGainDb;
      appModel._invalidate();
      updatePlot();
      if (progress.done) {
        optRunning = false;
        optStart.style.display = '';
        optStop.style.display = 'none';
        optProgress.textContent += optOptimizer._aborted ? ' — Stopped' : progress.earlyStop ? ' — Early stop' : ' — Done';
        renderOptParamList();
      }
    });
  });

  optStop.addEventListener('click', () => {
    if (optOptimizer) optOptimizer.abort();
  });
}

function getOptimizationFreqs(sampleRate, fmin, fmax, targetCurve) {
  const nyquist = sampleRate / 2;
  const cutoff = 0.9 * nyquist;
  if (targetCurve) {
    const idxs = [];
    for (let i = 0; i < targetCurve.freqs.length; i++) {
      const f = targetCurve.freqs[i];
      if (f >= fmin && f <= fmax && f <= cutoff) {
        idxs.push(i);
      }
    }
    const freqs = new Float64Array(idxs.length);
    const mags = new Float64Array(idxs.length);
    for (let j = 0; j < idxs.length; j++) {
      freqs[j] = targetCurve.freqs[idxs[j]];
      mags[j] = targetCurve.magDb[idxs[j]];
    }
    return { freqs, mags };
  }
  const lo = Math.max(1, fmin);
  const hi = Math.min(cutoff, fmax);
  const n = 200;
  const freqs = new Float64Array(n);
  const logLo = Math.log10(lo);
  const logHi = Math.log10(hi);
  for (let i = 0; i < n; i++) {
    freqs[i] = Math.pow(10, logLo + (logHi - logLo) * i / (n - 1));
  }
  return { freqs, mags: null };
}

function setupDivider() {
  const divider = document.getElementById('divider');
  const root = document.documentElement;
  let isDragging = false;
  const MIN_WIDTH = 200;
  const MAX_WIDTH = 800;

  divider.addEventListener('mousedown', (e) => {
    isDragging = true;
    divider.classList.add('active');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  function updateWidth(e) {
    const width = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, e.clientX));
    root.style.setProperty('--sidebar-width', width + 'px');
    Plotly.Plots.resize(document.getElementById('plot'));
  }

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    updateWidth(e);
  });

  document.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    divider.classList.remove('active');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  });
}

function renderFilterList() {
  const list = document.getElementById('filter-list');
  const html = [];

  appModel.filters.forEach((filter, i) => {
    const def = FILTER_TYPES[filter.type];
    if (!def) return;
    const coeffs = calcCoeffs(filter.type, filter.params, appModel.sampleRate) || { b0: 1, b1: 0, b2: 0, a1: 0, a2: 0 };

    const typeOptions = Object.entries(FILTER_TYPES)
      .map(([key, d]) =>
        `<option value="${key}" ${key === filter.type ? 'selected' : ''}>${d.name}</option>`
      ).join('');

    const paramInputs = def.params.map(p => {
      const val = filter.params[p.key] !== undefined ? filter.params[p.key] : p.default;
      return `<label class="param-label">${p.label}
        <input type="number" class="filter-param-input"
               data-param-key="${p.key}"
               value="${val}"
               ${p.min !== undefined ? `min="${p.min}"` : ''}
               ${p.max !== undefined ? `max="${p.max}"` : ''}
               ${p.step !== undefined ? `step="${p.step}"` : ''}>
      </label>`;
    }).join('');

    const coeffsHtml = `<details class="coeffs-details">
      <summary>Show coefficients</summary>
      <code>b0 = ${coeffs.b0.toFixed(6)}</code>
      <code>b1 = ${coeffs.b1.toFixed(6)}</code>
      <code>b2 = ${coeffs.b2.toFixed(6)}</code>
      <code>a1 = ${coeffs.a1.toFixed(6)}</code>
      <code>a2 = ${coeffs.a2.toFixed(6)}</code>
    </details>`;

    const bypassed = filter.bypassed || false;
    html.push(`<li class="filter-item${bypassed ? ' bypassed' : ''}" data-index="${i}">
      <div class="filter-header">
        <span class="filter-number">${i + 1}.</span>
        <button class="filter-bypass btn-icon" title="Toggle Bypass">${bypassed ? '\u25CB' : '\u25CF'}</button>
        <select class="filter-type-select">${typeOptions}</select>
        <div class="filter-actions">
          <button class="filter-move-up btn-icon" ${i === 0 ? 'disabled' : ''} title="Move Up">&#9650;</button>
          <button class="filter-move-down btn-icon" ${i === appModel.filters.length - 1 ? 'disabled' : ''} title="Move Down">&#9660;</button>
          <button class="filter-delete btn-icon" title="Delete">&#10005;</button>
        </div>
      </div>
      <div class="filter-params">${paramInputs}</div>
      ${coeffsHtml}
    </li>`);
  });

  list.innerHTML = html.join('');
}

function scheduleUpdate() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => { updatePlot(); debounceTimer = null; }, 100);
}

function updatePlot() {
  const plotDiv = document.getElementById('plot');

  if (appModel.filters.length === 0) {
    Plotly.purge('plot');
    plotDiv.innerHTML = '<div class="empty-plot">Add filters to see the response</div>';
    return;
  }

  try {
    switch (currentTab) {
      case 'freq': {
        const freqs = appModel.getFreqs();
        const magDb = appModel.getMagDb();
        plotFreqResponse(freqs, magDb, referenceCurve, plotRevision, optTargetCurve);
        break;
      }
      case 'phase': {
        const freqs = appModel.getFreqs();
        const phaseDeg = appModel.getPhaseDeg();
        plotPhase(freqs, phaseDeg, plotRevision);
        break;
      }
      case 'impulse': {
        const response = appModel.getImpulseResponse(IMPULSE_LENGTH);
        plotImpulse(response, plotRevision);
        break;
      }
      case 'group-delay': {
        const freqs = appModel.getFreqs();
        const groupDelay = appModel.getGroupDelay();
        plotGroupDelay(freqs, groupDelay, plotRevision);
        break;
      }
    }
  } catch (err) {
    console.error('Plot error:', err);
  }
}
