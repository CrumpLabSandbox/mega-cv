// Factory patches. Most are built by pairing an audio "bed" with a video "chain":
//  - a bed (AUD) is a self-contained audio patch that also names taps:
//      sig / sig2 = audio-rate signals, env = main rhythmic or slow CV, cv2 = second CV, lfo = slow drift
//  - a chain (VID) is a video patch ending in vout1, plus "hooks" that say where those taps plug in
// so any bed works with any chain. Compact notation:
//   mods:  'vco1' or ['vco1', { param: value }]   (type = id without trailing digits)
//   conns: 'from.out>to.in' or 'from.out>to.in*level'
import { registry } from './defs.js';

const AUD = {
  acid: {
    sig: 'mixer1.out', sig2: 'svf1.bp', env: 'follow1.out', cv2: 'adsr1.env', lfo: 'lfo1.sin',
    mods: [['clock1', { bpm: 126 }], ['seq1', { s0: 0, s1: 12, s2: 0, s3: 3, s4: 0, s5: 7, s6: 10, s7: -2, glide: 0.03 }], ['vco1', { freq: 65.41 }],
      ['adsr1', { a: 0.003, d: 0.2, s: 0.15, r: 0.12 }], ['svf1', { cut: 260, res: 0.78, cva: 4 }], 'vca1', ['lfo1', { rate: 0.07 }],
      ['delay1', { time: 0.357, fb: 0.45, mix: 0.3 }], 'kick1', ['euclid1', { steps: 16, pulses: 7 }], 'hat1',
      ['mixer1', { la: 0.7, lb: 0.9, lc: 0.3 }], 'follow1', ['out1', { vol: 0.6 }]],
    conns: ['clock1.s16>seq1.clock', 'seq1.cv>vco1.voct', 'clock1.s16>adsr1.gate', 'vco1.saw>svf1.in', 'adsr1.env>svf1.cv*0.6', 'lfo1.sin>svf1.cv*0.35',
      'svf1.lp>vca1.in', 'adsr1.env>vca1.cv', 'vca1.out>delay1.in', 'delay1.out>mixer1.a', 'clock1.s4>kick1.trig', 'kick1.out>mixer1.b',
      'clock1.s16>euclid1.clock', 'euclid1.gate>hat1.trig', 'hat1.out>mixer1.c', 'mixer1.out>out1.in', 'kick1.out>follow1.in'],
  },
  drone: {
    sig: 'ladder1.out', sig2: 'harm2.out', env: 'chaos1.x', cv2: 'chaos1.y', lfo: 'chaos1.z',
    mods: [['chaos1', { rate: 0.35 }], ['harm1', { freq: 55, n: 12, tilt: 1.2 }], ['harm2', { freq: 82.6, n: 6, tilt: 0.8, odd: 1 }], ['fm1', { freq: 110, ratio: 1.5, index: 2.5 }],
      ['mixer1', { la: 0.6, lb: 0.5, lc: 0.35 }], ['ladder1', { cut: 500, res: 0.45, cva: 2.5 }], ['phaser1', { rate: 0.08 }], ['reverb1', { size: 0.92, mix: 0.5 }], ['out1', { vol: 0.6 }]],
    conns: ['chaos1.x>harm1.voct*0.08', 'chaos1.y>fm1.idx*0.6', 'chaos1.z>ladder1.cv*0.7', 'chaos1.y>harm2.voct*0.04',
      'harm1.out>mixer1.a', 'harm2.out>mixer1.b', 'fm1.out>mixer1.c', 'mixer1.out>ladder1.in', 'ladder1.out>phaser1.in', 'phaser1.out>reverb1.in', 'reverb1.l>out1.l', 'reverb1.r>out1.r'],
  },
  drums: {
    sig: 'comp1.out', sig2: 'delay1.wet', env: 'follow1.out', cv2: 'follow2.out', lfo: 'lfo1.tri',
    mods: [['clock1', { bpm: 132 }], ['euclid1', { steps: 16, pulses: 4 }], ['euclid2', { steps: 16, pulses: 2, rot: 4 }], ['euclid3', { steps: 16, pulses: 11, rot: 2 }],
      'kick1', 'snare1', 'hat1', ['turing1', { prob: 0.15, len: 8, range: 2 }], ['quant1', { scale: 4 }], ['pluck1', { freq: 110, decay: 0.75 }],
      ['delay1', { time: 0.34, fb: 0.5, mix: 0.3 }], ['mixer1', { la: 0.9, lb: 0.6, lc: 0.3, ld: 0.6 }], 'comp1', 'follow1', ['follow2', { rel: 0.08 }], ['lfo1', { rate: 0.1 }], ['out1', { vol: 0.6 }]],
    conns: ['clock1.s16>euclid1.clock', 'clock1.s16>euclid2.clock', 'clock1.s16>euclid3.clock', 'euclid1.gate>kick1.trig', 'euclid2.gate>snare1.trig', 'euclid3.gate>hat1.trig',
      'clock1.s8>turing1.clock', 'turing1.cv>quant1.in', 'quant1.out>pluck1.voct', 'turing1.gate>pluck1.trig', 'pluck1.out>delay1.in',
      'kick1.out>mixer1.a', 'snare1.out>mixer1.b', 'hat1.out>mixer1.c', 'delay1.out>mixer1.d', 'mixer1.out>comp1.in', 'comp1.out>out1.in',
      'kick1.out>follow1.in', 'snare1.out>follow2.in'],
  },
  bells: {
    sig: 'vca1.out', sig2: 'fm1.out', env: 'ad1.out', cv2: 'turing1.cv', lfo: 'lfo1.sin',
    mods: [['clock1', { bpm: 90 }], ['turing1', { prob: 0.3, len: 5, range: 1 }], ['quant1', { scale: 3 }], ['fm1', { freq: 220, ratio: 3.5, index: 1 }], ['ad1', { rise: 0.002, fall: 0.6 }],
      'vca1', ['reverb1', { size: 0.85, mix: 0.5 }], ['lfo1', { rate: 0.1 }], ['out1', { vol: 0.6 }]],
    conns: ['clock1.s8>turing1.clock', 'turing1.cv>quant1.in*2', 'quant1.out>fm1.voct', 'turing1.gate>ad1.trig', 'clock1.s4>ad1.trig', 'ad1.out>vca1.cv', 'ad1.out>fm1.idx*0.5', 'fm1.out>vca1.in',
      'vca1.out>reverb1.in', 'reverb1.l>out1.l', 'reverb1.r>out1.r'],
  },
  pluck: {
    sig: 'mixer1.out', sig2: 'pluck2.out', env: 'follow1.out', cv2: 'seq1.cv', lfo: 'lfo1.sin',
    mods: [['clock1', { bpm: 110 }], ['euclid1', { steps: 16, pulses: 5 }], ['euclid2', { steps: 16, pulses: 3, rot: 2 }], ['seq1', { s0: 0, s1: 7, s2: 12, s3: 3, s4: 10, s5: 7, s6: 15, s7: 5 }],
      ['quant1', { scale: 2 }], ['turing1', { prob: 0.1, len: 6, range: 1.5 }], ['quant2', { scale: 2 }], ['pluck1', { freq: 220, decay: 0.85 }], ['pluck2', { freq: 110, decay: 0.9, damp: 0.5 }],
      ['mixer1', { la: 0.5, lb: 0.5 }], 'chorus1', ['delay1', { time: 0.41, fb: 0.5, mix: 0.35 }], ['reverb1', { mix: 0.4 }], 'follow1', ['lfo1', { rate: 0.06 }], ['out1', { vol: 0.6 }]],
    conns: ['clock1.s16>euclid1.clock', 'clock1.s16>euclid2.clock', 'clock1.s8>seq1.clock', 'seq1.cv>quant1.in', 'quant1.out>pluck1.voct', 'euclid1.gate>pluck1.trig',
      'clock1.s4>turing1.clock', 'turing1.cv>quant2.in', 'quant2.out>pluck2.voct', 'euclid2.gate>pluck2.trig', 'pluck1.out>mixer1.a', 'pluck2.out>mixer1.b',
      'mixer1.out>chorus1.in', 'chorus1.out>delay1.in', 'delay1.out>reverb1.in', 'reverb1.l>out1.l', 'reverb1.r>out1.r', 'mixer1.out>follow1.in'],
  },
  wobble: {
    sig: 'mixer1.out', sig2: 'ladder1.out', env: 'follow1.out', cv2: 'lfo1.sin', lfo: 'lfo2.sin',
    mods: [['clock1', { bpm: 140 }], ['euclid1', { steps: 16, pulses: 3 }], ['euclid2', { steps: 16, pulses: 2, rot: 4 }], ['kick1', { decay: 0.5 }], 'snare1',
      ['vco1', { freq: 55 }], ['vco2', { freq: 55.4 }], ['ladder1', { cut: 180, res: 0.55, cva: 3.5, drive: 2 }], ['lfo1', { rate: 4.667 }], ['lfo2', { rate: 0.11 }],
      ['drive1', { drive: 3, level: 0.6 }], ['mixer1', { la: 0.9, lb: 0.5, lc: 0.6 }], 'follow1', ['out1', { vol: 0.6 }]],
    conns: ['clock1.s16>euclid1.clock', 'clock1.s16>euclid2.clock', 'euclid1.gate>kick1.trig', 'euclid2.gate>snare1.trig', 'vco1.saw>ladder1.in*0.6', 'vco2.sqr>ladder1.in*0.5',
      'lfo1.sin>ladder1.cv*0.6', 'lfo2.sin>lfo1.rate*0.3', 'ladder1.out>drive1.in', 'kick1.out>mixer1.a', 'snare1.out>mixer1.b', 'drive1.out>mixer1.c', 'mixer1.out>out1.in', 'kick1.out>follow1.in'],
  },
  wind: {
    sig: 'svf1.bp', sig2: 'harm1.out', env: 'follow1.out', cv2: 'chaos1.x', lfo: 'chaos1.y',
    mods: ['noise1', ['svf1', { cut: 700, res: 0.8, cva: 2 }], ['lfo1', { rate: 0.09 }], ['chaos1', { rate: 0.25 }], ['harm1', { freq: 55, n: 5, tilt: 1.5 }], ['vca1', { level: 0.25 }],
      ['mixer1', { la: 0.9, lb: 0.5 }], ['reverb1', { size: 0.95, mix: 0.6 }], ['follow1', { gain: 6, rel: 0.4 }], ['out1', { vol: 0.6 }]],
    conns: ['noise1.pink>svf1.in', 'lfo1.sin>svf1.cv*0.5', 'chaos1.x>svf1.cv*0.5', 'svf1.bp>mixer1.a', 'harm1.out>vca1.in', 'chaos1.y>vca1.cv*0.2', 'vca1.out>mixer1.b',
      'mixer1.out>reverb1.in', 'reverb1.l>out1.l', 'reverb1.r>out1.r', 'svf1.bp>follow1.in'],
  },
  techno: {
    sig: 'comp1.out', sig2: 'ladder1.out', env: 'follow1.out', cv2: 'adsr1.env', lfo: 'lfo1.sin',
    mods: [['clock1', { bpm: 128 }], ['kick1', { decay: 0.3, drive: 0.5 }], ['euclid1', { steps: 16, pulses: 9 }], 'hat1', ['euclid2', { steps: 16, pulses: 2, rot: 4 }], ['snare1', { decay: 0.12 }],
      ['seq1', { s0: 0, s1: 0, s2: 12, s3: 0, s4: 0, s5: 3, s6: 0, s7: 10 }], ['vco1', { freq: 55 }], ['adsr1', { a: 0.002, d: 0.12, s: 0, r: 0.05 }], ['ladder1', { cut: 220, res: 0.6, cva: 3 }], 'vca1',
      ['mixer1', { la: 1, lb: 0.3, lc: 0.5, ld: 0.6 }], 'comp1', 'follow1', ['lfo1', { rate: 0.05 }], ['out1', { vol: 0.6 }]],
    conns: ['clock1.s4>kick1.trig', 'clock1.s16>euclid1.clock', 'euclid1.gate>hat1.trig', 'clock1.s16>euclid2.clock', 'euclid2.gate>snare1.trig', 'clock1.s16>seq1.clock', 'seq1.cv>vco1.voct',
      'clock1.s16>adsr1.gate', 'vco1.sqr>ladder1.in', 'adsr1.env>ladder1.cv*0.7', 'lfo1.sin>ladder1.cv*0.3', 'ladder1.out>vca1.in', 'adsr1.env>vca1.cv',
      'kick1.out>mixer1.a', 'hat1.out>mixer1.b', 'snare1.out>mixer1.c', 'vca1.out>mixer1.d', 'mixer1.out>comp1.in', 'comp1.out>out1.in', 'kick1.out>follow1.in'],
  },
  arps: {
    sig: 'delay1.out', sig2: 'vco2.saw', env: 'adsr1.env', cv2: 'seq2.cv', lfo: 'lfo1.sin',
    mods: [['clock1', { bpm: 100 }], ['seq1', { len: 5, s0: 0, s1: 7, s2: 12, s3: 15, s4: 19 }], ['seq2', { len: 7, s0: 0, s1: 0, s2: -5, s3: 0, s4: 3, s5: 0, s6: -2 }],
      ['vco1', { freq: 220 }], ['vco2', { freq: 220, fine: 7 }], ['adsr1', { a: 0.005, d: 0.2, s: 0.2, r: 0.3 }], ['svf1', { cut: 900, res: 0.4, cva: 3 }], 'vca1', ['mixer1', { la: 0.5, lb: 0.4 }],
      ['delay1', { time: 0.45, fb: 0.6, mix: 0.4 }], ['reverb1', { mix: 0.4 }], ['lfo1', { rate: 0.04 }], ['out1', { vol: 0.6 }]],
    conns: ['clock1.s16>seq1.clock', 'clock1.s4>seq2.clock', 'seq1.cv>vco1.voct', 'seq2.cv>vco1.voct', 'seq1.cv>vco2.voct', 'seq2.cv>vco2.voct', 'clock1.s16>adsr1.gate',
      'vco1.tri>mixer1.a', 'vco2.saw>mixer1.b', 'mixer1.out>svf1.in', 'adsr1.env>svf1.cv*0.5', 'lfo1.sin>svf1.cv*0.4', 'svf1.lp>vca1.in', 'adsr1.env>vca1.cv',
      'vca1.out>delay1.in', 'delay1.out>reverb1.in', 'reverb1.l>out1.l', 'reverb1.r>out1.r'],
  },
  scifi: {
    sig: 'delay1.out', sig2: 'vco1.sin', env: 'slew1.out', cv2: 'lfo1.sin', lfo: 'lfo1.tri',
    mods: [['vco1', { freq: 200 }], ['vco2', { freq: 317 }], 'ring1', ['lfo1', { rate: 0.13 }], ['lfo2', { rate: 5 }], ['slew1', { rise: 0.05, fall: 0.2 }], ['fold1', { gain: 2.5 }],
      ['delay1', { time: 0.23, fb: 0.55, mix: 0.4 }], ['out1', { vol: 0.4 }]],
    conns: ['vco1.sin>ring1.a', 'vco2.sin>ring1.b', 'lfo1.sin>vco1.voct*0.4', 'lfo2.rnd>slew1.in', 'slew1.out>vco2.voct*0.8', 'ring1.out>fold1.in', 'lfo1.tri>fold1.cv*0.15',
      'fold1.out>delay1.in', 'delay1.out>out1.in'],
  },
  pulse: {
    sig: 'mixer1.out', sig2: 'harm1.out', env: 'follow1.out', cv2: 'ad1.out', lfo: 'lfo1.sin',
    mods: [['clock1', { bpm: 60 }], ['kick1', { freq: 40, decay: 0.9, sweep: 2 }], ['harm1', { freq: 55, n: 6, tilt: 1.4 }], ['ad1', { rise: 0.3, fall: 1.5 }], 'vca1',
      ['reverb1', { size: 0.9, mix: 0.5 }], ['mixer1', { la: 0.9, lb: 0.6 }], ['follow1', { rel: 0.5 }], ['lfo1', { rate: 0.03 }], ['out1', { vol: 0.6 }]],
    conns: ['clock1.s4>kick1.trig', 'clock1.bar>ad1.trig', 'ad1.out>vca1.cv', 'harm1.out>vca1.in', 'kick1.out>mixer1.a', 'vca1.out>mixer1.b', 'mixer1.out>reverb1.in',
      'reverb1.l>out1.l', 'reverb1.r>out1.r', 'kick1.out>follow1.in'],
  },
  glitch: {
    sig: 'crush1.out', sig2: 'kick1.out', env: 'follow1.out', cv2: 'turing1.cv', lfo: 'lfo1.sin',
    mods: [['clock1', { bpm: 150 }], ['turing1', { prob: 0.25, len: 7, range: 1 }], 'div1', 'kick1', ['snare1', { decay: 0.08 }], ['hat1', { decay: 0.03 }],
      ['mixer1', { la: 0.9, lb: 0.5, lc: 0.3 }], ['crush1', { bits: 6, rate: 9000 }], 'follow1', ['lfo1', { rate: 0.2 }], ['out1', { vol: 0.55 }]],
    conns: ['clock1.s16>turing1.clock', 'turing1.gate>kick1.trig', 'clock1.s16>div1.clock', 'div1.d3>snare1.trig', 'clock1.s8>hat1.trig', 'kick1.out>mixer1.a', 'snare1.out>mixer1.b',
      'hat1.out>mixer1.c', 'mixer1.out>crush1.in', 'crush1.out>out1.in', 'kick1.out>follow1.in'],
  },
  keys: {
    sig: 'vca1.out', sig2: 'vco2.sqr', env: 'adsr1.env', cv2: 'keys1.cv', lfo: 'lfo1.sin',
    mods: ['keys1', ['vco1', { freq: 261.63 }], ['vco2', { freq: 261.63, fine: -9 }], ['adsr1', { a: 0.01, d: 0.3, s: 0.6, r: 0.5 }], ['svf1', { cut: 1200, res: 0.3, cva: 2 }], 'vca1',
      ['mixer1', { la: 0.5, lb: 0.4 }], 'chorus1', ['reverb1', { mix: 0.3 }], ['lfo1', { rate: 0.2 }], ['out1', { vol: 0.6 }]],
    conns: ['keys1.cv>vco1.voct', 'keys1.cv>vco2.voct', 'keys1.gate>adsr1.gate', 'vco1.saw>mixer1.a', 'vco2.sqr>mixer1.b', 'mixer1.out>svf1.in', 'adsr1.env>svf1.cv*0.5', 'svf1.lp>vca1.in',
      'adsr1.env>vca1.cv', 'vca1.out>chorus1.in', 'chorus1.out>reverb1.in', 'reverb1.l>out1.l', 'reverb1.r>out1.r'],
  },
  mic: {
    sig: 'micin1.out', sig2: 'svf1.hp', env: 'follow1.out', cv2: 'follow2.out', lfo: 'lfo1.sin',
    mods: ['micin1', ['svf1', { cut: 250, res: 0.1 }], ['follow1', { gain: 6 }], ['follow2', { gain: 10, rel: 0.08 }], ['lfo1', { rate: 0.08 }]],
    conns: ['micin1.out>svf1.in', 'svf1.lp>follow1.in', 'svf1.hp>follow2.in'],
  },
  silent: { // nothing reaches the speakers: slow modulators plus two unheard oscillators for the scopes
    sig: 'vco1.saw', sig2: 'vco2.sin', env: 'chaos1.x', cv2: 'chaos1.y', lfo: 'lfo1.sin',
    mods: [['lfo1', { rate: 0.1 }], ['lfo2', { rate: 0.037 }], ['chaos1', { rate: 0.4 }], ['vco1', { freq: 110 }], ['vco2', { freq: 165.4 }]],
    conns: ['chaos1.x>vco1.voct*0.3', 'lfo2.sin>vco2.voct*0.2'],
  },
};

