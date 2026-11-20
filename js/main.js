import { WIN_NUMBER, AUTO_REFRESH_MS } from './core/config.js';
import { loadGeometry, loadResults, loadSavedElections, saveElection } from './core/data.js';
import { evaluate, summarize } from './core/election.js';
import { byId } from './core/utils.js';
import { createMap } from './ui/map.js';
import { setTitle, setSync, setSyncError, renderHeader } from './ui/header.js';
import { initSidebar, renderSidebar, toggleSidebar, setSidebar, isSidebarOpen } from './ui/sidebar.js';
import { initLegend } from './ui/legend.js';
import { checkWinner } from './ui/winner.js';
import { trackCalls } from './core/calls.js';
import { enqueue, presidentItem, setProjectionGeometry, stateItems } from './ui/projection.js';
import { showTooltip, hideTooltip, showPopup, hidePopup, isPopupOpen, showCountyPopup, showCountyTooltip } from './ui/popup.js';
import { loadCounties, solveState, setCountyRange, setSavedElections, countyRangeInfo, countyRangeKey } from './core/counties.js';
import { renderSmallStates, highlightSmallState } from './ui/smallStates.js';
import { setCandidateImages } from './ui/avatar.js';
import { showLoader, hideLoader, showLoaderError } from './ui/loader.js';

const SIDEBAR_WIDTH = 300;
const MOBILE_BREAKPOINT = 600;

let geometry = null;
let map = null;
let states = [];
let busy = false;
let openState = null;
let appliedRange = null;
let appliedSaved = null;
let latestResult = null;
let solved = null;
let countyReady = null;
let allMode = false;
let latestSummary = null;

function sidebarInset() {
  return isSidebarOpen() && window.innerWidth > MOBILE_BREAKPOINT ? SIDEBAR_WIDTH : 0;
}

function closeCounties() {
  openState = null;
  solved = null;
  if (map) {
    map.hideCounties();
  }
}

function openCounties(state) {
  openState = state.name;
  solved = solveState(state);
  map.showCounties(state.abbr, solved.results);
  return solved;
}

function stateSummary(state, run) {
  if (!run || !run.list.length) {
    return '';
  }
  const swing = run.swing ? ` · swing ${run.swing[0] >= 0 ? '+' : ''}${run.swing[0].toFixed(2)} toward ${run.swing[0] >= 0 ? 'DEM' : 'GOP'}` : '';
  return `${run.results.size} of ${run.list.length} counties reporting${swing}`;
}

function clearSelection() {
  closeCounties();
  hidePopup();
  hideTooltip();
  map.select(null);
  highlightSmallState(null);
}

function allResults() {
  const all = new Map();
  states.forEach(state => solveState(state).results.forEach((value, key) => all.set(key, value)));
  return all;
}

function setAllMode(on) {
  allMode = on;
  document.querySelector('[data-toggle="counties"]').setAttribute('aria-pressed', String(on));
  if (on) {
    clearSelection();
    map.reset();
    map.showAllCounties(allResults());
  } else {
    map.hideAllCounties();
  }
}

function selectState(state, point) {
  if (allMode && state) {
    setAllMode(false);
  }
  if (!state) {
    clearSelection();
    return;
  }
  const stage = byId('stage').getBoundingClientRect();
  map.select(state.name);
  highlightSmallState(state.name);
  map.zoomToState(state.name, sidebarInset(), window.innerWidth <= MOBILE_BREAKPOINT ? stage.height * 0.58 : 0);
  const run = openCounties(state);
  showPopup(state, [Math.max(8, stage.width - sidebarInset() - 330), 8], stateSummary(state, run));
  if (window.innerWidth <= MOBILE_BREAKPOINT) {
    setSidebar(false);
  }
}

function focusState(state) {
  selectState(state, [0, 0]);
}

function syncCountyRange(result) {
  if (!countyReady) {
    return;
  }
  const { start, end } = result.countyRange || {};
  const key = countyRangeKey(start, end);
  if (key !== appliedRange) {
    setCountyRange(start, end);
    appliedRange = key;
  }
}

function refreshCountyLayers() {
  if (allMode) {
    map.updateAllCounties(allResults());
  }
  const current = states.find(item => item.name === openState);
  if (current) {
    solved = solveState(current);
    map.updateCounties(solved.results);
  }
}

async function syncSaved(result) {
  if (!countyReady || result.source !== 'sheet') {
    return;
  }
  const stamp = result.saved && result.saved.updated ? result.saved.updated : '';
  if (stamp === appliedSaved || (stamp === '' && appliedSaved === null)) {
    appliedSaved = stamp;
    return;
  }
  try {
    setSavedElections(stamp ? await loadSavedElections() : {});
    appliedSaved = stamp;
    refreshCountyLayers();
  } catch (error) {
    console.error(error);
  }
}

async function saveCounties() {
  const year = latestResult && latestResult.year;
  if (!year || !states.length) {
    window.alert('There are no results to save yet.');
    return;
  }
  const all = allResults();
  if (!all.size) {
    window.alert('No county results to save yet - no state has started reporting.');
    return;
  }
  const info = countyRangeInfo();
  const inRange = info.usedYears.includes(year);
  const lines = [
    `Save the ${year} county results (${all.size} counties)?`,
    '',
    `This becomes the ${year} election in the county history, replacing the real ${year} results for these counties.`
  ];
  if (inRange) {
    lines.push('', `Your Settings range includes ${year}, so the map will start learning from this result right away. Set END YEAR before ${year} if the election is still running.`);
  }
  if (!window.confirm(lines.join('\n'))) {
    return;
  }
  const key = window.prompt('Save password (the SAVE PASSWORD cell on the Settings tab):');
  if (!key) {
    return;
  }
  const counties = {};
  all.forEach((value, fips) => {
    counties[fips] = [value.votesDem, value.votesGop, value.votesInd];
  });
  const button = byId('btn-save-counties');
  button.disabled = true;
  try {
    const reply = await saveElection({ year, counties, key });
    setSavedElections(await loadSavedElections());
    appliedSaved = reply.updated;
    refreshCountyLayers();
    window.alert(`Saved ${reply.counties} counties as the ${year} election.`);
  } catch (error) {
    window.alert(`Not saved: ${error.message}`);
  } finally {
    button.disabled = false;
  }
}

