// MEGA-CV audio DSP. One AudioWorkletProcessor per module type.
// Conventions: audio/CV are the same signal. Pitch CV is 1.0 per octave. Gates/triggers are high above 0.5.
// Inputs and outputs are mono; their order matches the module definition in modules.js.
const SR = sampleRate, TAU = Math.PI * 2, ZERO = new Float32Array(128);
const clamp = (x, a, b) => x < a ? a : x > b ? b : x;
const rnd = () => Math.random() * 2 - 1;
const coef = t => 1 - Math.exp(-1 / (Math.max(t, 1e-5) * SR));
function blep(t, dt) {
  if (dt <= 0) return 0;
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}

function reg(name, params, init, proc) {
  registerProcessor(name, class extends AudioWorkletProcessor {
    static get parameterDescriptors() {
      return params ? params.split(' ').map(n => ({ name: n, defaultValue: 0, automationRate: 'k-rate' })) : [];
    }
    constructor() { super(); this.s = { port: this.port }; this.P = {}; this.I = []; this.O = []; init(this.s); }
    process(inputs, outputs, prm) {
      const P = this.P, I = this.I, O = this.O;
      for (const k in prm) P[k] = prm[k][0];
      for (let i = 0; i < inputs.length; i++) I[i] = inputs[i][0] || ZERO;
      for (let i = 0; i < outputs.length; i++) O[i] = outputs[i][0];
      proc(this.s, I, O, P, O.length ? O[0].length : 128);
      return true;
    }
  });
}

// ---------------------------------------------------------------- sources
reg('vco', 'freq fine fm pw', s => { s.ph = 0; s.ls = 0; }, (s, I, O, P, n) => {
  const vo = I[0], fm = I[1], pwm = I[2], sy = I[3];
  const base = P.freq * Math.pow(2, P.fine / 1200);
  for (let i = 0; i < n; i++) {
    const f = base * (vo[i] ? Math.pow(2, vo[i]) : 1) + fm[i] * P.fm * base;
    const dt = Math.min(Math.abs(f) / SR, 0.49);
    if (sy[i] > 0.5 && s.ls <= 0.5) s.ph = 0;
    s.ls = sy[i];
    s.ph += f / SR; s.ph -= Math.floor(s.ph);
    const p = s.ph, pw = clamp(P.pw + pwm[i] * 0.5, 0.02, 0.98);
    O[0][i] = Math.sin(TAU * p);
    O[1][i] = 1 - 4 * Math.abs(p - 0.5);
    O[2][i] = 2 * p - 1 - blep(p, dt);
    let q = p + 1 - pw; q -= Math.floor(q);
    O[3][i] = (p < pw ? 1 : -1) + blep(p, dt) - blep(q, dt);
  }
});

reg('lfo', 'rate uni', s => { s.ph = 0; s.lr = 0; s.r = rnd(); }, (s, I, O, P, n) => {
  const rc = I[0], rs = I[1], u = P.uni > 0.5;
  for (let i = 0; i < n; i++) {
    if (rs[i] > 0.5 && s.lr <= 0.5) s.ph = 0;
    s.lr = rs[i];
    s.ph += P.rate * (rc[i] ? Math.pow(2, rc[i] * 4) : 1) / SR;
    if (s.ph >= 1) { s.ph -= Math.floor(s.ph); s.r = rnd(); }
    const p = s.ph;
    let a = Math.sin(TAU * p), b = 1 - 4 * Math.abs(p - 0.5), c = 2 * p - 1, d = p < 0.5 ? 1 : -1, e = s.r;
    if (u) { a = a * 0.5 + 0.5; b = b * 0.5 + 0.5; c = c * 0.5 + 0.5; d = d * 0.5 + 0.5; e = e * 0.5 + 0.5; }
    O[0][i] = a; O[1][i] = b; O[2][i] = c; O[3][i] = d; O[4][i] = e;
  }
});

