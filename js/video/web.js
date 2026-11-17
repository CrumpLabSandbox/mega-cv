// Web Page source: fetch a URL and turn it into a texture.
//  - HTML: stylesheets and images are inlined, the page is rendered through an SVG <foreignObject>
//    into a tall canvas, and the shader scrolls over it. Scripts never run.
//  - "Image slideshow" mode cycles through the images found on the page.
//  - Direct image / video URLs are shown as-is; "Refresh" re-fetches on a timer (e.g. webcam JPEGs).
// Other sites cannot be read from the browser directly (CORS), so requests go through the
// same-origin /proxy endpoint of server.mjs. Without it only CORS-enabled URLs work.
const W = 1280, VH = 720, MAXP = 8;

const say = (inst, t) => { inst.status = t; if (inst.sayEl) inst.sayEl.textContent = t; };
const dataURL = blob => new Promise((ok, no) => { const f = new FileReader(); f.onload = () => ok(f.result); f.onerror = no; f.readAsDataURL(blob); });
const sleep = ms => new Promise(r => setTimeout(r, ms));

let proxyOK = null;
async function get(url) {
  if (proxyOK !== false) {
    let r = null;
    try { r = await fetch('/proxy?url=' + encodeURIComponent(url)); } catch { }
    if (r && r.headers.get('x-mega-proxy')) {
      proxyOK = true;
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return { r, final: r.headers.get('x-final-url') || url };
    }
    if (proxyOK === null) proxyOK = false;
  }
  let r;
  try { r = await fetch(url); } catch { throw new Error('Blocked by the browser (CORS). Run "node server.mjs" to enable the page proxy.'); }
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return { r, final: r.url || url };
}

const canvasOf = impl => impl.cv || (impl.cv = document.createElement('canvas'));
function push(eng, impl, pages) { eng.uploadEl(impl, 'page', impl.cv); impl.u.pages = pages; }

function drawCover(eng, impl, bmp) {
  const cv = canvasOf(impl); cv.width = W; cv.height = VH;
  const g = cv.getContext('2d'), s = Math.max(W / bmp.width, VH / bmp.height), w = bmp.width * s, h = bmp.height * s;
  g.fillStyle = '#000'; g.fillRect(0, 0, W, VH);
  g.drawImage(bmp, (W - w) / 2, (VH - h) / 2, w, h);
  push(eng, impl, 1);
}

function imgSrc(im) {
  const ss = im.getAttribute('srcset') || im.getAttribute('data-srcset');
  return im.getAttribute('src') || im.getAttribute('data-src') || (ss ? ss.split(',')[0].trim().split(/\s+/)[0] : '');
}
function collectImages(doc, base) {
  const out = new Set();
  const add = s => { try { if (s && !s.startsWith('data:')) out.add(new URL(s, base).href); } catch { } };
  add(doc.querySelector('meta[property="og:image"]')?.getAttribute('content'));
  doc.querySelectorAll('img').forEach(im => add(imgSrc(im)));
  return [...out].filter(u => !/\.svg(\?|$)/i.test(u)).slice(0, 60);
}

function textFallback(eng, impl, doc) {
  const cv = canvasOf(impl), words = (doc.body?.textContent || '').replace(/\s+/g, ' ').trim().split(' ');
  cv.width = W; cv.height = VH * 4;
  const g = cv.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, W, cv.height); g.fillStyle = '#111';
  g.font = 'bold 44px sans-serif'; g.fillText((doc.title || '').slice(0, 48), 40, 80);
  g.font = '26px serif';
  let line = '', y = 150;
  for (const w of words) {
    if (g.measureText(line + ' ' + w).width > W - 80) { g.fillText(line, 40, y); line = w; y += 36; if (y > cv.height - 20) break; } else line += (line ? ' ' : '') + w;
  }
  g.fillText(line, 40, y);
  push(eng, impl, 4);
}

