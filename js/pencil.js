// Pencil: drawings from the Pencil notebooks (https://crumplabsandbox.github.io/pencil/) as a signal source.
//  - 'pencil'  (video) replays a page stroke by stroke and outputs the pen as CV (updated once per video frame)
//  - 'ptrace'  (audio) loops a stretch of the same pen path at audio rate, so the drawing is the waveform
// Pages are stored as drawing operations; the pencil site's own engine turns them into timed strokes.
import { registry, P, SEL, TOG, BTN } from './defs.js';
import { V } from './video/modules.js';
import { wk } from './audio/modules.js';

const BASE = 'https://crumplabsandbox.github.io/pencil/';
const PW = 148, PH = 210;                       // page size in mm
const TITLES = ['Half a Pencil', 'On the Phone', 'The Doodle Critic']; // shown until the live list arrives

let enginePromise, indexPromise;
const pages = new Map();
const json = async path => { const r = await fetch(BASE + path); if (!r.ok) throw new Error(`Pencil site answered ${r.status} for ${path}`); return r.json(); };
const engine = () => enginePromise || (enginePromise = import(BASE + 'js/engine.js').catch(e => { enginePromise = null; throw e; }));

// The notebooks on the site: [{ id, title, stopAt, pages: ['nb1/001', ...] }]
export const books = () => indexPromise || (indexPromise = (async () => {
  const out = [];
  for (const b of (await json('data/index.json')).books) {
    try {
      const m = await json(`data/${b.id}/manifest.json`);
      const list = (m.notebooks || []).flatMap(nb => nb.pages.map((p, i) => `${nb.id}/${String(p.n ?? i + 1).padStart(3, '0')}`));
      if (list.length) out.push({ id: b.id, title: m.title || b.id, stopAt: m.stopAt, pages: list });
    } catch { /* a notebook that is listed but not published yet */ }
  }
  if (!out.length) throw new Error('No notebooks found on the pencil site');
  for (const type of ['pencil', 'ptrace']) { const p = registry.get(type).params[0]; p.options = out.map(b => b.title); p.max = out.length - 1; }
  return out;
})().catch(e => { indexPromise = null; throw e; }));

// One page as drawable chunks: { items: [{ e, p, w, a, l, c0, nw }], total (mm), ink (mm of pencil stroke), title }
export async function loadPage(bookIdx, pageNo) {
  const list = await books(), book = list[Math.max(0, Math.min(list.length - 1, Math.round(bookIdx)))];
  const n = book.pages.length, idx = ((Math.round(pageNo) - 1) % n + n) % n, key = `${book.id}/${book.pages[idx]}`;
  if (pages.has(key)) return pages.get(key);
  const [eng, page] = await Promise.all([engine(), json(`data/${key}.json`)]);
  const { sim } = eng.runPage(page.ops, page.before, page.seed, { stopAt: book.stopAt });
  const items = [];
  let c = 0, ink = 0, lx = NaN, ly = NaN;
  for (const it of sim.items) {
    if (it.t === 'x' || it.p.length < 4) continue;
    const p = Float32Array.from(it.p);
    let l = 0;
    for (let k = 2; k < p.length; k += 2) l += Math.hypot(p[k] - p[k - 2], p[k + 1] - p[k - 1]);
    if (!(l > 0)) continue;
    const e = it.t === 'e';
    items.push({ e, p, w: it.w, a: e ? 1 : it.a, l, c0: c, i0: ink, nw: Math.hypot(p[0] - lx, p[1] - ly) > 0.05 });
    c += l; if (!e) ink += l;
    lx = p[p.length - 2]; ly = p[p.length - 1];
  }
  const pg = { items, total: c, ink, title: book.title, page: idx + 1, count: n };
  if (pages.size > 12) pages.delete(pages.keys().next().value);
  pages.set(key, pg);
  return pg;
}

const say = (inst, t) => { if (inst.status === t) return; inst.status = t; if (inst.sayEl) inst.sayEl.textContent = t; };
const fail = e => /fetch|import|load/i.test(e.message || '') ? 'Could not reach the pencil site (are you online?)' : (e.message || String(e));
// The notebook list is fetched once; each panel rebuilds its selector the first time it sees it.
const syncList = (inst, impl) => { if (!impl.listed) { impl.listed = true; inst.el?.dispatchEvent(new Event('refresh')); } };