const chain = (...ids) => ids.slice(1).map((id, i) => `${ids[i]}.out>${id}.a`);
const VID = {
  mandala: {
    mods: [['vosc1', { geom: 1, freq: 5, speed: 0.5 }], ['colorize1', { range: 0.7, cycle: 0.05 }], ['ascope1', { gain: 1.5, thick: 0.5 }], 'blend1',
      ['feedback1', { zoom: 1.04, decay: 0.9, hsh: 0.012 }], ['kaleid1', { segs: 6, spin: 0.02 }], 'vout1'],
    conns: ['vosc1.out>colorize1.a', 'colorize1.out>blend1.a', 'ascope1.out>blend1.b', ...chain('blend1', 'feedback1', 'kaleid1', 'vout1')],
    hooks: ['$sig>ascope1.sig', '$env>vosc1.freq*0.6', '$lfo>feedback1.ang*0.15', '$cv2>colorize1.hue*0.3'],
  },
  julia: {
    mods: [['julia1', { cx: -0.78, cy: 0.16, zoom: 1.1 }], ['colorize1', { range: 1.4, cycle: 0.03, hue: 0.55, full: 0.5 }], ['plasma1', { scale: 2, speed: 0.3 }],
      ['displace1', { dx: 0.08, dy: 0.08, mode: 2 }], ['glow1', { th: 0.5, amt: 0.8 }], ['crt1', { scan: 0.25, curve: 0.2 }], 'vout1'],
    conns: ['julia1.out>colorize1.a', 'colorize1.out>displace1.a', 'plasma1.out>displace1.b', ...chain('displace1', 'glow1', 'crt1', 'vout1')],
    hooks: ['$env>julia1.cx*0.12', '$cv2>julia1.cy*0.12', '$lfo>julia1.ang*0.2'],
  },
  strobe: {
    mods: [['shape1', { sides: 6, size: 0.12, ring: 0.05, spin: 0.1 }], ['pattern1', { sx: 12, sy: 12, scx: 0.3 }], ['blend1', { mode: 3 }], ['colorize1', { range: 0.4, hue: 0.9, full: 0.3 }],
      ['glitch1', { amt: 0 }], ['rgbsplit1', { amt: 0, radial: 1 }], 'crt1', 'vout1'],
    conns: ['shape1.out>blend1.a', 'pattern1.out>blend1.b', ...chain('blend1', 'colorize1', 'glitch1', 'rgbsplit1', 'crt1', 'vout1')],
    hooks: ['$env>shape1.size*1.2', '$cv2>glitch1.amt*1.5', '$env>rgbsplit1.amt', '$lfo>colorize1.hue*0.3'],
  },
  life: {
    mods: [['vnoise1', { kind: 2, scale: 3, speed: 0.15 }], ['compare1', { th: 0.72 }], ['life1', { cell: 4, rate: 3, chaos: 0.1 }], ['blur1', { radius: 5 }],
      ['colorize1', { range: 0.9, hue: 0.5, cycle: 0.02 }], ['feedback1', { zoom: 0.99, decay: 0.94, hsh: 0.01 }], 'vout1'],
    conns: chain('vnoise1', 'compare1', 'life1', 'blur1', 'colorize1', 'feedback1', 'vout1'),
    hooks: ['$lfo>compare1.th*0.08', '$env>life1.chaos*0.4', '$cv2>colorize1.hue*0.3'],
  },
  tunnel: {
    mods: [['pattern1', { sx: 6, sy: 6 }], ['colorize1', { range: 0.5, hue: 0.6, full: 0.6 }], ['tunnel1', { speed: 0.5, reps: 3 }], ['rgbsplit1', { amt: 0.15, radial: 1 }], 'vout1'],
    conns: chain('pattern1', 'colorize1', 'tunnel1', 'rgbsplit1', 'vout1'),
    hooks: ['$env>tunnel1.speed*0.5', '$lfo>tunnel1.twist*0.5', '$cv2>rgbsplit1.amt*0.6', '$lfo>colorize1.hue*0.4'],
  },
  scopewall: {
    mods: [['ascope1', { gain: 1.2, thick: 0.6 }], ['trails1', { decay: 0.93 }], ['mirror1', { mode: 2 }], ['glow1', { th: 0.3, amt: 1 }], 'vout1'],
    conns: chain('ascope1', 'trails1', 'mirror1', 'glow1', 'vout1'),
    hooks: ['$sig>ascope1.sig', '$cv2>ascope1.hue*0.5', '$env>glow1.amt*0.5'],
  },
  spectro: {
    mods: [['spectrum1', { style: 2, gain: 1.4 }], 'hsv1', ['warp1', { kind: 0, freq: 4, amp: 0.1, speed: 0.5 }], 'vout1'],
    conns: chain('spectrum1', 'hsv1', 'warp1', 'vout1'),
    hooks: ['$sig>spectrum1.sig', '$lfo>warp1.amp*0.3', '$env>hsv1.bri*0.3', '$cv2>hsv1.hue*0.2'],
  },
  lissajous: {
    mods: [['xyscope1', { gain: 0.9, decay: 0.93, thick: 0.25 }], ['feedback1', { zoom: 1.02, decay: 0.9, hsh: 0.02 }], ['glow1', { th: 0.3, amt: 0.8 }], 'vout1'],
    conns: chain('xyscope1', 'feedback1', 'glow1', 'vout1'),
    hooks: ['$sig>xyscope1.x', '$sig2>xyscope1.y', '$lfo>feedback1.ang*0.1', '$cv2>xyscope1.hue*0.4'],
  },
  cells: {
    mods: [['voronoi1', { kind: 2, scale: 5 }], ['colorize1', { range: 0.8, hue: 0.1, full: 0.3 }], ['kaleid1', { segs: 8 }], ['trails1', { decay: 0.85 }], 'vout1'],
    conns: chain('voronoi1', 'colorize1', 'kaleid1', 'trails1', 'vout1'),
    hooks: ['$env>voronoi1.scale*0.3', '$lfo>kaleid1.ang*0.3', '$cv2>colorize1.hue*0.4'],
  },
  plasma: {
    mods: [['plasma1', { scale: 3 }], ['warp1', { kind: 2, freq: 10, amp: 0.4 }], ['levels1', { lev: 6 }], 'vout1'],
    conns: chain('plasma1', 'warp1', 'levels1', 'vout1'),
    hooks: ['$env>plasma1.cplx*0.6', '$lfo>warp1.amp*0.4', '$cv2>plasma1.hue*0.4'],
  },
  lava: {
    mods: [['blobs1', { size: 0.16 }], ['blur1', { radius: 10 }], ['colorize1', { range: 0.35, hue: 0.02, sat: 1 }], ['feedback1', { mode: 4, zoom: 0.99, py: 0.004, decay: 0.96 }], 'vout1'],
    conns: chain('blobs1', 'blur1', 'colorize1', 'feedback1', 'vout1'),
    hooks: ['$env>blobs1.size*0.5', '$cv2>blobs1.spread*0.4', '$lfo>colorize1.hue*0.2'],
  },
  rgbosc: {
    mods: [['vosc1', { freq: 4, speed: 0.3 }], ['vosc2', { freq: 7, geom: 1, speed: -0.4, shape: 1 }], ['vosc3', { freq: 5, geom: 3, speed: 0.2 }], 'rgbcomb1', ['xform1', { spin: 0.03 }], 'vout1'],
    conns: ['vosc1.out>rgbcomb1.a', 'vosc2.out>rgbcomb1.b', 'vosc3.out>rgbcomb1.c', ...chain('rgbcomb1', 'xform1', 'vout1')],
    hooks: ['$env>vosc1.freq*0.4', '$cv2>vosc2.ang*0.3', '$lfo>vosc3.freq*0.3', '$lfo>xform1.zoom*0.2'],
  },
  oscfm: {
    mods: [['vosc1', { freq: 3, speed: 0.2 }], ['vosc2', { freq: 9, geom: 1, fm: 1.2, speed: 0.4 }], ['colorize1', { range: 1, full: 0.4 }], ['mirror1', { mode: 2 }], 'vout1'],
    conns: chain('vosc1', 'vosc2', 'colorize1', 'mirror1', 'vout1'),
    hooks: ['$env>vosc2.fm*0.6', '$cv2>vosc1.freq*0.3', '$lfo>vosc1.ang*0.5', '$lfo>colorize1.hue*0.3'],
  },
  halftone: {
    mods: [['plasma1', { scale: 2.5, sat: 0.9 }], ['halftone1', { size: 10, col: 1 }], ['hsv1', { con: 1.4 }], 'vout1'],
    conns: chain('plasma1', 'halftone1', 'hsv1', 'vout1'),
    hooks: ['$env>halftone1.size*0.4', '$lfo>halftone1.ang*0.3', '$cv2>hsv1.hue*0.3'],
  },
  brokentv: {
    mods: [['pattern1', { kind: 3, sx: 10, thick: 0.4 }], ['vnoise1', { kind: 1, scale: 6, speed: 1.5 }], ['displace1', { dx: 0.15, dy: 0 }], ['glitch1', { amt: 0.15 }],
      ['crt1', { scan: 0.7, curve: 0.6, noisy: 0.3, mask: 0.6 }], 'vout1'],
    conns: ['pattern1.out>displace1.a', 'vnoise1.out>displace1.b', ...chain('displace1', 'glitch1', 'crt1', 'vout1')],
    hooks: ['$env>displace1.dx*0.5', '$cv2>glitch1.amt', '$lfo>pattern1.ang*0.1'],
  },
  edgeglow: {
    mods: [['plasma1', { scale: 2.5 }], ['edge1', { gain: 3, col: 1 }], ['trails1', { decay: 0.9 }], 'vout1'],
    conns: chain('plasma1', 'edge1', 'trails1', 'vout1'),
    hooks: ['$env>edge1.gain*0.4', '$cv2>plasma1.scale*0.3', '$lfo>plasma1.hue*0.5'],
  },
  mosaic: {
    mods: [['plasma1', { scale: 2 }], ['pixel1', { size: 24 }], ['levels1', { lev: 5 }], 'vout1'],
    conns: chain('plasma1', 'pixel1', 'levels1', 'vout1'),
    hooks: ['$env>pixel1.size*0.5', '$cv2>levels1.gam*0.3', '$lfo>plasma1.hue*0.5'],
  },
  kaleidnoise: {
    mods: [['vnoise1', { kind: 2, scale: 2.5 }], ['colorize1', { range: 1.2, full: 0.3 }], ['kaleid1', { segs: 10, spin: 0.03 }], ['glow1', { th: 0.5 }], 'vout1'],
    conns: chain('vnoise1', 'colorize1', 'kaleid1', 'glow1', 'vout1'),
    hooks: ['$env>kaleid1.zoom*0.3', '$lfo>kaleid1.ang*0.4', '$cv2>colorize1.hue*0.4'],
  },
  ramps: {
    mods: [['ramp1', { geom: 2, rep: 6 }], ['ramp2', { geom: 1, rep: 4 }], ['blend1', { mode: 3 }], ['colorize1', { range: 0.8, full: 0.5 }], ['warp1', { kind: 3, freq: 4, amp: 0.3 }], 'vout1'],
    conns: ['ramp1.out>blend1.a', 'ramp2.out>blend1.b', ...chain('blend1', 'colorize1', 'warp1', 'vout1')],
    hooks: ['$env>ramp2.ofs*0.6', '$lfo>ramp1.ang*0.8', '$cv2>warp1.amp*0.5', '$lfo>colorize1.hue*0.3'],
  },
  keyed: {
    mods: [['shape1', { sides: 5, size: 0.3, ring: 0.08, spin: 0.2 }], ['plasma1', { scale: 3 }], ['key1', { th: 0.5 }], ['trails1', { decay: 0.88 }], ['rgbsplit1', { amt: 0.1 }], 'vout1'],
    conns: ['shape1.out>key1.a', 'plasma1.out>key1.b', ...chain('key1', 'trails1', 'rgbsplit1', 'vout1')],
    hooks: ['$env>shape1.size*0.9', '$cv2>shape1.px*0.6', '$lfo>shape1.py*0.6', '$env>rgbsplit1.amt*0.6'],
  },
  bars: {
    mods: [['spectrum1', { style: 0, bars: 48, gain: 1.3 }], ['mirror1', { mode: 0 }], ['glow1', { th: 0.4, amt: 0.8 }], ['crt1', { scan: 0.3 }], 'vout1'],
    conns: chain('spectrum1', 'mirror1', 'glow1', 'crt1', 'vout1'),
    hooks: ['$sig>spectrum1.sig', '$env>glow1.amt*0.5', '$lfo>spectrum1.hue*0.4'],
  },
  radial: {
    mods: [['ascope1', { style: 3, gain: 1.5, thick: 0.6 }], ['feedback1', { zoom: 1.05, hsh: 0.02, decay: 0.93 }], ['kaleid1', { segs: 4 }], 'vout1'],
    conns: chain('ascope1', 'feedback1', 'kaleid1', 'vout1'),
    hooks: ['$sig>ascope1.sig', '$env>feedback1.zoom*0.1', '$lfo>feedback1.ang*0.1', '$cv2>ascope1.hue*0.5'],
  },
  grid: {
    mods: [['pattern1', { kind: 1, sx: 8, sy: 8, thick: 0.15 }], ['xform1', { zoom: 1.2, spin: 0.05 }], ['feedback1', { mode: 4, zoom: 1.08, decay: 0.95 }], ['colorize1', { range: 0.6, hue: 0.5, full: 0.2 }], 'vout1'],
    conns: chain('pattern1', 'xform1', 'feedback1', 'colorize1', 'vout1'),
    hooks: ['$env>xform1.zoom*0.3', '$lfo>xform1.ang*0.4', '$cv2>colorize1.hue*0.4'],
  },
  // ---- 3D worlds: a source chain feeds the splat cloud (a) and the sky (b) of World 3D
  worldplasma: {
    mods: [['plasma1', { scale: 3 }], ['vnoise1', { kind: 2, scale: 2, speed: 0.1 }], ['colorize1', { range: 1.2, hue: 0.6, full: 0.2 }], ['world1', { morph: 1, disp: 1.5 }], ['glow1', { th: 0.5, amt: 0.6 }], 'vout1'],
    conns: ['plasma1.out>world1.a', 'vnoise1.out>colorize1.a', 'colorize1.out>world1.b', ...chain('world1', 'glow1', 'vout1')],
    hooks: ['$env>world1.disp*0.5', '$lfo>world1.morph*0.6', '$cv2>world1.twist*0.3', '$cv2>plasma1.hue*0.4'],
  },
  worldscope: {
    mods: [['ascope1', { gain: 1.5, thick: 1 }], ['feedback1', { zoom: 1.04, decay: 0.93, hsh: 0.02 }], ['spectrum1', { style: 2 }], ['world1', { morph: 2, disp: 2, size: 2 }], 'vout1'],
    conns: ['ascope1.out>feedback1.a', 'feedback1.out>world1.a', 'spectrum1.out>world1.b', 'world1.out>vout1.a'],
    hooks: ['$sig>ascope1.sig', '$sig>spectrum1.sig', '$env>world1.disp*0.6', '$lfo>world1.morph*0.5', '$cv2>world1.size*0.3'],
  },
  worldfeedback: { // the world looks at its own output: the 3D render is fed back as its splat texture
    mods: [['vosc1', { geom: 3, freq: 6, speed: 0.4 }], ['colorize1', { range: 1, full: 0.5 }], ['vmix1', { mixv: 0.55 }], ['world1', { morph: 0.4, disp: 2.5, sky: 0.15 }], ['hsv1', { hue: 0.03 }], 'vout1'],
    conns: ['vosc1.out>colorize1.a', 'colorize1.out>vmix1.a', 'hsv1.out>vmix1.b', 'vmix1.out>world1.a', 'colorize1.out>world1.b', 'world1.out>hsv1.a', 'world1.out>vout1.a'],
    hooks: ['$env>world1.disp*0.5', '$lfo>world1.twist*0.5', '$cv2>vosc1.freq*0.3', '$lfo>vmix1.mixv*0.3'],
  },
  worldlife: {
    mods: [['vnoise1', { kind: 2, scale: 3, speed: 0.15 }], ['compare1', { th: 0.7 }], ['life1', { cell: 4, rate: 3 }], ['colorize1', { range: 0.9, hue: 0.5, full: 0.6 }], ['julia1', {}],
      ['world1', { morph: 3, disp: 1, size: 2.5 }], 'vout1'],
    conns: [...chain('vnoise1', 'compare1', 'life1', 'colorize1'), 'colorize1.out>world1.a', 'julia1.out>world1.b', 'world1.out>vout1.a'],
    hooks: ['$env>life1.chaos*0.5', '$lfo>world1.morph*0.4', '$cv2>julia1.cx*0.15', '$env>world1.gain*0.3'],
  },
  // ---- live inputs (press the button on the source module to grant access)
  cammirror: {
    mods: ['camera1', ['mirror1', { mode: 2 }], ['trails1', { decay: 0.8 }], ['rgbsplit1', { amt: 0.1 }], 'vout1'],
    conns: chain('camera1', 'mirror1', 'trails1', 'rgbsplit1', 'vout1'),
    hooks: ['$env>rgbsplit1.amt*0.8', '$cv2>trails1.decay*0.2'],
  },
  camkey: {
    mods: ['camera1', 'plasma1', ['key1', { th: 0.45, soft: 0.1 }], ['levels1', { lev: 8 }], 'vout1'],
    conns: ['camera1.out>key1.a', 'plasma1.out>key1.b', ...chain('key1', 'levels1', 'vout1')],
    hooks: ['$env>key1.th*0.4', '$lfo>plasma1.hue*0.5'],
  },
  camedge: {
    mods: ['camera1', ['edge1', { gain: 3, col: 0.6 }], ['feedback1', { zoom: 1.03, decay: 0.88, hsh: 0.03 }], 'vout1'],
    conns: chain('camera1', 'edge1', 'feedback1', 'vout1'),
    hooks: ['$env>feedback1.zoom*0.1', '$lfo>feedback1.ang*0.1', '$cv2>edge1.gain*0.3'],
  },
  camworld: {
    mods: ['camera1', ['plasma1', { scale: 2 }], ['world1', { morph: 1, disp: 2 }], 'vout1'],
    conns: ['camera1.out>world1.a', 'plasma1.out>world1.b', 'world1.out>vout1.a'],
    hooks: ['$env>world1.disp*0.5', '$lfo>world1.morph*0.5', '$cv2>world1.twist*0.3'],
  },
  webmangle: {
    mods: ['web1', ['vnoise1', { kind: 1, scale: 3, speed: 0.5 }], ['displace1', { dx: 0.03, dy: 0.03 }], ['glitch1', { amt: 0.1 }], 'crt1', 'vout1'],
    conns: ['web1.out>displace1.a', 'vnoise1.out>displace1.b', ...chain('displace1', 'glitch1', 'crt1', 'vout1')],
    hooks: ['$env>glitch1.amt', '$lfo>displace1.dx*0.3', '$cv2>web1.zoom*0.15'],
  },
  webkaleid: {
    mods: [['web1', { scroll: 0.08 }], ['kaleid1', { segs: 6 }], ['hsv1', { sat: 1.5 }], ['trails1', { decay: 0.7 }], 'vout1'],
    conns: chain('web1', 'kaleid1', 'hsv1', 'trails1', 'vout1'),
    hooks: ['$lfo>kaleid1.ang*0.3', '$cv2>hsv1.hue*0.4', '$env>kaleid1.zoom*0.2'],
  },
  webfeedback: {
    mods: ['web1', ['levels1', { inv: 1 }], ['feedback1', { zoom: 1.03, decay: 0.9, hsh: 0.03 }], 'rgbsplit1', 'vout1'],
    conns: chain('web1', 'levels1', 'feedback1', 'rgbsplit1', 'vout1'),
    hooks: ['$env>rgbsplit1.amt*0.6', '$lfo>feedback1.ang*0.08', '$cv2>feedback1.zoom*0.05'],
  },
  webslides: {
    mods: [['web1', { mode: 1, hold: 1.5 }], ['halftone1', { size: 6, col: 1 }], ['xform1', { zoom: 1.1 }], ['trails1', { mode: 1, decay: 0.8 }], 'vout1'],
    conns: chain('web1', 'halftone1', 'xform1', 'trails1', 'vout1'),
    hooks: ['$env>xform1.zoom*0.2', '$lfo>xform1.ang*0.05', '$cv2>halftone1.size*0.3'],
  },
  webworld: {
    mods: [['web1', { scroll: 0.06 }], ['levels1', { inv: 1 }], ['world1', { morph: 3, disp: 0.6, size: 1.2, dens: 2 }], 'vout1'],
    conns: ['web1.out>levels1.a', 'levels1.out>world1.a', 'levels1.out>world1.b', 'world1.out>vout1.a'],
    hooks: ['$env>world1.disp*0.4', '$lfo>world1.morph*0.5', '$cv2>world1.twist*0.2'],
  },
  screenkaleid: {
    mods: ['screen1', ['kaleid1', { segs: 6 }], ['feedback1', { zoom: 1.02, decay: 0.85 }], 'vout1'],
    conns: chain('screen1', 'kaleid1', 'feedback1', 'vout1'),
    hooks: ['$lfo>kaleid1.ang*0.3', '$env>feedback1.zoom*0.1', '$cv2>feedback1.hsh*0.1'],
  },
  screenedge: {
    mods: ['screen1', ['edge1', { gain: 3, col: 0.5 }], 'glow1', 'hsv1', 'vout1'],
    conns: chain('screen1', 'edge1', 'glow1', 'hsv1', 'vout1'),
    hooks: ['$env>edge1.gain*0.3', '$lfo>hsv1.hue*0.5'],
  },
};

