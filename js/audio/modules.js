// Audio module definitions. Worklet-backed modules (wk) map 1:1 onto processors in worklet.js;
// native modules (nat) are built from stock Web Audio nodes.
import { register, P, SEL, TOG, BTN, ports } from '../defs.js';

const base = (type, name, cat, o) => ({
  type, name, cat, domain: 'a', cols: o.cols, ui: o.ui,
  params: o.params || [], ins: ports(o.ins || [], 'a'), outs: ports(o.outs || [], 'a'),
});

function wk(type, name, cat, o) {
  const def = base(type, name, cat, o);
  def.create = ac => {
    const node = new AudioWorkletNode(ac, type, {
      numberOfInputs: def.ins.length, numberOfOutputs: def.outs.length,
      outputChannelCount: def.outs.map(() => 1), channelCount: 1, channelCountMode: 'explicit',
    });
    const impl = { node, ains: {}, aouts: {} };
    def.ins.forEach((p, i) => impl.ains[p.id] = [node, i]);
    def.outs.forEach((p, i) => impl.aouts[p.id] = [node, i]);
    const smooth = Object.fromEntries(def.params.map(p => [p.id, p.type === 'knob' && !p.step]));
    impl.set = (id, v, init) => {
      const prm = node.parameters.get(id);
      if (!prm) return;
      if (init || !smooth[id]) prm.setValueAtTime(v, ac.currentTime); else prm.setTargetAtTime(v, ac.currentTime, 0.012);
    };
    impl.dispose = () => { node.port.onmessage = null; node.disconnect(); };
    return impl;
  };
  register(def);
}

function nat(type, name, cat, o, build) {
  const def = base(type, name, cat, o);
  def.create = (ac, inst, env) => {
    const r = build(ac, env, inst), map = r.set || {}, d = r.dispose;
    r.set = (id, v, init) => {
      const t = map[id];
      if (!t) return;
      if (typeof t === 'function') t(v, init); else if (init) t.value = v; else t.setTargetAtTime(v, ac.currentTime, 0.015);
    };
    r.dispose = () => {
      d && d();
      for (const n of r.nodes || []) { try { n.stop && n.stop(); } catch { } try { n.disconnect(); } catch { } }
    };
    return r;
  };
  register(def);
}

const HZ = { exp: 1, unit: 'Hz' }, SEC = { exp: 1, unit: 's' };
const FREQ = (def = 130.81) => P('freq', 'Freq', 8, 8000, def, HZ);
const gain = (ac, v = 1) => { const g = ac.createGain(); g.gain.value = v; return g; };
const konst = (ac, v = 0) => { const c = ac.createConstantSource(); c.offset.value = v; c.start(); return c; };

// ================================================================ Oscillators / sources
wk('vco', 'VCO', 'Oscillators', {
  ins: ['voct:V/Oct', 'fm:FM', 'pwm:PWM', 'sync:Sync'], outs: ['sin:Sine', 'tri:Tri', 'saw:Saw', 'sqr:Square'],
  params: [FREQ(), P('fine', 'Fine', -100, 100, 0, { unit: 'c' }), P('fm', 'FM Amt', 0, 10, 1), P('pw', 'Width', 0.02, 0.98, 0.5)],
});
wk('fm', 'FM Op', 'Oscillators', {
  ins: ['voct:V/Oct', 'idx:Index'], outs: ['out'],
  params: [FREQ(), P('ratio', 'Ratio', 0.25, 16, 2, { step: 0.25 }), P('index', 'Index', 0, 12, 2), P('fb', 'Feedback', 0, 1, 0)],
});
wk('harm', 'Harmonic', 'Oscillators', {
  ins: ['voct:V/Oct'], outs: ['out'],
  params: [FREQ(), P('n', 'Partials', 1, 16, 8, { step: 1 }), P('tilt', 'Tilt', 0, 3, 1), P('odd', 'Odd', 0, 1, 0)],
});
wk('pluck', 'Pluck', 'Oscillators', {
  ins: ['trig:Trig', 'voct:V/Oct'], outs: ['out'],
  params: [FREQ(), P('damp', 'Damp', 0, 1, 0.3), P('decay', 'Decay', 0, 1, 0.8)],
});
wk('noise', 'Noise', 'Oscillators', { outs: ['white:White', 'pink:Pink', 'brown:Brown'] });

