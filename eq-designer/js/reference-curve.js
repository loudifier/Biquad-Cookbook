function parseReferenceCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return null;

  const freqs = [];
  const magDb = [];
  const rowSep = /[,;\t\s]+/;
  const colSep = /[,;\t]+/;

  // Scan preamble lines to find actual header
  let headerIdx = -1, freqIdx = -1, magIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const cols = lines[i].trim().toLowerCase().split(colSep)
      .map(s => s.trim()).filter(s => s.length > 0);
    if (cols.length < 2) continue;
    const fi = cols.findIndex(p => /^f$|freq|hz|^fr/i.test(p));
    const mi = cols.findIndex(p => /mag|magnitude|db|level|gain|spl/i.test(p));
    if (fi >= 0 && mi >= 0) {
      headerIdx = i; freqIdx = fi; magIdx = mi;
      break;
    }
  }
  if (headerIdx < 0) return null;

  for (let i = headerIdx + 1; i < lines.length; i++) {
    const cols = lines[i].trim().split(rowSep).filter(s => s.length > 0);
    if (cols.length <= Math.max(freqIdx, magIdx)) continue;
    const f = parseFloat(cols[freqIdx]);
    const m = parseFloat(cols[magIdx]);
    if (isNaN(f) || isNaN(m) || f <= 0) continue;
    freqs.push(f);
    magDb.push(m);
  }

  if (freqs.length < 2) return null;
  return { freqs: new Float64Array(freqs), magDb: new Float64Array(magDb) };
}
