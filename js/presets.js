// Factory patches, written in a compact form:
//   mods:  'vco1' or ['vco1', { param: value }]   (type = id without trailing digits)
//   conns: 'from.out>to.in' or 'from.out>to.in*level'
import { registry } from './defs.js';

const RAW = [
  {
    name: 'Acid Feedback',
    mods: [['clock1', { bpm: 126 }], ['seq1', { s0: 0, s1: 12, s2: 0, s3: 3, s4: 0, s5: 7, s6: 10, s7: -2, glide: 0.03 }], ['vco1', { freq: 65.41 }],
      ['adsr1', { a: 0.003, d: 0.2, s: 0.15, r: 0.12 }], ['svf1', { cut: 260, res: 0.78, cva: 4 }], 'vca1', ['lfo1', { rate: 0.07 }],
      ['delay1', { time: 0.357, fb: 0.45, mix: 0.3 }], 'kick1', ['euclid1', { steps: 16, pulses: 7 }], 'hat1',
      ['mixer1', { la: 0.7, lb: 0.9, lc: 0.3 }], 'follow1', ['out1', { vol: 0.6 }],
      ['vosc1', { geom: 1, freq: 5, speed: 0.5 }], ['colorize1', { range: 0.7, cycle: 0.05 }], ['ascope1', { gain: 1.5, thick: 0.5 }], 'blend1',
      ['feedback1', { zoom: 1.04, decay: 0.9, hsh: 0.012 }], ['kaleid1', { segs: 6, spin: 0.02 }], 'vout1'],
    conns: ['clock1.s16>seq1.clock', 'seq1.cv>vco1.voct', 'clock1.s16>adsr1.gate', 'vco1.saw>svf1.in', 'adsr1.env>svf1.cv*0.6', 'lfo1.sin>svf1.cv*0.35',
      'svf1.lp>vca1.in', 'adsr1.env>vca1.cv', 'vca1.out>delay1.in', 'delay1.out>mixer1.a', 'clock1.s4>kick1.trig', 'kick1.out>mixer1.b',
      'clock1.s16>euclid1.clock', 'euclid1.gate>hat1.trig', 'hat1.out>mixer1.c', 'mixer1.out>out1.in', 'kick1.out>follow1.in',
      'vosc1.out>colorize1.a', 'colorize1.out>blend1.a', 'ascope1.out>blend1.b', 'blend1.out>feedback1.a', 'feedback1.out>kaleid1.a', 'kaleid1.out>vout1.a',
      'svf1.lp>ascope1.sig', 'follow1.out>vosc1.freq*0.6', 'lfo1.sin>feedback1.ang*0.15', 'adsr1.env>colorize1.hue*0.3'],
  },
  {
    name: 'Chaos Drone',
    mods: [['chaos1', { rate: 0.35 }], ['harm1', { freq: 55, n: 12, tilt: 1.2 }], ['harm2', { freq: 82.6, n: 6, tilt: 0.8, odd: 1 }], ['fm1', { freq: 110, ratio: 1.5, index: 2.5 }],
      ['mixer1', { la: 0.6, lb: 0.5, lc: 0.35 }], ['ladder1', { cut: 500, res: 0.45, cva: 2.5 }], ['phaser1', { rate: 0.08 }], ['reverb1', { size: 0.92, mix: 0.5 }], ['out1', { vol: 0.6 }],
      ['julia1', { cx: -0.78, cy: 0.16, zoom: 1.1 }], ['colorize1', { range: 1.4, cycle: 0.03, hue: 0.55, full: 0.5 }], ['plasma1', { scale: 2, speed: 0.3 }],
      ['displace1', { dx: 0.08, dy: 0.08, mode: 2 }], ['glow1', { th: 0.5, amt: 0.8 }], ['crt1', { scan: 0.25, curve: 0.2 }], 'vout1'],
    conns: ['chaos1.x>harm1.voct*0.08', 'chaos1.y>fm1.idx*0.6', 'chaos1.z>ladder1.cv*0.7', 'chaos1.y>harm2.voct*0.04',
      'harm1.out>mixer1.a', 'harm2.out>mixer1.b', 'fm1.out>mixer1.c', 'mixer1.out>ladder1.in', 'ladder1.out>phaser1.in', 'phaser1.out>reverb1.in', 'reverb1.l>out1.l', 'reverb1.r>out1.r',
      'julia1.out>colorize1.a', 'colorize1.out>displace1.a', 'plasma1.out>displace1.b', 'displace1.out>glow1.a', 'glow1.out>crt1.a', 'crt1.out>vout1.a',
      'chaos1.x>julia1.cx*0.12', 'chaos1.y>julia1.cy*0.12', 'chaos1.z>julia1.ang*0.2'],
  },
  {
    name: 'Drum Machine Strobes',
    mods: [['clock1', { bpm: 132 }], ['euclid1', { steps: 16, pulses: 4 }], ['euclid2', { steps: 16, pulses: 2, rot: 4 }], ['euclid3', { steps: 16, pulses: 11, rot: 2 }],
      'kick1', 'snare1', 'hat1', ['turing1', { prob: 0.15, len: 8, range: 2 }], ['quant1', { scale: 4 }], ['pluck1', { freq: 110, decay: 0.75 }],
      ['delay1', { time: 0.34, fb: 0.5, mix: 0.3 }], ['mixer1', { la: 0.9, lb: 0.6, lc: 0.3, ld: 0.6 }], 'comp1', 'follow1', ['follow2', { rel: 0.08 }], ['out1', { vol: 0.6 }],
      ['shape1', { sides: 6, size: 0.12, ring: 0.05, spin: 0.1 }], ['pattern1', { sx: 12, sy: 12, scx: 0.3 }], ['blend1', { mode: 3 }], ['colorize1', { range: 0.4, hue: 0.9, full: 0.3 }],
      ['glitch1', { amt: 0 }], ['rgbsplit1', { amt: 0, radial: 1 }], ['crt1', {}], 'vout1'],
    conns: ['clock1.s16>euclid1.clock', 'clock1.s16>euclid2.clock', 'clock1.s16>euclid3.clock', 'euclid1.gate>kick1.trig', 'euclid2.gate>snare1.trig', 'euclid3.gate>hat1.trig',
      'clock1.s8>turing1.clock', 'turing1.cv>quant1.in', 'quant1.out>pluck1.voct', 'turing1.gate>pluck1.trig', 'pluck1.out>delay1.in',
      'kick1.out>mixer1.a', 'snare1.out>mixer1.b', 'hat1.out>mixer1.c', 'delay1.out>mixer1.d', 'mixer1.out>comp1.in', 'comp1.out>out1.in',
      'kick1.out>follow1.in', 'snare1.out>follow2.in',
      'shape1.out>blend1.a', 'pattern1.out>blend1.b', 'blend1.out>colorize1.a', 'colorize1.out>glitch1.a', 'glitch1.out>rgbsplit1.a', 'rgbsplit1.out>crt1.a', 'crt1.out>vout1.a',
      'follow1.out>shape1.size*1.2', 'follow2.out>glitch1.amt*1.5', 'follow1.out>rgbsplit1.amt', 'turing1.cv>colorize1.hue*0.3'],
  },
  {
    name: 'Life Forms (video plays audio)',
    mods: [['vnoise1', { kind: 2, scale: 3, speed: 0.15 }], ['compare1', { th: 0.72 }], ['life1', { cell: 4, rate: 3, chaos: 0.1 }], ['blur1', { radius: 5 }],
      ['colorize1', { range: 0.9, hue: 0.5, cycle: 0.02 }], ['feedback1', { mode: 0, zoom: 0.99, decay: 0.94, hsh: 0.01 }], 'vout1',
      ['vfollow1', { area: 0.5 }], ['vfollow2', { cx: 0.25, cy: 0.5, area: 0.15 }], ['slew1', { rise: 0.3, fall: 0.3 }], ['quant1', { scale: 3 }],
      ['vco1', { freq: 110 }], ['vco2', { freq: 110.7 }], ['svf1', { cut: 400, res: 0.5, cva: 5 }], ['mixer1', { la: 0.5, lb: 0.5 }], ['reverb1', { size: 0.9, mix: 0.6 }], ['out1', { vol: 0.6 }]],
    conns: ['vnoise1.out>compare1.a', 'compare1.out>life1.a', 'life1.out>blur1.a', 'blur1.out>colorize1.a', 'colorize1.out>feedback1.a', 'feedback1.out>vout1.a',
      'life1.out>vfollow1.a', 'life1.out>vfollow2.a', 'vfollow2.luma>slew1.in*2', 'slew1.out>quant1.in*2', 'quant1.out>vco1.voct', 'quant1.out>vco2.voct',
      'vco1.tri>mixer1.a', 'vco2.saw>mixer1.b', 'mixer1.out>svf1.in', 'vfollow1.luma>svf1.cv*2', 'svf1.lp>reverb1.in', 'reverb1.l>out1.l', 'reverb1.r>out1.r'],
  },
];

const expand = p => ({
  name: p.name,
  mods: p.mods.map(m => { const [id, params] = Array.isArray(m) ? m : [m, {}]; return { id, type: id.replace(/\d+$/, ''), params }; }),
  conns: p.conns.map(s => { const m = s.match(/^(\w+)\.(\w+)>(\w+)\.(\w+)(?:\*(-?[\d.]+))?$/); return [m[1], m[2], m[3], m[4], m[5] ? +m[5] : 1]; }),
});

export const presets = [
  ...RAW.map(expand),
  { name: 'Everything (one of each, unpatched)', get mods() { return [...registry.keys()].map(t => ({ id: t + '1', type: t, params: {} })); }, conns: [] },
  { name: 'Empty', mods: [], conns: [] },
];