wk('kick', 'Kick', 'Drums', {
  ins: ['trig:Trig'], outs: ['out'],
  params: [P('freq', 'Pitch', 20, 200, 48, HZ), P('decay', 'Decay', 0.05, 2, 0.35, SEC), P('sweep', 'Sweep', 0, 8, 3), P('drive', 'Drive', 0, 1, 0.2)],
});
wk('snare', 'Snare', 'Drums', {
  ins: ['trig:Trig'], outs: ['out'],
  params: [P('tone', 'Tone', 80, 400, 180, HZ), P('decay', 'Decay', 0.03, 1, 0.18, SEC), P('snap', 'Snap', 0, 1, 0.7)],
});
wk('hat', 'Hi-Hat', 'Drums', {
  ins: ['trig:Trig'], outs: ['out'],
  params: [P('tone', 'Tone', 200, 1200, 540, HZ), P('decay', 'Decay', 0.01, 1, 0.05, SEC)],
});

// ================================================================ Filters
wk('svf', 'SVF Filter', 'Filters', {
  ins: ['in', 'cv:Cutoff'], outs: ['lp:LP', 'bp:BP', 'hp:HP'],
  params: [P('cut', 'Cutoff', 20, 18000, 800, HZ), P('res', 'Reso', 0, 1, 0.3), P('cva', 'CV Amt', -8, 8, 4, { unit: 'oct' }), P('drive', 'Drive', 1, 10, 1, { exp: 1 })],
});
wk('ladder', 'Ladder', 'Filters', {
  ins: ['in', 'cv:Cutoff'], outs: ['out'],
  params: [P('cut', 'Cutoff', 20, 10000, 800, HZ), P('res', 'Reso', 0, 1, 0.3), P('cva', 'CV Amt', -8, 8, 4, { unit: 'oct' }), P('drive', 'Drive', 0.2, 8, 1, { exp: 1 })],
});
nat('eq', 'EQ', 'Filters', {
  ins: ['in'], outs: ['out'],
  params: [P('low', 'Low', -18, 18, 0, { unit: 'dB' }), P('mid', 'Mid', -18, 18, 0, { unit: 'dB' }), P('midf', 'Mid Hz', 200, 5000, 1000, HZ), P('high', 'High', -18, 18, 0, { unit: 'dB' })],
}, ac => {
  const l = ac.createBiquadFilter(), m = ac.createBiquadFilter(), h = ac.createBiquadFilter();
  l.type = 'lowshelf'; l.frequency.value = 200; m.type = 'peaking'; m.Q.value = 0.8; h.type = 'highshelf'; h.frequency.value = 4000;
  l.connect(m).connect(h);
  return { ains: { in: l }, aouts: { out: h }, set: { low: l.gain, mid: m.gain, midf: m.frequency, high: h.gain }, nodes: [l, m, h] };
});