// ================================================================ video source
const PX = 4, CW = PW * PX, CH = PH * PX;      // canvas pixels per mm

// Draws the stretch [a, b) of the page (mm of stroke) and reports where the pen ended up.
function drawSpan(ctx, pg, a, b, thick, out) {
  const items = pg.items;
  let lo = 0, hi = items.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (items[m].c0 <= a) lo = m; else hi = m - 1; }
  for (let i = lo; i < items.length; i++) {
    const it = items[i];
    if (it.c0 >= b) break;
    const s = Math.max(0, a - it.c0), e = Math.min(it.l, b - it.c0), p = it.p;
    if (e <= s) continue;
    if (it.nw && a <= it.c0) out.strokes++;
    ctx.beginPath();
    let d = 0, started = false;
    for (let k = 2; k < p.length && d < e; k += 2) {
      const x0 = p[k - 2], y0 = p[k - 1], x1 = p[k], y1 = p[k + 1], sl = Math.hypot(x1 - x0, y1 - y0);
      if (!(sl > 0)) continue;
      if (d + sl > s) {
        const t0 = Math.max(0, (s - d) / sl), t1 = Math.min(1, (e - d) / sl);
        if (!started) { ctx.moveTo(x0 + (x1 - x0) * t0, y0 + (y1 - y0) * t0); started = true; }
        out.x = x0 + (x1 - x0) * t1; out.y = y0 + (y1 - y0) * t1;
        ctx.lineTo(out.x, out.y);
      }
      d += sl;
    }
    ctx.strokeStyle = it.e ? '#000' : '#fff';
    ctx.globalAlpha = it.e ? 0.9 : Math.min(1, 0.25 + it.a);
    ctx.lineWidth = it.e ? it.w : Math.max(0.35, it.w * thick);
    ctx.stroke();
    out.a = it.e ? 0 : it.a; out.ink = it.i0 + (it.e ? 0 : e);
  }
}

function restart(impl) {
  const S = impl.S;
  S.pos = 0; S.hold = 0; S.dirty = true;
  S.ctx.globalAlpha = 1; S.ctx.fillStyle = '#000'; S.ctx.fillRect(0, 0, PW, PH);
}

async function loadVideo(inst, eng, impl) {
  const tok = ++impl.tok;
  try {
    const pg = await loadPage(inst.params.book, inst.params.page);
    if (impl.dead || tok !== impl.tok) return;
    impl.S.pg = pg; restart(impl); syncList(inst, impl);
  } catch (e) { if (!impl.dead && tok === impl.tok) say(inst, fail(e)); }
}

