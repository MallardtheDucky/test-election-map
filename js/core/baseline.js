
export const DEFAULT_SPAN = 4;
export const HISTORY_COLUMNS = 12;
const SWING_BAND = 0.08;
const IND_FLAG = 0.05;
const DEFAULT_VOL = 0.038;
const K_BASE = { R: 0.23, S: 0.94, U: 0.44 };

const CURVE_X = [0, 0.25, 0.5, 0.75, 1];
const CURVE_Y = [0, 0.15, 0.35, 0.65, 1];

function curve(x) {
  for (let i = 1; i < CURVE_X.length; i += 1) {
    if (x <= CURVE_X[i]) {
      const t = (x - CURVE_X[i - 1]) / (CURVE_X[i] - CURVE_X[i - 1]);
      return CURVE_Y[i - 1] + t * (CURVE_Y[i] - CURVE_Y[i - 1]);
    }
  }
  return 1;
}

export function recencyWeights(n) {
  if (n <= 1) {
    return [1];
  }
  return Array.from({ length: n }, (_, i) => curve((i + 1) / n) - curve(i / n));
}

export function pickCycles(years, start, end) {
  let lo = start === null || start === '' || start === undefined ? NaN : Number(start);
  let hi = end === null || end === '' || end === undefined ? NaN : Number(end);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    const last = years.length - 1;
    return { indexes: years.map((_, i) => i).slice(Math.max(0, last - DEFAULT_SPAN + 1)), adjusted: true };
  }
  if (lo > hi) {
    [lo, hi] = [hi, lo];
  }
  let indexes = years.map((y, i) => (y >= lo && y <= hi ? i : -1)).filter(i => i >= 0);
  let adjusted = false;
  if (!indexes.length) {
    const mid = (lo + hi) / 2;
    let best = 0;
    years.forEach((y, i) => {
      if (Math.abs(y - mid) < Math.abs(years[best] - mid)) {
        best = i;
      }
    });
    indexes = [best];
    adjusted = true;
  }
  return { indexes, adjusted };
}

function shareRow(county, i) {
  const t = county.raw.t[i];
  if (!t) {
    return null;
  }
  const d = county.raw.d[i] / t;
  const r = county.raw.r[i] / t;
  return [d, r, Math.max(0, 1 - d - r)];
}

function nearestWithData(county, years, indexes) {
  const mid = (years[indexes[0]] + years[indexes[indexes.length - 1]]) / 2;
  let best = -1;
  county.raw.t.forEach((t, i) => {
    if (t && (best === -1 || Math.abs(years[i] - mid) < Math.abs(years[best] - mid))) {
      best = i;
    }
  });
  return best;
}

function weightedMean(rows, weights) {
  const total = weights.reduce((s, w) => s + w, 0);
  const out = [0, 0, 0];
  rows.forEach((row, j) => {
    for (let k = 0; k < 3; k += 1) {
      out[k] += row[k] * weights[j];
    }
  });
  return out.map(v => v / total);
}

function stdev(values) {
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  return Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
}

function lean(b) {
  const margin = b[0] - b[1];
  return Math.abs(margin) < SWING_BAND ? 'Swing' : margin > 0 ? 'Democratic' : 'Republican';
}

export function applyRange(counties, years, start, end) {
  const { indexes, adjusted } = pickCycles(years, start, end);
  const weights = recencyWeights(indexes.length);
  const usedYears = indexes.map(i => years[i]);
  const historyIdx = indexes.slice(-HISTORY_COLUMNS);
  const missing = [];

  counties.forEach(county => {
    const rows = [];
    const w = [];
    const vols = [];
    let latest = -1;
    indexes.forEach((i, j) => {
      const row = shareRow(county, i);
      if (row) {
        rows.push(row);
        w.push(weights[j]);
        vols.push(row[0] / Math.max(row[0] + row[1], 1e-9));
        latest = i;
      }
    });
    county.stand = null;
    if (!rows.length) {
      const i = nearestWithData(county, years, indexes);
      if (i === -1) {
        missing.push(county);
        county.b = [0.45, 0.5, 0.05];
        county.t = Math.max(50, Math.round((county.p || 0) * 0.45));
        county.k = 0.7;
        county.l = 'Republican';
        county.ind = false;
        county.h = [];
        return;
      }
      rows.push(shareRow(county, i));
      w.push(1);
      latest = i;
      county.stand = years[i];
    }
    county.b = weightedMean(rows, w);
    county.t = county.raw.t[latest];
    const vol = vols.length >= 3 ? stdev(vols) : DEFAULT_VOL;
    const close = 1 - Math.abs(county.b[0] - county.b[1]);
    county.k = Math.min(2, Math.max(0.375, (K_BASE[county.c] || K_BASE.R) + 5.454 * vol + 0.45 * close));
    county.l = lean(county.b);
    county.ind = Math.max(...rows.map(row => row[2])) >= IND_FLAG;
    county.h = historyIdx.map(i => {
      const row = shareRow(county, i);
      return row ? [Math.round(row[0] * 1000), Math.round(row[1] * 1000)] : null;
    });
  });

  return { counties, usedYears, historyYears: historyIdx.map(i => years[i]), adjusted, missing };
}