reg('noise', '', s => { s.b0 = s.b1 = s.b2 = s.br = 0; }, (s, I, O, P, n) => {
  for (let i = 0; i < n; i++) {
    const w = rnd();
    s.b0 = 0.99765 * s.b0 + w * 0.0990460; s.b1 = 0.96300 * s.b1 + w * 0.2965164; s.b2 = 0.57000 * s.b2 + w * 1.0526913;
    s.br = (s.br + 0.02 * w) / 1.02;
    O[0][i] = w; O[1][i] = (s.b0 + s.b1 + s.b2 + w * 0.1848) * 0.25; O[2][i] = s.br * 3.5;
  }
});

reg('fm', 'freq ratio index fb', s => { s.cp = s.mp = s.lm = 0; }, (s, I, O, P, n) => {
  const vo = I[0], ic = I[1], o = O[0];
  for (let i = 0; i < n; i++) {
    const f = P.freq * (vo[i] ? Math.pow(2, vo[i]) : 1);
    s.mp += f * P.ratio / SR; s.mp -= Math.floor(s.mp);
    s.cp += f / SR; s.cp -= Math.floor(s.cp);
    const m = Math.sin(TAU * s.mp + P.fb * 1.5 * s.lm); s.lm = m;
    o[i] = Math.sin(TAU * s.cp + Math.max(0, P.index + ic[i] * 4) * m);
  }
});

reg('harm', 'freq n tilt odd', s => { s.ph = 0; s.amp = new Float32Array(17); }, (s, I, O, P, n) => {
  const vo = I[0], o = O[0], N = clamp(Math.round(P.n), 1, 16), amp = s.amp;
  let sum = 0;
  for (let k = 1; k <= N; k++) { amp[k] = Math.pow(k, -P.tilt) * ((k & 1) ? 1 : 1 - P.odd); sum += amp[k]; }
  for (let i = 0; i < n; i++) {
    const f = P.freq * (vo[i] ? Math.pow(2, vo[i]) : 1);
    s.ph += f / SR; s.ph -= Math.floor(s.ph);
    const km = Math.min(N, Math.floor(SR * 0.45 / Math.max(f, 1)));
    let y = 0;
    for (let k = 1; k <= km; k++) y += amp[k] * Math.sin(TAU * k * s.ph);
    o[i] = y / sum;
  }
});

reg('pluck', 'freq damp decay', s => { s.b = new Float32Array(8192); s.w = 0; s.lt = 0; s.exc = 0; s.lp = 0; }, (s, I, O, P, n) => {
  const tr = I[0], vo = I[1], o = O[0], b = s.b;
  const g = 1 - Math.pow(10, -1 - 3 * P.decay), a = 1 - P.damp * 0.9;
  for (let i = 0; i < n; i++) {
    const N = clamp(SR / (P.freq * (vo[i] ? Math.pow(2, vo[i]) : 1)), 2, 8000);
    if (tr[i] > 0.5 && s.lt <= 0.5) s.exc = Math.ceil(N);
    s.lt = tr[i];
    const rp = s.w - N + 8192, i0 = Math.floor(rp), fr = rp - i0;
    const y = b[i0 & 8191] * (1 - fr) + b[(i0 + 1) & 8191] * fr;
    s.lp += a * (y - s.lp);
    const x = s.exc > 0 ? (s.exc--, rnd()) : 0;
    const out = x + s.lp * g;
    b[s.w] = out; s.w = (s.w + 1) & 8191;
    o[i] = out;
  }
});

reg('kick', 'freq decay sweep drive', s => { s.e = 0; s.pe = 0; s.ph = 0; s.lt = 0; }, (s, I, O, P, n) => {
  const tr = I[0], o = O[0], ke = Math.exp(-1 / (P.decay * SR)), kp = Math.exp(-1 / (0.03 * SR)), d = 1 + P.drive * 5;
  for (let i = 0; i < n; i++) {
    if (tr[i] > 0.5 && s.lt <= 0.5) { s.e = 1; s.pe = 1; s.ph = 0; }
    s.lt = tr[i];
    s.ph += P.freq * (1 + P.sweep * s.pe) / SR; s.ph -= Math.floor(s.ph);
    o[i] = Math.tanh(Math.sin(TAU * s.ph) * s.e * d) * 0.9;
    s.e *= ke; s.pe *= kp;
  }
});

