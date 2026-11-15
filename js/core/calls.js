let baseline = null;
let baselineKey = '';

export function trackCalls(states, result) {
  const key = `${result.source || ''}|${result.year || ''}`;
  const now = new Map();
  states.forEach(state => {
    if (state.called) {
      now.set(state.abbr || state.name, state.leader);
    }
  });

  let live = false;
  const fresh = [];
  if (baseline && key === baselineKey) {
    live = true;
    states.forEach(state => {
      if (state.called && baseline.get(state.abbr || state.name) !== state.leader) {
        fresh.push(state);
      }
    });
  }

  baseline = now;
  baselineKey = key;
  return { live, fresh };
}
