// WebGL2 video engine. Every video module is one fragment-shader pass rendering into its own
// ping-pong framebuffer; video patch connections are just "which module's texture feeds this sampler".
// CV inputs on video params are AnalyserNodes sampled once per frame.
import { toNorm, fromNorm } from '../defs.js';

const VS = `#version 300 es
out vec2 vUv;
void main(){vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));vUv=p;gl_Position=vec4(p*2.-1.,0.,1.);}`;

const LIB = `
#define PI 3.14159265
#define TAU 6.2831853
float luma(vec3 c){return dot(c,vec3(.299,.587,.114));}
vec3 hsv2rgb(vec3 c){vec3 p=abs(fract(c.xxx+vec3(0.,2./3.,1./3.))*6.-3.);return c.z*mix(vec3(1.),clamp(p-1.,0.,1.),c.y);}
vec3 rgb2hsv(vec3 c){vec4 K=vec4(0.,-1./3.,2./3.,-1.);vec4 p=mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g));vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r));float d=q.x-min(q.w,q.y);return vec3(abs(q.z+(q.w-q.y)/(6.*d+1e-10)),d/(q.x+1e-10),q.x);}
float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vnoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<5;i++){s+=a*vnoise(p);p=p*2.03+17.;a*=.5;}return s;}
mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
vec2 asp(vec2 uv){return (uv-.5)*vec2(R.x/R.y,1.);}
vec2 unasp(vec2 p){return p/vec2(R.x/R.y,1.)+.5;}
float wv(float x,float s){float f=fract(x);return s<.5?.5+.5*sin(TAU*x):s<1.5?abs(f*2.-1.):s<2.5?f:step(.5,f);}
`;