reg('snare', 'tone decay snap', s => { s.e = s.be = s.ph = s.lt = s.lp = 0; }, (s, I, O, P, n) => {
  const tr = I[0], o = O[0], ke = Math.exp(-1 / (P.decay * SR)), kb = Math.exp(-1 / (0.07 * SR));
  for (let i = 0; i < n; i++) {
    if (tr[i] > 0.5 && s.lt <= 0.5) { s.e = 1; s.be = 1; s.ph = 0; }
    s.lt = tr[i];
    s.ph += P.tone * (1 + s.be * 0.6) / SR; s.ph -= Math.floor(s.ph);
    const w = rnd(); s.lp += 0.25 * (w - s.lp);
    o[i] = Math.tanh((Math.sin(TAU * s.ph) * s.be * 0.9 + (w - s.lp) * P.snap * s.e) * 1.4) * 0.8;
    s.e *= ke; s.be *= kb;
  }
});

const HAT = [2, 3, 4.16, 5.43, 6.79, 8.21];
reg('hat', 'tone decay', s => { s.e = s.lt = s.lp = 0; s.ph = new Float64Array(6); }, (s, I, O, P, n) => {
  const tr = I[0], o = O[0], ke = Math.exp(-1 / (P.decay * SR)), ph = s.ph;
  for (let i = 0; i < n; i++) {
    if (tr[i] > 0.5 && s.lt <= 0.5) s.e = 1;
    s.lt = tr[i];
    let x = 0;
    for (let j = 0; j < 6; j++) { ph[j] += P.tone * HAT[j] / SR; ph[j] -= Math.floor(ph[j]); x += ph[j] < 0.5 ? 1 : -1; }
    x = x / 6 + rnd() * 0.5;
    s.lp += 0.55 * (x - s.lp);
    o[i] = (x - s.lp) * s.e * 0.8;
    s.e *= ke;
  }
});

reg('chaos', 'rate', s => { s.x = 0.1; s.y = 0; s.z = 20; }, (s, I, O, P, n) => {
  const dt = Math.min(P.rate / SR, 0.01);
  for (let i = 0; i < n; i++) {
    const dx = 10 * (s.y - s.x), dy = s.x * (28 - s.z) - s.y, dz = s.x * s.y - 8 / 3 * s.z;
    s.x += dx * dt; s.y += dy * dt; s.z += dz * dt;
    O[0][i] = s.x / 20; O[1][i] = s.y / 27; O[2][i] = (s.z - 25) / 25;
  }
});

// ---------------------------------------------------------------- filters & shapers
reg('svf', 'cut res cva drive', s => { s.a = s.b = 0; s.g = 0.1; }, (s, I, O, P, n) => {
  const x = I[0], cv = I[1], k = 2 - 1.96 * P.res;
  for (let i = 0; i < n; i++) {
    if ((i & 15) === 0) s.g = Math.tan(Math.PI * clamp(P.cut * Math.pow(2, cv[i] * P.cva), 10, SR * 0.45) / SR);
    const g = s.g, a1 = 1 / (1 + g * (g + k)), a2 = g * a1, a3 = g * a2;
    const v0 = P.drive > 1.01 ? Math.tanh(x[i] * P.drive) : x[i];
    const v3 = v0 - s.b, v1 = a1 * s.a + a2 * v3, v2 = s.b + a2 * s.a + a3 * v3;
    s.a = 2 * v1 - s.a; s.b = 2 * v2 - s.b;
    O[0][i] = v2; O[1][i] = v1; O[2][i] = v0 - k * v1 - v2;
  }
});