// ================================================================ Effects
wk('fold', 'Wavefolder', 'Effects', {
  ins: ['in', 'cv:Fold'], outs: ['out'],
  params: [P('gain', 'Fold', 1, 20, 2, { exp: 1 }), P('sym', 'Symmetry', -1, 1, 0)],
});
wk('drive', 'Drive', 'Effects', {
  ins: ['in'], outs: ['out'],
  params: [P('drive', 'Drive', 1, 50, 4, { exp: 1 }), SEL('mode', 'Mode', ['Soft', 'Hard', 'Fuzz']), P('level', 'Level', 0, 1, 0.7)],
});
wk('crush', 'Bitcrusher', 'Effects', {
  ins: ['in'], outs: ['out'],
  params: [P('bits', 'Bits', 1, 16, 8), P('rate', 'Rate', 200, 48000, 8000, HZ)],
});
wk('phaser', 'Phaser', 'Effects', {
  ins: ['in'], outs: ['out'],
  params: [P('rate', 'Rate', 0.02, 10, 0.4, HZ), P('depth', 'Depth', 0, 1, 0.8), P('fb', 'Feedback', 0, 0.95, 0.5), P('mix', 'Mix', 0, 1, 0.5)],
});
wk('reverb', 'Reverb', 'Effects', {
  ins: ['in'], outs: ['l:L', 'r:R'],
  params: [P('size', 'Size', 0, 1, 0.7), P('damp', 'Damp', 0, 1, 0.4), P('mix', 'Mix', 0, 1, 0.35)],
});
nat('delay', 'Delay', 'Effects', {
  ins: ['in', 'tcv:Time'], outs: ['out', 'wet:Wet'],
  params: [P('time', 'Time', 0.001, 2, 0.3, SEC), P('fb', 'Feedback', 0, 0.97, 0.4), P('tone', 'Tone', 200, 16000, 4000, HZ), P('mix', 'Mix', 0, 1, 0.35), P('mod', 'CV Amt', 0, 0.1, 0.005)],
}, ac => {
  const inp = gain(ac), d = ac.createDelay(4), lp = ac.createBiquadFilter(), fb = gain(ac, 0.4), wet = gain(ac, 0.35), dry = gain(ac, 0.65), o = gain(ac), tc = gain(ac, 0.005);
  inp.connect(dry).connect(o); inp.connect(d).connect(lp).connect(wet).connect(o); lp.connect(fb).connect(d); tc.connect(d.delayTime);
  return {
    ains: { in: inp, tcv: tc }, aouts: { out: o, wet: lp }, nodes: [inp, d, lp, fb, wet, dry, o, tc],
    set: { time: d.delayTime, fb: fb.gain, tone: lp.frequency, mod: tc.gain, mix: v => { wet.gain.setTargetAtTime(v, ac.currentTime, 0.02); dry.gain.setTargetAtTime(1 - v, ac.currentTime, 0.02); } },
  };
});
nat('chorus', 'Chorus', 'Effects', {
  ins: ['in'], outs: ['out'],
  params: [P('rate', 'Rate', 0.05, 8, 0.6, HZ), P('depth', 'Depth', 0, 1, 0.5), P('mix', 'Mix', 0, 1, 0.5)],
}, ac => {
  const inp = gain(ac), d1 = ac.createDelay(0.1), d2 = ac.createDelay(0.1), lfo = ac.createOscillator(), g1 = gain(ac, 0.002), g2 = gain(ac, -0.002), wet = gain(ac, 0.5), o = gain(ac);
  d1.delayTime.value = 0.012; d2.delayTime.value = 0.019; lfo.start();
  lfo.connect(g1).connect(d1.delayTime); lfo.connect(g2).connect(d2.delayTime);
  inp.connect(o); inp.connect(d1).connect(wet); inp.connect(d2).connect(wet); wet.connect(o);
  return {
    ains: { in: inp }, aouts: { out: o }, nodes: [inp, d1, d2, lfo, g1, g2, wet, o],
    set: { rate: lfo.frequency, mix: wet.gain, depth: v => { g1.gain.value = v * 0.004; g2.gain.value = -v * 0.004; } },
  };
});
nat('comp', 'Compressor', 'Effects', {
  ins: ['in'], outs: ['out'],
  params: [P('thr', 'Thresh', -60, 0, -24, { unit: 'dB' }), P('ratio', 'Ratio', 1, 20, 4), P('att', 'Attack', 0.001, 0.5, 0.005, SEC), P('rel', 'Release', 0.01, 1, 0.2, SEC), P('makeup', 'Makeup', 0, 4, 1)],
}, ac => {
  const c = ac.createDynamicsCompressor(), g = gain(ac);
  c.connect(g);
  return { ains: { in: c }, aouts: { out: g }, set: { thr: c.threshold, ratio: c.ratio, att: c.attack, rel: c.release, makeup: g.gain }, nodes: [c, g] };
});

