import { PROJECTION } from '../core/config.js';
import { loadPortrait } from './avatar.js';
import { endTopLayer, SIDES } from './graphicKit.js';
import { playState } from './stateGraphic.js';
import { playPresident } from './presidentGraphic.js';

const queue = [];
let running = false;
let geometry = null;

window.addEventListener('projection:skip-all', () => {
  for (let i = queue.length - 1; i >= 0; i -= 1) {
    if (queue[i].kind === 'state') {
      queue.splice(i, 1);
    }
  }
  endTopLayer();
});

export function setProjectionGeometry(value) {
  geometry = value;
}

function featureFor(name) {
  return geometry ? geometry.features.find(item => item.properties.name === name) : null;
}

function candidateOf(summary, leader) {
  return { GOP: summary.gopCandidate, DEM: summary.demCandidate, IND: summary.indCandidate }[leader] || '';
}

function names(summary) {
  return {
    dem: summary.demCandidate ? summary.demCandidate.trim().split(/\s+/).pop() : 'Democrat',
    gop: summary.gopCandidate ? summary.gopCandidate.trim().split(/\s+/).pop() : 'Republican'
  };
}

function evOf(summary) {
  return { dem: summary.demEV, gop: summary.gopEV, ind: summary.indEV };
}

export function stateItems(calls, summary) {
  const ordered = calls.slice().sort((a, b) => b.electoralVotes - a.electoralVotes);
  const running = evOf(summary);
  ordered.forEach(state => {
    running[SIDES[state.leader].key] -= state.electoralVotes;
  });
  return ordered.map((state, index) => {
    const key = SIDES[state.leader].key;
    const from = { ...running };
    running[key] += state.electoralVotes;
    const candidate = candidateOf(summary, state.leader);
    const votes = { GOP: state.votesGop, DEM: state.votesDem, IND: state.votesInd };
    return {
      kind: 'state',
      leader: state.leader,
      candidate,
      state,
      votes: { winner: votes[state.leader] },
      feature: featureFor(state.name),
      portrait: loadPortrait(candidate, key),
      tally: { from, to: { ...running }, names: names(summary) },
      fast: ordered.length > PROJECTION.fastAfter,
      remaining: ordered.length - index - 1
    };
  });
}

export function presidentItem(info, summary, states) {
  const key = info.side;
  const leader = key.toUpperCase();
  const candidate = candidateOf(summary, leader);
  const pv = { gop: summary.gopPV, dem: summary.demPV, ind: summary.indPV }[key];
  const accent = { gop: '#e5424f', dem: '#4d93e6', ind: '#a98be0' }[key];
  return {
    kind: 'president',
    leader,
    candidate,
    ev: { ...evOf(summary), winner: evOf(summary)[key] },
    names: names(summary),
    statesWon: states.filter(state => state.called && state.leader === leader).length,
    pvShare: summary.totalPV > 0 ? pv / summary.totalPV : 0,
    portrait: loadPortrait(candidate, key),
    confetti: [accent, '#f6c945', '#ffffff', '#ffe58a']
  };
}

function whenVisible() {
  if (!document.hidden) {
    return Promise.resolve();
  }
  return new Promise(resolve => {
    const wake = () => {
      if (!document.hidden) {
        document.removeEventListener('visibilitychange', wake);
        resolve();
      }
    };
    document.addEventListener('visibilitychange', wake);
  });
}

async function pump() {
  if (running) {
    return;
  }
  running = true;
  try {
    while (queue.length) {
      await whenVisible();
      const item = queue.shift();
      try {
        if (item.kind === 'president') {
          await playPresident(item);
        } else {
          const pending = queue.filter(next => next.kind === 'state').length;
          item.remaining = pending;
          await playState(item, { fast: item.fast });
        }
      } catch (error) {
        console.error('Projection graphic failed', error);
      }
    }
  } finally {
    running = false;
  }
}

export function enqueue(items) {
  if (!items.length) {
    return;
  }
  queue.push(...items);
  pump();
}
