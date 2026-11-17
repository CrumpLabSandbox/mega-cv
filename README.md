# MEGA·CV

A modular **audio and video** synthesizer that runs in the browser, patched with a pin-matrix patch bay.
No build step, no dependencies — plain ES modules, Web Audio (AudioWorklet) and WebGL2.

## Run

Online: <https://crumplabsandbox.github.io/mega-cv/> (deployed by GitHub Actions on every push to `main`).

Locally, with the bundled server (Node 18+, no dependencies):

```bash
node server.mjs 8931
```

Open <http://localhost:8931>, press **Start**. A recent Chrome, Edge, Firefox or Safari is needed.

`server.mjs` serves the files and adds a same-origin `/proxy` endpoint. Browsers refuse to read other sites'
HTML and images directly (CORS), so the **Web Page** module needs that proxy to load arbitrary URLs. Any static
server (or the GitHub Pages copy) runs everything else, but there Web Page only works for URLs that send CORS headers.

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
- **Full screen** (top bar, the corner button on the monitor, or double-click the monitor): toggles the video to fill the screen; Esc also exits.
- **Immersive** (top bar): fly inside the patch. See *World 3D* below.
- **Presets**: 80+ factory patches, grouped by Beats / Melodic / Ambient / 3D worlds / Playable / Video only / Live input.
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

**Video (47)**
Sources: V-Osc, Ramp, V-Noise, Shape, Plasma, Pattern, Colour, Voronoi, Julia, Life, Blobs, Camera, Screen Capture, Web Page, Media File, Audio Scope, Spectrum, XY Scope ·
Mix: V-Mixer, Blend, Luma Key, Compare, RGB Combine, V-VCA ·
Colour: Colorize, HSV Adjust, Levels ·
Geometry: Transform, Kaleidoscope, Mirror, Scroll, Displace, Warp, Tunnel/Polar ·
FX: Feedback, Trails, Blur, Glow, Edges, Pixelate, RGB Split, CRT, Glitch, Halftone ·
I/O: Video Probe, World 3D, Video Out

## Live video sources

- **Web Page** — type a URL and press Enter. The page's HTML is fetched, its stylesheets and images are inlined, and it is
  drawn into a tall texture that the module scrolls through (scroll speed, position and zoom all take CV). Scripts never run,
  so script-built pages come out sparse; if a page cannot be drawn with styles it falls back to its text.
  *Image slideshow* mode cycles through the images found on the page instead. A direct image or video URL is shown as-is,
  and *Refresh* re-fetches on a timer, which turns a webcam JPEG URL into a live feed.
- **Screen Capture** — share any browser tab, window or screen. This is the way to get a fully live, scripted site
  (maps, video players, another app) into the patch.
- **Camera**, **Media File** (local image / video), **Audio In**.

## World 3D and immersive mode

**World 3D** is a video module that renders a 3D scene from its two video inputs: input *Splats* is sampled by a cloud of
up to 147k additive gaussian splats, displaced by brightness and morphed between plane, sphere, torus and tunnel;
input *Sky* is wrapped around the horizon. Shape, displacement, splat size, twist, spin, sky and glow all take CV, and the
module's output is ordinary video, so it can be patched onward (or back into itself).

Press **Immersive** to go inside (a World 3D module is added and wired in front of Video Out if the patch has none):

- `W A S D` fly, `Space` / `C` up and down, `Shift` fast, mouse (or arrow keys) to look, `F` fullscreen, `Esc` to leave.
- The two matrices stand as walls of pins: audio / CV on the left, video on the right. Aim at a pin and click to plug or unplug it.
- Crystals drift through the scene, each carrying a random new connection. Fly into one to make it; `Z` undoes the last one.
- The module has CV outputs for the player's position, speed and a trigger on each crystal hit, so flying around plays the synth.

## Code map

| File | What it does |
| --- | --- |
| `js/defs.js` | Module registry and parameter helpers |
| `js/patch.js` | Patch model: module instances, connections, audio-graph wiring, save/load |
| `js/audio/worklet.js` | All custom DSP (one `AudioWorkletProcessor` per module type) |
| `js/audio/modules.js` | Audio module definitions (worklet-backed and native Web Audio) |
| `js/video/engine.js` | WebGL2 renderer: one shader pass + ping-pong framebuffer per module |
| `js/video/modules.js` | Video module definitions (GLSL) |
| `js/video/web.js` | Web Page source: fetch, inline, render to texture |
| `js/video/world.js` | World 3D renderer and immersive mode |
| `server.mjs` | Local static server + page proxy |
| `js/matrix.js` | Matrix patch bay |
| `js/ui.js` | Rack panels, knobs, add-module menu |
| `js/presets.js` | Factory patches: audio beds × video chains |

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