// [name, group, audio bed, video chain, param tweaks { modId: { param: value } }]
const COMBOS = [
  ['Acid Feedback', 'Beats', 'acid', 'mandala'],
  ['Acid Tunnel', 'Beats', 'acid', 'tunnel'],
  ['Acid Lissajous', 'Beats', 'acid', 'lissajous', { clock1: { bpm: 118 }, svf1: { res: 0.85 } }],
  ['Acid Grid Zoom', 'Beats', 'acid', 'grid', { clock1: { bpm: 138 }, seq1: { s1: 0, s3: 12, s6: 3 } }],
  ['Drum Machine Strobes', 'Beats', 'drums', 'strobe'],
  ['Drum Cells', 'Beats', 'drums', 'cells'],
  ['Drum Spectrum Bars', 'Beats', 'drums', 'bars'],
  ['Broken TV Beat', 'Beats', 'drums', 'brokentv', { clock1: { bpm: 96 }, euclid3: { pulses: 7 } }],
  ['Techno Bunker', 'Beats', 'techno', 'grid'],
  ['Techno Halftone', 'Beats', 'techno', 'halftone'],
  ['Techno Scope Wall', 'Beats', 'techno', 'scopewall'],
  ['Techno RGB Oscillators', 'Beats', 'techno', 'rgbosc', { clock1: { bpm: 134 } }],
  ['Wobble Bass Lava', 'Beats', 'wobble', 'lava'],
  ['Wobble Plasma', 'Beats', 'wobble', 'plasma'],
  ['Wobble Video FM', 'Beats', 'wobble', 'oscfm', { lfo1: { rate: 7 } }],
  ['Glitch Beat Mosaic', 'Beats', 'glitch', 'mosaic'],
  ['Glitch Beat Static', 'Beats', 'glitch', 'brokentv', { crt1: { noisy: 0.5 } }],
  ['Glitch Beat Shapes', 'Beats', 'glitch', 'keyed', { shape1: { sides: 3 } }],
  ['Heartbeat Rings', 'Beats', 'pulse', 'keyed', { shape1: { sides: 0, ring: 0.03, size: 0.15 }, trails1: { decay: 0.96 } }],
  ['Heartbeat Lava', 'Beats', 'pulse', 'lava'],
  ['Heartbeat Tunnel', 'Beats', 'pulse', 'tunnel', { tunnel1: { speed: 0.15 }, pattern1: { kind: 2 } }],

  ['FM Bells Kaleidoscope', 'Melodic', 'bells', 'kaleidnoise'],
  ['FM Bells Julia', 'Melodic', 'bells', 'julia'],
  ['FM Bells Ramps', 'Melodic', 'bells', 'ramps'],
  ['FM Bells Radial Scope', 'Melodic', 'bells', 'radial', { fm1: { ratio: 2 } }],
  ['Pluck Garden Cells', 'Melodic', 'pluck', 'cells'],
  ['Pluck Garden Life', 'Melodic', 'pluck', 'life'],
  ['Pluck Garden Radial Scope', 'Melodic', 'pluck', 'radial'],
  ['Pluck Garden Halftone', 'Melodic', 'pluck', 'halftone', { clock1: { bpm: 84 }, halftone1: { kind: 1 } }],
  ['Polymeter Arps Mandala', 'Melodic', 'arps', 'mandala'],
  ['Polymeter Arps Tunnel', 'Melodic', 'arps', 'tunnel', { pattern1: { kind: 4 } }],
  ['Polymeter Arps Edge Glow', 'Melodic', 'arps', 'edgeglow'],
  ['Polymeter Arps Spectrogram', 'Melodic', 'arps', 'spectro'],

  ['Chaos Drone', 'Ambient', 'drone', 'julia'],
  ['Chaos Drone Lissajous', 'Ambient', 'drone', 'lissajous'],
  ['Chaos Drone Lava', 'Ambient', 'drone', 'lava'],
  ['Chaos Drone Video FM', 'Ambient', 'drone', 'oscfm'],
  ['Chaos Drone Spectrogram', 'Ambient', 'drone', 'spectro', { chaos1: { rate: 0.8 } }],
  ['Wind Noise Clouds', 'Ambient', 'wind', 'kaleidnoise', { kaleid1: { segs: 2 } }],
  ['Wind Plasma', 'Ambient', 'wind', 'plasma', { levels1: { lev: 32 } }],
  ['Wind Edge Glow', 'Ambient', 'wind', 'edgeglow'],
  ['Wind Cells', 'Ambient', 'wind', 'cells', { voronoi1: { kind: 3 } }],
  ['Sci-Fi Ring Mod Scope', 'Ambient', 'scifi', 'radial'],
  ['Sci-Fi Lissajous', 'Ambient', 'scifi', 'lissajous'],
  ['Sci-Fi RGB Oscillators', 'Ambient', 'scifi', 'rgbosc'],
  ['Sci-Fi Ramps', 'Ambient', 'scifi', 'ramps'],

  ['World: Acid Plasma Planet', '3D worlds (press Immersive)', 'acid', 'worldplasma'],
  ['World: Techno Scope Torus', '3D worlds (press Immersive)', 'techno', 'worldscope'],
  ['World: Drone Self-Feedback', '3D worlds (press Immersive)', 'drone', 'worldfeedback'],
  ['World: Pluck Life Tunnel', '3D worlds (press Immersive)', 'pluck', 'worldlife'],
  ['World: Wobble Plasma Planet', '3D worlds (press Immersive)', 'wobble', 'worldplasma', { world1: { morph: 2 } }],
  ['World: Bells Scope Torus', '3D worlds (press Immersive)', 'bells', 'worldscope'],
  ['World: Silent Feedback', '3D worlds (press Immersive)', 'silent', 'worldfeedback'],

  ['Keyboard Synth Scope Wall', 'Playable (keys A–L)', 'keys', 'scopewall'],
  ['Keyboard Mandala', 'Playable (keys A–L)', 'keys', 'mandala'],
  ['Keyboard Spectrum Bars', 'Playable (keys A–L)', 'keys', 'bars'],
  ['Keyboard Lissajous', 'Playable (keys A–L)', 'keys', 'lissajous'],

  ['Silent Julia Drift', 'Video only', 'silent', 'julia'],
  ['Silent Life', 'Video only', 'silent', 'life'],
  ['Silent Voronoi', 'Video only', 'silent', 'cells'],
  ['Silent Tunnel', 'Video only', 'silent', 'tunnel'],
  ['Silent Video FM', 'Video only', 'silent', 'oscfm'],
  ['Silent Mosaic', 'Video only', 'silent', 'mosaic'],
  ['Silent Kaleido Noise', 'Video only', 'silent', 'kaleidnoise'],
  ['Silent Lava', 'Video only', 'silent', 'lava'],

  ['Web Page Mangler', 'Live input', 'silent', 'webmangle'],
  ['Web Page Kaleidoscope + Drone', 'Live input', 'drone', 'webkaleid'],
  ['Web Page Beat Glitch', 'Live input', 'drums', 'webmangle'],
  ['Web Page Feedback + Acid', 'Live input', 'acid', 'webfeedback'],
  ['Web Image Slideshow + Bells', 'Live input', 'bells', 'webslides'],
  ['Web Page 3D Tunnel + Arps', 'Live input', 'arps', 'webworld'],
  ['Screen Capture Kaleidoscope', 'Live input', 'silent', 'screenkaleid'],
  ['Screen Capture Edges + Techno', 'Live input', 'techno', 'screenedge'],
  ['Camera Mirror Trails', 'Live input', 'silent', 'cammirror'],
  ['Camera Plasma Key + Acid', 'Live input', 'acid', 'camkey'],
  ['Camera Edges + Wobble', 'Live input', 'wobble', 'camedge'],
  ['Camera 3D Planet + Drone', 'Live input', 'drone', 'camworld'],
  ['Mic Reactive Mandala', 'Live input', 'mic', 'mandala'],
  ['Mic Reactive Spectrum', 'Live input', 'mic', 'bars'],
  ['Mic Reactive Lava', 'Live input', 'mic', 'lava'],
];

