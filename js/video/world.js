// World 3D: a video module that renders a 3D scene, plus the immersive (first-person) mode.
// The scene is built from the patch itself:
//   - input a is sampled by a cloud of additive gaussian splats (one per grid point), displaced by brightness
//     and morphed between plane / sphere / torus / tunnel
//   - input b is wrapped around the sky
//   - the two patch matrices stand in the world as walls of pins; aim and click to plug / unplug
//   - crystals float around; flying into one makes the connection it carries
// Because it is an ordinary video module, every parameter takes CV and its output can be patched onward.
// It also has CV outputs for the player's position and speed, so moving around plays the synth.
import { P, SEL } from '../defs.js';
import { V } from './modules.js';

const CV = { cv: 1 }, WALLX = 13, FOV = 0.62; // tan(half vertical fov)
export const W = { active: false, cam: { p: [0, 0, 13], yaw: 0, pitch: 0 }, vel: [0, 0, 0], walls: [], crystals: [], t: 0, ver: -1, score: 0, undo: [], keys: new Set() };

const HEAD = `#version 300 es
precision highp float;precision highp sampler2D;
uniform vec3 cE,cR,cU,cF;uniform vec4 cP;uniform vec2 R;
#define TAU 6.2831853
vec4 prj(vec3 p){vec3 q=p-cE;float z=dot(cF,q);return vec4(dot(cR,q)*cP.x,dot(cU,q)*cP.y,z*cP.z+cP.w,z);}
vec3 hue(float h){return clamp(abs(fract(h+vec3(0.,2./3.,1./3.))*6.-3.)-1.,0.,1.);}
`;
const FS = `#version 300 es
precision highp float;in vec4 vC;out vec4 o;
void main(){float d=length(gl_PointCoord-.5)*2.;o=vec4(vC.rgb*exp(-d*d*3.5)*step(d,1.),1.);}`;
const SPLAT = HEAD + `uniform sampler2D a;uniform vec2 G;uniform float morph,disp,size,twist,spin,gain,hasA,T;out vec4 vC;
void main(){int i=gl_VertexID;vec2 uv=(vec2(float(i%int(G.x)),float(i/int(G.x)))+.5)/G;
vec3 c=hasA>.5?texture(a,uv).rgb:hue(uv.x+uv.y+T*.05)*(.4+.6*sin(uv.y*40.+T)*sin(uv.x*60.));float l=dot(c,vec3(.299,.587,.114));
float th=uv.x*TAU,ph=uv.y*TAU;
vec3 p0=vec3((uv.x-.5)*16.,(uv.y-.5)*9.,0.),n0=vec3(0.,0.,1.);
vec3 n1=vec3(cos(ph*.5-1.5708)*cos(th),sin(ph*.5-1.5708),cos(ph*.5-1.5708)*sin(th)),p1=n1*5.;
vec3 n2=vec3(cos(ph)*cos(th),sin(ph),cos(ph)*sin(th)),p2=vec3(4.5*cos(th),0.,4.5*sin(th))+n2*1.8;
vec3 n3=vec3(-cos(th),-sin(th),0.),p3=vec3(4.*cos(th),4.*sin(th),(uv.y-.5)*44.);
float m=clamp(morph,0.,3.);vec3 p,n;
if(m<1.){p=mix(p0,p1,m);n=mix(n0,n1,m);}else if(m<2.){p=mix(p1,p2,m-1.);n=mix(n1,n2,m-1.);}else{p=mix(p2,p3,m-2.);n=mix(n2,n3,m-2.);}
p+=normalize(n+1e-4)*l*disp;
float tw=spin*TAU+p.y*twist*.5,cs=cos(tw),sn=sin(tw);p.xz=mat2(cs,-sn,sn,cs)*p.xz;
vec4 q=prj(p);gl_Position=q;gl_PointSize=clamp(size*R.y*.09*(.35+l)/max(q.w,.2),1.,128.);vC=vec4(c*gain*(.15+l)*.55,1.);}`;
const PINS = HEAD + `uniform vec3 o,du,dv,col;uniform vec2 dim;uniform sampler2D st;uniform float hov;out vec4 vC;
void main(){int c=gl_VertexID%int(dim.x),r=gl_VertexID/int(dim.x);float on=texelFetch(st,ivec2(c,r),0).r;
vec4 q=prj(o+du*float(c)+dv*float(r));gl_Position=q;float h=abs(float(gl_VertexID)-hov)<.5?1.:0.;
gl_PointSize=clamp(R.y*length(du)*(on>.5?1.3:.35)*(1.+h*2.)*cP.y*.5/max(q.w,.1),1.5,90.);vC=vec4(mix(on>.5?col:col*.3,vec3(1.),h),1.);}`;
const GEMS = HEAD + `uniform vec4 pts[8];uniform float T;out vec4 vC;
void main(){vec4 g=pts[gl_VertexID];vec4 q=prj(g.xyz+vec3(0.,sin(T*1.3+g.w*9.)*.25,0.));gl_Position=q;
gl_PointSize=clamp(R.y*(.5+.12*sin(T*5.+g.w*20.))*cP.y*.5/max(q.w,.1),2.,200.);vC=vec4(hue(g.w+T*.1)*1.4+.2,1.);}`;
const SKY = `uniform vec3 cR,cU,cF;uniform vec4 cP;
vec4 fx(vec2 uv){vec3 d=normalize(cF+cR*(uv.x*2.-1.)/cP.x+cU*(uv.y*2.-1.)/cP.y);
vec2 e=vec2(atan(d.z,d.x)/TAU+.5,acos(clamp(d.y,-1.,1.))/PI);vec3 k=texture(b,e*vec2(2.,1.)).rgb*sky;
vec2 g=floor(e*vec2(700.,350.));k+=step(.9985,hash(g))*(.4+.6*sin(T*2.+hash(g+1.)*40.));
k+=vec3(.02,.03,.06)*(1.-abs(d.y));return vec4(k,1.);}`;

