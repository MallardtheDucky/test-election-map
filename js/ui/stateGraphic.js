import { formatNumber, formatReporting, initials } from '../core/utils.js';
import { countUp, make, present, silhouette, splitName, SIDES, reducedMotion } from './graphicKit.js';
import { PROJECTION } from '../core/config.js';

const CHECK =
  '<svg class="pj-check" viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 12.8 9.6 18 19.5 6.5"/></svg>';

function tallyHtml(tally) {
  const pct = value => `${(value / 538) * 100}%`;
  return `
    <div class="pj-tally">
      <div class="tally-side tally-dem">
        <span class="tally-name"></span>
        <b class="tally-num" data-side="dem">0</b>
      </div>
      <div class="tally-mid">
        <div class="tally-bar">
          <i class="seg seg-dem" style="width:${pct(tally.from.dem)}"></i>
          <i class="seg seg-ind" style="left:${pct(tally.from.dem)};width:${pct(tally.from.ind)}"></i>
          <i class="seg seg-gop" style="width:${pct(tally.from.gop)}"></i>
          <span class="tally-mark"><em>270</em></span>
        </div>
        <span class="tally-gain"></span>
      </div>
      <div class="tally-side tally-gop">
        <b class="tally-num" data-side="gop">0</b>
        <span class="tally-name"></span>
      </div>
    </div>`;
}

export function buildState(data) {
  const side = SIDES[data.leader];
  const key = side.key;
  const { first, last } = splitName(data.candidate, side.label);
  const root = make(`
    <div class="pj pj-state" data-side="${key}" role="status" aria-live="assertive">
      <div class="pj-bg"><div class="pj-glow"></div><div class="pj-beams"></div><div class="pj-grain"></div></div>
      <div class="pj-canvas">
        <div class="pj-silhouette"></div>
        <div class="pj-portrait">
          <div class="pj-portrait-card">
            <div class="pj-portrait-media"></div>
            <div class="pj-sheen"></div>
          </div>
        </div>
        <div class="pj-copy">
          <h2 class="pj-state-name"><span data-fit="118"></span></h2>
          <p class="pj-ev"><b></b><span> electoral votes</span></p>
          <div class="pj-tag"><span class="pj-tag-body">${CHECK}<span>Projected winner</span></span></div>
          <p class="pj-first"></p>
          <h3 class="pj-last"><span data-fit="150"></span></h3>
          <ul class="pj-stats">
            <li><b class="st-share"></b><span>of the vote</span></li>
            <li><b class="st-margin"></b><span class="st-margin-label">point lead</span></li>
            <li><b class="st-rep"></b><span class="st-rep-label">reporting</span></li>
          </ul>
        </div>
        ${tallyHtml(data.tally)}
        <div class="pj-meta"></div>
      </div>
      <div class="pj-progress"><i></i></div>
      <div class="pj-controls">
        <button type="button" class="pj-btn" data-dismiss>${data.remaining ? 'Next' : 'Close'}</button>
        ${data.remaining > 1 ? '<button type="button" class="pj-btn pj-btn-quiet" data-skip-all>Skip all</button>' : ''}
      </div>
    </div>`);

  root.querySelector('.pj-state-name [data-fit]').textContent = data.state.name;
  root.querySelector('.pj-ev b').textContent = String(data.state.electoralVotes);
  if (data.state.electoralVotes === 1) {
    root.querySelector('.pj-ev span').textContent = ' electoral vote';
  }
  root.querySelector('.pj-first').textContent = first;
  root.querySelector('.pj-first').hidden = !first;
  root.querySelector('.pj-last [data-fit]').textContent = last;

  const shareOf = data.votes.winner / Math.max(1, data.state.total);
  root.querySelector('.st-share').textContent = `${(shareOf * 100).toFixed(1)}%`;
  root.querySelector('.st-margin').textContent = `+${(data.state.margin * 100).toFixed(1)}`;
  if (data.state.reporting > 0) {
    root.querySelector('.st-rep').textContent = formatReporting(data.state.reporting);
  } else {
    root.querySelector('.st-rep').textContent = formatNumber(data.votes.winner);
    root.querySelector('.st-rep-label').textContent = 'votes';
  }

  root.querySelector('.tally-dem .tally-name').textContent = data.tally.names.dem;
  root.querySelector('.tally-gop .tally-name').textContent = data.tally.names.gop;
  root.querySelector('.tally-num[data-side="dem"]').textContent = String(data.tally.from.dem);
  root.querySelector('.tally-num[data-side="gop"]').textContent = String(data.tally.from.gop);
  root.querySelector('.tally-gain').textContent = `+${data.state.electoralVotes}`;
  root.querySelector('.tally-gain').dataset.side = key;
  root.querySelector('.pj-meta').textContent = data.remaining
    ? `${data.remaining} more projection${data.remaining === 1 ? '' : 's'} to follow`
    : '';

  root.setAttribute(
    'aria-label',
    `Projected winner in ${data.state.name}: ${data.candidate || side.label}, ${data.state.electoralVotes} electoral votes`
  );

  const holder = root.querySelector('.pj-silhouette');
  holder.appendChild(silhouette(data.feature, 560, 560));

  const media = root.querySelector('.pj-portrait-media');
  const monogram = make(`<span class="pj-monogram"></span>`);
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

export function playState(data, { fast }) {
  const hold = fast ? PROJECTION.fastMs : PROJECTION.stateMs;
  const root = buildState(data);
  if (fast) {
    root.classList.add('is-fast');
  }
  const skipAll = root.querySelector('[data-skip-all]');
  if (skipAll) {
    skipAll.addEventListener('click', event => {
      event.stopPropagation();
      window.dispatchEvent(new CustomEvent('projection:skip-all'));
    });
  }
  const tally = data.tally;
  const winnerKey = SIDES[data.leader].key;
  return present(root, {
    hold,
    onStart: () => {
      const lead = reducedMotion() ? 0 : fast ? 1100 : 2300;
      ['dem', 'gop'].forEach(sideKey => {
        const node = root.querySelector(`.tally-num[data-side="${sideKey}"]`);
        const from = sideKey === winnerKey ? tally.from[sideKey] : tally.to[sideKey];
        countUp(node, from, tally.to[sideKey], sideKey === winnerKey ? 1200 : 1, lead);
      });
      root.querySelectorAll('.seg').forEach(node => node.classList.add('go'));
      const bar = key => `${(tally.to[key] / 538) * 100}%`;
      setTimeout(() => {
        root.querySelector('.seg-dem').style.width = bar('dem');
        root.querySelector('.seg-gop').style.width = bar('gop');
        const ind = root.querySelector('.seg-ind');
        ind.style.left = bar('dem');
        ind.style.width = bar('ind');
      }, lead);
    }
  });
}
