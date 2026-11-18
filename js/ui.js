// Rack UI: module panels, knobs, and the add-module menu.
import { registry, toNorm, fromNorm, CAT_COLORS } from './defs.js';

const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

export function fmt(p, v) {
  const a = Math.abs(v);
  const s = p.step >= 1 ? v.toFixed(0) : a >= 100 ? v.toFixed(0) : a >= 10 ? v.toFixed(1) : a >= 1 ? v.toFixed(2) : v.toFixed(3);
  return s + (p.unit ? ' ' + p.unit : '');
}

function knob(p, inst, patch) {
  const el = h('div', 'k', `<div class="dial"><i></i></div><label>${p.label}</label><output></output>`);
  const ptr = el.querySelector('i'), out = el.querySelector('output');
  const show = () => { const v = inst.params[p.id]; ptr.style.transform = `rotate(${-135 + 270 * toNorm(p, v)}deg)`; out.textContent = fmt(p, v); };
  let y0 = null, n0;
  el.onpointerdown = e => { el.setPointerCapture(e.pointerId); y0 = e.clientY; n0 = toNorm(p, inst.params[p.id]); el.classList.add('drag'); e.preventDefault(); };
  el.onpointermove = e => { if (y0 == null) return; patch.setParam(inst, p.id, fromNorm(p, n0 + (y0 - e.clientY) / (e.shiftKey ? 1600 : 170))); show(); };
  el.onpointerup = el.onpointercancel = () => { y0 = null; el.classList.remove('drag'); };
  el.ondblclick = () => { patch.setParam(inst, p.id, p.def); show(); };
  el.title = `${p.label} — drag up/down, shift for fine, double-click to reset`;
  show();
  return el;
}

function control(p, inst, patch) {
  if (p.type === 'knob') return knob(p, inst, patch);
  if (p.type === 'sel') {
    const el = h('label', 'sel', `<span>${p.label}</span>`), s = h('select');
    p.options.forEach((o, i) => s.add(new Option(o, i)));
    s.value = inst.params[p.id];
    s.onchange = () => patch.setParam(inst, p.id, +s.value);
    el.append(s); return el;
  }
  if (p.type === 'tog') {
    const b = h('button', 'tog', p.label);
    const show = () => b.classList.toggle('on', inst.params[p.id] > 0.5);
    b.onclick = () => { patch.setParam(inst, p.id, inst.params[p.id] > 0.5 ? 0 : 1); show(); };
    show(); return b;
  }
  if (p.type === 'text') {
    const i = h('input', 'txt');
    i.type = 'text'; i.value = inst.params[p.id]; i.placeholder = p.label; i.spellcheck = false; i.title = p.label + ' — press Enter to apply';
    i.onchange = () => patch.setParam(inst, p.id, i.value.trim());
    i.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') i.blur(); };
    return i;
  }
  const b = h('button', 'btn', p.label);
  b.onclick = () => inst.impl.action?.(p.id);
  return b;
}

export class Rack {
  constructor(el, patch, video) {
    this.patch = patch; this.video = video;
    this.secA = h('div', 'mods'); this.secV = h('div', 'mods');
    el.append(h('h2', 'sec a', 'Audio &amp; CV'), this.secA, h('h2', 'sec v', 'Video'), this.secV);
  }
  add(inst, scroll) {
    const def = inst.def, isV = def.domain === 'v';
    const el = inst.el = h('div', 'mod ' + (isV ? 'v' : 'a'));
    el.style.setProperty('--c', CAT_COLORS[def.cat] || '#888');
    const head = h('div', 'head', `<span>${inst.name}</span>`), x = h('button', 'x', '&times;');
    x.title = 'Remove module'; x.onclick = () => this.patch.remove(inst);
    head.append(x); el.append(head);
    if (isV) {
      const c = inst.thumb = h('canvas', 'thumb'); c.width = 128; c.height = 72;
      c.title = 'Click to preview this module on the monitor';
      c.onclick = () => { this.video.preview = this.video.preview === inst ? null : inst; this.markPreview(); };
      inst.thumbCtx = c.getContext('2d'); el.append(c);
    }
    const knobs = h('div', 'knobs'), others = h('div', 'others');
    const nk = def.params.filter(p => p.type === 'knob').length;
    knobs.style.setProperty('--cols', def.cols || Math.min(Math.max(nk, isV ? 3 : 2), 4));
    const build = () => { knobs.textContent = ''; others.textContent = ''; for (const p of def.params) (p.type === 'knob' ? knobs : others).append(control(p, inst, this.patch)); };
    build();
    el.addEventListener('refresh', () => { build(); def.ui && inst.type === 'seq' && def.ui(knobs, inst); });
    if (nk) el.append(knobs);
    if (others.children.length) el.append(others);
    if (def.status) el.append(inst.sayEl = h('div', 'status', inst.status || ''));
    const io = (l, cls) => l.length ? `<span class="${cls}">${l.map(p => p.label).join(' · ')}</span>` : '';
    el.append(h('div', 'io', io(def.ins, 'i') + io(def.outs, 'o')));
    (isV ? this.secV : this.secA).append(el);
    def.ui?.(knobs, inst);
    if (scroll) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  remove(inst) { inst.el?.remove(); if (this.video.preview === inst) this.video.preview = null; this.markPreview(); }
  markPreview() { for (const m of this.patch.mods) m.thumb?.classList.toggle('on', this.video.preview === m); document.getElementById('monitor').classList.toggle('preview', !!this.video.preview); }
}

export function buildMenu(el, onPick) {
  const groups = { a: new Map(), v: new Map() };
  for (const def of registry.values()) { const g = groups[def.domain]; if (!g.has(def.cat)) g.set(def.cat, []); g.get(def.cat).push(def); }
  for (const [dom, title] of [['a', 'Audio &amp; CV'], ['v', 'Video']]) {
    const col = h('div', 'col ' + dom, `<h3>${title} <small>${[...groups[dom].values()].flat().length} modules</small></h3>`);
    for (const [cat, defs] of groups[dom]) {
      const g = h('div', 'grp', `<h4 style="--c:${CAT_COLORS[cat]}">${cat.replace('Video ', '')}</h4>`);
      for (const d of defs) { const b = h('button', '', d.name); b.onclick = () => onPick(d.type); g.append(b); }
      col.append(g);
    }
    el.append(col);
  }
}
