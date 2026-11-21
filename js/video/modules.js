// Video module definitions. Each module is a GLSL function `vec4 fx(vec2 uv)`.
// Available in every shader: T (seconds), F (frame count), R (resolution), P (this module's previous frame),
// one sampler per video input (a, b, c), one float uniform per param, plus the helpers in engine.js LIB.
// Param flags: cv = gets a CV input in the matrix (+-1 sweeps the full range), acc = integrated over time (speed -> phase).
import { register, P, SEL, TOG, BTN, TEXT, ports } from '../defs.js';
import { loadWeb, webFrame, stopLive } from './web.js';

export function V(type, name, cat, o) {
  const params = o.params || [], vins = ports(o.ins || [], 'v'), ains = o.ains || [], aouts = o.aouts || [];
  register({
    type, name, cat, domain: 'v', params, glsl: o.glsl, tex: o.tex || [], cols: o.cols, xuni: o.xuni, status: o.status, onParam: o.onParam, draw: o.draw,
    vins: vins.map(p => p.id), ains, aouts: ports(aouts, 'a').map(p => p.id),
    ins: [...vins, ...ports(ains.map(a => a.id + ':' + (a.label || a.id)), 'a'), ...params.filter(p => p.cv).map(p => ({ id: p.id, label: p.label, type: 'a' }))],
    outs: [...(o.noOut ? [] : [{ id: 'out', label: 'out', type: 'v' }]), ...ports(aouts, 'a')],
    setup: o.setup, frame: o.frame, after: o.after, action: o.action, dispose: o.dispose,
  });
}
const CV = { cv: 1 }, ACC = { acc: 1 };
const A = ['a:In'], AB = ['a:A', 'b:B'];

