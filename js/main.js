import './audio/modules.js';
import './video/modules.js';
import { initWorld } from './video/world.js';
import { registry } from './defs.js';
import { Patch } from './patch.js';
import { VideoEngine } from './video/engine.js';
import { Rack, buildMenu } from './ui.js';
import { Matrix } from './matrix.js';
import { presets } from './presets.js';

const $ = id => document.getElementById(id);
const STORE = 'mega-cv.patch';

async function boot() {
  const ac = new AudioContext({ latencyHint: 'interactive' });
  await ac.audioWorklet.addModule('js/audio/worklet.js');
  const master = ac.createGain(), sink = ac.createGain();
  sink.gain.value = 0;
  master.connect(ac.destination); sink.connect(ac.destination);

  const video = new VideoEngine($('screen'), ac, sink);
  const patch = new Patch(ac, video, { master, sink });
  const rack = new Rack($('rack'), patch, video);
  const matrix = new Matrix($('matrix'), patch, $('mxstatus'), $('pinpop'));

  let mxDirty = true, saveT = 0, loading = false;
  patch.on = (ev, x) => {
    if (ev === 'add') { rack.add(x, !loading); mxDirty = true; }
    else if (ev === 'remove') { rack.remove(x); mxDirty = true; }
    else if (ev === 'conn' || ev === 'amt') matrix.refresh();
    else if (ev === 'load') mxDirty = true;
    clearTimeout(saveT);
    saveT = setTimeout(() => { try { localStorage.setItem(STORE, JSON.stringify(patch.toJSON())); } catch { } }, 400);
  };
  const load = json => { loading = true; try { patch.load(json); } finally { loading = false; } video.preview = null; rack.markPreview(); };

  // ---- top bar
  const menu = $('menu');
  buildMenu(menu, type => patch.add(type));
  $('add').onclick = e => { menu.hidden = !menu.hidden; e.stopPropagation(); };
  addEventListener('pointerdown', e => { if (!menu.hidden && !menu.contains(e.target) && e.target !== $('add')) menu.hidden = true; });
  addEventListener('keydown', e => { if (e.key === 'Escape') { menu.hidden = true; $('pinpop').hidden = true; } });

  const sel = $('presets');
  sel.add(new Option(`Presets (${presets.length})…`, ''));
  const groups = {};
  presets.forEach((p, i) => {
    const g = groups[p.group] || (groups[p.group] = sel.appendChild(Object.assign(document.createElement('optgroup'), { label: p.group })));
    g.append(new Option(p.name, i));
  });
  sel.onchange = () => { if (sel.value !== '') load(presets[+sel.value]); sel.value = ''; };

  $('save').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(patch.toJSON(), null, 1)], { type: 'application/json' }));
    a.download = 'mega-cv-patch.json'; a.click();
  };
  $('load').onclick = () => $('file').click();
  $('file').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { load(JSON.parse(await f.text())); } catch (err) { alert('Could not load patch: ' + err.message); }
    e.target.value = '';
  };
  $('clear').onclick = () => { if (!patch.mods.length || confirm('Remove all modules?')) load({ mods: [], conns: [] }); };

  $('res').onchange = e => { const [w, h] = e.target.value.split('x').map(Number); video.setRes(w, h, patch.mods); };
  const worldUpdate = initWorld({ patch, video, canvas: $('screen'), setRes: (w, h) => { $('res').value = `${w}x${h}`; video.setRes(w, h, patch.mods); } });
  $('fs').onclick = () => $('screen').requestFullscreen?.();
  $('power').onclick = () => { const on = ac.state === 'running'; on ? ac.suspend() : ac.resume(); $('power').classList.toggle('on', !on); };

  let rec = null;
  $('rec').onclick = () => {
    if (rec) { rec.stop(); return; }
    const st = $('screen').captureStream(30), dest = ac.createMediaStreamDestination(), chunks = [];
    master.connect(dest); st.addTrack(dest.stream.getAudioTracks()[0]);
    rec = new MediaRecorder(st);
    rec.ondataavailable = e => chunks.push(e.data);
    rec.onstop = () => {
      master.disconnect(dest); rec = null; $('rec').classList.remove('on');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' })); a.download = 'mega-cv.webm'; a.click();
    };
    rec.start(); $('rec').classList.add('on');
  };

  const seg = (id, fn) => $(id).addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    [...$(id).children].forEach(c => c.classList.toggle('on', c === b)); fn(b.dataset.v);
  });
  seg('view', v => { $('main').className = 'v-' + v; });
  seg('mxtab', k => matrix.setKind(k));

  // ---- initial patch
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(STORE)); } catch { }
  try { load(saved && saved.mods?.length ? saved : presets[0]); } catch (e) { console.error(e); load(presets[0]); }
  matrix.hover(null);

  // ---- frame loop
  let last = performance.now();
  const frame = now => {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (mxDirty) { mxDirty = false; matrix.render(); }
    try { worldUpdate(dt); video.render(patch.mods, dt); } catch (e) { console.error(e); }
    for (const m of patch.mods) m.impl.tick?.();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  window.megacv = { ac, patch, video, registry, presets, load }; // handy in the console
}

$('go').onclick = async () => {
  $('go').disabled = true;
  try { await boot(); $('start').remove(); }
  catch (e) { console.error(e); $('err').textContent = 'Could not start: ' + e.message; $('go').disabled = false; }
};
const count = d => [...registry.values()].filter(x => x.domain === d).length;
$('counts').textContent = `${count('a')} audio modules · ${count('v')} video modules`;