reg('ladder', 'cut res cva drive', s => { s.y1 = s.y2 = s.y3 = s.y4 = 0; s.g = 0.1; }, (s, I, O, P, n) => {
  const x = I[0], cv = I[1], o = O[0], r = P.res * 4.2;
  for (let i = 0; i < n; i++) {
    if ((i & 15) === 0) s.g = 1 - Math.exp(-TAU * clamp(P.cut * Math.pow(2, cv[i] * P.cva), 10, SR * 0.22) / SR);
    const g = s.g, u = Math.tanh(x[i] * P.drive - r * s.y4);
    s.y1 += g * (u - s.y1); s.y2 += g * (s.y1 - s.y2); s.y3 += g * (s.y2 - s.y3); s.y4 += g * (s.y3 - s.y4);
    o[i] = s.y4 * (1 + P.res * 1.5);
  }
});

reg('fold', 'gain sym', s => {}, (s, I, O, P, n) => {
  const x = I[0], cv = I[1], o = O[0];
  for (let i = 0; i < n; i++) o[i] = Math.sin((x[i] * Math.max(0, P.gain + cv[i] * 10) + P.sym) * Math.PI / 2);
});

reg('drive', 'drive mode level', s => {}, (s, I, O, P, n) => {
  const x = I[0], o = O[0], m = Math.round(P.mode);
  for (let i = 0; i < n; i++) {
    const v = x[i] * P.drive;
    o[i] = P.level * (m === 0 ? Math.tanh(v) : m === 1 ? clamp(v, -1, 1) : (v > 0 ? 1 - Math.exp(-v) : -0.4 * (1 - Math.exp(v * 3))));
  }
});

reg('crush', 'bits rate', s => { s.acc = 1; s.h = 0; }, (s, I, O, P, n) => {
  const x = I[0], o = O[0], q = Math.pow(2, P.bits - 1), inc = Math.min(1, P.rate / SR);
  for (let i = 0; i < n; i++) {
    s.acc += inc;
    if (s.acc >= 1) { s.acc -= 1; s.h = Math.round(x[i] * q) / q; }
    o[i] = s.h;
  }
});

reg('phaser', 'rate depth fb mix', s => { s.ph = 0; s.z = new Float64Array(6); s.last = 0; s.a = 0; }, (s, I, O, P, n) => {
  const x = I[0], o = O[0], z = s.z;
  for (let i = 0; i < n; i++) {
    if ((i & 15) === 0) {
      s.ph += P.rate * 16 / SR; s.ph -= Math.floor(s.ph);
      const fc = 300 * Math.pow(16, P.depth * (0.5 + 0.5 * Math.sin(TAU * s.ph)));
      const t = Math.tan(Math.PI * Math.min(fc, SR * 0.4) / SR);
      s.a = (t - 1) / (t + 1);
    }
    let v = x[i] + s.last * P.fb;
    for (let j = 0; j < 6; j++) { const y = s.a * v + z[j]; z[j] = v - s.a * y; v = y; }
    s.last = v;
    o[i] = x[i] + v * P.mix;
  }
});

reg('reverb', 'size damp mix', s => {
  const k = SR / 44100;
  s.c = [1116, 1139, 1188, 1211, 1277, 1300, 1356, 1379, 1422, 1445, 1491, 1514].map(l => ({ b: new Float32Array(Math.round(l * k)), i: 0, lp: 0 }));
  s.a = [556, 579, 441, 464, 341, 364].map(l => ({ b: new Float32Array(Math.round(l * k)), i: 0 }));
}, (s, I, O, P, n) => {
  const x = I[0], fb = 0.7 + P.size * 0.285, d = P.damp * 0.8, C = s.c, A = s.a;
  for (let i = 0; i < n; i++) {
    const inp = x[i] * 0.06;
    for (let ch = 0; ch < 2; ch++) {
      let acc = 0;
      for (let j = ch; j < 12; j += 2) {
        const c = C[j], y = c.b[c.i];
        c.lp = y * (1 - d) + c.lp * d;
        c.b[c.i] = inp + c.lp * fb;
        if (++c.i >= c.b.length) c.i = 0;
        acc += y;
      }
      for (let j = ch; j < 6; j += 2) {
        const a = A[j], bo = a.b[a.i], y = bo - acc;
        a.b[a.i] = acc + bo * 0.5;
        if (++a.i >= a.b.length) a.i = 0;
        acc = y;
      }
      O[ch][i] = x[i] * (1 - P.mix) + acc * P.mix;
    }
  }
});