function build(eng) {
  const gl = eng.gl;
  const mk = vs => {
    const sh = (t, s) => { const x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; };
    const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(p);
    const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const name = gl.getActiveUniform(p, i).name.replace('[0]', ''); u[name] = gl.getUniformLocation(p, name); }
    return { p, u };
  };
  const sky = eng.program(SKY, ['b'], ['sky'], []);
  for (const n of ['cR', 'cU', 'cF', 'cP']) sky.u[n] = gl.getUniformLocation(sky.p, n);
  return { splat: mk(SPLAT), pins: mk(PINS), gems: mk(GEMS), sky, st: [gl.createTexture(), gl.createTexture()] };
}

function basis(c) {
  const cp = Math.cos(c.pitch), sp = Math.sin(c.pitch), cy = Math.cos(c.yaw), sy = Math.sin(c.yaw);
  return { f: [cp * sy, sp, -cp * cy], r: [cy, 0, sy], u: [-sp * sy, cp, sp * cy] };
}
const DENS = [[160, 90], [256, 144], [384, 216], [512, 288]];

function draw(inst, eng, impl) {
  const gl = eng.gl, pv = impl.pv, S = eng.w3 || (eng.w3 = build(eng)), cam = W.cam, B = basis(cam);
  const asp = eng.w / eng.h, n = 0.1, f = 300, cP = [1 / (asp * FOV), 1 / FOV, (f + n) / (f - n), -2 * f * n / (f - n)];
  const camU = u => { gl.uniform3fv(u.cE, cam.p); gl.uniform3fv(u.cR, B.r); gl.uniform3fv(u.cU, B.u); gl.uniform3fv(u.cF, B.f); gl.uniform4fv(u.cP, cP); gl.uniform2f(u.R, eng.w, eng.h); };
  const tex = k => impl.vin[k] ? impl.vin[k].impl.tg[0].tex : eng.black;
  gl.activeTexture(gl.TEXTURE0);

  let P_ = S.sky; gl.useProgram(P_.p);
  gl.bindTexture(gl.TEXTURE_2D, tex('b')); gl.uniform1i(P_.u.b, 0);
  gl.uniform1f(P_.u.T, eng.t); gl.uniform2f(P_.u.R, eng.w, eng.h); gl.uniform1f(P_.u.sky, pv.sky);
  gl.uniform3fv(P_.u.cR, B.r); gl.uniform3fv(P_.u.cU, B.u); gl.uniform3fv(P_.u.cF, B.f); gl.uniform4fv(P_.u.cP, cP);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
  P_ = S.splat; gl.useProgram(P_.p); camU(P_.u);
  const [gx, gy] = DENS[Math.round(pv.dens)] || DENS[1];
  gl.bindTexture(gl.TEXTURE_2D, tex('a')); gl.uniform1i(P_.u.a, 0);
  gl.uniform2f(P_.u.G, gx, gy); gl.uniform1f(P_.u.hasA, impl.vin.a ? 1 : 0); gl.uniform1f(P_.u.T, eng.t);
  for (const k of ['morph', 'disp', 'size', 'twist', 'spin', 'gain']) gl.uniform1f(P_.u[k], pv[k]);
  gl.drawArrays(gl.POINTS, 0, gx * gy);

  if (pv.wall > 0.5) {
    P_ = S.pins; gl.useProgram(P_.p); camU(P_.u);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    W.walls.forEach((w, i) => {
      if (!w.n) return;
      gl.bindTexture(gl.TEXTURE_2D, S.st[i]);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, w.cols.length, w.rows.length, 0, gl.RED, gl.UNSIGNED_BYTE, w.state);
      gl.uniform1i(P_.u.st, 0); gl.uniform3fv(P_.u.o, w.o); gl.uniform3fv(P_.u.du, w.du); gl.uniform3fv(P_.u.dv, w.dv);
      gl.uniform3fv(P_.u.col, w.kind === 'a' ? [1, 0.7, 0] : [0, 0.9, 1]); gl.uniform2f(P_.u.dim, w.cols.length, w.rows.length);
      gl.uniform1f(P_.u.hov, W.active && W.hover?.wall === w ? W.hover.idx : -9);
      gl.drawArrays(gl.POINTS, 0, w.n);
    });
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  }
  if (W.active && W.crystals.length) {
    P_ = S.gems; gl.useProgram(P_.p); camU(P_.u);
    gl.uniform1f(P_.u.T, eng.t); gl.uniform4fv(P_.u.pts, W.crystals.flatMap(c => [...c.p, c.h]));
    gl.drawArrays(gl.POINTS, 0, W.crystals.length);
  }
  gl.disable(gl.BLEND);
}