export class VideoEngine {
  constructor(canvas, ac, sink) {
    this.canvas = canvas; this.ac = ac; this.sink = sink;
    const gl = this.gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
    if (!gl) throw new Error('WebGL2 is not available in this browser');
    this.progs = new Map(); this.t = 0; this.frame = 0; this.order = []; this.dirty = true;
    this.cvbuf = new Float32Array(32); this.thumbIdx = 0; this.preview = null;
    this.black = this.rawTex(gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    this.blit = this.program('vec4 fx(vec2 uv){return texture(a,uv);}', ['a'], [], []);
    this.w = 0; this.setRes(640, 360, []);
  }

  rawTex(filter) {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
    return t;
  }
  target() {
    const gl = this.gl, tex = this.rawTex(gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, this.w, this.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    return { tex, fbo };
  }
  freeTarget(t) { this.gl.deleteTexture(t.tex); this.gl.deleteFramebuffer(t.fbo); }

  setRes(w, h, mods) {
    if (w === this.w && h === this.h) return;
    this.w = w; this.h = h; this.canvas.width = w; this.canvas.height = h;
    for (const m of mods) if (m.def.domain === 'v') { m.impl.tg.forEach(t => this.freeTarget(t)); m.impl.tg = [this.target(), this.target()]; }
  }

  program(glsl, vins, params, xtex) {
    const gl = this.gl;
    const fs = `#version 300 es
precision highp float;precision highp int;precision highp sampler2D;
in vec2 vUv;out vec4 oC;uniform float T,F;uniform vec2 R;uniform sampler2D P;
${[...vins, ...xtex].map(v => `uniform sampler2D ${v};`).join('')}${params.map(p => `uniform float ${p};`).join('')}
${LIB}${glsl}
void main(){oC=vec4(clamp(fx(vUv).rgb,0.,1.),1.);}`;
    const sh = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {};
    for (const n of ['T', 'F', 'R', 'P', ...vins, ...xtex, ...params]) u[n] = gl.getUniformLocation(p, n);
    return { p, u };
  }
  progFor(def) {
    let pr = this.progs.get(def.type);
    if (!pr) {
      const names = def.params.filter(p => p.type !== 'btn').map(p => p.id);
      try { pr = this.program(def.glsl, def.vins, names, def.tex); }
      catch (e) { console.error(`Shader error in "${def.type}":\n${e.message}`); pr = this.program('vec4 fx(vec2 uv){return vec4(1.,0.,1.,1.);}', def.vins, names, def.tex); }
      this.progs.set(def.type, pr);
    }
    return pr;
  }

  create(def, inst) {
    const ac = this.ac;
    const impl = { ains: {}, aouts: {}, vin: {}, acc: {}, cvn: {}, cvc: {}, an: {}, xt: {}, tg: [this.target(), this.target()], prog: this.progFor(def) };
    for (const p of def.params) {
      if (p.acc) impl.acc[p.id] = 0;
      if (p.cv) { const an = ac.createAnalyser(); an.fftSize = 32; an.connect(this.sink); impl.ains[p.id] = an; impl.cvn[p.id] = an; }
    }
    for (const a of def.ains) { const an = ac.createAnalyser(); an.fftSize = a.fft || 1024; an.smoothingTimeConstant = 0.6; an.connect(this.sink); impl.ains[a.id] = an; impl.an[a.id] = an; }
    for (const id of def.aouts) { const cs = ac.createConstantSource(); cs.offset.value = 0; cs.start(); impl.aouts[id] = cs; }
    impl.set = () => { };
    impl.connected = (port, d) => { impl.cvc[port] = (impl.cvc[port] || 0) + d; };
    impl.action = id => def.action?.(inst, this, impl, id);
    impl.dispose = () => {
      def.dispose?.(inst, this, impl);
      impl.tg.forEach(t => this.freeTarget(t));
      for (const k in impl.xt) this.gl.deleteTexture(impl.xt[k]);
      for (const k in impl.ains) impl.ains[k].disconnect();
      for (const k in impl.aouts) { impl.aouts[k].stop(); impl.aouts[k].disconnect(); }
    };
    def.setup?.(inst, this, impl);
    this.dirty = true;
    return impl;
  }

  // Upload a DOM element (video / image) into a named extra texture.
  uploadEl(impl, name, el) {
    const gl = this.gl;
    if (!impl.xt[name]) impl.xt[name] = this.rawTex(gl.LINEAR); else gl.bindTexture(gl.TEXTURE_2D, impl.xt[name]);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, el);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  }
  // Upload a 1-row data texture. fmt: 'r32f' | 'rg32f' | 'r8'
  uploadData(impl, name, w, fmt, data) {
    const gl = this.gl;
    if (!impl.xt[name]) impl.xt[name] = this.rawTex(fmt === 'r8' ? gl.LINEAR : gl.NEAREST); else gl.bindTexture(gl.TEXTURE_2D, impl.xt[name]);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    if (fmt === 'r32f') gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, w, 1, 0, gl.RED, gl.FLOAT, data);
    else if (fmt === 'rg32f') gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, w, 1, 0, gl.RG, gl.FLOAT, data);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, w, 1, 0, gl.RED, gl.UNSIGNED_BYTE, data);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  }

  sort(mods) {
    // Topological order over video connections so chains render in one frame; cycles fall back to a 1-frame delay.
    const seen = new Set(), order = [];
    const visit = m => {
      if (seen.has(m)) return;
      seen.add(m);
      for (const k in m.impl.vin) { const s = m.impl.vin[k]; if (s) visit(s); }
      order.push(m);
    };
    mods.filter(m => m.def.domain === 'v').forEach(visit);
    this.order = order; this.dirty = false;
  }

  cv(impl, p, v) {
    if (!(impl.cvc[p.id] > 0)) return v;
    impl.cvn[p.id].getFloatTimeDomainData(this.cvbuf);
    const c = this.cvbuf[31];
    return c === c ? fromNorm({ ...p, step: 0 }, toNorm(p, v) + c * 0.5) : v;
  }

  render(mods, dt) {
    const gl = this.gl;
    this.t += dt; this.frame++;
    if (this.dirty) this.sort(mods);
    gl.viewport(0, 0, this.w, this.h);
    for (const m of this.order) {
      const impl = m.impl, def = m.def, pr = impl.prog, u = pr.u;
      def.frame?.(m, this, impl);
      gl.bindFramebuffer(gl.FRAMEBUFFER, impl.tg[1].fbo);
      gl.useProgram(pr.p);
      gl.uniform1f(u.T, this.t); gl.uniform1f(u.F, this.frame); gl.uniform2f(u.R, this.w, this.h);
      let unit = 0;
      const bind = (loc, tex) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex || this.black); gl.uniform1i(loc, unit++); };
      bind(u.P, impl.tg[0].tex);
      for (const v of def.vins) { const s = impl.vin[v]; bind(u[v], s && s.impl.tg[0].tex); }
      for (const x of def.tex) bind(u[x], impl.xt[x]);
      for (const p of def.params) {
        if (p.type === 'btn') continue;
        let v = m.params[p.id];
        if (p.cv) v = this.cv(impl, p, v);
        if (p.acc) { v = impl.acc[p.id] = (impl.acc[p.id] + v * dt) % 4096; }
        gl.uniform1f(u[p.id], v);
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      impl.tg.reverse();
      def.after?.(m, this, impl);
    }
    // Screen: a few module thumbnails (round-robin), then the monitor image on top.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.useProgram(this.blit.p);
    gl.activeTexture(gl.TEXTURE0); gl.uniform1i(this.blit.u.a, 0);
    const n = this.order.length;
    for (let k = 0; k < Math.min(4, n); k++) {
      const m = this.order[this.thumbIdx++ % n], c = m.thumb;
      if (!c || !c.offsetParent) continue;
      const r = c.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) continue;
      gl.viewport(0, 0, c.width, c.height);
      gl.bindTexture(gl.TEXTURE_2D, m.impl.tg[0].tex);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      m.thumbCtx.drawImage(this.canvas, 0, this.h - c.height, c.width, c.height, 0, 0, c.width, c.height);
    }
    const show = (this.preview && this.order.includes(this.preview) && this.preview) || this.order.find(m => m.type === 'vout');
    gl.viewport(0, 0, this.w, this.h);
    gl.bindTexture(gl.TEXTURE_2D, show ? show.impl.tg[0].tex : this.black);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
}