// ---------------------------------------------------------------- envelopes & modulation
reg('adsr', 'a d s r', s => { s.v = 0; s.st = 0; s.g = 0; }, (s, I, O, P, n) => {
  const gt = I[0], o = O[0], ka = coef(P.a / 3), kd = coef(P.d / 3), kr = coef(P.r / 3);
  for (let i = 0; i < n; i++) {
    const g = gt[i] > 0.5;
    if (g && !s.g) s.st = 1;
    if (!g) s.st = 0;
    s.g = g;
    if (s.st === 1) { s.v += (1.3 - s.v) * ka; if (s.v >= 1) { s.v = 1; s.st = 2; } }
    else if (s.st === 2) s.v += (P.s - s.v) * kd;
    else s.v += (0 - s.v) * kr;
    o[i] = s.v;
  }
});

reg('ad', 'rise fall curve loop', s => { s.v = 0; s.st = 0; s.lt = 0; s.eoc = 0; }, (s, I, O, P, n) => {
  const tr = I[0], ur = 1 / (P.rise * SR), uf = 1 / (P.fall * SR), e = Math.pow(2, -P.curve * 2);
  for (let i = 0; i < n; i++) {
    if (tr[i] > 0.5 && s.lt <= 0.5) s.st = 1;
    s.lt = tr[i];
    if (s.st === 0 && P.loop > 0.5) s.st = 1;
    if (s.st === 1) { s.v += ur; if (s.v >= 1) { s.v = 1; s.st = 2; } }
    else if (s.st === 2) { s.v -= uf; if (s.v <= 0) { s.v = 0; s.st = 0; s.eoc = SR * 0.005; } }
    O[0][i] = Math.pow(s.v, e);
    O[1][i] = s.eoc > 0 ? (s.eoc--, 1) : 0;
  }
});

reg('follow', 'att rel gain', s => { s.v = 0; }, (s, I, O, P, n) => {
  const x = I[0], o = O[0], ka = coef(P.att), kr = coef(P.rel);
  for (let i = 0; i < n; i++) {
    const a = Math.abs(x[i]) * P.gain;
    s.v += (a - s.v) * (a > s.v ? ka : kr);
    o[i] = s.v;
  }
});

reg('slew', 'rise fall', s => { s.v = 0; }, (s, I, O, P, n) => {
  const x = I[0], o = O[0], kr = coef(P.rise), kf = coef(P.fall);
  for (let i = 0; i < n; i++) { s.v += (x[i] - s.v) * (x[i] > s.v ? kr : kf); o[i] = s.v; }
});

reg('sh', '', s => { s.v = 0; s.lt = 0; }, (s, I, O, P, n) => {
  const x = I[0], tr = I[1], o = O[0];
  for (let i = 0; i < n; i++) { if (tr[i] > 0.5 && s.lt <= 0.5) s.v = x[i]; s.lt = tr[i]; o[i] = s.v; }
});

const SCALES = [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], [0, 2, 4, 5, 7, 9, 11], [0, 2, 3, 5, 7, 8, 10], [0, 2, 4, 7, 9], [0, 3, 5, 7, 10],
  [0, 2, 3, 5, 7, 9, 10], [0, 1, 3, 5, 7, 8, 10], [0, 2, 4, 6, 8, 10], [0, 7], [0]];