V('world', 'World 3D', 'Video I/O', {
  ins: ['a:Splats', 'b:Sky'], aouts: ['px:Pos X', 'py:Pos Y', 'pz:Pos Z', 'spd:Speed', 'hit:Hit'], cols: 4, status: 1,
  params: [P('morph', 'Shape', 0, 3, 1, CV), P('disp', 'Displace', -5, 5, 1.2, CV), P('size', 'Splat size', 0.2, 8, 1.6, { exp: 1, cv: 1 }), P('twist', 'Twist', -1, 1, 0, CV),
    P('spin', 'Spin', -1, 1, 0.03, { acc: 1, cv: 1 }), P('sky', 'Sky', 0, 2, 0.3, CV), P('gain', 'Glow', 0.1, 4, 1, { exp: 1, cv: 1 }),
    SEL('dens', 'Splats', ['14k', '37k', '83k', '147k'], 1), { id: 'wall', label: 'Matrix walls', type: 'tog', def: 1, min: 0, max: 1 }],
  glsl: `vec4 fx(vec2 uv){return texture(a,uv);}`,
  draw,
  setup(inst) { inst.status = 'Press Immersive in the top bar to fly inside'; },
});

// ---------------------------------------------------------------- world state, picking, game
function rebuildWalls(patch) {
  W.ver = patch.ver;
  W.walls = ['a', 'v'].map(kind => {
    const rows = [], cols = [];
    for (const m of patch.mods) {
      for (const p of m.def.outs) if (p.type === kind) rows.push({ m, p });
      for (const p of m.def.ins) if (p.type === kind) cols.push({ m, p });
    }
    const s = Math.min(0.34, 22 / Math.max(cols.length, 1), 11 / Math.max(rows.length, 1)), sx = kind === 'a' ? -1 : 1;
    return {
      kind, rows, cols, s, n: rows.length * cols.length, state: new Uint8Array(rows.length * cols.length), x: sx * WALLX,
      o: [sx * WALLX, (rows.length - 1) * s / 2, sx * (cols.length - 1) * s / 2], du: [0, 0, -sx * s], dv: [0, -s, 0],
      ri: new Map(rows.map((x, i) => [x.m.id + '.' + x.p.id, i])), ci: new Map(cols.map((x, i) => [x.m.id + '.' + x.p.id, i])),
    };
  });
  W.crystals.forEach(c => { c.conn = null; });
}

