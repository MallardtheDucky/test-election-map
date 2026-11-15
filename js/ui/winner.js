import { byId } from '../core/utils.js';

const banner = byId('winner-banner');
const text = byId('winner-text');

let declaredKey = '';

export function checkWinner(summary, winNumber, { live = false } = {}) {
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
    return null;
  }
  const key = `${side}:${winner}`;
  text.textContent = `${winner} wins the presidency`;
  banner.dataset.side = side;
  banner.classList.add('show');
  if (key === declaredKey) {
    return null;
  }
  declaredKey = key;
  return live ? { side, winner } : null;
}
