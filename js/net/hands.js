// Invisible Hands for MEGA·CV: send CV to other apps over the internet, and bring their outputs back as CV.
// One module type, 'hands'. Every copy shares a single connection to the relay (one room at a time).
//   Send 1–4  (inputs):  patch any CV in; each slot is aimed at a control in the room ("Everyone · bleed").
//   Recv 1–4  (outputs): another app's published outputs (e.g. a Chamber site's depth), 0..1, as CV.
// Protocol, library and relay are Sam Ling's: https://github.com/samuelling/InvisibleHands (SPEC.md).
// Based on the module Sam proposed, with these differences: sends run from a worker timer (not the animation
// loop, which stops in a hidden tab), everything received is range-checked, each slot remembers what it last
// moved so it can let go of it, all copies share one send budget, the relay address is fixed here, and a room
// saved in a patch is not rejoined until asked.
import { register, SEL, TEXT, BTN, ports } from '../defs.js';
import './invisible-hands.js'; // vendored, unchanged; sets globalThis.InvisibleHands

const RELAY = 'wss://invisible-hands.samuelling.workers.dev'; // given explicitly, so a ?relay= in a link is ignored
const SLOTS = 4;
const SEND_MS = 40;         // 25 Hz per slot
const BUDGET = 90;          // messages per second for all copies together; the relay allows 120 per connection
const KEEPALIVE = 5000;     // re-send an unchanged value this often, so sites don't drift back to their own LFOs
const MODES = ['Mod ±1', 'Set 0..1', 'Set ±1→0..1', 'Gate'];
const clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;

let hands = null, timerOn = false, tokens = BUDGET, tLast = 0, rr = 0;
const insts = new Set();

function link() {
  if (hands || !globalThis.InvisibleHands) return hands;
  hands = globalThis.InvisibleHands.create({ app: 'mega-cv', name: 'MEGA·CV', relay: RELAY }); // joins ?room=… by itself
  const changed = () => insts.forEach(i => { i.impl.resend(); i.impl.redraw?.(); });
  hands.on('status', changed); hands.on('peers', changed);
  return hands;
}

// One timer for every copy. A worker's timer keeps its pace when this tab is in the background.
function startTimer() {
  if (timerOn) return; timerOn = true;
  const fallback = () => setInterval(pump, SEND_MS);
  try {
    const w = new Worker(URL.createObjectURL(new Blob([`setInterval(()=>postMessage(0),${SEND_MS})`], { type: 'text/javascript' })));
    w.onmessage = pump; w.onerror = () => { w.terminate(); fallback(); };
  } catch { fallback(); }
}
function pump() {
  const h = hands;
  if (!h || !insts.size) return;
  const now = performance.now(), list = [...insts];
  tokens = Math.min(BUDGET, tokens + (now - tLast) / 1000 * BUDGET); tLast = now;
  for (const inst of list) inst.impl.recv();
  if (h.status !== 'on') return;
  const n = list.length * SLOTS;
  for (let k = 0; k < n; k++) {
    const j = (rr + k) % n;
    if (tokens < 1) { rr = j; return; } // out of budget: the next round starts with the slot that missed out
    if (list[Math.floor(j / SLOTS)].impl.send(j % SLOTS, now)) tokens--;
  }
}

// a destination is stored as "<to>|<param>": to = "*" (everyone) or "app:<slug>"
const parseDest = s => { const [to, p] = String(s || '').split('|'); return p ? { to: to === '*' ? undefined : to, p } : null; };
// a source is stored as "<app>|<out>"
const parseSrc = s => { const [app, o] = String(s || '').split('|'); return o ? { app, o } : null; };
// what peers say about themselves is untrusted: keep only well-formed entries, and only ever use them as text
const okId = s => typeof s === 'string' && s.length > 0 && s.length <= 64 && !s.includes('|');
const listOf = a => (Array.isArray(a) ? a : []).filter(p => p && okId(p.id));
const text = (s, fallback) => String(s ?? fallback).slice(0, 64);

const params = [TEXT('room', 'Room code (Enter to join, clear to leave)'), BTN('join', 'Join / Leave'), BTN('new', 'New room'), BTN('copy', 'Copy invite')];
for (let i = 1; i <= SLOTS; i++) params.push(TEXT('d' + i, `Send ${i} destination`), SEL('m' + i, `Send ${i} mode`, MODES, 0));
for (let i = 1; i <= SLOTS; i++) params.push(TEXT('s' + i, `Recv ${i} source`));

