// Shared module-definition helpers. Audio and video modules both register here.
export const registry = new Map();
export const register = def => registry.set(def.type, def);

// Parameter constructors. Options: exp (log taper), step, unit, cv (video: CV input), acc (video: integrate over time)
export const P = (id, label, min, max, def, o = {}) => ({ id, label, min, max, def, type: 'knob', ...o });
export const SEL = (id, label, options, def = 0) => ({ id, label, type: 'sel', options, def, min: 0, max: options.length - 1 });
export const TOG = (id, label, def = 0) => ({ id, label, type: 'tog', def, min: 0, max: 1 });
export const TEXT = (id, label, def = '') => ({ id, label, type: 'text', def });
export const BTN = (id, label) => ({ id, label, type: 'btn' });

// 'id:Label' strings -> port objects. type: 'a' (audio / CV) or 'v' (video)
export const ports = (list, type) => list.map(s => { const [id, label] = s.split(':'); return { id, label: label || id, type }; });

const c01 = n => n < 0 ? 0 : n > 1 ? 1 : n;
export const toNorm = (p, v) => p.exp ? Math.log(v / p.min) / Math.log(p.max / p.min) : (v - p.min) / (p.max - p.min);
export const fromNorm = (p, n) => {
  n = c01(n);
  let v = p.exp ? p.min * Math.pow(p.max / p.min, n) : p.min + (p.max - p.min) * n;
  if (p.step) v = Math.round(v / p.step) * p.step;
  return v;
};

export const CAT_COLORS = {
  Oscillators: '#ffb400', Drums: '#ff7a45', Filters: '#ff5d8f', Effects: '#c77dff',
  Modulation: '#5dd39e', Sequencing: '#4cc9f0', Utilities: '#9aa5b1', 'Audio I/O': '#f1f3f5',
  'Video Sources': '#00e5ff', 'Video Mix': '#7b8cff', 'Video Color': '#ff6bd6',
  'Video Geometry': '#7dff8a', 'Video FX': '#ffd166', 'Video I/O': '#f1f3f5',
};