// ================================================================ Sources
V('vosc', 'V-Osc', 'Video Sources', {
  ins: ['a:FM'],
  params: [P('freq', 'Freq', 0.5, 200, 6, { exp: 1, cv: 1 }), SEL('shape', 'Shape', ['Sine', 'Tri', 'Saw', 'Square']), SEL('geom', 'Geometry', ['Linear', 'Radial', 'Angular', 'Spiral']),
    P('ang', 'Angle', 0, 1, 0, CV), P('speed', 'Speed', -4, 4, 0.3, { acc: 1, cv: 1 }), P('fm', 'FM', 0, 2, 0, CV)],
  glsl: `vec4 fx(vec2 uv){vec2 p=rot(ang*TAU)*asp(uv);float l=length(p),t=atan(p.y,p.x)/TAU;
float ph=geom<.5?p.x*freq:geom<1.5?l*freq:geom<2.5?t*floor(freq+.5):l*freq+t*3.;
ph+=speed+fm*luma(texture(a,uv).rgb)*4.;return vec4(vec3(wv(ph,shape)),1.);}`,
});
V('ramp', 'Ramp', 'Video Sources', {
  params: [SEL('geom', 'Geometry', ['Linear', 'Radial', 'Angular', 'Diamond', 'Box']), P('ang', 'Angle', 0, 1, 0, CV), P('rep', 'Repeat', 1, 16, 1), P('ofs', 'Offset', -1, 1, 0, CV), TOG('mir', 'Mirror')],
  glsl: `vec4 fx(vec2 uv){vec2 p=rot(ang*TAU)*asp(uv);vec2 q=rot(ang*TAU)*(uv-.5);
float g=geom<.5?q.x+.5:geom<1.5?length(p)*1.4:geom<2.5?atan(p.y,p.x)/TAU+.5:geom<3.5?abs(p.x)+abs(p.y):max(abs(p.x),abs(p.y))*2.;
g=g*rep+ofs;float f=mir>.5?abs(fract(g*.5)*2.-1.):fract(g);return vec4(vec3(f),1.);}`,
});
V('vnoise', 'V-Noise', 'Video Sources', {
  params: [SEL('kind', 'Type', ['Static', 'Smooth', 'Fractal', 'Colour static'], 2), P('scale', 'Scale', 0.5, 100, 4, { exp: 1, cv: 1 }), P('speed', 'Speed', -3, 3, 0.3, ACC)],
  glsl: `vec4 fx(vec2 uv){vec2 p=asp(uv)*scale;vec2 c=floor(p*8.)+mod(floor(T*30.),97.)*13.1;
if(kind<.5)return vec4(vec3(hash(c)),1.);
if(kind<1.5)return vec4(vec3(clamp(.5*(vnoise(p+speed)+vnoise(p*1.7-speed+9.))*1.5-.25,0.,1.)),1.);
if(kind<2.5)return vec4(vec3(clamp((fbm(p+fbm(p+speed)*2.)-.22)*2.2,0.,1.)),1.);
return vec4(hash(c),hash(c+7.3),hash(c+19.1),1.);}`,
});
V('shape', 'Shape', 'Video Sources', {
  params: [P('sides', 'Sides', 0, 12, 0, { step: 1 }), P('size', 'Size', 0.01, 1, 0.25, CV), P('soft', 'Soft', 0, 0.5, 0.01), P('ring', 'Ring', 0, 0.5, 0),
    P('px', 'X', -1, 1, 0, CV), P('py', 'Y', -1, 1, 0, CV), P('spin', 'Spin', -2, 2, 0, ACC)],
  glsl: `vec4 fx(vec2 uv){vec2 p=asp(uv)-vec2(px,py)*vec2(R.x/R.y,1.)*.5;float d;
if(sides<2.5)d=length(p);else{float g=atan(p.x,p.y)+spin*TAU,r=TAU/floor(sides+.5);d=cos(floor(.5+g/r)*r-g)*length(p);}
d=ring>.001?abs(d-size)-ring*.5:d-size;float s=max(soft,.003);return vec4(vec3(1.-smoothstep(-s,s,d)),1.);}`,
});
V('plasma', 'Plasma', 'Video Sources', {
  params: [P('scale', 'Scale', 0.5, 20, 4, { exp: 1, cv: 1 }), P('speed', 'Speed', -4, 4, 0.6, ACC), P('cplx', 'Complex', 0, 2, 0.5, CV), P('hue', 'Hue', 0, 1, 0, CV), P('sat', 'Sat', 0, 1, 0.8)],
  glsl: `vec4 fx(vec2 uv){vec2 p=asp(uv)*scale;float t=speed;
float v=sin(p.x+t)+sin(p.y*1.3-t*.7)+sin((p.x+p.y)*.7+t*1.3)+sin(length(p+vec2(sin(t*.5),cos(t*.3))*2.)*1.5-t);
v+=cplx*sin(p.x*2.3*sin(t*.2)+p.y*3.1+v);return vec4(hsv2rgb(vec3(v*.15+hue,sat,.5+.5*sin(v*PI))),1.);}`,
});
V('pattern', 'Pattern', 'Video Sources', {
  params: [SEL('kind', 'Type', ['Checker', 'Grid', 'Dots', 'Stripes', 'Bricks']), P('sx', 'Count X', 1, 64, 8, { exp: 1, cv: 1 }), P('sy', 'Count Y', 1, 64, 8, { exp: 1, cv: 1 }),
    P('thick', 'Width', 0, 1, 0.5, CV), P('ang', 'Angle', 0, 1, 0, CV), P('scx', 'Scroll X', -4, 4, 0, ACC), P('scy', 'Scroll Y', -4, 4, 0, ACC)],
  glsl: `vec4 fx(vec2 uv){vec2 p=rot(ang*TAU)*asp(uv)*vec2(sx,sy)+vec2(scx,scy);vec2 f=fract(p),g=floor(p);float v;
if(kind<.5)v=mod(g.x+g.y,2.);
else if(kind<1.5)v=max(step(1.-thick*.5,f.x),step(1.-thick*.5,f.y));
else if(kind<2.5)v=1.-smoothstep(thick*.5-.03,thick*.5+.03,length(f-.5));
else if(kind<3.5)v=step(f.x,thick);
else{vec2 q=p;q.x+=mod(g.y,2.)*.5;vec2 h=fract(q);v=1.-max(step(1.-thick*.2,h.x),step(1.-thick*.4,h.y));}
return vec4(vec3(v),1.);}`,
});
V('solid', 'Colour', 'Video Sources', {
  params: [P('hue', 'Hue', 0, 1, 0.55, CV), P('sat', 'Sat', 0, 1, 0.8, CV), P('val', 'Value', 0, 1, 1, CV)],
  glsl: `vec4 fx(vec2 uv){return vec4(hsv2rgb(vec3(hue,sat,val)),1.);}`,
});
V('voronoi', 'Voronoi', 'Video Sources', {
  params: [SEL('kind', 'Type', ['Cells', 'Distance', 'Edges', 'Bubbles'], 2), P('scale', 'Scale', 1, 40, 6, { exp: 1, cv: 1 }), P('speed', 'Speed', -4, 4, 0.5, ACC)],
  glsl: `vec4 fx(vec2 uv){vec2 p=asp(uv)*scale;vec2 i=floor(p),f=fract(p);float d1=9.,d2=9.;vec2 id=vec2(0.);
for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){vec2 g=vec2(float(x),float(y));vec2 o=vec2(hash(i+g),hash(i+g+17.3));o=.5+.45*sin(speed+TAU*o);
float d=length(g+o-f);if(d<d1){d2=d1;d1=d;id=i+g;}else if(d<d2)d2=d;}
float v=kind<.5?hash(id):kind<1.5?d1:kind<2.5?smoothstep(0.,.12,d2-d1):1.-d1;return vec4(vec3(v),1.);}`,
});
V('julia', 'Julia', 'Video Sources', {
  params: [P('cx', 'C real', -1.5, 1.5, -0.8, CV), P('cy', 'C imag', -1.5, 1.5, 0.156, CV), P('zoom', 'Zoom', 0.3, 50, 1.2, { exp: 1, cv: 1 }), P('ang', 'Angle', 0, 1, 0, CV)],
  glsl: `vec4 fx(vec2 uv){vec2 z=rot(ang*TAU)*asp(uv)*3./zoom;float n=0.;
for(int i=0;i<64;i++){z=vec2(z.x*z.x-z.y*z.y,2.*z.x*z.y)+vec2(cx,cy);if(dot(z,z)>16.)break;n+=1.;}
float v=n>63.5?0.:(n+4.-log2(log2(max(dot(z,z),4.))))/24.;return vec4(vec3(sqrt(clamp(v,0.,1.))),1.);}`,
});
V('life', 'Life', 'Video Sources', {
  ins: ['a:Seed'],
  params: [P('cell', 'Cell px', 2, 16, 4, { step: 1 }), P('rate', 'Frames/step', 1, 30, 4, { step: 1 }), P('chaos', 'Spawn', 0, 1, 0.15, CV)],
  glsl: `float al(vec2 c,vec2 n){return step(.5,texture(P,(c+.5)/n).g);}
vec4 fx(vec2 uv){vec2 n=floor(R/cell);vec2 c=floor(uv*n);vec4 pv=texture(P,(c+.5)/n);
if(mod(F,floor(rate+.5))>.5)return pv;
float s=al(c+vec2(-1.,-1.),n)+al(c+vec2(0.,-1.),n)+al(c+vec2(1.,-1.),n)+al(c+vec2(-1.,0.),n)+al(c+vec2(1.,0.),n)+al(c+vec2(-1.,1.),n)+al(c+vec2(0.,1.),n)+al(c+vec2(1.,1.),n);
float was=step(.5,pv.g);float now=((s>2.5&&s<3.5)||(was>.5&&s>1.5&&s<2.5))?1.:0.;
if(hash(c+fract(T)*77.)<chaos*chaos*.05)now=1.;
if(luma(texture(a,(c+.5)/n).rgb)>.6&&hash(c+fract(T)*31.)<.3)now=1.;
return vec4(now>.5?1.:pv.r*.9,now,now>.5?1.:pv.b*.97,1.);}`,
});
V('blobs', 'Blobs', 'Video Sources', {
  params: [P('size', 'Size', 0.02, 0.5, 0.14, CV), P('spread', 'Spread', 0, 1.5, 1, CV), P('soft', 'Soft', 0, 1, 0.2), P('speed', 'Speed', -4, 4, 0.7, ACC)],
  glsl: `vec4 fx(vec2 uv){vec2 p=asp(uv);float v=0.;
for(int i=0;i<7;i++){float k=float(i);vec2 c=vec2(sin(speed*(1.+k*.13)+k*1.7),cos(speed*(.8+k*.21)+k*2.3))*vec2(.7,.4)*spread;v+=size*size/max(dot(p-c,p-c),1e-5);}
return vec4(vec3(smoothstep(1.,1.01+soft*4.,v)),1.);}`,
});