reg('quant', 'scale root', s => { s.li = NaN; s.lo = 0; s.key = -1; }, (s, I, O, P, n) => {
  const x = I[0], o = O[0], sc = SCALES[clamp(Math.round(P.scale), 0, SCALES.length - 1)], root = Math.round(P.root);
  const key = P.scale * 100 + root;
  if (key !== s.key) { s.key = key; s.li = NaN; }
  for (let i = 0; i < n; i++) {
    if (x[i] !== s.li) {
      s.li = x[i];
      const st = x[i] * 12 - root, oc = Math.floor(st / 12), r = st - oc * 12;
      let best = 0, bd = 99;
      for (let j = 0; j <= sc.length; j++) { const c = j < sc.length ? sc[j] : sc[0] + 12, d = Math.abs(c - r); if (d < bd) { bd = d; best = c; } }
      s.lo = (oc * 12 + best + root) / 12;
    }
    o[i] = s.lo;
  }
});

reg('logic', '', s => {}, (s, I, O, P, n) => {
  const a = I[0], b = I[1];
  for (let i = 0; i < n; i++) {
    const A = a[i] > 0.5, B = b[i] > 0.5;
    O[0][i] = a[i] > b[i] ? 1 : 0; O[1][i] = A && B ? 1 : 0; O[2][i] = A || B ? 1 : 0; O[3][i] = A !== B ? 1 : 0;
  }
});

// ---------------------------------------------------------------- clocks & sequencing
reg('clock', 'bpm run', s => { s.ph = 0; s.c = 0; s.lr = 0; }, (s, I, O, P, n) => {
  const rs = I[0], inc = P.bpm / 60 * 4 / SR, run = P.run > 0.5;
  for (let i = 0; i < n; i++) {
    if (rs[i] > 0.5 && s.lr <= 0.5) { s.ph = 0; s.c = 0; }
    s.lr = rs[i];
    const f = s.ph, c = s.c;
    O[0][i] = run && f < 0.5 ? 1 : 0;
    O[1][i] = run && ((c % 2) + f) / 2 < 0.5 ? 1 : 0;
    O[2][i] = run && ((c % 4) + f) / 4 < 0.5 ? 1 : 0;
    O[3][i] = run && (c + f) / 16 < 0.25 ? 1 : 0;
    if (run) { s.ph += inc; if (s.ph >= 1) { s.ph -= 1; s.c = (s.c + 1) % 16; } }
  }
});

reg('div', '', s => { s.c = -1; s.lc = 0; s.lr = 0; }, (s, I, O, P, n) => {
  const ck = I[0], rs = I[1];
  for (let i = 0; i < n; i++) {
    if (rs[i] > 0.5 && s.lr <= 0.5) s.c = -1;
    s.lr = rs[i];
    const h = ck[i] > 0.5;
    if (h && s.lc <= 0.5) s.c = (s.c + 1) % 48;
    s.lc = ck[i];
    const c = s.c;
    O[0][i] = h && c % 2 === 0 ? 1 : 0; O[1][i] = h && c % 3 === 0 ? 1 : 0; O[2][i] = h && c % 4 === 0 ? 1 : 0;
    O[3][i] = h && c % 8 === 0 ? 1 : 0; O[4][i] = h && c % 16 === 0 ? 1 : 0;
  }
});

reg('seq', 'len glide s0 s1 s2 s3 s4 s5 s6 s7', s => { s.i = -1; s.lc = 0; s.lr = 0; s.v = 0; }, (s, I, O, P, n) => {
  const ck = I[0], rs = I[1], len = clamp(Math.round(P.len), 1, 8), k = P.glide > 0.0005 ? coef(P.glide) : 1;
  const st = [P.s0, P.s1, P.s2, P.s3, P.s4, P.s5, P.s6, P.s7];
  for (let i = 0; i < n; i++) {
    if (rs[i] > 0.5 && s.lr <= 0.5) s.i = -1;
    s.lr = rs[i];
    if (ck[i] > 0.5 && s.lc <= 0.5) { s.i = (s.i + 1) % len; s.port.postMessage(s.i); }
    s.lc = ck[i];
    s.v += (st[s.i < 0 ? 0 : s.i] / 12 - s.v) * k;
    O[0][i] = s.v; O[1][i] = ck[i] > 0.5 ? 1 : 0;
  }
});