// ================================================================ Modulation
wk('lfo', 'LFO', 'Modulation', {
  ins: ['rate:Rate', 'reset:Reset'], outs: ['sin:Sine', 'tri:Tri', 'saw:Saw', 'sqr:Square', 'rnd:S&H'],
  params: [P('rate', 'Rate', 0.01, 200, 1, HZ), TOG('uni', 'Unipolar')],
});
wk('adsr', 'ADSR', 'Modulation', {
  ins: ['gate:Gate'], outs: ['env:Env'],
  params: [P('a', 'Attack', 0.001, 5, 0.005, SEC), P('d', 'Decay', 0.001, 5, 0.15, SEC), P('s', 'Sustain', 0, 1, 0.4), P('r', 'Release', 0.001, 10, 0.25, SEC)],
});
wk('ad', 'AD / Function', 'Modulation', {
  ins: ['trig:Trig'], outs: ['out', 'eoc:EOC'],
  params: [P('rise', 'Rise', 0.001, 10, 0.01, SEC), P('fall', 'Fall', 0.001, 10, 0.3, SEC), P('curve', 'Curve', -1, 1, 0), TOG('loop', 'Loop')],
});
wk('chaos', 'Chaos', 'Modulation', { outs: ['x:X', 'y:Y', 'z:Z'], params: [P('rate', 'Rate', 0.05, 500, 1, { exp: 1 })] });
wk('follow', 'Env Follower', 'Modulation', {
  ins: ['in'], outs: ['out'],
  params: [P('att', 'Attack', 0.0005, 0.5, 0.005, SEC), P('rel', 'Release', 0.005, 5, 0.15, SEC), P('gain', 'Gain', 0.1, 20, 2, { exp: 1 })],
});
wk('slew', 'Slew', 'Modulation', {
  ins: ['in'], outs: ['out'],
  params: [P('rise', 'Rise', 0.0001, 5, 0.1, SEC), P('fall', 'Fall', 0.0001, 5, 0.1, SEC)],
});
wk('sh', 'Sample & Hold', 'Modulation', { ins: ['in', 'trig:Trig'], outs: ['out'] });

// ================================================================ Sequencing
wk('clock', 'Clock', 'Sequencing', {
  ins: ['reset:Reset'], outs: ['s16:1/16', 's8:1/8', 's4:1/4', 'bar:Bar'],
  params: [P('bpm', 'BPM', 30, 300, 120, { step: 1 }), TOG('run', 'Run', 1)],
});
wk('div', 'Clock Divider', 'Sequencing', { ins: ['clock:Clock', 'reset:Reset'], outs: ['d2:/2', 'd3:/3', 'd4:/4', 'd8:/8', 'd16:/16'] });
wk('seq', 'Sequencer', 'Sequencing', {
  ins: ['clock:Clock', 'reset:Reset'], outs: ['cv:CV', 'gate:Gate'], cols: 4,
  params: [...[0, 1, 2, 3, 4, 5, 6, 7].map(i => P('s' + i, 'Step ' + (i + 1), -24, 24, [0, 0, 12, 0, 7, 0, 3, 10][i], { step: 1, unit: 'st' })),
    P('len', 'Length', 1, 8, 8, { step: 1 }), P('glide', 'Glide', 0, 0.5, 0, { unit: 's' })],
  ui(body, inst) {
    const ks = [...body.querySelectorAll('.k')];
    inst.impl.node.port.onmessage = e => ks.forEach((k, i) => k.classList.toggle('step', i === e.data));
  },
});
wk('euclid', 'Euclid', 'Sequencing', {
  ins: ['clock:Clock', 'reset:Reset'], outs: ['gate:Gate'],
  params: [P('steps', 'Steps', 1, 32, 16, { step: 1 }), P('pulses', 'Pulses', 0, 32, 5, { step: 1 }), P('rot', 'Rotate', 0, 31, 0, { step: 1 })],
});
wk('turing', 'Turing', 'Sequencing', {
  ins: ['clock:Clock'], outs: ['cv:CV', 'gate:Gate'],
  params: [P('prob', 'Random', 0, 1, 0.2), P('len', 'Length', 2, 16, 8, { step: 1 }), P('range', 'Range', 0, 4, 2, { unit: 'oct' })],
});
wk('quant', 'Quantizer', 'Sequencing', {
  ins: ['in'], outs: ['out'],
  params: [SEL('scale', 'Scale', ['Chromatic', 'Major', 'Minor', 'Maj Pent', 'Min Pent', 'Dorian', 'Phrygian', 'Whole', 'Fifths', 'Octaves'], 4), P('root', 'Root', 0, 11, 0, { step: 1, unit: 'st' })],
});