function pick(cam, f) {
  let best = null;
  for (const w of W.walls) {
    if (!w.n || Math.abs(f[0]) < 1e-4) continue;
    const t = (w.x - cam.p[0]) / f[0];
    if (t <= 0 || t > 80 || (best && t > best.t)) continue;
    const y = cam.p[1] + f[1] * t, z = cam.p[2] + f[2] * t;
    const c = Math.round((z - w.o[2]) / w.du[2]), r = Math.round((w.o[1] - y) / w.s);
    if (c >= 0 && c < w.cols.length && r >= 0 && r < w.rows.length) best = { wall: w, t, r, c, idx: r * w.cols.length + c };
  }
  return best;
}
const label = (w, r, c) => `${w.rows[r].m.name} ${w.rows[r].p.label} → ${w.cols[c].m.name} ${w.cols[c].p.label}`;
const connAt = (patch, w, r, c) => patch.find(w.rows[r].m.id, w.rows[r].p.id, w.cols[c].m.id, w.cols[c].p.id);

function propose(patch) { // a random new audio/CV connection for a crystal to carry
  const w = W.walls[0];
  if (!w || !w.n) return null;
  for (let k = 0; k < 30; k++) {
    const r = (Math.random() * w.rows.length) | 0, c = (Math.random() * w.cols.length) | 0;
    if (w.cols[c].m.type === 'out' || w.rows[r].m === w.cols[c].m || connAt(patch, w, r, c)) continue;
    return { r, c, text: label(w, r, c) };
  }
  return null;
}
function spawn(c) {
  const a = Math.random() * Math.PI * 2, d = 6 + Math.random() * 5;
  c.p = [Math.max(-10, Math.min(10, Math.cos(a) * d)), (Math.random() - 0.5) * 7, Math.sin(a) * d]; c.h = Math.random(); c.conn = null;
}

