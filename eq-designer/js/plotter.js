function getTheme() {
  const dark = document.body.classList.contains('dark');
  return {
    paper_bgcolor: dark ? '#252526' : '#fafafa',
    plot_bgcolor: dark ? '#1e1e1e' : '#ffffff',
    font_color: dark ? '#cccccc' : '#222222',
    grid_color: dark ? '#444444' : '#c0c0c0',
    zeroline_color: dark ? '#555555' : '#aaaaaa',
    minor_grid_color: dark ? '#333333' : '#dddddd',
  };
}

function interpolateCurve(refFreqs, refMag, targetFreqs) {
  const n = targetFreqs.length;
  const result = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const f = targetFreqs[i];
    let lo = 0, hi = refFreqs.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >>> 1;
      if (refFreqs[mid] < f) lo = mid;
      else hi = mid;
    }
    if (f <= refFreqs[0]) result[i] = refMag[0];
    else if (f >= refFreqs[refFreqs.length - 1]) result[i] = refMag[refFreqs.length - 1];
    else {
      const t = (f - refFreqs[lo]) / (refFreqs[hi] - refFreqs[lo]);
      result[i] = refMag[lo] + t * (refMag[hi] - refMag[lo]);
    }
  }
  return result;
}

const PLOT_CONFIG = {
  responsive: true,
  displaylogo: false,
  modeBarButtonsToRemove: ['lasso2d', 'select2d', 'autoScale2d', 'resetScale2d'],
  displayModeBar: true,
  scrollZoom: true
};

function buildLayout(uirevision, extra) {
  const t = getTheme();
  return {
    font: { family: 'Segoe UI, Arial, sans-serif', size: 12, color: t.font_color },
    margin: { l: 60, r: 30, t: 30, b: 60 },
    hovermode: 'x unified',
    paper_bgcolor: t.paper_bgcolor,
    plot_bgcolor: t.plot_bgcolor,
    uirevision: String(uirevision),
    xaxis: Object.assign({
      gridcolor: t.grid_color,
      zerolinecolor: t.zeroline_color,
      minor: { show: true, gridcolor: t.minor_grid_color }
    }, extra.xaxis || {}),
    yaxis: Object.assign({
      gridcolor: t.grid_color,
      zerolinecolor: t.zeroline_color,
      zerolinewidth: 1.5
    }, extra.yaxis || {}),
    ...extra.extra || {}
  };
}

function plotFreqResponse(freqs, magDb, referenceCurve, revision, targetCurve) {
  const traces = [{
    x: Array.from(freqs),
    y: Array.from(magDb),
    type: 'scatter',
    mode: 'lines',
    name: 'EQ Response',
    line: { color: '#4a90d9', width: 2 }
  }];

  if (referenceCurve) {
    traces.push({
      x: Array.from(referenceCurve.freqs),
      y: Array.from(referenceCurve.magDb),
      type: 'scatter',
      mode: 'lines',
      name: 'Reference',
      line: { color: '#e67e22', width: 1.5, dash: 'dash' }
    });

    const refInterp = interpolateCurve(referenceCurve.freqs, referenceCurve.magDb, freqs);
    const combined = new Float64Array(freqs.length);
    for (let i = 0; i < freqs.length; i++) combined[i] = refInterp[i] + magDb[i];

    traces.push({
      x: Array.from(freqs),
      y: Array.from(combined),
      type: 'scatter',
      mode: 'lines',
      name: 'Reference + EQ',
      line: { color: '#8e44ad', width: 2.5 }
    });
  }

  if (targetCurve) {
    traces.push({
      x: Array.from(targetCurve.freqs),
      y: Array.from(targetCurve.magDb),
      type: 'scatter',
      mode: 'lines',
      name: 'Target',
      line: { color: '#e74c3c', width: 1.5, dash: 'dot' }
    });
  }

  const layout = buildLayout(revision, {
    xaxis: {
      type: 'log',
      title: 'Frequency (Hz)',
      range: [Math.log10(Math.max(1, freqs[0])), Math.log10(Math.min(freqs[freqs.length - 1], 24000))]
    },
    yaxis: {
      title: 'Magnitude (dB)',
      range: (() => {
        const valid = Array.from(magDb).filter(v => Number.isFinite(v) && v > -300);
        if (valid.length === 0) return [-60, 60];
        const max = Math.max(...valid);
        const min = Math.min(...valid);
        if (max - min > 60) return [max - 60, max + 6];
        const pad = Math.max(6, (max - min) * 0.1 + 3);
        return [Math.floor((min - pad) / 5) * 5, Math.ceil((max + pad) / 5) * 5];
      })(),
      zeroline: true
    }
  });
  layout.title = { text: 'Frequency Response' };

  Plotly.react('plot', traces, layout, PLOT_CONFIG);
}

function plotPhase(freqs, phaseDeg, revision) {
  const trace = {
    x: Array.from(freqs),
    y: Array.from(phaseDeg),
    type: 'scatter',
    mode: 'lines',
    name: 'Phase',
    line: { color: '#4a90d9', width: 2 }
  };

  const layout = buildLayout(revision, {
    xaxis: {
      type: 'log',
      title: 'Frequency (Hz)',
      range: [Math.log10(Math.max(1, freqs[0])), Math.log10(Math.min(freqs[freqs.length - 1], 24000))]
    },
    yaxis: {
      title: 'Phase (degrees)',
      zeroline: true
    }
  });
  layout.title = { text: 'Phase Response' };

  Plotly.react('plot', [trace], layout, PLOT_CONFIG);
}

function plotImpulse(response, revision) {
  const n = response.length;
  const x = new Array(n);
  for (let i = 0; i < n; i++) x[i] = i;

  const trace = {
    x,
    y: Array.from(response),
    type: 'scatter',
    mode: 'lines',
    name: 'Impulse',
    line: { color: '#27ae60', width: 1.5 }
  };

  const layout = buildLayout(revision, {
    xaxis: { type: 'linear', title: 'Sample', zeroline: false },
    yaxis: { title: 'Amplitude', zeroline: true }
  });
  layout.title = { text: 'Impulse Response' };

  Plotly.react('plot', [trace], layout, PLOT_CONFIG);
}

function plotGroupDelay(freqs, groupDelayMs, revision) {
  const trace = {
    x: Array.from(freqs),
    y: Array.from(groupDelayMs),
    type: 'scatter',
    mode: 'lines',
    name: 'Group Delay',
    line: { color: '#4a90d9', width: 2 }
  };

  const layout = buildLayout(revision, {
    xaxis: {
      type: 'log',
      title: 'Frequency (Hz)',
      range: [Math.log10(Math.max(1, freqs[0])), Math.log10(Math.min(freqs[freqs.length - 1], 24000))]
    },
    yaxis: { title: 'Delay (ms)', zeroline: true }
  });
  layout.title = { text: 'Group Delay' };

  Plotly.react('plot', [trace], layout, PLOT_CONFIG);
}