// ================================================================ Utilities
nat('vca', 'VCA', 'Utilities', {
  ins: ['in', 'cv:CV'], outs: ['out'],
  params: [P('level', 'Level', 0, 2, 0), P('cva', 'CV Amt', 0, 2, 1)],
}, ac => {
  const g = gain(ac, 0), c = gain(ac);
  c.connect(g.gain);
  return { ains: { in: g, cv: c }, aouts: { out: g }, set: { level: g.gain, cva: c.gain }, nodes: [g, c] };
});
nat('mixer', 'Mixer', 'Utilities', {
  ins: ['a:A', 'b:B', 'c:C', 'd:D'], outs: ['out'],
  params: [P('la', 'A', 0, 1.5, 0.8), P('lb', 'B', 0, 1.5, 0.8), P('lc', 'C', 0, 1.5, 0.8), P('ld', 'D', 0, 1.5, 0.8), P('master', 'Master', 0, 1.5, 1)],
}, ac => {
  const o = gain(ac), g = [0, 1, 2, 3].map(() => { const x = gain(ac, 0.8); x.connect(o); return x; });
  return { ains: { a: g[0], b: g[1], c: g[2], d: g[3] }, aouts: { out: o }, set: { la: g[0].gain, lb: g[1].gain, lc: g[2].gain, ld: g[3].gain, master: o.gain }, nodes: [o, ...g] };
});
nat('ring', 'Ring Mod', 'Utilities', { ins: ['a:A', 'b:B'], outs: ['out'] }, ac => {
  const g = gain(ac, 0);
  return { ains: { a: g, b: g.gain }, aouts: { out: g }, nodes: [g] };
});
nat('atten', 'Offset / Atten', 'Utilities', {
  ins: ['in'], outs: ['out'],
  params: [P('gain', 'Gain', -2, 2, 1), P('offset', 'Offset', -1, 1, 0)],
}, ac => {
  const g = gain(ac), o = gain(ac), cs = konst(ac);
  g.connect(o); cs.connect(o);
  return { ains: { in: g }, aouts: { out: o }, set: { gain: g.gain, offset: cs.offset }, nodes: [g, o, cs] };
});
nat('pan', 'Panner', 'Utilities', {
  ins: ['in', 'cv:Pan'], outs: ['l:L', 'r:R'], params: [P('pan', 'Pan', -1, 1, 0)],
}, ac => {
  const p = ac.createStereoPanner(), sp = ac.createChannelSplitter(2);
  p.connect(sp);
  return { ains: { in: p, cv: p.pan }, aouts: { l: [sp, 0], r: [sp, 1] }, set: { pan: p.pan }, nodes: [p, sp] };
});
wk('logic', 'Logic', 'Utilities', { ins: ['a:A', 'b:B'], outs: ['gt:A>B', 'and:AND', 'or:OR', 'xor:XOR'] });