register({
  type: 'hands', name: 'Invisible Hands', cat: 'Network', domain: 'a', status: 1,
  params,
  ins: ports([...Array(SLOTS)].map((_, i) => `in${i + 1}:Send ${i + 1}`), 'a'),
  outs: ports([...Array(SLOTS)].map((_, i) => `out${i + 1}:Recv ${i + 1}`), 'a'),

  create(ac, inst, env) {
    const h = link();
    const ains = {}, aouts = {}, an = [], cs = [], buf = new Float32Array(32);
    const live = Array(SLOTS).fill(0), cur = Array(SLOTS).fill(null), sentAt = Array(SLOTS).fill(0);
    for (let i = 0; i < SLOTS; i++) {
      const a = ac.createAnalyser(); a.fftSize = 32; a.connect(env.sink); an.push(a); ains['in' + (i + 1)] = a;
      const c = ac.createConstantSource(); c.offset.value = 0; c.start(); cs.push(c); aouts['out' + (i + 1)] = c;
    }
    const say = t => { inst.status = t; if (inst.sayEl) inst.sayEl.textContent = t; };
    // let go of whatever this slot last moved: a modulation ends at 0, a gate is left low
    const release = i => {
      const c = cur[i]; cur[i] = null;
      if (!c || !h || h.status !== 'on') return;
      if (c.mode === 0) h.mod(c.to, c.p, 0); else if (c.mode === 3 && c.v) h.set(c.to, c.p, 0);
    };

    const impl = {
      ains, aouts,
      set(id, v, init) {
        if (id === 'room' && h && !init) { // a room saved in a patch is only rejoined when asked (Join, or Enter in the box)
          const want = String(v || '').trim();
          if (!want) { if (h.room) h.leave(); }
          else if (want !== h.room) h.join(want);
        }
        impl.redraw?.(true);
      },
      action(id) {
        if (!h) return;
        const patch = globalThis.megacv?.patch;
        if (id === 'join') { if (h.room) h.leave(); else h.join(inst.params.room); impl.redraw?.(true); }
        if (id === 'new') { const code = h.newRoom(); if (patch) patch.setParam(inst, 'room', code); else inst.params.room = code; impl.redraw?.(true); }
        if (id === 'copy' && h.room) {
          const url = h.inviteUrl();
          (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => say('Invite link copied · ' + h.room), () => say(url));
        }
      },
      connected(inp, d) { const i = +inp.slice(2) - 1; live[i] = Math.max(0, live[i] + d); },
      resend() { sentAt.fill(0); }, // someone joined or the link came back: say every value again
      // received: published outputs of the chosen app become CV
      recv() {
        const t = ac.currentTime;
        for (let i = 0; i < SLOTS; i++) {
          const s = parseSrc(inst.params['s' + (i + 1)]); let v = 0;
          if (s && h) { const peer = h.peers.find(q => q.app === s.app), x = peer?.state?.[s.o]; if (typeof x === 'number' && Number.isFinite(x)) v = clamp(x, 0, 1); }
          cs[i].offset.setTargetAtTime(v, t, 0.03);
        }
      },
      // send slot i if its value moved, or to keep it alive; returns true when a message went out
      send(i, now) {
        const d = parseDest(inst.params['d' + (i + 1)]);
        if (!d || !live[i]) { if (cur[i]) release(i); return false; }
        const mode = clamp(Math.round(+inst.params['m' + (i + 1)]) || 0, 0, 3), c = cur[i];
        const same = c && c.to === d.to && c.p === d.p && c.mode === mode;
        if (c && !same) release(i); // re-aimed: the old control settles before the new one moves
        an[i].getFloatTimeDomainData(buf);
        let x = buf[buf.length - 1]; if (!Number.isFinite(x)) x = 0;
        let v = mode === 0 ? clamp(x, -1, 1) : mode === 1 ? clamp(x, 0, 1) : mode === 2 ? clamp((x + 1) / 2, 0, 1) : (x > 0.5 ? 1 : 0);
        v = Math.round(v * 1000) / 1000;
        const moved = !same || Math.abs(v - c.v) >= (mode === 3 ? 0.5 : 0.004);
        if (!moved && now - sentAt[i] < KEEPALIVE) return false;
        if (!(mode === 0 ? h.mod(d.to, d.p, v) : h.set(d.to, d.p, v))) return false;
        cur[i] = { to: d.to, p: d.p, mode, v }; sentAt[i] = now;
        return true;
      },
      dispose() {
        for (let i = 0; i < SLOTS; i++) release(i);
        insts.delete(inst);
        for (const n of [...an, ...cs]) { try { n.stop?.(); } catch { } try { n.disconnect(); } catch { } }
      },
    };
    insts.add(inst);
    startTimer();
    return impl;
  },

  // pickers under the buttons: choose destinations and sources from whoever is in the room
  ui(body, inst) {
    const host = inst.el;
    if (!host) return;
    const box = document.createElement('div'); box.className = 'others hands-map';
    host.classList.add('hands-mod');
    host.insertBefore(box, host.querySelector('.status') || host.querySelector('.io'));
    const setP = (id, v) => { const patch = globalThis.megacv?.patch; if (patch) patch.setParam(inst, id, v); else { inst.params[id] = v; inst.impl.set(id, v); } };
    const pick = (label, value, opts, onPick) => {
      const l = document.createElement('label'); l.className = 'sel';
      const sp = document.createElement('span'); sp.textContent = label;
      const s = document.createElement('select');
      s.add(new Option('— none —', ''));
      for (const [v, t] of opts) s.add(new Option(t, v));
      if (value && ![...s.options].some(o => o.value === value)) s.add(new Option(value.replace(/^\*\|/, 'Everyone|').replace(/^app:/, '').replace('|', ' · ') + ' (not here now)', value));
      s.value = value || ''; s.onchange = () => onPick(s.value); s.onblur = () => inst.impl.redraw(true);
      l.append(sp, s); return l;
    };
    // force = redraw even while a picker has focus (peers coming and going must not close an open menu)
    inst.impl.redraw = force => {
      const h = hands; if (!h) return;
      const peers = h.peers.filter(q => okId(q.app));
      const saved = String(inst.params.room || '');
      const n = peers.length;
      const st = h.status === 'on' ? `Linked · ${h.room} · ${n} other app${n === 1 ? '' : 's'}`
        : h.room ? `Connecting to ${h.room}…${h.error ? ' ' + h.error : ''}`
        : h.error ? h.error
        : saved ? `Not linked. Press Join to rejoin ${saved}.`
        : 'Not linked. Type a room code and press Enter, or press New room.';
      inst.status = st; if (inst.sayEl) inst.sayEl.textContent = st;
      if (h.room && inst.params.room !== h.room) inst.params.room = h.room; // joined from an invite link
      const roomBox = host.querySelector('.others input.txt[placeholder^="Room"]');
      if (roomBox && document.activeElement !== roomBox) roomBox.value = h.room || inst.params.room || '';
      if (!force && box.contains(document.activeElement)) return;

      // destinations: every control id once for "Everyone", then each app's own
      const dest = [], kinds = new Map(), apps = new Map();
      for (const q of peers) { if (!apps.has(q.app)) apps.set(q.app, q); for (const p of listOf(q.params)) if (!kinds.has(p.id)) kinds.set(p.id, p.kind); }
      for (const id of kinds.keys()) dest.push([`*|${id}`, `Everyone · ${id}`]);
      for (const q of apps.values()) for (const p of listOf(q.params)) dest.push([`app:${q.app}|${p.id}`, `${text(q.name, q.app)} · ${text(p.label, p.id)}`]);
      const src = [];
      for (const q of apps.values()) for (const o of listOf(q.outs)) src.push([`${q.app}|${o.id}`, `${text(q.name, q.app)} · ${text(o.label, o.id)}`]);
      box.textContent = '';
      for (let i = 1; i <= SLOTS; i++) {
        box.append(pick(`Send ${i} →`, inst.params['d' + i], dest, v => {
          const d = parseDest(v), kind = d && kinds.get(d.p);
          if (kind === 'trig' || kind === 'toggle') setP('m' + i, 3); // switches and triggers get gates
          setP('d' + i, v);
        }));
        const l = document.createElement('label'), sp = document.createElement('span'), s = document.createElement('select');
        l.className = 'sel'; sp.textContent = 'as';
        MODES.forEach((t, k) => s.add(new Option(t, k)));
        s.value = inst.params['m' + i]; s.onchange = () => setP('m' + i, +s.value); s.onblur = () => inst.impl.redraw(true);
        l.append(sp, s); box.append(l);
      }
      for (let i = 1; i <= SLOTS; i++) box.append(pick(`Recv ${i} ←`, inst.params['s' + i], src, v => setP('s' + i, v)));
    };
    inst.impl.redraw(true);
  },
});
