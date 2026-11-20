import {
  GEOMETRY_URL,
  LOCAL_RESULTS_URL,
  SHEET_URL,
  EXCLUDED_REGIONS
} from './config.js';

const INLINE = window.APRP_INLINE || null;

function sheetUrl() {
  const fromAddress = new URLSearchParams(window.location.search).get('sheet');
  return (fromAddress || SHEET_URL || '').trim();
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  let text;
  try {
    const response = await fetch(url, { redirect: 'follow', signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    text = await response.text();
  } catch (error) {
    throw error.name === 'AbortError' ? new Error('Request timed out') : error;
  } finally {
    clearTimeout(timer);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error('Reply was not JSON (check that the web app access is set to Anyone)');
  }
}

function toRecord(raw) {
  const name = raw.name || raw.NAME || raw.STATE_NAME;
  if (!name) {
    return null;
  }
  return {
    name,
    abbr: raw.abbr || '',
    electoralVotes: Number(raw.electoral_votes) || 0,
    votesGop: Number(raw.votes_gop) || 0,
    votesDem: Number(raw.votes_dem) || 0,
    votesInd: Number(raw.votes_ind) || 0,
    reporting: Number(raw.reporting) || 0,
    called: typeof raw.called === 'boolean' ? raw.called : null,
    gopCandidate: raw.gop_candidate || '',
    demCandidate: raw.dem_candidate || '',
    indCandidate: raw.ind_candidate || '',
    gopImage: raw.gop_image || '',
    demImage: raw.dem_image || '',
    indImage: raw.ind_image || ''
  };
}

function readRange(fromSheet) {
  const fromAddress = (new URLSearchParams(window.location.search).get('range') || '').match(/^(\d{4})\s*[-_.]\s*(\d{4})$/);
  const start = fromAddress ? Number(fromAddress[1]) : Number(fromSheet && fromSheet.start);
  const end = fromAddress ? Number(fromAddress[2]) : Number(fromSheet && fromSheet.end);
  return Number.isFinite(start) && Number.isFinite(end) && start > 0 && end > 0 ? { start, end } : { start: null, end: null };
}

function parseResults(payload) {
  if (payload && payload.error) {
    throw new Error(payload.error);
  }
  let rows = [];
  if (payload && payload.type === 'FeatureCollection' && Array.isArray(payload.features)) {
    rows = payload.features.map(feature => feature.properties || {});
  } else if (payload && Array.isArray(payload.states)) {
    rows = payload.states;
  } else if (Array.isArray(payload)) {
    rows = payload;
  } else {
    throw new Error('Results are not in a recognised format');
  }
  const records = rows.map(toRecord).filter(Boolean);
  if (!records.length) {
    throw new Error('Results contain no states');
  }
  const range = payload && payload.county_range ? payload.county_range : null;
  return {
    records,
    year: payload && payload.year ? payload.year : null,
    updated: payload && payload.updated ? payload.updated : null,
    countyRange: readRange(range),
    saved: payload && payload.saved_elections ? payload.saved_elections : null
  };
}

export async function loadResults({ fallback = true } = {}) {
  const failures = [];
  const live = sheetUrl();

  if (live) {
    const joiner = live.includes('?') ? '&' : '?';
    const attempts = fallback ? 2 : 3;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const payload = await fetchJson(`${live}${joiner}t=${Date.now()}`);
        return { ...parseResults(payload), source: 'sheet' };
      } catch (error) {
        if (attempt === attempts) {
          failures.push(`Google Sheet: ${error.message}`);
        } else {
          await new Promise(resolve => setTimeout(resolve, 800 * attempt));
        }
      }
    }
  }

  if (!fallback) {
    throw new Error(failures.join(' | ') || 'No live source');
  }

  try {
    const payload = INLINE && INLINE.results ? INLINE.results : await fetchJson(LOCAL_RESULTS_URL);
    return { ...parseResults(payload), source: 'local', sheetFailed: Boolean(live), failures };
  } catch (error) {
    failures.push(`Saved copy: ${error.message}`);
  }
  throw new Error(failures.join(' | '));
}

export async function loadGeometry() {
  const topology = INLINE && INLINE.geo ? INLINE.geo : await fetchJson(GEOMETRY_URL);
  const objectName = Object.keys(topology.objects)[0];
  const collection = topojson.feature(topology, topology.objects[objectName]);
  const features = collection.features
    .filter(feature => !EXCLUDED_REGIONS.includes(feature.properties.shapeName))
    .map(feature => ({
      type: 'Feature',
      id: feature.properties.shapeISO,
      properties: { name: feature.properties.shapeName, iso: feature.properties.shapeISO },
      geometry: feature.geometry
    }));
  return { type: 'FeatureCollection', features };
}

export async function loadSavedElections() {
  const live = sheetUrl();
  if (!live) {
    return {};
  }
  const joiner = live.includes('?') ? '&' : '?';
  const payload = await fetchJson(`${live}${joiner}saved=1&t=${Date.now()}`);
  if (payload && payload.error) {
    throw new Error(payload.error);
  }
  const out = {};
  Object.keys((payload && payload.elections) || {}).forEach(year => {
    out[year] = payload.elections[year].counties || {};
  });
  return out;
}

export async function saveElection({ year, counties, key }) {
  const live = sheetUrl();
  if (!live) {
    throw new Error('Saving needs the Google Sheet connection (no sheet address is set).');
  }
  const response = await fetch(live, {
    method: 'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ year, counties, key })
  });
  let reply;
  try {
    reply = await response.json();
  } catch (error) {
    throw new Error('The sheet did not answer (is the latest Code.gs deployed as a new version?)');
  }
  if (!reply.ok) {
    throw new Error(reply.error || 'Save failed');
  }
  return reply;
}