export function initWorld({ patch, video, canvas, setRes }) {
  const hud = document.getElementById('hud'), $pin = document.getElementById('hudpin'), $msg = document.getElementById('hudmsg'), $score = document.getElementById('hudscore');
  let msgT = 0;
  const say = t => { $msg.textContent = t; msgT = 4; };
  const world = () => patch.mods.find(m => m.type === 'world');

  const lock = () => { try { canvas.requestPointerLock?.()?.catch?.(() => { }); } catch { } };
  function ensureWorld() {
    if (world()) return;
    const w = patch.add('world');
    const vout = patch.mods.find(m => m.type === 'vout') || patch.add('vout');
    const src = patch.conns.find(c => c.type === 'v' && c.to === vout.id);
    if (src) { patch.connect(src.from, src.out, w.id, 'a'); patch.connect(src.from, src.out, w.id, 'b'); }
    patch.connect(w.id, 'out', vout.id, 'a');
  }
  function enter() {
    ensureWorld();
    W.active = true; W.cam = { p: [0, 0, 13], yaw: 0, pitch: 0 }; W.vel = [0, 0, 0]; W.keys.clear();
    W.crystals = Array.from({ length: 7 }, () => { const c = {}; spawn(c); return c; });
    document.body.classList.add('immersive');
    if (video.h < 540) setRes(960, 540);
    video.preview = null;
    syncLock(); lock();
    say('Fly into crystals to rewire the synth. Aim at a wall pin and click to patch it.');
  }
  function exit() {
    W.active = false; W.locked = false; W.keys.clear(); W.hover = null;
    document.body.classList.remove('immersive');
    if (document.pointerLockElement) document.exitPointerLock();
    if (document.fullscreenElement) document.exitFullscreen?.();
  }
  const toggle = () => (W.active ? exit() : enter());
  document.getElementById('immersive').onclick = toggle;
  const $exit = document.getElementById('hudexit');
  $exit.onmousedown = e => e.stopPropagation(); // do not treat it as a click on the world
  $exit.onclick = exit;

  // Mouse capture is optional: losing it (Esc, or a browser that refuses it) only frees the cursor.
  const syncLock = () => { W.locked = !!document.pointerLockElement; hud.classList.toggle('free', !W.locked); };
  document.addEventListener('pointerlockchange', syncLock);

  const look = (dx, dy) => { W.cam.yaw += dx * 0.0025; W.cam.pitch = Math.max(-1.5, Math.min(1.5, W.cam.pitch - dy * 0.0025)); };
  addEventListener('mousemove', e => {
    if (!W.active) return;
    if (document.pointerLockElement || e.buttons & 2) look(e.movementX, e.movementY);
    const r = canvas.getBoundingClientRect(), a = video.w / video.h, w = Math.min(r.width, r.height * a), h = w / a; // letterboxed picture
    W.mouse = [(e.clientX - r.left - r.width / 2) / (w / 2), -(e.clientY - r.top - r.height / 2) / (h / 2)];
  });
  hud.addEventListener('contextmenu', e => e.preventDefault());
  hud.addEventListener('mousedown', e => {
    if (!W.active || e.button !== 0) return;
    const h = W.hover;
    if (!h) { if (!document.pointerLockElement) lock(); return; } // click empty space to capture the mouse
    const ex = connAt(patch, h.wall, h.r, h.c), row = h.wall.rows[h.r], col = h.wall.cols[h.c];
    if (ex) { patch.disconnect(ex); say('Unplugged: ' + label(h.wall, h.r, h.c)); }
    else { patch.connect(row.m.id, row.p.id, col.m.id, col.p.id, 1); say('Patched: ' + label(h.wall, h.r, h.c)); }
  });
  // Capture phase so flying with WASD does not also play the Keyboard module.
  addEventListener('keydown', e => {
    if (!W.active) return;
    e.stopImmediatePropagation();
    const k = e.key.toLowerCase();
    if (k === 'escape' || k === 'x') { exit(); return; }
    if (k === 'z' && W.undo.length) { const c = W.undo.pop(); patch.disconnect(c); say('Undone'); }
    if (k === 'f') document.getElementById('monitor').requestFullscreen?.();
    W.keys.add(k); if (k.startsWith('arrow') || k === ' ') e.preventDefault();
  }, true);
  addEventListener('keyup', e => { if (W.active) { W.keys.delete(e.key.toLowerCase()); e.stopImmediatePropagation(); } }, true);

  return function update(dt) {
    W.t += dt;
    const inst = world();
    if (!inst) { if (W.active) exit(); return; }
    if (W.ver !== patch.ver) rebuildWalls(patch);
    for (const w of W.walls) {
      w.state.fill(0);
      for (const c of patch.conns) if (c.type === w.kind) { const r = w.ri.get(c.from + '.' + c.out), k = w.ci.get(c.to + '.' + c.inp); if (r != null && k != null) w.state[r * w.cols.length + k] = 255; }
    }
    const cam = W.cam;
    if (!W.active) { // idle: slow orbit so the module is a useful 3D source in the rack too
      const a = W.t * 0.08, p = [Math.sin(a) * 11, Math.sin(W.t * 0.05) * 3, Math.cos(a) * 11], l = Math.hypot(...p);
      cam.p = p; cam.yaw = Math.atan2(-p[0], p[2]); cam.pitch = Math.asin(-p[1] / l);
      return;
    }
    const K = W.keys, B = basis(cam), v = W.vel;
    if (K.has('arrowleft')) cam.yaw -= dt * 1.6; if (K.has('arrowright')) cam.yaw += dt * 1.6;
    if (K.has('arrowup')) cam.pitch = Math.min(1.5, cam.pitch + dt * 1.2); if (K.has('arrowdown')) cam.pitch = Math.max(-1.5, cam.pitch - dt * 1.2);
    const fw = (K.has('w') ? 1 : 0) - (K.has('s') ? 1 : 0), st = (K.has('d') ? 1 : 0) - (K.has('a') ? 1 : 0), up = (K.has(' ') || K.has('e') ? 1 : 0) - (K.has('c') || K.has('q') ? 1 : 0);
    const sp = K.has('shift') ? 16 : 7, k = Math.min(1, dt * 6);
    for (let i = 0; i < 3; i++) {
      v[i] += ((B.f[i] * fw + B.r[i] * st + (i === 1 ? up : 0)) * sp - v[i]) * k;
      cam.p[i] += v[i] * dt;
    }
    cam.p[0] = Math.max(-WALLX + 1, Math.min(WALLX - 1, cam.p[0])); cam.p[1] = Math.max(-12, Math.min(12, cam.p[1])); cam.p[2] = Math.max(-40, Math.min(40, cam.p[2]));

    let ray = B.f; // aim with the crosshair when the mouse is captured, otherwise with the cursor
    if (!W.locked && W.mouse) {
      const mx = W.mouse[0] * FOV * video.w / video.h, my = W.mouse[1] * FOV;
      ray = [0, 1, 2].map(i => B.f[i] + B.r[i] * mx + B.u[i] * my);
      const l = Math.hypot(...ray); ray = ray.map(x => x / l);
    }
    W.hover = inst.params.wall > 0.5 ? pick(cam, ray) : null;
    let near = null, nd = 7;
    for (const c of W.crystals) {
      if (!c.conn) c.conn = propose(patch);
      const d = Math.hypot(c.p[0] - cam.p[0], c.p[1] - cam.p[1], c.p[2] - cam.p[2]);
      if (d < nd) { nd = d; near = c; }
      if (d < 1.3) {
        const w = W.walls[0], q = c.conn;
        if (q && w.rows[q.r] && w.cols[q.c]) {
          const made = patch.connect(w.rows[q.r].m.id, w.rows[q.r].p.id, w.cols[q.c].m.id, w.cols[q.c].p.id, +(0.2 + Math.random() * 0.6).toFixed(2));
          if (made) { W.undo.push(made); W.score++; say('Crystal patched: ' + q.text + '  (Z to undo)'); }
        }
        const t = video.ac.currentTime, hit = inst.impl.aouts.hit.offset;
        hit.setValueAtTime(1, t); hit.setValueAtTime(0, t + 0.12);
        spawn(c);
      }
    }
    const t = video.ac.currentTime, o = inst.impl.aouts;
    o.px.offset.setTargetAtTime(cam.p[0] / WALLX, t, 0.03); o.py.offset.setTargetAtTime(cam.p[1] / 12, t, 0.03); o.pz.offset.setTargetAtTime(cam.p[2] / 20, t, 0.03);
    o.spd.offset.setTargetAtTime(Math.min(1, Math.hypot(...v) / 16), t, 0.03);

    const h = W.hover;
    $pin.textContent = h ? label(h.wall, h.r, h.c) + (connAt(patch, h.wall, h.r, h.c) ? '  ●  click to unplug' : '  ○  click to patch')
      : near && near.conn ? 'Crystal ahead: ' + near.conn.text : '';
    $pin.classList.toggle('on', !!h);
    $score.textContent = W.score ? `${W.score} crystal${W.score > 1 ? 's' : ''}` : '';
    if (msgT > 0 && (msgT -= dt) <= 0) $msg.textContent = '';
  };
}