nat('scope', 'Scope', 'Utilities', {
  ins: ['in'], params: [P('time', 'Time', 128, 2048, 1024, { exp: 1, step: 1 }), P('gain', 'Gain', 0.2, 10, 1, { exp: 1 })],
  ui(body, inst) {
    const c = document.createElement('canvas');
    c.width = 184; c.height = 72; c.className = 'scope';
    body.after(c);
    inst.impl.ctx = c.getContext('2d');
  },
}, (ac, env, inst) => {
  const an = ac.createAnalyser(); an.fftSize = 4096; an.connect(env.sink);
  const buf = new Float32Array(4096);
  const r = { ains: { in: an }, aouts: {}, nodes: [an] };
  r.tick = () => {
    const g = r.ctx; if (!g || !g.canvas.offsetParent) return;
    an.getFloatTimeDomainData(buf);
    const W = 184, H = 72, N = Math.round(inst.params.time), k = inst.params.gain;
    let s = 0;
    for (let i = 1; i < 4096 - N; i++) if (buf[i - 1] <= 0 && buf[i] > 0) { s = i; break; }
    g.fillStyle = '#0b0d10'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#23303a'; g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.stroke();
    g.strokeStyle = '#ffb400'; g.lineWidth = 1.5; g.beginPath();
    for (let x = 0; x < W; x++) { const y = H / 2 - buf[s + Math.floor(x / W * N)] * k * H * 0.45; x ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.stroke();
  };
  return r;
});

// ================================================================ I/O
const KEYS = 'awsedftgyhujkolp';
nat('keys', 'Keyboard', 'Audio I/O', {
  outs: ['cv:V/Oct', 'gate:Gate'],
  params: [P('oct', 'Octave', -3, 3, 0, { step: 1 }), P('glide', 'Glide', 0, 0.5, 0, { unit: 's' }), BTN('midi', 'Enable MIDI')],
}, ac => {
  const cv = konst(ac), gate = konst(ac), held = [];
  let oct = 0, glide = 0;
  const upd = () => {
    const t = ac.currentTime;
    if (held.length) { cv.offset.setTargetAtTime((held[held.length - 1] - 60) / 12 + oct, t, glide / 3 + 0.001); gate.offset.setValueAtTime(1, t); }
    else gate.offset.setValueAtTime(0, t);
  };
  const down = n => { if (!held.includes(n)) held.push(n); upd(); };
  const up = n => { const i = held.indexOf(n); if (i >= 0) held.splice(i, 1); upd(); };
  const typing = e => e.repeat || e.metaKey || e.ctrlKey || e.altKey || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName);
  const kd = e => { const i = KEYS.indexOf(e.key.toLowerCase()); if (i >= 0 && !typing(e)) down(60 + i); };
  const ku = e => { const i = KEYS.indexOf(e.key.toLowerCase()); if (i >= 0) up(60 + i); };
  addEventListener('keydown', kd); addEventListener('keyup', ku);
  let midi = [];
  return {
    ains: {}, aouts: { cv, gate }, nodes: [cv, gate],
    set: { oct: v => { oct = v; upd(); }, glide: v => { glide = v; } },
    action() {
      navigator.requestMIDIAccess?.().then(ma => {
        for (const inp of ma.inputs.values()) {
          midi.push(inp);
          inp.onmidimessage = e => { const [st, n, v] = e.data, c = st & 0xf0; if (c === 0x90 && v > 0) down(n); else if (c === 0x80 || c === 0x90) up(n); };
        }
      }).catch(e => console.warn('MIDI unavailable', e));
    },
    dispose() { removeEventListener('keydown', kd); removeEventListener('keyup', ku); midi.forEach(m => m.onmidimessage = null); },
  };
});
nat('micin', 'Audio In', 'Audio I/O', {
  outs: ['out'], params: [P('gain', 'Gain', 0, 8, 1), BTN('on', 'Enable input')],
}, ac => {
  const g = gain(ac); let src, stream;
  return {
    ains: {}, aouts: { out: g }, set: { gain: g.gain }, nodes: [g],
    action() {
      if (stream) return;
      navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
        .then(st => { stream = st; src = ac.createMediaStreamSource(st); src.connect(g); }).catch(e => console.warn('Audio input unavailable', e));
    },
    dispose() { src?.disconnect(); stream?.getTracks().forEach(t => t.stop()); },
  };
});
nat('out', 'Audio Out', 'Audio I/O', {
  ins: ['in:Mono', 'l:L', 'r:R'], params: [P('vol', 'Volume', 0, 1, 0.6)],
}, (ac, env) => {
  const mk = () => { const g = gain(ac); g.channelCount = 1; g.channelCountMode = 'explicit'; return g; };
  const m = mk(), l = mk(), r = mk(), mg = ac.createChannelMerger(2), vol = gain(ac, 0.6), lim = ac.createDynamicsCompressor();
  lim.threshold.value = -4; lim.knee.value = 2; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.12;
  m.connect(mg, 0, 0); m.connect(mg, 0, 1); l.connect(mg, 0, 0); r.connect(mg, 0, 1);
  mg.connect(vol).connect(lim).connect(env.master);
  return { ains: { in: m, l, r }, aouts: {}, set: { vol: vol.gain }, nodes: [m, l, r, mg, vol, lim] };
});
