import { byId } from '../core/utils.js';

const banner = byId('winner-banner');
const text = byId('winner-text');

let declaredKey = '';

export function checkWinner(summary, winNumber) {
  let winner = null;
  let side = '';
  if (summary.gopEV >= winNumber) {
    winner = summary.gopCandidate || 'Republican';
    side = 'gop';
  }
  if (summary.demEV >= winNumber) {
    winner = summary.demCandidate || 'Democrat';
    side = 'dem';
  }
  if (summary.indEV >= winNumber) {
    winner = summary.indCandidate || 'Independent';
    side = 'ind';
  }
  if (!winner) {
    declaredKey = '';
    banner.classList.remove('show');
    return;
  }
  const key = `${side}:${winner}`;
  if (key === declaredKey) {
    return;
  }
  declaredKey = key;
  text.textContent = `${winner} wins the presidency`;
  banner.dataset.side = side;
  banner.classList.add('show');
  if (typeof confetti === 'function') {
    confetti({ particleCount: 200, spread: 100, origin: { y: 0.6 } });
  }
}