reg('turing', 'prob len range', s => { s.r = (Math.random() * 65536) | 0; s.lc = 0; s.bit = 0; }, (s, I, O, P, n) => {
  const ck = I[0], len = clamp(Math.round(P.len), 2, 16);
  for (let i = 0; i < n; i++) {
    if (ck[i] > 0.5 && s.lc <= 0.5) {
      let b = (s.r >> (len - 1)) & 1;
      if (Math.random() < P.prob) b = Math.random() < 0.5 ? 1 : 0;
      s.r = ((s.r << 1) | b) & 0xffff; s.bit = b;
    }
    s.lc = ck[i];
    O[0][i] = (s.r & 0xff) / 255 * P.range;
    O[1][i] = s.bit && ck[i] > 0.5 ? 1 : 0;
  }
});

reg('euclid', 'steps pulses rot', s => { s.i = -1; s.lc = 0; s.lr = 0; }, (s, I, O, P, n) => {
  const ck = I[0], rs = I[1], N = Math.max(1, Math.round(P.steps)), K = clamp(Math.round(P.pulses), 0, N), R = Math.round(P.rot);
  for (let i = 0; i < n; i++) {
    if (rs[i] > 0.5 && s.lr <= 0.5) s.i = -1;
    s.lr = rs[i];
    if (ck[i] > 0.5 && s.lc <= 0.5) s.i = (s.i + 1) % N;
    s.lc = ck[i];
    const hit = s.i >= 0 && ((s.i + R) * K) % N < K;
    O[0][i] = hit && ck[i] > 0.5 ? 1 : 0;
  }
});

// Pencil Tracer: loops a stretch of a drawing's pen path. The path arrives from the main thread as evenly spaced points.
reg('ptrace', 'freq span pos drift gain pp', s => {
  s.ph = 0; s.d = 0; s.n = 0; s.lr = 0; s.sy = 0; s.px = 0; s.py = 0; s.hx = 0; s.hy = 0;
  s.port.onmessage = e => { const m = e.data; s.X = m.x; s.Y = m.y; s.A = m.a; s.step = m.step; s.jump = m.jump; s.n = m.x.length; s.d = 0; };
}, (s, I, O, P, n) => {
  const N = s.n;
  if (N < 4) { for (const o of O) o.fill(0); return; }
  const vo = I[0], pc = I[1], sc = I[2], rs = I[3], X = s.X, Y = s.Y, A = s.A, pp = P.pp > 0.5, dd = P.drift / SR / s.step;
  for (let i = 0; i < n; i++) {
    if (rs[i] > 0.5 && s.lr <= 0.5) { s.ph = 0; s.d = 0; }
    s.lr = rs[i];
    s.ph += P.freq * (vo[i] ? Math.pow(2, vo[i]) : 1) / SR;
    if (s.ph >= 1) { s.ph -= Math.floor(s.ph); s.sy = 64; }
    s.d += dd; if (s.d >= N) s.d -= N; else if (s.d < 0) s.d += N;
    const W = clamp(P.span * (sc[i] ? Math.pow(2, sc[i] * 4) : 1) / s.step, 1, N - 1);
    let q = (P.pos + pc[i]) * (N - 1) + s.d + (pp ? 1 - Math.abs(2 * s.ph - 1) : s.ph) * W;
    q %= N; if (q < 0) q += N;
    const j = q | 0, j1 = j + 1 < N ? j + 1 : 0;
    let x = X[j], y = Y[j];
    const dx = X[j1] - x, dy = Y[j1] - y;
    if (dx * dx + dy * dy < s.jump) { x += dx * (q - j); y += dy * (q - j); } // never glide across a pen lift
    O[0][i] = x; O[1][i] = y;
    s.hx = x - s.px + 0.9993 * s.hx; s.px = x; s.hy = y - s.py + 0.9993 * s.hy; s.py = y; // remove the offset of where on the page we are
    O[2][i] = Math.tanh(s.hx * P.gain); O[3][i] = Math.tanh(s.hy * P.gain);
    O[4][i] = A[j];
    O[5][i] = s.sy > 0 ? (s.sy--, 1) : 0;
  }
});
