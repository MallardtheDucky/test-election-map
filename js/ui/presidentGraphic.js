import { initials } from '../core/utils.js';
import { PROJECTION } from '../core/config.js';
import { fireConfetti, make, present, reducedMotion, splitName, SIDES } from './graphicKit.js';

const NS = 'http://www.w3.org/2000/svg';
const CHECK =
  '<svg class="pj-check" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12.8 9.6 18 19.5 6.5"/></svg>';

const MAP_W = 600;
const MAP_H = 380;
const RACE_MS = 2600;

function mapSvg(data) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${MAP_W} ${MAP_H}`);
  svg.setAttribute('class', 'pres-map-svg');
  svg.setAttribute('aria-hidden', 'true');
  if (!data.geometry || typeof d3 === 'undefined') {
    return svg;
  }
  const collection = { type: 'FeatureCollection', features: data.geometry.features };
  const projection = d3.geoAlbersUsa().fitExtent([[6, 4], [MAP_W - 6, MAP_H - 16]], collection);
  const path = d3.geoPath(projection);
  const info = new Map(data.mapStates.map(state => [state.name, state]));
  const group = document.createElementNS(NS, 'g');
  group.setAttribute('class', 'm-tops');
  collection.features.forEach(feature => {
    const d = path(feature);
    if (!d) {
      return;
    }
    const state = info.get(feature.properties.name);
    let kind = 'open';
    if (state && state.leader) {
      kind = SIDES[state.leader].key === data.sideKey ? 'win' : SIDES[state.leader].key === data.oppKey ? 'opp' : 'open';
    }
    const node = document.createElementNS(NS, 'path');
    node.setAttribute('d', d);
    node.setAttribute('class', `m-state m-${kind}`);
    node.dataset.ev = String(state ? state.ev : 0);
    group.appendChild(node);
  });
  svg.appendChild(group);
  return svg;
}

function runRace(root, data, delay, onHit) {
  const sorted = selector =>
    [...root.querySelectorAll(selector)].sort((a, b) => Number(b.dataset.ev) - Number(a.dataset.ev));
  const winEls = sorted('.m-win');
  const oppEls = sorted('.m-opp');
  const winNum = root.querySelector('.ps-ev');
  const oppNum = root.querySelector('.ps-opp');
  const barWin = root.querySelector('.b-win');
  const barOver = root.querySelector('.b-over');
  const barOpp = root.querySelector('.b-opp');
  const total = data.totalEV;
  const threshold = data.winNumber;
  let hit = false;

  const light = (nodes, value, full) => {
    let running = 0;
    nodes.forEach(node => {
      running += Number(node.dataset.ev);
      node.classList.toggle('lit', full || running <= Math.round(value));
    });
  };

  const paint = progress => {
    const w = data.ev.winner * progress;
    const o = data.ev.opp * progress;
    const full = progress >= 1;
    light(winEls, w, full);
    light(oppEls, o, full);
    barWin.style.width = `${(Math.min(w, threshold) / total) * 100}%`;
    barOver.style.width = `${(Math.max(0, w - threshold) / total) * 100}%`;
    barOpp.style.width = `${(o / total) * 100}%`;
    winNum.textContent = String(Math.round(w));
    oppNum.textContent = String(Math.round(o));
    if (!hit && w >= threshold) {
      hit = true;
      onHit();
    }
  };

  if (reducedMotion()) {
    paint(1);
    return;
  }
  paint(0);
  const begin = performance.now() + delay;
  const frame = now => {
    if (!root.isConnected) {
      return;
    }
    const t = Math.min(1, Math.max(0, (now - begin) / RACE_MS));
    paint(1 - Math.pow(1 - t, 3));
    if (t < 1) {
      requestAnimationFrame(frame);
    }
  };
  requestAnimationFrame(frame);
}

export function buildPresident(data) {
  const side = SIDES[data.leader];
  const key = side.key;
  const oppKey = data.oppKey;
  data.sideKey = key;
  const { first, last } = splitName(data.candidate, side.label);
  const root = make(`
    <div class="pj pj-president" data-side="${key}" data-opp="${oppKey}" role="dialog" aria-modal="true" aria-label="">
      <div class="pj-bg">
        <div class="pj-glow"></div><div class="pj-rays"></div><div class="pj-beams"></div><div class="pj-grain"></div>
      </div>
      <div class="pj-canvas">
        <div class="pres-text">
          <div class="pj-tag"><span class="pj-tag-body">${CHECK}<span>Projected winner</span></span></div>
          <p class="pres-office">President of the United States</p>
          <p class="pj-first"></p>
          <h2 class="pj-last"><span data-fit="170"></span></h2>
          <p class="pres-wins">wins the presidency</p>
          <ul class="pj-stats">
            <li class="st-win"><b class="ps-ev">0</b><span class="ps-ev-label"></span></li>
            <li class="st-opp" data-side="${oppKey}"><b class="ps-opp">0</b><span class="ps-opp-label"></span></li>
            <li><b class="ps-states"></b><span class="ps-states-label">states won</span></li>
            <li><b class="ps-pv"></b><span>popular vote</span></li>
          </ul>
          <p class="pres-pending" hidden><i></i><span></span></p>
        </div>
        <div class="pres-scene">
          <div class="pres-beam"></div>
          <div class="pres-card">
            <div class="pres-card-media"></div>
            <div class="pj-sheen"></div>
          </div>
          <div class="pres-map"></div>
          <div class="pres-bar">
            <i class="b-win"></i><i class="b-over"></i><i class="b-opp"></i>
            <span class="b-mark"><em>${data.winNumber}</em></span>
          </div>
        </div>
      </div>
      <div class="pj-controls">
        <button type="button" class="pj-btn" data-dismiss>Close</button>
      </div>
      <div class="pj-progress"><i></i></div>
    </div>`);

  root.setAttribute('aria-label', `${data.candidate || side.label} wins the presidency with ${data.ev.winner} electoral votes`);
  root.querySelector('.pj-first').textContent = first;
  root.querySelector('.pj-first').hidden = !first;
  root.querySelector('.pj-last [data-fit]').textContent = last;
  root.querySelector('.ps-states').textContent = String(data.statesWon);
  if (data.statesWon === 1) {
    root.querySelector('.ps-states-label').textContent = 'state won';
  }
  root.querySelector('.ps-pv').textContent = data.pvShare > 0 ? `${(data.pvShare * 100).toFixed(1)}%` : '—';
  root.querySelector('.ps-ev-label').textContent = `for ${data.names[key] || last}`;
  root.querySelector('.ps-opp-label').textContent = `for ${data.names[oppKey]}`;

  const markAt = (data.winNumber / data.totalEV) * 100;
  root.querySelector('.b-mark').style.left = `${markAt}%`;
  root.querySelector('.b-over').style.left = `${markAt}%`;

  if (data.pending.states > 0) {
    const noun = data.pending.states === 1 ? 'state' : 'states';
    root.querySelector('.pres-pending').hidden = false;
    root.querySelector('.pres-pending span').textContent =
      `Counting continues · ${data.pending.states} ${noun} and ${data.pending.ev} electoral votes still to be called`;
  }

  root.querySelector('.pres-map').appendChild(mapSvg(data));

  const media = root.querySelector('.pres-card-media');
  const monogram = make('<span class="pj-monogram"></span>');
  monogram.textContent = initials(data.candidate || side.label);
  media.appendChild(monogram);
  data.portrait.then(url => {
    if (!url) {
      return;
    }
    const img = new Image();
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    img.src = url;
    media.replaceChildren(img);
  });
  return root;
}

export function playPresident(data) {
  const root = buildPresident(data);
  const calm = reducedMotion();
  return present(root, {
    hold: PROJECTION.presidentMs,
    backdropCloses: true,
    onStart: () => {
      const delay = calm ? 0 : 1700;
      runRace(root, data, delay, () => {
        root.classList.add('is-declared');
        if (!calm) {
          fireConfetti(data.confetti);
          setTimeout(() => fireConfetti(data.confetti), 2400);
        }
      });
      const button = root.querySelector('[data-dismiss]');
      if (button) {
        setTimeout(() => button.focus({ preventScroll: true }), calm ? 0 : 3800);
      }
    }
  });
}
