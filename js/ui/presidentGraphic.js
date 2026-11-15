import { formatNumber, initials } from '../core/utils.js';
import { loadPortrait } from './avatar.js';
import { PROJECTION } from '../core/config.js';
import { countUp, fireConfetti, hemicycle, make, present, reducedMotion, splitName, SIDES } from './graphicKit.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const CHECK =
  '<svg class="pj-check" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12.8 9.6 18 19.5 6.5"/></svg>';
const HEAD =
  '<svg class="pj-ghost" viewBox="0 0 200 240" aria-hidden="true"><circle cx="100" cy="82" r="46"/>' +
  '<path d="M16 240c0-58 38-92 84-92s84 34 84 92Z"/></svg>';

function seatLayer(ev, winnerKey) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 640 340');
  svg.setAttribute('class', 'pres-seats');
  svg.setAttribute('aria-hidden', 'true');
  const seats = hemicycle();
  const total = seats.length;
  const owner = new Array(total).fill('open');
  let cursor = 0;
  for (let i = 0; i < ev.dem; i += 1) {
    owner[cursor++] = 'dem';
  }
  for (let i = 0; i < ev.ind; i += 1) {
    owner[cursor++] = 'ind';
  }
  let tail = total;
  for (let i = 0; i < ev.gop; i += 1) {
    owner[--tail] = 'gop';
  }
  const rank = { dem: 0, gop: 0, ind: 0 };
  const lightAt = Math.min(269, 538);
  seats.forEach((seat, index) => {
    const who = owner[index];
    const dot = document.createElementNS(SVG_NS, 'circle');
    dot.setAttribute('cx', seat.x.toFixed(1));
    dot.setAttribute('cy', seat.y.toFixed(1));
    dot.setAttribute('r', '4.9');
    let order = 0;
    if (who === 'open') {
      order = (index / total) * 18;
    } else {
      const position = who === 'gop' ? ev.gop - 1 - rank.gop : rank[who];
      rank[who] += 1;
      order = 24 + position * 2.4;
      if (who === winnerKey && position >= lightAt - 1) {
        dot.setAttribute('class', `seat seat-${who} seat-over`);
      }
    }
    if (!dot.getAttribute('class')) {
      dot.setAttribute('class', `seat seat-${who}`);
    }
    dot.style.setProperty('--d', `${order.toFixed(1)}ms`);
    svg.appendChild(dot);
  });
  return svg;
}

export function buildPresident(data) {
  const side = SIDES[data.leader];
  const key = side.key;
  const { first, last } = splitName(data.candidate, side.label);
  const root = make(`
    <div class="pj pj-president" data-side="${key}" role="dialog" aria-modal="true" aria-label="">
      <div class="pj-bg">
        <div class="pj-glow"></div><div class="pj-rays"></div><div class="pj-beams"></div><div class="pj-grain"></div>
      </div>
      <div class="pj-canvas">
        <div class="pres-text">
          <div class="pj-tag"><span class="pj-tag-body">${CHECK}<span>Projected winner</span></span></div>
          <p class="pres-office">President of the United States</p>
          <p class="pj-first"></p>
          <h2 class="pj-last"><span data-fit="190"></span></h2>
          <p class="pres-wins">wins the presidency</p>
          <ul class="pj-stats">
            <li><b class="ps-ev"></b><span>electoral votes</span></li>
            <li><b class="ps-states"></b><span class="ps-states-label">states won</span></li>
            <li><b class="ps-pv"></b><span>of the popular vote</span></li>
          </ul>
        </div>
        <div class="pres-chamber">
          <div class="pres-ring"></div>
          <div class="pres-seat-holder"></div>
          <div class="pres-portrait"><div class="pres-portrait-media"></div></div>
          <div class="pres-notch"><em>270</em><i></i></div>
          <div class="pres-count pres-count-dem"><b data-side="dem">0</b><span></span></div>
          <div class="pres-count pres-count-gop"><b data-side="gop">0</b><span></span></div>
        </div>
      </div>
      <div class="pj-controls">
        <button type="button" class="pj-btn pj-btn-solid" data-dismiss>Back to the map</button>
      </div>
      <div class="pj-progress"><i></i></div>
    </div>`);

  root.setAttribute('aria-label', `${data.candidate || side.label} wins the presidency with ${data.ev.winner} electoral votes`);
  root.querySelector('.pj-first').textContent = first;
  root.querySelector('.pj-first').hidden = !first;
  root.querySelector('.pj-last [data-fit]').textContent = last;
  root.querySelector('.ps-ev').textContent = String(data.ev.winner);
  root.querySelector('.ps-states').textContent = String(data.statesWon);
  if (data.statesWon === 1) {
    root.querySelector('.ps-states-label').textContent = 'state won';
  }
  root.querySelector('.ps-pv').textContent = data.pvShare > 0 ? `${(data.pvShare * 100).toFixed(1)}%` : '—';
  root.querySelector('.pres-count-dem span').textContent = data.names.dem;
  root.querySelector('.pres-count-gop span').textContent = data.names.gop;
  root.querySelector('.pres-seat-holder').appendChild(seatLayer(data.ev, key));

  const media = root.querySelector('.pres-portrait-media');
  media.innerHTML = HEAD;
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
  const auto = PROJECTION.presidentAutoCloseMs;
  const calm = reducedMotion();
  return present(root, {
    hold: auto,
    backdropCloses: false,
    onStart: () => {
      const delay = calm ? 0 : 2600;
      countUp(root.querySelector('.pres-count-dem b'), 0, data.ev.dem, 1500, delay);
      countUp(root.querySelector('.pres-count-gop b'), 0, data.ev.gop, 1500, delay);
      const button = root.querySelector('[data-dismiss]');
      if (button) {
        setTimeout(() => button.focus({ preventScroll: true }), calm ? 0 : 3200);
      }
      if (!calm) {
        setTimeout(() => fireConfetti(data.confetti), 1700);
        setTimeout(() => fireConfetti(data.confetti), 4300);
      }
    }
  });
}
