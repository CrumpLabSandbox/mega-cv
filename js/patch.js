// The patch: module instances + matrix connections. Owns all audio-graph wiring.
import { registry } from './defs.js';

export class Patch {
  constructor(ac, video, env) {
    this.ac = ac; this.video = video; this.env = env;
    this.mods = []; this.conns = []; this.on = () => { };
  }
  get(id) { return this.mods.find(m => m.id === id); }
  find(from, out, to, inp) { return this.conns.find(c => c.from === from && c.out === out && c.to === to && c.inp === inp); }

  add(type, opt = {}) {
    const def = registry.get(type);
    if (!def) { console.warn('Unknown module type', type); return null; }
    let id = opt.id;
    if (!id || this.get(id)) { let n = 1; while (this.get(type + n)) n++; id = type + n; }
    const inst = { id, type, def, name: def.name + ' ' + id.slice(type.length), params: {} };
    for (const p of def.params) if (p.type !== 'btn') inst.params[p.id] = opt.params?.[p.id] ?? p.def;
    inst.impl = def.domain === 'v' ? this.video.create(def, inst) : def.create(this.ac, inst, this.env);
    for (const p of def.params) if (p.type !== 'btn') inst.impl.set(p.id, inst.params[p.id], true);
    // Keep every output pulled by the audio graph even when it only drives video CV.
    for (const k in inst.impl.aouts) { const [n, i] = this.pair(inst.impl.aouts[k]); n.connect(this.env.sink, i); }
    this.mods.push(inst);
    this.video.dirty = true;
    this.on('add', inst);
    return inst;
  }
  remove(inst) {
    for (const c of this.conns.filter(c => c.from === inst.id || c.to === inst.id)) this.disconnect(c);
    inst.impl.dispose?.();
    this.mods.splice(this.mods.indexOf(inst), 1);
    this.video.dirty = true;
    this.on('remove', inst);
  }
  clear() { for (const m of [...this.mods]) this.remove(m); }

  setParam(inst, id, v) { inst.params[id] = v; inst.impl.set(id, v); this.on('param', inst); }

  pair(x) { return Array.isArray(x) ? x : [x, 0]; }
  reaches(a, b) { // is there an audio path from module a to module b?
    const seen = new Set([a]), q = [a];
    while (q.length) {
      const m = q.pop();
      if (m === b) return true;
      for (const c of this.conns) if (c.type === 'a' && c.from === m && !seen.has(c.to)) { seen.add(c.to); q.push(c.to); }
    }
    return false;
  }

  connect(from, out, to, inp, amt = 1) {
    const src = this.get(from), dst = this.get(to);
    const po = src?.def.outs.find(p => p.id === out), pi = dst?.def.ins.find(p => p.id === inp);
    if (!po || !pi || po.type !== pi.type) { console.warn('Bad connection', from, out, to, inp); return null; }
    if (this.find(from, out, to, inp)) return null;
    const c = { from, out, to, inp, amt, type: po.type };
    if (c.type === 'v') {
      const old = this.conns.find(x => x.type === 'v' && x.to === to && x.inp === inp);
      if (old) this.disconnect(old, true);
      dst.impl.vin[inp] = src;
      this.video.dirty = true;
    } else {
      const ac = this.ac, g = ac.createGain(), [on, oi] = this.pair(src.impl.aouts[out]), target = dst.impl.ains[inp];
      g.gain.value = amt;
      on.connect(g, oi);
      let tail = g;
      if (this.reaches(to, from)) { // feedback loop: Web Audio needs a delay in every cycle
        const d = ac.createDelay(0.05); d.delayTime.value = 128 / ac.sampleRate;
        g.connect(d); tail = d; c.dly = d;
      }
      if (target instanceof AudioParam) tail.connect(target); else { const [n, i] = this.pair(target); tail.connect(n, 0, i); }
      c.g = g; c.src = on; c.oi = oi;
      dst.impl.connected?.(inp, 1);
    }
    this.conns.push(c);
    this.on('conn', c);
    return c;
  }
  disconnect(c, quiet) {
    const i = this.conns.indexOf(c);
    if (i < 0) return;
    this.conns.splice(i, 1);
    const dst = this.get(c.to);
    if (c.type === 'v') { if (dst) dst.impl.vin[c.inp] = null; this.video.dirty = true; }
    else {
      try { c.src.disconnect(c.g, c.oi); } catch { }
      c.g.disconnect(); c.dly?.disconnect();
      dst?.impl.connected?.(c.inp, -1);
    }
    if (!quiet) this.on('conn', c);
  }
  setAmt(c, amt) { c.amt = amt; if (c.g) c.g.gain.setTargetAtTime(amt, this.ac.currentTime, 0.01); this.on('amt', c); }

  toJSON() {
    return {
      app: 'mega-cv', v: 1,
      mods: this.mods.map(m => ({ id: m.id, type: m.type, params: { ...m.params } })),
      conns: this.conns.map(c => [c.from, c.out, c.to, c.inp, +c.amt.toFixed(3)]),
    };
  }
  load(json) {
    this.clear();
    for (const m of json.mods || []) this.add(m.type, m);
    for (const [f, o, t, i, a] of json.conns || []) this.connect(f, o, t, i, a ?? 1);
    this.on('load');
  }
}
