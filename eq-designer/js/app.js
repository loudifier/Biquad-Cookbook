let appModel = null;
let referenceCurve = null;
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

function setupSaveLoad() {
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
      renderFilterList();
      referenceCurve = null;
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
        if (currentTab === 'freq') updatePlot();
      } else {
        alert('Could not parse CSV. Expected columns: frequency, magnitude (dB)');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
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
        plotFreqResponse(freqs, magDb, referenceCurve, plotRevision);
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