const parseMod = m => { const [id, params] = Array.isArray(m) ? m : [m, {}]; return { id, type: id.replace(/\d+$/, ''), params: { ...params } }; };
const parseConn = s => { const m = s.match(/^(\w+)\.(\w+)>(\w+)\.(\w+)(?:\*(-?[\d.]+))?$/); return [m[1], m[2], m[3], m[4], m[5] ? +m[5] : 1]; };

function combo([name, group, a, v, tweaks = {}]) {
  const A = AUD[a], V = VID[v];
  const mods = [...A.mods, ...V.mods].map(parseMod);
  for (const id in tweaks) Object.assign(mods.find(m => m.id === id).params, tweaks[id]);
  const hooks = V.hooks.map(h => h.replace(/^\$(\w+)/, (_, k) => A[k]));
  return { name, group, mods, conns: [...A.conns, ...V.conns, ...hooks].map(parseConn) };
}

// One hand-wired patch where the picture drives the sound.
const LIFE = {
  name: 'Life Forms (video plays audio)', group: 'Ambient',
  mods: [...VID.life.mods, ['vfollow1', { area: 0.5 }], ['vfollow2', { cx: 0.25, cy: 0.5, area: 0.15 }], ['slew1', { rise: 0.3, fall: 0.3 }], ['quant1', { scale: 3 }],
    ['vco1', { freq: 110 }], ['vco2', { freq: 110.7 }], ['svf1', { cut: 400, res: 0.5, cva: 5 }], ['mixer1', { la: 0.5, lb: 0.5 }], ['reverb1', { size: 0.9, mix: 0.6 }], ['out1', { vol: 0.6 }]].map(parseMod),
  conns: [...VID.life.conns, 'life1.out>vfollow1.a', 'life1.out>vfollow2.a', 'vfollow2.luma>slew1.in*2', 'slew1.out>quant1.in*2', 'quant1.out>vco1.voct', 'quant1.out>vco2.voct',
    'vco1.tri>mixer1.a', 'vco2.saw>mixer1.b', 'mixer1.out>svf1.in', 'vfollow1.luma>svf1.cv*2', 'svf1.lp>reverb1.in', 'reverb1.l>out1.l', 'reverb1.r>out1.r'].map(parseConn),
};

const built = COMBOS.map(combo);
built.splice(built.findIndex(p => p.name === 'Wind Noise Clouds'), 0, LIFE);

export const presets = [
  ...built,
  { name: 'Everything (one of each, unpatched)', group: 'Utility', get mods() { return [...registry.keys()].map(t => ({ id: t + '1', type: t, params: {} })); }, conns: [] },
  { name: 'Empty', group: 'Utility', mods: [], conns: [] },
];