// ---- sources that need JavaScript (camera, media files, audio visualisers)
const stopMedia = (inst, eng, impl) => { impl.stream?.getTracks().forEach(t => t.stop()); impl.el?.pause?.(); impl.el = null; };
const useStream = (impl, promise) => promise.then(st => {
  const v = document.createElement('video');
  v.srcObject = st; v.muted = true; v.playsInline = true; v.play();
  impl.stream = st; impl.el = v;
}).catch(e => console.warn('Video source unavailable', e));
const elFrame = name => (inst, eng, impl) => {
  const el = impl.el;
  if (!el) return;
  if (el.tagName === 'VIDEO' ? el.readyState >= 2 : !impl.done && el.complete) { eng.uploadEl(impl, name, el); impl.done = true; }
};
V('camera', 'Camera', 'Video Sources', {
  params: [BTN('on', 'Enable camera'), TOG('flip', 'Mirror', 1)], tex: ['cam'],
  glsl: `vec4 fx(vec2 uv){return texture(cam,vec2(flip>.5?1.-uv.x:uv.x,uv.y));}`,
  action(inst, eng, impl) { if (!impl.stream) useStream(impl, navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } })); },
  frame: elFrame('cam'), dispose: stopMedia,
});
V('screen', 'Screen Capture', 'Video Sources', {
  params: [BTN('on', 'Share a tab / window / screen')], tex: ['cam'],
  glsl: `vec4 fx(vec2 uv){return texture(cam,uv);}`,
  action(inst, eng, impl) { stopMedia(inst, eng, impl); impl.stream = null; useStream(impl, navigator.mediaDevices.getDisplayMedia({ video: true, audio: false })); },
  frame: elFrame('cam'), dispose: stopMedia,
});
V('web', 'Web Page', 'Video Sources', {
  status: 1, tex: ['page'], xuni: ['pages'], cols: 3,
  params: [TEXT('url', 'https://…', 'https://en.wikipedia.org/wiki/Video_synthesizer'), BTN('go', 'Reload'), SEL('mode', 'Show', ['Rendered page', 'Image slideshow', 'Live page (runs scripts)']),
    P('scroll', 'Scroll', -1, 1, 0.04, { acc: 1, cv: 1 }), P('pos', 'Position', 0, 1, 0, CV), P('zoom', 'Zoom', 0.25, 8, 1, { exp: 1, cv: 1 }),
    P('hold', 'Slide time', 0.1, 30, 3, { exp: 1, unit: 's' }), P('refresh', 'Refresh', 0, 600, 0, { step: 1, unit: 's' })],
  glsl: `vec4 fx(vec2 uv){vec2 q=(uv-.5)/zoom+.5;float y=mod(pos*max(pages-1.,0.)+(pages>1.01?scroll:0.)+(1.-q.y),pages);return texture(page,vec2(q.x,1.-y/pages));}`,
  onParam(inst, eng, impl, id) { if (id === 'url' || id === 'mode') { clearTimeout(impl.pend); impl.pend = setTimeout(() => loadWeb(inst, eng, impl), 60); } },
  action(inst, eng, impl) { loadWeb(inst, eng, impl); },
  frame: webFrame,
  dispose(inst, eng, impl) { clearTimeout(impl.pend); impl.el?.pause?.(); stopLive(impl); },
});
V('media', 'Media File', 'Video Sources', {
  params: [BTN('load', 'Load image / video')], tex: ['img'],
  glsl: `vec4 fx(vec2 uv){return texture(img,uv);}`,
  action(inst, eng, impl) {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*,video/*';
    inp.onchange = () => {
      const f = inp.files[0]; if (!f) return;
      const url = URL.createObjectURL(f);
      stopMedia(inst, eng, impl); impl.done = false;
      if (f.type.startsWith('video')) { const v = document.createElement('video'); v.src = url; v.loop = true; v.muted = true; v.playsInline = true; v.play(); impl.el = v; }
      else { const im = new Image(); im.src = url; impl.el = im; }
    };
    inp.click();
  },
  frame: elFrame('img'), dispose: stopMedia,
});
V('ascope', 'Audio Scope', 'Video Sources', {
  ains: [{ id: 'sig', label: 'Audio', fft: 2048 }], tex: ['wav'],
  params: [SEL('style', 'Style', ['Line', 'Filled', 'Mirror', 'Radial']), P('gain', 'Gain', 0.1, 10, 1, { exp: 1, cv: 1 }), P('thick', 'Thick', 0, 1, 0.3), P('hue', 'Hue', 0, 1, 0.45, CV), P('sat', 'Sat', 0, 1, 0.7)],
  glsl: `float smp(float x){float f=clamp(x,0.,1.)*510.;int i=int(f);return mix(texelFetch(wav,ivec2(i,0),0).r,texelFetch(wav,ivec2(i+1,0),0).r,fract(f))*gain;}
vec4 fx(vec2 uv){float v;
if(style>2.5){vec2 p=asp(uv);float t=atan(p.y,p.x)/TAU+.5;float r=.25+smp(abs(t*2.-1.))*.2;v=1.-smoothstep(0.,thick*.02+.004,abs(length(p)-r));}
else{float y=(uv.y-.5)*2.;float s0=smp(uv.x),s1=smp(uv.x+1.5/R.x);float lo=min(s0,s1),hi=max(s0,s1);
if(style<.5)v=1.-smoothstep(0.,thick*.04+.008,max(max(lo-y,y-hi),0.));else if(style<1.5)v=step(min(0.,s0),y)*step(y,max(0.,s0));else v=step(abs(y),abs(s0));}
return vec4(hsv2rgb(vec3(hue,sat,1.))*v,1.);}`,
  setup(inst, eng, impl) { impl.buf = new Float32Array(2048); },
  frame(inst, eng, impl) {
    const b = impl.buf; impl.an.sig.getFloatTimeDomainData(b);
    let s = 0;
    for (let i = 1; i < 1536; i++) if (b[i - 1] <= 0 && b[i] > 0) { s = i; break; }
    eng.uploadData(impl, 'wav', 512, 'r32f', b.subarray(s, s + 512));
  },
});
V('spectrum', 'Spectrum', 'Video Sources', {
  ains: [{ id: 'sig', label: 'Audio', fft: 1024 }], tex: ['spc'],
  params: [SEL('style', 'Style', ['Bars', 'Radial', 'Spectrogram']), P('gain', 'Gain', 0.2, 5, 1, { exp: 1, cv: 1 }), P('bars', 'Bars', 4, 128, 32, { exp: 1, step: 1 }), P('hue', 'Hue', 0, 1, 0.6, CV)],
  glsl: `float sp(float x){return texture(spc,vec2(pow(clamp(x,0.,1.),2.)*.7+.001,.5)).r*gain;}
vec4 fx(vec2 uv){
if(style>1.5){if(uv.x<1.-1.5/R.x)return texture(P,uv+vec2(1./R.x,0.));float s=sp(uv.y);return vec4(hsv2rgb(vec3(hue+(1.-s)*.6,1.,s)),1.);}
float v,k;
if(style<.5){float n=floor(bars+.5);k=(floor(uv.x*n)+.5)/n;v=step(uv.y,sp(k))*step(.12,fract(uv.x*n));}
else{vec2 p=asp(uv);k=abs(atan(p.x,p.y)/PI);float r=length(p);v=step(.12,r)*step(r,.12+sp(k)*.4);}
return vec4(hsv2rgb(vec3(hue+k*.35,.85,1.))*v,1.);}`,
  setup(inst, eng, impl) { impl.buf = new Uint8Array(512); },
  frame(inst, eng, impl) { impl.an.sig.getByteFrequencyData(impl.buf); eng.uploadData(impl, 'spc', 512, 'r8', impl.buf); },
});
V('xyscope', 'XY Scope', 'Video Sources', {
  ains: [{ id: 'x', label: 'X', fft: 512 }, { id: 'y', label: 'Y', fft: 512 }], tex: ['xy'],
  params: [P('gain', 'Gain', 0.1, 10, 0.8, { exp: 1, cv: 1 }), P('decay', 'Persist', 0, 1, 0.9), P('thick', 'Thick', 0, 1, 0.2), P('hue', 'Hue', 0, 1, 0.33, CV), P('sat', 'Sat', 0, 1, 0.8)],
  glsl: `float seg(vec2 p,vec2 s,vec2 e){vec2 pa=p-s,ba=e-s;float h=clamp(dot(pa,ba)/(dot(ba,ba)+1e-9),0.,1.);return length(pa-ba*h);}
vec4 fx(vec2 uv){vec2 p=asp(uv)*2.;float d=9.;vec2 pv=texelFetch(xy,ivec2(0,0),0).rg*gain;
for(int i=1;i<128;i++){vec2 q=texelFetch(xy,ivec2(i,0),0).rg*gain;d=min(d,seg(p,pv,q));pv=q;}
float v=1.-smoothstep(0.,thick*.03+.006,d);vec3 f=texture(P,uv).rgb*decay-.004;return vec4(max(f,hsv2rgb(vec3(hue,sat,1.))*v),1.);}`,
  setup(inst, eng, impl) { impl.bx = new Float32Array(512); impl.by = new Float32Array(512); impl.xy = new Float32Array(256); },
  frame(inst, eng, impl) {
    impl.an.x.getFloatTimeDomainData(impl.bx); impl.an.y.getFloatTimeDomainData(impl.by);
    for (let i = 0; i < 128; i++) { impl.xy[i * 2] = impl.bx[i * 4 + 3]; impl.xy[i * 2 + 1] = impl.by[i * 4 + 3]; }
    eng.uploadData(impl, 'xy', 128, 'rg32f', impl.xy);
  },
});

// ================================================================ Mixing & keying
V('vmix', 'V-Mixer', 'Video Mix', {
  ins: AB, params: [P('mixv', 'Mix', 0, 1, 0.5, CV)],
  glsl: `vec4 fx(vec2 uv){return mix(texture(a,uv),texture(b,uv),mixv);}`,
});
V('blend', 'Blend', 'Video Mix', {
  ins: AB, params: [SEL('mode', 'Mode', ['Add', 'Multiply', 'Screen', 'Difference', 'Overlay', 'Lighten', 'Darken', 'Subtract', 'Exclusion']), P('amt', 'Amount', 0, 1, 1, CV)],
  glsl: `vec4 fx(vec2 uv){vec3 x=texture(a,uv).rgb,y=texture(b,uv).rgb,r;
if(mode<.5)r=x+y;else if(mode<1.5)r=x*y;else if(mode<2.5)r=1.-(1.-x)*(1.-y);else if(mode<3.5)r=abs(x-y);
else if(mode<4.5)r=mix(2.*x*y,1.-2.*(1.-x)*(1.-y),step(.5,x));else if(mode<5.5)r=max(x,y);else if(mode<6.5)r=min(x,y);else if(mode<7.5)r=x-y;else r=x+y-2.*x*y;
return vec4(mix(x,r,amt),1.);}`,
});
V('key', 'Luma Key', 'Video Mix', {
  ins: ['a:Fg', 'b:Bg'], params: [P('th', 'Thresh', 0, 1, 0.4, CV), P('soft', 'Soft', 0, 0.5, 0.05), TOG('inv', 'Invert')],
  glsl: `vec4 fx(vec2 uv){vec4 x=texture(a,uv),y=texture(b,uv);float m=smoothstep(th-soft,th+soft+.001,luma(x.rgb));if(inv>.5)m=1.-m;return mix(y,x,m);}`,
});
V('compare', 'Compare', 'Video Mix', {
  ins: AB, params: [P('th', 'Thresh', 0, 1, 0.5, CV), P('soft', 'Soft', 0, 0.5, 0.01)],
  glsl: `vec4 fx(vec2 uv){float d=luma(texture(a,uv).rgb)-luma(texture(b,uv).rgb);return vec4(vec3(smoothstep(th-soft,th+soft+.001,d)),1.);}`,
});
V('rgbcomb', 'RGB Combine', 'Video Mix', {
  ins: ['a:R', 'b:G', 'c:B'],
  glsl: `vec4 fx(vec2 uv){return vec4(luma(texture(a,uv).rgb),luma(texture(b,uv).rgb),luma(texture(c,uv).rgb),1.);}`,
});
V('vvca', 'V-VCA', 'Video Mix', {
  ins: A, params: [P('level', 'Level', 0, 2, 1, CV)],
  glsl: `vec4 fx(vec2 uv){return vec4(texture(a,uv).rgb*level,1.);}`,
});

// ================================================================ Colour
V('colorize', 'Colorize', 'Video Color', {
  ins: A, params: [P('hue', 'Hue', 0, 1, 0, CV), P('range', 'Range', -2, 2, 0.6, CV), P('sat', 'Sat', 0, 1, 0.9, CV), P('full', 'Bright', 0, 1, 0), P('cycle', 'Cycle', -2, 2, 0, ACC)],
  glsl: `vec4 fx(vec2 uv){float l=luma(texture(a,uv).rgb);return vec4(hsv2rgb(vec3(hue+l*range+cycle,sat,mix(l,step(.02,l),full))),1.);}`,
});
V('hsv', 'HSV Adjust', 'Video Color', {
  ins: A, params: [P('hue', 'Hue', -1, 1, 0, CV), P('sat', 'Sat', 0, 2, 1, CV), P('bri', 'Bright', 0, 2, 1, CV), P('con', 'Contrast', 0, 3, 1, CV)],
  glsl: `vec4 fx(vec2 uv){vec3 h=rgb2hsv(texture(a,uv).rgb);h.x=fract(h.x+hue);h.y=clamp(h.y*sat,0.,1.);vec3 k=hsv2rgb(h);k=(k-.5)*con+.5;return vec4(k*bri,1.);}`,
});
V('levels', 'Levels', 'Video Color', {
  ins: A, params: [P('lev', 'Posterize', 2, 32, 32, { step: 1 }), P('gam', 'Gamma', 0.2, 4, 1, { exp: 1, cv: 1 }), P('inv', 'Invert', 0, 1, 0, CV), P('sol', 'Solarize', 0, 1, 1, CV)],
  glsl: `vec4 fx(vec2 uv){vec3 k=pow(max(texture(a,uv).rgb,0.),vec3(gam));if(lev<31.5){float n=floor(lev+.5)-1.;k=floor(k*n+.5)/n;}
k=mix(k,1.-k,inv);if(sol<.999)k=mix(k,1.-k,step(sol,k));return vec4(k,1.);}`,
});

// ================================================================ Geometry
V('xform', 'Transform', 'Video Geometry', {
  ins: A, params: [P('zoom', 'Zoom', 0.1, 10, 1, { exp: 1, cv: 1 }), P('ang', 'Rotate', -1, 1, 0, CV), P('px', 'X', -1, 1, 0, CV), P('py', 'Y', -1, 1, 0, CV), P('spin', 'Spin', -2, 2, 0, ACC), TOG('tile', 'Tile')],
  glsl: `vec4 fx(vec2 uv){vec2 q=unasp(rot((ang+spin)*TAU)*asp(uv)/zoom)-vec2(px,py);if(tile>.5)q=fract(q);return texture(a,q);}`,
});
V('kaleid', 'Kaleidoscope', 'Video Geometry', {
  ins: A, params: [P('segs', 'Segments', 1, 24, 6, { step: 1, cv: 1 }), P('ang', 'Angle', 0, 1, 0, CV), P('zoom', 'Zoom', 0.2, 5, 1, { exp: 1, cv: 1 }), P('spin', 'Spin', -2, 2, 0, ACC)],
  glsl: `vec4 fx(vec2 uv){vec2 p=asp(uv);float r=length(p)/zoom,t=atan(p.y,p.x)+spin*TAU;float w=TAU/floor(segs+.5);t=abs(mod(t,w)-w*.5)+ang*TAU;return texture(a,unasp(vec2(cos(t),sin(t))*r));}`,
});
V('mirror', 'Mirror', 'Video Geometry', {
  ins: A, params: [SEL('mode', 'Mode', ['Left / Right', 'Top / Bottom', 'Quad', 'Diagonal'])],
  glsl: `vec4 fx(vec2 uv){vec2 q=uv;if(mode<.5)q.x=.5-abs(q.x-.5);else if(mode<1.5)q.y=.5-abs(q.y-.5);else if(mode<2.5)q=.5-abs(q-.5);else{vec2 p=asp(uv);if(p.y>p.x)p=p.yx;q=unasp(p);}return texture(a,q);}`,
});
V('scroll', 'Scroll', 'Video Geometry', {
  ins: A, params: [P('vx', 'Speed X', -2, 2, 0.1, { acc: 1, cv: 1 }), P('vy', 'Speed Y', -2, 2, 0, { acc: 1, cv: 1 })],
  glsl: `vec4 fx(vec2 uv){return texture(a,fract(uv+vec2(vx,vy)));}`,
});
V('displace', 'Displace', 'Video Geometry', {
  ins: ['a:In', 'b:Map'], params: [SEL('mode', 'Mode', ['Luma', 'Red/Green', 'Angle']), P('dx', 'Amount X', -1, 1, 0.1, CV), P('dy', 'Amount Y', -1, 1, 0.1, CV)],
  glsl: `vec4 fx(vec2 uv){vec3 d=texture(b,uv).rgb;float l=luma(d);vec2 o=mode<.5?vec2(dx,dy)*(l-.5):mode<1.5?(d.rg-.5)*vec2(dx,dy):vec2(cos(l*TAU),sin(l*TAU))*vec2(dx,dy)*.5;return texture(a,uv+o);}`,
});
V('warp', 'Warp', 'Video Geometry', {
  ins: A, params: [SEL('kind', 'Type', ['Waves', 'Ripple', 'Noise', 'Twirl']), P('freq', 'Freq', 0.5, 60, 8, { exp: 1, cv: 1 }), P('amp', 'Amount', 0, 1, 0.2, CV), P('speed', 'Speed', -6, 6, 1, ACC)],
  glsl: `vec4 fx(vec2 uv){vec2 p=asp(uv),o;
if(kind<.5)o=vec2(sin(p.y*freq+speed),sin(p.x*freq+speed*1.3));
else if(kind<1.5)o=normalize(p+1e-5)*sin(length(p)*freq-speed);
else if(kind<2.5)o=vec2(vnoise(p*freq*.3+speed*.3),vnoise(p*freq*.3+7.-speed*.3))-.5;
else return texture(a,unasp(rot(amp*6.*exp(-length(p)*freq*.3))*p));
return texture(a,uv+o*amp*.2);}`,
});
V('tunnel', 'Tunnel / Polar', 'Video Geometry', {
  ins: A, params: [SEL('mode', 'Mode', ['Tunnel', 'To polar', 'From polar']), P('speed', 'Speed', -3, 3, 0.4, { acc: 1, cv: 1 }), P('reps', 'Repeat', 1, 8, 2, { step: 1 }), P('twist', 'Twist', -2, 2, 0, CV), P('fog', 'Fog', 0, 1, 0.7)],
  glsl: `vec4 fx(vec2 uv){vec2 p=asp(uv);float r=length(p),t=atan(p.y,p.x)/TAU;
if(mode<.5){vec2 q=vec2(t*reps+twist*r,.3/max(r,.001)+speed);return vec4(texture(a,fract(q)).rgb*mix(1.,smoothstep(0.,.5,r),fog),1.);}
if(mode<1.5)return texture(a,vec2(fract(t*reps+.5+speed),r*1.1+twist*t));
return texture(a,.5+uv.y*.5*vec2(cos((uv.x*reps+speed)*TAU),sin((uv.x*reps+speed)*TAU))*vec2(R.y/R.x,1.));}`,
});

// ================================================================ Effects
V('feedback', 'Feedback', 'Video FX', {
  ins: A,
  params: [SEL('mode', 'Mode', ['Max', 'Add', 'Mix', 'Difference', 'Over']), P('decay', 'Amount', 0, 1.1, 0.92, CV), P('zoom', 'Zoom', 0.5, 1.5, 1.02, CV), P('ang', 'Rotate', -0.25, 0.25, 0, CV),
    P('px', 'Shift X', -0.2, 0.2, 0, CV), P('py', 'Shift Y', -0.2, 0.2, 0, CV), P('hsh', 'Hue Shift', -0.5, 0.5, 0, CV)],
  glsl: `vec4 fx(vec2 uv){vec3 f=texture(P,unasp(rot(ang*TAU)*asp(uv)/zoom)-vec2(px,py)).rgb;
if(abs(hsh)>.0005){vec3 h=rgb2hsv(f);h.x=fract(h.x+hsh);f=hsv2rgb(h);}
vec3 s=texture(a,uv).rgb,g=max(f*decay-.004,0.);
vec3 r=mode<.5?max(s,g):mode<1.5?s+g:mode<2.5?mix(s,f,clamp(decay,0.,1.)):mode<3.5?abs(s-g):mix(g,s,smoothstep(.05,.25,luma(s)));return vec4(r,1.);}`,
});
V('trails', 'Trails', 'Video FX', {
  ins: A, params: [SEL('mode', 'Mode', ['Peak', 'Average']), P('decay', 'Persist', 0, 1, 0.9, CV)],
  glsl: `vec4 fx(vec2 uv){vec3 s=texture(a,uv).rgb,f=texture(P,uv).rgb;return vec4(mode<.5?max(s,f*decay-.004):mix(s,f,decay*.98),1.);}`,
});
V('blur', 'Blur', 'Video FX', {
  ins: A, params: [P('radius', 'Radius', 0, 40, 6, CV)],
  glsl: `vec4 fx(vec2 uv){vec3 k=vec3(0.);for(int i=0;i<24;i++){float j=float(i);float r=sqrt((j+.5)/24.)*radius,t=j*2.39996;k+=texture(a,uv+vec2(cos(t),sin(t))*r/R).rgb;}return vec4(k/24.,1.);}`,
});
V('glow', 'Glow', 'Video FX', {
  ins: A, params: [P('th', 'Thresh', 0, 1, 0.4, CV), P('rad', 'Radius', 1, 60, 16), P('amt', 'Amount', 0, 3, 1, CV)],
  glsl: `vec4 fx(vec2 uv){vec3 s=texture(a,uv).rgb,g=vec3(0.);for(int i=0;i<24;i++){float j=float(i);float r=sqrt((j+.5)/24.)*rad,t=j*2.39996;g+=max(texture(a,uv+vec2(cos(t),sin(t))*r/R).rgb-th,0.);}return vec4(s+g/24.*amt*3.,1.);}`,
});
V('edge', 'Edges', 'Video FX', {
  ins: A, params: [P('gain', 'Gain', 0.2, 10, 2, { exp: 1, cv: 1 }), P('wid', 'Width', 0.5, 8, 1), P('col', 'Colour', 0, 1, 0)],
  glsl: `float L(vec2 uv,float x,float y){return luma(texture(a,uv+vec2(x,y)/R*wid).rgb);}
vec4 fx(vec2 uv){float gx=-L(uv,-1.,-1.)-2.*L(uv,-1.,0.)-L(uv,-1.,1.)+L(uv,1.,-1.)+2.*L(uv,1.,0.)+L(uv,1.,1.);
float gy=-L(uv,-1.,-1.)-2.*L(uv,0.,-1.)-L(uv,1.,-1.)+L(uv,-1.,1.)+2.*L(uv,0.,1.)+L(uv,1.,1.);
float g=length(vec2(gx,gy))*gain;return vec4(mix(vec3(g),texture(a,uv).rgb*g*2.,col),1.);}`,
});
V('pixel', 'Pixelate', 'Video FX', {
  ins: A, params: [P('size', 'Size', 1, 128, 12, { exp: 1, cv: 1 })],
  glsl: `vec4 fx(vec2 uv){vec2 n=R/size;return texture(a,(floor(uv*n)+.5)/n);}`,
});
V('rgbsplit', 'RGB Split', 'Video FX', {
  ins: A, params: [P('amt', 'Amount', 0, 1, 0.2, CV), P('ang', 'Angle', 0, 1, 0, CV), TOG('radial', 'Radial')],
  glsl: `vec4 fx(vec2 uv){vec2 o=radial>.5?(uv-.5)*amt*.2:vec2(cos(ang*TAU),sin(ang*TAU))*amt*.05;return vec4(texture(a,uv+o).r,texture(a,uv).g,texture(a,uv-o).b,1.);}`,
});
V('crt', 'CRT', 'Video FX', {
  ins: A, params: [P('lines', 'Lines', 30, 600, 240, { exp: 1 }), P('scan', 'Scanline', 0, 1, 0.4), P('curve', 'Curve', 0, 1, 0.3), P('mask', 'RGB Mask', 0, 1, 0.3), P('vig', 'Vignette', 0, 1, 0.4), P('noisy', 'Noise', 0, 1, 0.08, CV)],
  glsl: `vec4 fx(vec2 uv){vec2 p=uv*2.-1.;p*=1.+curve*dot(p,p)*.15;vec2 q=p*.5+.5;if(q.x<0.||q.x>1.||q.y<0.||q.y>1.)return vec4(0.,0.,0.,1.);
vec3 k=texture(a,q).rgb;k*=1.-scan*(.5+.5*cos(q.y*lines*TAU));float m=mod(gl_FragCoord.x,3.);
k*=mix(vec3(1.),vec3(m<1.?1.4:.8,(m>=1.&&m<2.)?1.4:.8,m>=2.?1.4:.8),mask);k*=1.-vig*dot(p,p)*.5;k+=noisy*(hash(uv*R+fract(T)*61.)-.5);return vec4(k,1.);}`,
});
V('glitch', 'Glitch', 'Video FX', {
  ins: A, params: [P('amt', 'Amount', 0, 1, 0.3, CV), P('rate', 'Rate', 0.5, 60, 12, { exp: 1, unit: 'Hz' }), P('blocks', 'Blocks', 2, 64, 12, { exp: 1 })],
  glsl: `vec4 fx(vec2 uv){float t=floor(T*rate);vec2 q=uv;float by=floor(uv.y*blocks);
if(hash(vec2(by,t))<amt)q.x+=(hash(vec2(by+3.,t))-.5)*amt;
vec2 bc=floor(uv*vec2(blocks*1.7,blocks));if(hash(bc+t*1.3)<amt*.3)q=fract(q+vec2(hash(bc+t),hash(bc-t))-.5);
float s=amt*.03*step(hash(vec2(t,9.)),.5);vec3 k=vec3(texture(a,q+vec2(s,0.)).r,texture(a,q).g,texture(a,q-vec2(s,0.)).b);
if(hash(vec2(t,by*.37))<amt*.1)k=1.-k;return vec4(k,1.);}`,
});
V('halftone', 'Halftone', 'Video FX', {
  ins: A, params: [SEL('kind', 'Type', ['Dots', 'Lines', 'Dither']), P('size', 'Size', 2, 64, 8, { exp: 1, cv: 1 }), P('ang', 'Angle', 0, 1, 0.125, CV), P('col', 'Colour', 0, 1, 0)],
  glsl: `vec4 fx(vec2 uv){vec2 p=rot(ang*TAU)*(uv*R)/size;vec2 g=floor(p)+.5;vec3 s=texture(a,(rot(-ang*TAU)*(g*size))/R).rgb;float l=luma(s);
float v=kind<.5?1.-smoothstep(l*.75-.08,l*.75+.08,length(p-g)):kind<1.5?step(abs(fract(p.y)-.5),l*.5):step(hash(g),l);
return vec4(v*mix(vec3(1.),s/max(l,.15),col),1.);}`,
});

// ================================================================ I/O
V('vfollow', 'Video Probe', 'Video I/O', {
  ins: A, aouts: ['luma:Luma', 'r:R', 'g:G', 'b:B'],
  params: [P('cx', 'X', 0, 1, 0.5, CV), P('cy', 'Y', 0, 1, 0.5, CV), P('area', 'Area', 0.01, 1, 0.3)],
  glsl: `vec4 fx(vec2 uv){vec2 px=uv*R;vec2 ctr=vec2(cx,cy);
if(px.x<8.&&px.y<8.){vec3 k=vec3(0.);for(int i=0;i<32;i++){float j=float(i);float r=sqrt((j+hash(px))/32.)*area*.7,t=j*2.39996+hash(px+3.)*TAU;k+=texture(a,ctr+vec2(cos(t),sin(t))*r*vec2(R.y/R.x,1.)).rgb;}return vec4(k/32.,1.);}
vec3 k=texture(a,uv).rgb;float d=abs(length((uv-ctr)*vec2(R.x/R.y,1.))-area*.7);return vec4(mix(k,vec3(1.,.9,.2),1.-smoothstep(0.,.006,d)),1.);}`,
  setup(inst, eng, impl) { impl.px = new Uint8Array(256); },
  after(inst, eng, impl) {
    const gl = eng.gl, px = impl.px, t = eng.ac.currentTime;
    gl.bindFramebuffer(gl.FRAMEBUFFER, impl.tg[0].fbo);
    gl.readPixels(0, 0, 8, 8, gl.RGBA, gl.UNSIGNED_BYTE, px);
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < 256; i += 4) { r += px[i]; g += px[i + 1]; b += px[i + 2]; }
    r /= 16320; g /= 16320; b /= 16320;
    const o = impl.aouts;
    o.luma.offset.setTargetAtTime(0.299 * r + 0.587 * g + 0.114 * b, t, 0.02);
    o.r.offset.setTargetAtTime(r, t, 0.02); o.g.offset.setTargetAtTime(g, t, 0.02); o.b.offset.setTargetAtTime(b, t, 0.02);
  },
});
V('vout', 'Video Out', 'Video I/O', { ins: A, noOut: 1, glsl: `vec4 fx(vec2 uv){return texture(a,uv);}` });