V('pencil', 'Pencil', 'Video Sources', {
  status: 1, tex: ['pen'], xuni: ['ux', 'uy'], cols: 4,
  ains: [{ id: 'reset', label: 'Reset', fft: 2048 }],
  aouts: ['x:Pen X', 'y:Pen Y', 'down:Pen down', 'pr:Pressure', 'strk:Stroke', 'end:Page end', 'prog:Progress'],
  params: [SEL('book', 'Notebook', TITLES), P('page', 'Page', 1, 100, 1, { step: 1 }),
    P('speed', 'Speed', 5, 20000, 400, { exp: 1, cv: 1, unit: 'mm/s' }), P('zoom', 'Zoom', 1, 16, 1, { exp: 1, cv: 1 }),
    P('fade', 'Fade', 0, 1, 0), P('thick', 'Thick', 0.5, 8, 1.6, { exp: 1 }),
    TOG('follow', 'Follow pen', 0), TOG('next', 'Auto next page', 1), SEL('ink', 'Look', ['White ink', 'Pencil on paper']), BTN('again', 'Restart page')],
  glsl: `const vec3 PAPER=vec3(.93,.91,.85),LEAD=vec3(.13,.13,.16);
vec4 fx(vec2 uv){vec2 c=mix(vec2(.5),vec2(ux,uy),follow*clamp(zoom-1.,0.,1.));
vec2 q=asp(uv)/zoom;q.x*=${(PH / PW).toFixed(5)};q+=c;
float on=step(0.,q.x)*step(q.x,1.)*step(0.,q.y)*step(q.y,1.);
float k=texture(pen,q).r*on;vec3 pv=texture(P,uv).rgb;
if(fade>.001){float o=ink>.5?(luma(pv)<.05?0.:(PAPER.r-pv.r)/(PAPER.r-LEAD.r)):pv.r;k=max(k,o*(1.-fade*fade*.5)-.004);}
return vec4(ink>.5?mix(PAPER,LEAD,clamp(k,0.,1.))*on:vec3(k),1.);}`,
  setup(inst, eng, impl) {
    const cv = document.createElement('canvas'); cv.width = CW; cv.height = CH;
    const ctx = cv.getContext('2d'); ctx.scale(PX, PX); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    impl.S = { cv, ctx, pos: 0, hold: 0, t: null, rb: new Float32Array(2048), rl: 0, dirty: true, wasFade: false, cx: 0.5, cy: 0.5, pen: { x: PW / 2, y: PH / 2, a: 0, ink: 0, strokes: 0 } };
    impl.tok = 0; impl.u.ux = 0.5; impl.u.uy = 0.5;
    restart(impl);
    inst.status = 'Loading notebook…';
  },
  onParam(inst, eng, impl, id) { if (id === 'book' || id === 'page') { clearTimeout(impl.pend); impl.pend = setTimeout(() => loadVideo(inst, eng, impl), 60); } },
  action(inst, eng, impl) { restart(impl); },
  frame(inst, eng, impl) {
    const S = impl.S, prm = inst.params, def = inst.def, pg = S.pg, now = eng.t, at = eng.ac.currentTime, o = impl.aouts;
    const dt = Math.min(0.1, S.t == null ? 0 : now - S.t); S.t = now;
    // rising edges on the Reset input since the last frame
    const rb = S.rb, n0 = Math.max(0, rb.length - Math.ceil(dt * eng.ac.sampleRate) - 1);
    impl.an.reset.getFloatTimeDomainData(rb);
    let rst = false;
    for (let i = n0; i < rb.length; i++) { const h = rb[i] > 0.5; if (h && !S.rl) rst = true; S.rl = h; }
    if (rst) restart(impl);
    if (pg) {
      const fading = prm.fade > 0.001, pen = S.pen;
      if (fading !== S.wasFade) { // Fade keeps only fresh strokes on the canvas; without it the page builds up
        S.wasFade = fading;
        if (!fading) { const p = S.pos; restart(impl); S.pos = p; pen.strokes = 0; drawSpan(S.ctx, pg, 0, p, prm.thick, pen); }
      }
      if (fading) { S.ctx.globalAlpha = 1; S.ctx.fillStyle = '#000'; S.ctx.fillRect(0, 0, PW, PH); S.dirty = true; }
      let down = 0;
      if (S.hold > 0) {
        if ((S.hold -= dt) <= 0) {
          if (prm.next > 0.5 && pg.count > 1) { // turn the page
            S.pg = null; inst.params.page = pg.page % pg.count + 1;
            inst.el?.dispatchEvent(new Event('refresh')); loadVideo(inst, eng, impl);
          } else restart(impl);
        }
      } else if (pg.total > 0) {
        const speed = eng.cv(impl, def.params[2], prm.speed), to = Math.min(pg.total, S.pos + speed * dt);
        pen.strokes = 0;
        if (to > S.pos) { drawSpan(S.ctx, pg, S.pos, to, prm.thick, pen); S.pos = to; S.dirty = true; down = pen.a > 0 ? 1 : 0; }
        if (pen.strokes) { o.strk.offset.setValueAtTime(1, at); o.strk.offset.setValueAtTime(0, at + 0.03); }
        if (S.pos >= pg.total) { S.hold = fading ? 0.05 : 1.2; o.end.offset.setValueAtTime(1, at); o.end.offset.setValueAtTime(0, at + 0.1); }
      }
      const ux = pen.x / PW, uy = 1 - pen.y / PH, k = Math.min(1, dt * 6);
      S.cx += (ux - S.cx) * k; S.cy += (uy - S.cy) * k;
      impl.u.ux = S.cx; impl.u.uy = S.cy;
      // Pen as CV: the page's long side spans -1..1, so X stays within about +-0.7
      o.x.offset.setTargetAtTime((pen.x - PW / 2) / (PH / 2), at, 0.008);
      o.y.offset.setTargetAtTime((PH / 2 - pen.y) / (PH / 2), at, 0.008);
      o.down.offset.setTargetAtTime(down, at, 0.004);
      o.pr.offset.setTargetAtTime(down ? pen.a : 0, at, 0.01);
      o.prog.offset.setTargetAtTime(pg.ink ? pen.ink / pg.ink : 0, at, 0.01);
      if (!(eng.frame % 20)) say(inst, `${pg.title} · page ${pg.page}/${pg.count} · ${Math.round(100 * S.pos / (pg.total || 1))}% of ${(pg.total / 1000).toFixed(1)} m`);
    }
    if (S.dirty) { eng.uploadEl(impl, 'pen', S.cv); S.dirty = false; }
  },
  dispose(inst, eng, impl) { clearTimeout(impl.pend); },
});

