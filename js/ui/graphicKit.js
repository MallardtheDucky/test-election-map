const SVG_NS = 'http://www.w3.org/2000/svg';
const OUT_MS = 650;

const FONT_SPECS = [
  '900 100px "Big Shoulders Display"',
  '800 100px "Big Shoulders Display"',
  '700 100px "Big Shoulders Display"',
  '600 16px "Hanken Grotesk"',
  '700 16px "Hanken Grotesk"'
];

export function loadFonts() {
  if (!document.fonts || !document.fonts.load) {
    return Promise.resolve();
  }
  const loads = Promise.all(FONT_SPECS.map(spec => document.fonts.load(spec))).catch(() => null);
  return Promise.race([loads, new Promise(resolve => setTimeout(resolve, 1500))]);
}

loadFonts();

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const SIDES = {
  GOP: { key: 'gop', label: 'Republican' },
  DEM: { key: 'dem', label: 'Democrat' },
  IND: { key: 'ind', label: 'Independent' }
};

export function make(html) {
  const template = document.createElement('template');
  template.innerHTML = html.trim();
  return template.content.firstElementChild;
}

export function splitName(full, partyLabel) {
  const text = String(full || '').trim();
  if (!text || text.toLowerCase() === partyLabel.toLowerCase()) {
    return { first: '', last: partyLabel };
  }
  const parts = text.split(/\s+/);
  if (parts.length === 1) {
    return { first: '', last: parts[0] };
  }
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] };
}

export function layoutCanvas(root) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const portrait = h / w > 1.05;
  const cw = portrait ? 540 : 1280;
  const ch = portrait ? Math.max(1120, Math.round((540 * h) / w)) : 720;
  root.dataset.orient = portrait ? 'port' : 'land';
  root.style.setProperty('--cw', `${cw}px`);
  root.style.setProperty('--ch', `${ch}px`);
  root.style.setProperty('--s', String(Math.min(w / cw, h / ch)));
}

export function fitText(node, maxWidth, maxSize, minSize = 24) {
  node.style.fontSize = `${maxSize}px`;
  const width = node.offsetWidth;
  if (width > maxWidth) {
    node.style.fontSize = `${Math.max(minSize, Math.floor((maxSize * maxWidth) / width))}px`;
  }
}

export function fitAll(root) {
  root.querySelectorAll('[data-fit]').forEach(node => {
    const box = node.parentElement;
    const max = Number(node.dataset.fit);
    const limit = Number(getComputedStyle(box).getPropertyValue('--fit-w').replace('px', '')) || box.clientWidth;
    fitText(node, limit, max);
  });
}

export function countUp(node, from, to, duration, delay = 0, format = value => String(value)) {
  if (reducedMotion() || from === to) {
    node.textContent = format(to);
    return;
  }
  node.textContent = format(from);
  const begin = performance.now() + delay;
  function frame(now) {
    if (!node.isConnected) {
      return;
    }
    const t = Math.min(1, Math.max(0, (now - begin) / duration));
    const eased = 1 - Math.pow(1 - t, 3);
    node.textContent = format(Math.round(from + (to - from) * eased));
    if (t < 1) {
      requestAnimationFrame(frame);
    }
  }
  requestAnimationFrame(frame);
}

export function silhouette(feature, width, height, pad = 24) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('class', 'pj-shape');
  svg.setAttribute('aria-hidden', 'true');
  if (!feature || typeof d3 === 'undefined') {
    return svg;
  }
  const [cx, cy] = d3.geoCentroid(feature);
  const projection = d3
    .geoConicEqualArea()
    .rotate([-cx, 0])
    .center([0, cy])
    .parallels([cy - 4, cy + 4])
    .fitExtent([[pad, pad], [width - pad, height - pad]], feature);
  const d = d3.geoPath(projection)(feature);
  if (!d) {
    return svg;
  }
  const defs = document.createElementNS(SVG_NS, 'defs');
  defs.innerHTML =
    '<linearGradient id="pj-fill" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="var(--c-light)"/><stop offset="1" stop-color="var(--c-deep)"/></linearGradient>';
  svg.appendChild(defs);

  const fill = document.createElementNS(SVG_NS, 'path');
  fill.setAttribute('d', d);
  fill.setAttribute('class', 'pj-shape-fill');
  const line = document.createElementNS(SVG_NS, 'path');
  line.setAttribute('d', d);
  line.setAttribute('class', 'pj-shape-line');
  line.setAttribute('pathLength', '1');
  const glow = line.cloneNode();
  glow.setAttribute('class', 'pj-shape-glow');
  svg.append(fill, glow, line);
  return svg;
}

const openLayers = [];
let keyBound = false;

function onKey(event) {
  if (event.key === 'Escape' && openLayers.length) {
    event.stopImmediatePropagation();
    openLayers[openLayers.length - 1].end();
  }
}

export function present(root, { hold = 0, backdropCloses = true, onStart } = {}) {
  if (!keyBound) {
    document.addEventListener('keydown', onKey, true);
    keyBound = true;
  }
  document.body.appendChild(root);
  layoutCanvas(root);
  const onResize = () => {
    layoutCanvas(root);
    fitAll(root);
  };
  window.addEventListener('resize', onResize);

  return loadFonts().then(
    () =>
      new Promise(resolve => {
        let ended = false;
        let timer = 0;
        const layer = {
          end() {
            if (ended) {
              return;
            }
            ended = true;
            clearTimeout(timer);
            const at = openLayers.indexOf(layer);
            if (at >= 0) {
              openLayers.splice(at, 1);
            }
            root.classList.add('is-out');
            setTimeout(() => {
              window.removeEventListener('resize', onResize);
              root.remove();
              resolve();
            }, reducedMotion() ? 0 : OUT_MS);
          }
        };
        openLayers.push(layer);
        root.querySelectorAll('[data-dismiss]').forEach(node => node.addEventListener('click', event => {
          event.stopPropagation();
          layer.end();
        }));
        if (backdropCloses) {
          root.addEventListener('click', () => layer.end());
        }
        fitAll(root);
        requestAnimationFrame(() => {
          root.classList.add('is-in');
          if (onStart) {
            onStart();
          }
        });
        if (hold > 0) {
          root.style.setProperty('--hold', `${hold}ms`);
          timer = setTimeout(() => layer.end(), hold);
        }
        root.__layer = layer;
      })
  );
}

export function endTopLayer() {
  if (openLayers.length) {
    openLayers[openLayers.length - 1].end();
  }
}

export function fireConfetti(colors, zIndex = 4200) {
  if (typeof confetti !== 'function' || reducedMotion()) {
    return;
  }
  const base = { colors, zIndex, ticks: 260, gravity: 0.9, scalar: 1.05, disableForReducedMotion: true };
  confetti({ ...base, particleCount: 90, angle: 60, spread: 70, origin: { x: 0, y: 0.75 }, startVelocity: 62 });
  confetti({ ...base, particleCount: 90, angle: 120, spread: 70, origin: { x: 1, y: 0.75 }, startVelocity: 62 });
  setTimeout(() => confetti({ ...base, particleCount: 160, spread: 120, origin: { x: 0.5, y: 0.35 }, startVelocity: 42 }), 450);
}