async function renderPage(doc, base, inst, eng, impl, live) {
  doc.querySelectorAll('script,noscript,iframe,object,embed,video,audio,canvas,template,base,meta,source,link:not([rel~="stylesheet"])').forEach(e => e.remove());
  let css = '';
  for (const l of [...doc.querySelectorAll('link')].slice(0, 10)) {
    try { const { r } = await get(new URL(l.getAttribute('href'), base).href); css += (await r.text()).slice(0, 400000) + '\n'; } catch { }
  }
  doc.querySelectorAll('link').forEach(e => e.remove());
  doc.querySelectorAll('style').forEach(s => { css += s.textContent + '\n'; s.remove(); });
  css = css.replace(/@import[^;]+;/g, '').replace(/@font-face\s*{[^}]*}/g, '').replace(/url\((?!\s*['"]?data:)[^)]*\)/g, 'none').replace(/\]\]>/g, '');
  if (!live()) return;

  const imgs = [...doc.querySelectorAll('img')];
  let done = 0;
  await Promise.all(imgs.map(async (im, i) => {
    const src = imgSrc(im);
    ['srcset', 'sizes', 'loading', 'data-src', 'data-srcset'].forEach(a => im.removeAttribute(a));
    if (src.startsWith('data:')) return;
    if (!src || i >= 40) { im.remove(); return; }
    try {
      const { r } = await get(new URL(src, base).href), b = await r.blob();
      if (b.size > 2e6 || !b.type.startsWith('image/')) throw 0;
      im.setAttribute('src', await dataURL(b));
    } catch { im.remove(); }
    if (live()) say(inst, `Loading images ${++done}/${Math.min(imgs.length, 40)}…`);
  }));
  if (!live()) return;

  // Make the DOM safe to serialise as XML, and drop anything that would trigger a network load.
  for (const el of doc.body.querySelectorAll('*')) {
    for (const a of [...el.attributes]) {
      if (!/^[A-Za-z_][\w.-]*$/.test(a.name) || /^on/i.test(a.name)) el.removeAttribute(a.name);
      else if (a.name === 'style' && a.value.includes('url(')) el.setAttribute('style', a.value.replace(/url\((?!\s*['"]?data:)[^)]*\)/g, 'none'));
    }
  }
  // Measure the laid-out height in an isolated shadow tree.
  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:-99999px;top:0;width:${W}px;visibility:hidden`;
  document.body.append(host);
  const sh = host.attachShadow({ mode: 'open' }), st = document.createElement('style'), wrap = document.createElement('div');
  st.textContent = css; wrap.innerHTML = doc.body.innerHTML; sh.append(st, wrap);
  await sleep(250);
  const H = Math.max(VH, Math.min(VH * MAXP, Math.ceil(wrap.scrollHeight)));
  host.remove();
  if (!live()) return;

  const body = new XMLSerializer().serializeToString(doc.body);
  const svg = (`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><foreignObject x="0" y="0" width="${W}" height="${H}">` +
    `<div xmlns="http://www.w3.org/1999/xhtml" style="width:${W}px;height:${H}px;overflow:hidden;background:#fff;color:#000;font:16px sans-serif">` +
    `<style><![CDATA[${css}]]></style>${body}</div></foreignObject></svg>`).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F￾￿]/g, '');
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  try {
    await img.decode();
    if (!live()) return;
    const cv = canvasOf(impl); cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.drawImage(img, 0, 0);
    g.getImageData(0, 0, 1, 1); // throws if the browser considers the rendering tainted
    push(eng, impl, H / VH);
    say(inst, `Page rendered · ${(H / VH).toFixed(1)} screens · ${impl.images.length} images`);
  } catch (e) {
    console.warn('Web Page: styled render failed, using text only', e);
    impl.cv = null; textFallback(eng, impl, doc);
    say(inst, 'Rendered as text only (this page could not be drawn with styles)');
  }
}

export async function loadWeb(inst, eng, impl) {
  let url = String(inst.params.url || '').trim();
  if (!url) { say(inst, 'Type a URL and press Enter'); return; }
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  const token = impl.token = (impl.token || 0) + 1, live = () => impl.token === token && !impl.dead;
  impl.lastLoad = performance.now(); impl.el?.pause?.(); impl.el = null; impl.images = []; impl.slide = 0; impl.nextAt = 0;
  say(inst, 'Loading…');
  try {
    const { r, final } = await get(url), ct = (r.headers.get('content-type') || '').toLowerCase();
    if (ct.startsWith('image/')) {
      const bmp = await createImageBitmap(await r.blob());
      if (live()) { drawCover(eng, impl, bmp); say(inst, 'Image'); }
      return;
    }
    if (ct.startsWith('video/')) {
      r.body?.cancel();
      const v = document.createElement('video');
      v.crossOrigin = 'anonymous'; v.src = proxyOK ? '/proxy?url=' + encodeURIComponent(final) : final;
      v.loop = true; v.muted = true; v.playsInline = true;
      await v.play();
      if (live()) { impl.el = v; impl.u.pages = 1; say(inst, 'Video stream'); } else v.pause();
      return;
    }
    const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
    if (!live()) return;
    impl.images = collectImages(doc, final);
    if (inst.params.mode > 0.5) { say(inst, impl.images.length ? `${impl.images.length} images found` : 'No images found on this page'); return; }
    await renderPage(doc, final, inst, eng, impl, live);
  } catch (e) { if (live()) say(inst, e.message || String(e)); }
}

export function webFrame(inst, eng, impl) {
  const now = performance.now(), p = inst.params;
  if (p.refresh >= 1 && now - (impl.lastLoad || 0) > p.refresh * 1000 && !impl.busy) loadWeb(inst, eng, impl);
  if (impl.el) { if (impl.el.readyState >= 2) eng.uploadEl(impl, 'page', impl.el); return; }
  if (p.mode > 0.5 && impl.images?.length && now >= (impl.nextAt || 0) && !impl.busy) {
    impl.busy = true;
    const token = impl.token, u = impl.images[impl.slide++ % impl.images.length];
    get(u).then(({ r }) => r.blob()).then(createImageBitmap).then(bmp => {
      if (impl.token !== token || impl.dead) return;
      if (bmp.width < 48 || bmp.height < 48) { impl.nextAt = 0; return; }
      drawCover(eng, impl, bmp); impl.nextAt = performance.now() + inst.params.hold * 1000;
    }).catch(() => { impl.nextAt = performance.now() + 200; }).finally(() => { impl.busy = false; });
  }
}