// ================================================================ audio-rate tracer
const STEP = 0.5; // mm between path points sent to the audio thread

// The page's pencil strokes resampled to evenly spaced points, in the same -1..1 coordinates as the Pencil CV outputs.
function pathOf(pg) {
  const n = Math.max(4, Math.ceil(pg.ink / STEP) + pg.items.length + 4);
  const x = new Float32Array(n), y = new Float32Array(n), a = new Float32Array(n);
  let m = 0, need = 0;
  const put = (px, py, al) => { if (m < n) { x[m] = (px - PW / 2) / (PH / 2); y[m] = (PH / 2 - py) / (PH / 2); a[m++] = al; } };
  for (const it of pg.items) {
    if (it.e) continue;
    const p = it.p;
    if (it.nw) { put(p[0], p[1], it.a); need = STEP; }
    for (let k = 2; k < p.length; k += 2) {
      const x0 = p[k - 2], y0 = p[k - 1], dx = p[k] - x0, dy = p[k + 1] - y0, sl = Math.hypot(dx, dy);
      let d = need;
      for (; d <= sl; d += STEP) put(x0 + dx * d / sl, y0 + dy * d / sl, it.a);
      need = d - sl;
    }
  }
  return { x: x.slice(0, m), y: y.slice(0, m), a: a.slice(0, m), step: STEP, jump: (2.5 * STEP / (PH / 2)) ** 2 };
}

wk('ptrace', 'Pencil Tracer', 'Oscillators', {
  ins: ['voct:V/Oct', 'pos:Position', 'span:Span', 'reset:Reset'],
  outs: ['x:X', 'y:Y', 'ax:Audio X', 'ay:Audio Y', 'pr:Pressure', 'sync:Sync'], cols: 3,
  params: [SEL('book', 'Notebook', TITLES), P('page', 'Page', 1, 100, 1, { step: 1 }),
    P('freq', 'Freq', 0.05, 2000, 55, { exp: 1, unit: 'Hz' }), P('span', 'Span', 2, 20000, 150, { exp: 1, unit: 'mm' }), P('pos', 'Position', 0, 1, 0),
    P('drift', 'Drift', -400, 400, 25, { unit: 'mm/s' }), P('gain', 'Gain', 1, 60, 6, { exp: 1 }), TOG('pp', 'Ping-pong', 1)],
});
{
  const def = registry.get('ptrace'), make = def.create;
  def.status = 1;
  def.create = (ac, inst) => {
    const impl = make(ac), set = impl.set, dispose = impl.dispose;
    let tok = 0, pend = 0;
    const load = async () => {
      const t = ++tok;
      try {
        const pg = await loadPage(inst.params.book, inst.params.page);
        if (impl.dead || t !== tok) return;
        const path = pathOf(pg);
        say(inst, `${pg.title} · page ${pg.page}/${pg.count} · ${(pg.ink / 1000).toFixed(1)} m of pencil`);
        impl.node.port.postMessage(path, [path.x.buffer, path.y.buffer, path.a.buffer]);
        syncList(inst, impl);
      } catch (e) { if (!impl.dead && t === tok) say(inst, fail(e)); }
    };
    inst.status = 'Loading notebook…';
    impl.set = (id, v, init) => { if (id === 'book' || id === 'page') { clearTimeout(pend); pend = setTimeout(load, 60); } else set(id, v, init); };
    impl.dispose = () => { impl.dead = true; clearTimeout(pend); dispose(); };
    return impl;
  };
}
