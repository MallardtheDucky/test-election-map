import { COUNTY_DATA_URL, COUNTY_GEOMETRY_URL } from './config.js';

const INLINE = window.APRP_INLINE || null;
const CLASS_NAMES = { U: 'Urban', S: 'Suburban', R: 'Rural' };
const CLASS_ORDER = { R: 0, S: 1, U: 2 };

let byState = new Map();
let byFips = new Map();
let years = [];

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} (${url})`);
  }
  return response.json();
}

function hash01(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

export async function loadCounties() {
  const [data, topology] = await Promise.all([
    INLINE && INLINE.counties ? INLINE.counties : fetchJson(COUNTY_DATA_URL),
    INLINE && INLINE.countyGeo ? INLINE.countyGeo : fetchJson(COUNTY_GEOMETRY_URL)
  ]);
  years = data.years;
  byState = new Map();
  byFips = new Map();
  data.counties.forEach(county => {
    county.className = CLASS_NAMES[county.c];
    county.order = CLASS_ORDER[county.c] + 0.28 * Math.log10(Math.max(county.t, 50)) + 1.4 * hash01(county.f);
    if (!byState.has(county.s)) {
      byState.set(county.s, []);
    }
    byState.get(county.s).push(county);
    byFips.set(county.f, county);
  });
  byState.forEach(list => list.sort((a, b) => a.order - b.order));
  const features = topojson.feature(topology, topology.objects.counties).features;
  return { features, years };
}

export const countyByFips = fips => byFips.get(fips);
export const countiesOf = abbr => byState.get(abbr) || [];

function shares(rows, theta, out) {
  rows.forEach((row, j) => {
    const [pd, pr, pi] = row.b;
    const ed = pd * Math.exp(Math.max(-40, Math.min(40, row.k * theta[0])));
    const ei = pi * Math.exp(Math.max(-40, Math.min(40, row.k * theta[1])));
    const sum = ed + pr + ei;
    out[j] = [ed / sum, pr / sum, ei / sum];
  });
}

function residual(rows, theta, target, useInd, buffer) {
  shares(rows, theta, buffer);
  let wd = 0;
  let wi = 0;
  let w = 0;
  rows.forEach((row, j) => {
    wd += row.w * buffer[j][0];
    wi += row.w * buffer[j][2];
    w += row.w;
  });
  return [wd / w - target[0], useInd ? wi / w - target[2] : 0];
}

export function solveSwing(rows, target) {
  const useInd = target[2] > 1e-9 && rows.some(row => row.b[2] > 0);
  const buffer = new Array(rows.length);
  let theta = [0, useInd ? 0 : -60];
  let F = residual(rows, theta, target, useInd, buffer);
  const norm = f => Math.hypot(f[0], f[1]);
  for (let iter = 0; iter < 120 && norm(F) > 1e-11; iter += 1) {
    let a = 0, b = 0, d = 0, w = 0;
    rows.forEach((row, j) => {
      const [sd, , si] = buffer[j];
      a += row.w * row.k * sd * (1 - sd);
      b += row.w * -row.k * sd * si;
      d += row.w * row.k * si * (1 - si);
      w += row.w;
    });
    a /= w; b /= w; d /= w;
    let step;
    if (useInd) {
      const det = a * d - b * b;
      step = Math.abs(det) < 1e-18 ? [F[0] / (a || 1e-9), F[1] / (d || 1e-9)] : [(d * F[0] - b * F[1]) / det, (a * F[1] - b * F[0]) / det];
    } else {
      step = [F[0] / (a || 1e-9), 0];
    }
    const cap = Math.max(Math.abs(step[0]), Math.abs(step[1]));
    if (cap > 4) {
      step = step.map(v => (v * 4) / cap);
    }
    let t = 1;
    let next = null;
    let nextF = null;
    for (let tries = 0; tries < 30; tries += 1) {
      next = [theta[0] - t * step[0], useInd ? theta[1] - t * step[1] : theta[1]];
      nextF = residual(rows, next, target, useInd, buffer);
      if (norm(nextF) < norm(F) * (1 - 1e-4 * t) || norm(nextF) < 1e-12) {
        break;
      }
      t /= 2;
    }
    theta = next;
    F = nextF;
  }
  shares(rows, theta, buffer);
  return { theta, shares: buffer.slice(), error: norm(F) };
}

function largestRemainder(values, total) {
  const floors = values.map(Math.floor);
  let left = total - floors.reduce((s, v) => s + v, 0);
  values
    .map((v, i) => [v - Math.floor(v), i])
    .sort((x, y) => y[0] - x[0])
    .forEach(([, i]) => {
      if (left > 0) {
        floors[i] += 1;
        left -= 1;
      }
    });
  return floors;
}

export function solveState(state) {
  const list = countiesOf(state.abbr);
  const total = state.votesGop + state.votesDem + state.votesInd;
  if (!list.length || total <= 0) {
    return { list, results: new Map(), swing: null };
  }
  const reporting = state.reporting > 0 ? Math.min(state.reporting, 100) / 100 : 1;
  const allWeight = list.reduce((s, c) => s + c.t, 0);
  let budget = allWeight * reporting;
  const rows = [];
  list.forEach(county => {
    if (budget <= 0) {
      return;
    }
    const fraction = Math.min(1, budget / county.t);
    budget -= county.t * fraction;
    rows.push({ county, fraction, w: county.t * fraction, b: county.b, k: county.k });
  });
  const target = [state.votesDem / total, state.votesGop / total, state.votesInd / total];
  const solved = solveSwing(rows, target);
  const scale = total / rows.reduce((s, r) => s + r.w, 0);
  const raw = rows.map((row, j) => solved.shares[j].map(s => s * row.w * scale));
  const dem = largestRemainder(raw.map(v => v[0]), state.votesDem);
  const gop = largestRemainder(raw.map(v => v[1]), state.votesGop);
  const ind = largestRemainder(raw.map(v => v[2]), state.votesInd);
  const results = new Map();
  rows.forEach((row, j) => {
    const sh = solved.shares[j];
    const votes = [dem[j], gop[j], ind[j]];
    const sum = votes[0] + votes[1] + votes[2];
    const ranked = [['DEM', sh[0]], ['GOP', sh[1]], ['IND', sh[2]]].sort((x, y) => y[1] - x[1]);
    results.set(row.county.f, {
      county: row.county,
      votesDem: votes[0],
      votesGop: votes[1],
      votesInd: votes[2],
      total: sum,
      shares: sh,
      leader: ranked[0][0],
      margin: ranked[0][1] - ranked[1][1],
      partial: row.fraction < 0.999
    });
  });
  return { list, results, swing: solved.theta, error: solved.error };
}

export function countyStatus(result) {
  if (!result) {
    return 'Uncalled';
  }
  const m = result.margin;
  const tier = m >= 0.4 ? 'Solid' : m >= 0.2 ? 'Likely' : m >= 0.08 ? 'Lean' : 'Tilt';
  return `${tier} ${result.leader}`;
}
