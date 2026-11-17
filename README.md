# MEGA·CV

A modular **audio and video** synthesizer that runs in the browser, patched with a pin-matrix patch bay.
No build step, no dependencies — plain ES modules, Web Audio (AudioWorklet) and WebGL2.

## Run

Serve the folder over HTTP (AudioWorklet and ES modules do not load from `file://`):

```bash
python3 -m http.server 8931
```

Open <http://localhost:8931>, press **Start**. A recent Chrome, Edge, Firefox or Safari is needed.

## How it works

- **Rack** (left): one panel per module. Drag knobs up/down (shift = fine, double-click = reset).
  Video panels show a live thumbnail; click it to preview that module on the monitor.
- **Matrix** (right): rows are outputs, columns are inputs. Click a pin to connect.
  - *Audio / CV matrix* — audio and control voltage are the same signal, so anything can modulate anything.
    Right-click a pin (or shift+scroll) to set its level from −2 to 2; negative levels invert.
    Feedback loops are allowed (a one-block delay is inserted automatically).
  - *Video matrix* — each video input takes one source. Video feedback loops are allowed (one frame of delay).
- **Audio drives video**: every video parameter marked for CV appears as a column in the audio/CV matrix.
  A CV of ±1 sweeps the parameter across its full range.
- **Video drives audio**: the *Video Probe* module turns the brightness / colour of a region into CV.
- Patches autosave to `localStorage`; **Save / Load** use JSON files; **Rec** captures the monitor + audio to `.webm`.

Signal conventions: pitch CV is 1.0 per octave, gates and triggers are high above 0.5, LFOs are ±1.

## Modules

**Audio & CV (42)**
Oscillators: VCO, FM Op, Harmonic, Pluck, Noise ·
Drums: Kick, Snare, Hi-Hat ·
Filters: SVF, Ladder, EQ ·
Effects: Wavefolder, Drive, Bitcrusher, Phaser, Reverb, Delay, Chorus, Compressor ·
Modulation: LFO, ADSR, AD/Function, Chaos, Env Follower, Slew, Sample & Hold ·
Sequencing: Clock, Clock Divider, Sequencer, Euclid, Turing, Quantizer ·
Utilities: VCA, Mixer, Ring Mod, Offset/Atten, Panner, Logic, Scope ·
I/O: Keyboard (computer keys `A W S E D F T G Y H U J K O L P`, optional MIDI), Audio In, Audio Out

**Video (44)**
Sources: V-Osc, Ramp, V-Noise, Shape, Plasma, Pattern, Colour, Voronoi, Julia, Life, Blobs, Camera, Media File, Audio Scope, Spectrum, XY Scope ·
Mix: V-Mixer, Blend, Luma Key, Compare, RGB Combine, V-VCA ·
Colour: Colorize, HSV Adjust, Levels ·
Geometry: Transform, Kaleidoscope, Mirror, Scroll, Displace, Warp, Tunnel/Polar ·
FX: Feedback, Trails, Blur, Glow, Edges, Pixelate, RGB Split, CRT, Glitch, Halftone ·
I/O: Video Probe, Video Out

## Code map

| File | What it does |
| --- | --- |
| `js/defs.js` | Module registry and parameter helpers |
| `js/patch.js` | Patch model: module instances, connections, audio-graph wiring, save/load |
| `js/audio/worklet.js` | All custom DSP (one `AudioWorkletProcessor` per module type) |
| `js/audio/modules.js` | Audio module definitions (worklet-backed and native Web Audio) |
| `js/video/engine.js` | WebGL2 renderer: one shader pass + ping-pong framebuffer per module |
| `js/video/modules.js` | Video module definitions (GLSL) |
| `js/matrix.js` | Matrix patch bay |
| `js/ui.js` | Rack panels, knobs, add-module menu |
| `js/presets.js` | Factory patches |

### Adding a module

Audio (DSP in `worklet.js`, definition in `audio/modules.js` — names and port order must match):

```js
reg('gain2', 'amount', s => {}, (s, I, O, P, n) => { for (let i = 0; i < n; i++) O[0][i] = I[0][i] * P.amount; });
wk('gain2', 'Gain', 'Utilities', { ins: ['in'], outs: ['out'], params: [P('amount', 'Amount', 0, 4, 1)] });
```

Video (`video/modules.js`) — write `vec4 fx(vec2 uv)`; inputs are samplers, params are float uniforms:

```js
V('invert', 'Invert', 'Video Color', {
  ins: ['a:In'], params: [P('amt', 'Amount', 0, 1, 1, { cv: 1 })],
  glsl: `vec4 fx(vec2 uv){vec3 k=texture(a,uv).rgb;return vec4(mix(k,1.-k,amt),1.);}`,
});
```

Module type ids must not end in a digit, and video param ids must not collide with GLSL keywords or the helpers in `engine.js`.
