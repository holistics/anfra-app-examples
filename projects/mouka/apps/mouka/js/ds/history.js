// DS.history: undo / redo for the design panel. Every committed edit (a slider released, a colour picked, a font or theme
// chosen, a token reverted, Reset, a preset applied) pushes a snapshot of the whole design state (DS.snapshot: theme +
// every live override), labelled with what changed. Undo / redo / jump restore a snapshot exactly, so one edit can be
// taken back without resetting the rest. In memory only (the sandbox has no storage); a saved preset is how a state
// outlives a reload (js/ds/panel.js + scripts/ds_save.py). Loaded after js/ds/tokens.js.
(() => {
  const CAP = 100;
  const stack = [{ label: 'Start', snap: DS.snapshot(), at: Date.now() }];
  let i = 0;
  const listeners = new Set();
  const notify = () => listeners.forEach((f) => { try { f(); } catch (e) { console.error('history listener', e); } });

  // "--r-lg 16px → 4px", "Theme mouka → dark", "3 tokens": what moved between two snapshots
  function describe(a, b) {
    if (a.theme !== b.theme) return `Theme ${a.theme} → ${b.theme}`;
    const keys = [...new Set([...Object.keys(a.overrides), ...Object.keys(b.overrides)])].filter((k) => a.overrides[k] !== b.overrides[k]);
    if (keys.length === 1) {
      const k = keys[0], short = (v) => (v == null ? 'default' : String(v).split(',')[0].replace(/'/g, '').slice(0, 18));
      return `${k} ${short(a.overrides[k])} → ${short(b.overrides[k])}`;
    }
    return `${keys.length} tokens`;
  }
  // commit(label?): record the current state as a step (skipped when nothing changed since the current step)
  function commit(label) {
    const snap = DS.snapshot(), cur = stack[i].snap;
    if (DS.sameSnap(cur, snap)) return false;
    stack.splice(i + 1);
    stack.push({ label: label ?? describe(cur, snap), snap, at: Date.now() });
    if (stack.length > CAP) stack.splice(1, stack.length - CAP);   // keep 'Start'
    i = stack.length - 1;
    notify();
    return true;
  }
  function jump(n) {
    if (n < 0 || n >= stack.length || n === i) return false;
    i = n;
    DS.restore(stack[i].snap);
    notify();
    return true;
  }
  DS.history = {
    commit, jump,
    undo: () => jump(i - 1),
    redo: () => jump(i + 1),
    get canUndo() { return i > 0; },
    get canRedo() { return i < stack.length - 1; },
    get index() { return i; },
    get steps() { return stack.map((s, n) => ({ n, label: s.label, at: s.at, current: n === i })); },
    onChange: (f) => { listeners.add(f); return () => listeners.delete(f); },
  };
})();