function render(result) {
  latestResult = result;
  syncCountyRange(result);
  setTitle(result.year);
  setSync(result);
  states = result.records.map(evaluate);
  const summary = summarize(states);
  setCandidateImages({
    [summary.gopCandidate]: summary.gopImage,
    [summary.demCandidate]: summary.demImage,
    [summary.indCandidate]: summary.indImage
  });
  map.update(states);
  renderHeader(summary);
  renderSidebar(states);
  renderSmallStates(states, (state, point) => selectState(state, point));
  highlightSmallState(map.selectedState());
  refreshCountyLayers();
  latestSummary = summary;

  const { live, fresh } = trackCalls(states, result);
  const won = checkWinner(summary, WIN_NUMBER, { live });
  const items = stateItems(fresh, summary);
  if (won) {
    items.push(presidentItem(won, summary, states, WIN_NUMBER));
  }
  enqueue(items);
}

function replayPresident() {
  const banner = byId('winner-banner');
  if (!latestSummary || !banner.classList.contains('show')) {
    return;
  }
  enqueue([presidentItem({ side: banner.dataset.side }, latestSummary, states, WIN_NUMBER)]);
}

let failedRefreshes = 0;

async function refresh() {
  if (busy) {
    return;
  }
  busy = true;
  const icon = document.querySelector('#btn-refresh .icon');
  icon.classList.add('spin');
  try {
    const result = await loadResults({ fallback: false });
    await syncSaved(result);
    render(result);
    failedRefreshes = 0;
  } catch (error) {
    console.error(error);
    failedRefreshes += 1;
    if (failedRefreshes >= 2) {
      setSyncError();
    }
  } finally {
    setTimeout(() => icon.classList.remove('spin'), 800);
    busy = false;
  }
}

async function start() {
  showLoader();
  try {
    const [geo, results] = await Promise.all([
      geometry ? Promise.resolve(geometry) : loadGeometry(),
      loadResults()
    ]);
    geometry = geo;
    setProjectionGeometry(geo);
    if (!countyReady) {
      const counties = await loadCounties();
      countyReady = counties.features;
    }

    if (!map) {
      map = createMap(byId('map'), geometry, {
        onHover: (state, point) => {
          if (state && !isPopupOpen()) {
            showTooltip(state, point);
          } else {
            hideTooltip();
          }
        },
        onSelect: (state, point) => {
          if (!state) {
            clearSelection();
            map.reset();
            return;
          }
          selectState(state, point);
        },
        onCountyHover: (county, result, point) => {
          if (county) {
            showCountyTooltip(county, result, point);
          } else {
            hideTooltip();
          }
        },
        onCountySelect: (county, result, point) => {
          const state = states.find(item => (allMode ? item.abbr === county.s : item.name === openState));
          showCountyPopup(county, result, state, point, countyRangeInfo());
        }
      });
      map.setCountyFeatures(countyReady);
    }

    await syncSaved(results);
    render(results);
    hideLoader();
  } catch (error) {
    console.error(error);
    showLoaderError(
      'The election data did not load',
      error.message,
      'Serve this folder over HTTP (for example: python3 -m http.server) rather than opening index.html directly.'
    );
  }
}

function bindControls() {
  const root = document.documentElement;
  byId('btn-theme').addEventListener('click', () => {
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch (e) {  }
  });
  document.querySelectorAll('#toolbar [data-toggle]').forEach(button => {
    button.addEventListener('click', () => {
      const kind = button.dataset.toggle;
      if (kind === 'counties') {
        setAllMode(!allMode);
        return;
      }
      const on = document.body.classList.toggle(kind === 'legend' ? 'show-legend' : 'show-small');
      button.setAttribute('aria-pressed', String(on));
    });
  });

  byId('btn-reset').addEventListener('click', () => {
    if (allMode) {
      setAllMode(false);
    }
    clearSelection();
    map.reset();
  });
  byId('btn-refresh').addEventListener('click', refresh);
  const saveButton = byId('btn-save-counties');
  if (new URLSearchParams(window.location.search).has('admin')) {
    saveButton.hidden = false;
    saveButton.addEventListener('click', saveCounties);
  }
  byId('btn-sidebar').addEventListener('click', toggleSidebar);
  byId('winner-banner').addEventListener('click', replayPresident);
  byId('zoom-in').addEventListener('click', () => map.zoomBy(1.6));
  byId('zoom-out').addEventListener('click', () => map.zoomBy(1 / 1.6));

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      clearSelection();
    }
  });

  let resizeFrame = 0;
  new ResizeObserver(() => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      if (map) {
        map.layout();
      }
    });
  }).observe(byId('map'));

  window.addEventListener('aprp:retry', start);
}

setTitle(null);
initLegend();
initSidebar({ onPick: focusState });
bindControls();
start();

if (AUTO_REFRESH_MS > 0) {
  setInterval(() => {
    if (!document.hidden) {
      refresh();
    }
  }, AUTO_REFRESH_MS);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      refresh();
    }
  });
}
