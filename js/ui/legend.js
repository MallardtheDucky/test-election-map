import { COLORS } from '../core/config.js';
import { byId, el } from '../core/utils.js';

const panel = byId('legend-panel');

function swatch(label, color, hatch) {
  const item = el('span', 'legend-item');
  const dot = el('span', 'legend-dot');
  dot.style.background = color;
  if (hatch) {
    dot.classList.add('hatch');
  }
  item.append(dot, el('span', null, label));
  return item;
}

function ramp(label, side) {
  const wrap = el('span', 'legend-ramp');
  wrap.appendChild(el('span', null, label));
  const chips = el('span', 'legend-chips');
  ['Tilt', 'Lean', 'Likely', 'Solid'].forEach(level => {
    const chip = el('span', 'legend-chip');
    chip.style.background = COLORS[`${level} ${side}`];
    chip.title = level;
    chips.appendChild(chip);
  });
  wrap.appendChild(chips);
  return wrap;
}

export function initLegend() {
  const states = el('div', 'legend-row');
  states.append(
    swatch('No Election', COLORS['No Election']),
    swatch('No Results', COLORS['No Results']),
    swatch('Counting Results', COLORS.Counting)
  );
  const called = el('div', 'legend-row');
  called.append(
    el('span', 'legend-note', 'Called (declared winner)'),
    swatch('Dem.', COLORS['Solid DEM']),
    swatch('Rep.', COLORS['Solid GOP']),
    swatch('Other', COLORS['Solid IND'])
  );
  const leading = el('div', 'legend-row');
  leading.append(
    el('span', 'legend-note', 'Leading (not yet called)'),
    swatch('Dem.', COLORS['Likely DEM'], true),
    swatch('Rep.', COLORS['Likely GOP'], true),
    swatch('Other', COLORS['Likely IND'], true)
  );
  const margin = el('div', 'legend-row legend-margin');
  margin.append(el('span', 'legend-note', 'County lead'), ramp('Dem.', 'DEM'), ramp('Rep.', 'GOP'), ramp('Other', 'IND'));
  panel.replaceChildren(states, called, leading, margin);
}
