// Patch assistant: chat with Claude to plan and build patches.
// The user supplies their own Anthropic API key. Requests go straight from this page to
// api.anthropic.com - there is no server in between, and the key is never sent anywhere else.
// Claude gets the module catalog in its system prompt and three tools that act on the live patch.
import { registry } from './defs.js';

const API = 'https://api.anthropic.com/v1/messages';
const KEY_STORE = 'mega-cv.anthropic-key', MODEL_STORE = 'mega-cv.assistant-model';
const MODELS = [['claude-opus-5-5', 'Claude Opus 5.5'], ['claude-sonnet-5-5', 'Claude Sonnet 5.5'], ['claude-haiku-5-5', 'Claude Haiku 5.5']];
const FALLBACK_OK = new Set(['claude-opus-5-5', 'claude-sonnet-5-5']); // models that accept server-side refusal fallbacks

// ---------------------------------------------------------------- what Claude is told
function catalog() {
  const lines = [];
  for (const d of registry.values()) {
    const port = p => p.id + (d.domain === 'v' ? (p.type === 'v' ? ':video' : ':cv') : '');
    const prm = d.params.filter(p => p.type !== 'btn').map(p =>
      p.type === 'sel' ? `${p.id}{${p.options.map((o, i) => i + '=' + o).join(',')}}(${p.def})`
        : p.type === 'tog' ? `${p.id}{0,1}(${p.def})`
          : p.type === 'text' ? `${p.id}"text"`
            : `${p.id} ${p.min}..${p.max}(${p.def})${p.unit ? p.unit : ''}${p.acc ? ' speed' : ''}`);
    lines.push(`${d.type} — ${d.name} [${d.domain === 'v' ? 'video' : 'audio'}/${d.cat}] in: ${d.ins.map(port).join(' ') || '-'} | out: ${d.outs.map(port).join(' ') || '-'} | params: ${prm.join(', ') || '-'}`);
  }
  return lines.join('\n');
}

const systemPrompt = () => `You are the patch assistant built into MEGA·CV, a modular audio and video synthesizer that runs in the browser. The person you are talking to is at the instrument. They describe the sound, the visuals and the feel they want, and you design a patch and build it for them with your tools.

How the instrument works
- A patch is a set of modules plus connections made in a pin matrix. Outputs connect to inputs. Every connection has a level from -2 to 2 (1 is unity, negative inverts).
- Audio and control voltage (CV) are the same kind of signal, so any audio output can feed any audio or CV input. Video is a separate kind of signal: video outputs only connect to video inputs, and each video input takes exactly one source.
- Pitch CV is 1.0 per octave. Gates and triggers are high above 0.5. LFOs and most oscillators swing -1..1; envelopes and followers are 0..1.
- On video modules, the inputs marked :cv modulate the parameter of the same name: a CV of 1 moves it by half its range. Use connection levels around 0.1-0.6 for tasteful modulation. This is how sound drives picture.
- Parameters marked "speed" are rates that get integrated over time (scroll, spin, cycle).
- Nothing is heard unless audio reaches an "out" module (inputs: in = mono, l, r). Nothing is seen unless video reaches a "vout" module (input: a). The "vfollow" module turns picture brightness back into CV. The "world" module renders its video inputs as a 3D splat scene.
- Module ids are the type followed by a number: vco1, vco2, lfo1. Connections are written "module.port", for example "vco1.saw" to "svf1.in".
- Sequencers, envelopes and drums need something to trigger them, usually a "clock" (outputs s16, s8, s4, bar) or the "keys" module for playing by hand. A "vca" with level 0 stays silent until an envelope opens it through its cv input.
- Keep it safe to listen to: sum voices through a "mixer", keep the out module's vol at or below 0.6, and avoid very high resonance with high drive.

How to work
- When the request leaves real choices open, reply first with a short plan in plain language: the voices, the modulators, the video chain, and how sound and picture are tied together. Then ask if they want it built. If they have already told you to go ahead, or the request is specific, build it straight away.
- Build with apply_patch (replaces the whole patch) for a new patch, and edit_patch for changes to the current one. Call get_patch first when you need to see what is there. The tools report any module, port or parameter they could not use; fix those and try again rather than leaving a patch half-wired.
- Honour counts the person gives you exactly ("three oscillators, two LFOs").
- After building, say briefly what you made and name two or three knobs or pins worth playing with. Keep replies short; this is a chat panel beside the instrument. Write plain text without markdown headings or tables.
- Only parameters listed in the catalog exist. Selector parameters take the number shown before each option.

Module catalog (type — name [domain/category] in | out | params with range and (default))
${catalog()}`;

const endpoint = { type: 'string', description: 'A port written as "moduleId.portId", e.g. "vco1.saw"' };
const moduleList = {
  type: 'array', items: {
    type: 'object', required: ['id', 'type'],
    properties: { id: { type: 'string', description: 'type + number, e.g. "vco1"' }, type: { type: 'string' }, params: { type: 'object', description: 'parameter id -> value; omitted parameters use their defaults' } },
  },
};
const connList = { type: 'array', items: { type: 'object', required: ['from', 'to'], properties: { from: endpoint, to: endpoint, level: { type: 'number', description: '-2..2, default 1' } } } };
const TOOLS = [
  { name: 'get_patch', description: 'Read the patch that is currently loaded: its modules with all parameter values, and its connections. Call this before editing a patch you did not just build.', input_schema: { type: 'object', properties: {} } },
  {
    name: 'apply_patch', description: 'Replace the whole patch with a new one. Use this to build a patch from scratch. Returns what was built and a list of anything that could not be applied.',
    input_schema: { type: 'object', required: ['modules', 'connections'], properties: { modules: moduleList, connections: connList } },
  },
  {
    name: 'edit_patch', description: 'Change the current patch in place. Every field is optional; they are applied in this order: remove_modules, add_modules, set_params, disconnect, connect. Returns the result and a list of anything that could not be applied.',
    input_schema: {
      type: 'object', properties: {
        remove_modules: { type: 'array', items: { type: 'string' } }, add_modules: moduleList,
        set_params: { type: 'array', items: { type: 'object', required: ['id', 'params'], properties: { id: { type: 'string' }, params: { type: 'object' } } } },
        disconnect: { type: 'array', items: { type: 'object', required: ['from', 'to'], properties: { from: endpoint, to: endpoint } } }, connect: connList,
      },
    },
  },
];

// ---------------------------------------------------------------- tools, run against the live patch
export function makeTools(patch, load) {
  const undo = [];
  const snap = () => { undo.push(JSON.stringify(patch.toJSON())); if (undo.length > 20) undo.shift(); };
  const split = s => { const i = String(s).lastIndexOf('.'); return i < 0 ? [String(s), ''] : [s.slice(0, i), s.slice(i + 1)]; };

  function cleanParams(def, params, errs, id) {
    const out = {};
    for (const [k, v] of Object.entries(params || {})) {
      const p = def.params.find(x => x.id === k && x.type !== 'btn');
      if (!p) { errs.push(`${id}: no parameter "${k}" (has: ${def.params.filter(x => x.type !== 'btn').map(x => x.id).join(', ') || 'none'})`); continue; }
      if (p.type === 'text') { out[k] = String(v); continue; }
      const n = Number(v);
      if (!Number.isFinite(n)) { errs.push(`${id}.${k}: "${v}" is not a number`); continue; }
      out[k] = Math.min(p.max, Math.max(p.min, p.type === 'knob' && !p.step ? n : Math.round(n)));
    }
    return out;
  }
  // Give every requested module a valid id (type + number), remembering what each requested id became.
  function planModules(list, taken, errs, rename) {
    const mods = [], ok = m => { const d = registry.get(m?.type); return d && new RegExp(`^${d.type}\\d+$`).test(String(m.id || '')); };
    const keep = new Set(); // well-formed ids are honoured first, so a badly named module never steals one
    for (const m of list || []) if (ok(m) && !taken.has(m.id) && !keep.has(m.id)) keep.add(m.id);
    for (const id of keep) taken.add(id);
    for (const m of list || []) {
      const def = registry.get(m?.type);
      if (!def) { errs.push(`unknown module type "${m?.type}"`); continue; }
      let id = String(m.id || '');
      if (keep.has(id)) keep.delete(id); else { let n = 1; while (taken.has(def.type + n)) n++; id = def.type + n; taken.add(id); }
      if (m.id && m.id !== id) { if (taken.has(m.id)) errs.push(`duplicate id "${m.id}": the second one was added as "${id}"`); else rename[m.id] = id; }
      mods.push({ id, type: def.type, params: cleanParams(def, m.params, errs, id) });
    }
    return mods;
  }
  function connect(c, rename, errs) {
    let [a, out] = split(c.from), [b, inp] = split(c.to);
    a = rename[a] || a; b = rename[b] || b;
    const src = patch.get(a), dst = patch.get(b);
    if (!src || !dst) { errs.push(`${c.from} > ${c.to}: no module "${src ? b : a}"`); return 0; }
    const po = src.def.outs.find(p => p.id === out), pi = dst.def.ins.find(p => p.id === inp);
    if (!po) { errs.push(`${c.from}: ${a} has no output "${out}" (outputs: ${src.def.outs.map(p => p.id).join(', ') || 'none'})`); return 0; }
    if (!pi) { errs.push(`${c.to}: ${b} has no input "${inp}" (inputs: ${dst.def.ins.map(p => p.id).join(', ') || 'none'})`); return 0; }
    if (po.type !== pi.type) { errs.push(`${c.from} > ${c.to}: cannot connect ${po.type === 'v' ? 'video' : 'audio/CV'} to ${pi.type === 'v' ? 'a video' : 'an audio/CV'} input`); return 0; }
    const level = Math.min(2, Math.max(-2, Number.isFinite(+c.level) ? +c.level : 1));
    const ex = patch.find(a, out, b, inp);
    if (ex) { patch.setAmt(ex, level); return 1; }
    return patch.connect(a, out, b, inp, level) ? 1 : 0;
  }
  const report = (errs, rename, extra = {}) => ({
    ...extra, modules: patch.mods.length, connections: patch.conns.length,
    ...(Object.keys(rename).length ? { renamed_ids: rename } : {}),
    hears_audio: patch.conns.some(c => patch.get(c.to)?.type === 'out'), shows_video: patch.conns.some(c => patch.get(c.to)?.type === 'vout'),
    problems: errs.length ? errs : 'none',
  });

  const run = {
    get_patch() {
      const j = patch.toJSON();
      return { modules: j.mods, connections: j.conns.map(([f, o, t, i, a]) => ({ from: `${f}.${o}`, to: `${t}.${i}`, level: a })) };
    },
    apply_patch(inp) {
      if (!Array.isArray(inp?.modules)) return { error: 'modules must be an array' };
      snap();
      const errs = [], rename = {}, mods = planModules(inp.modules, new Set(), errs, rename);
      load({ mods, conns: [] });
      let made = 0;
      for (const c of inp.connections || []) made += connect(c, rename, errs);
      return report(errs, rename, { applied: true, connections_made: made });
    },
    edit_patch(inp) {
      snap();
      const errs = [], rename = {};
      for (const id of inp?.remove_modules || []) { const m = patch.get(id); m ? patch.remove(m) : errs.push(`cannot remove "${id}": no such module`); }
      for (const m of planModules(inp?.add_modules, new Set(patch.mods.map(m => m.id)), errs, rename)) patch.add(m.type, m);
      for (const s of inp?.set_params || []) {
        const m = patch.get(rename[s.id] || s.id);
        if (!m) { errs.push(`cannot set parameters on "${s.id}": no such module`); continue; }
        const clean = cleanParams(m.def, s.params, errs, m.id);
        for (const k in clean) patch.setParam(m, k, clean[k]);
        m.el?.dispatchEvent(new CustomEvent('refresh'));
      }
      for (const c of inp?.disconnect || []) {
        const [a, o] = split(c.from), [b, i] = split(c.to), ex = patch.find(rename[a] || a, o, rename[b] || b, i);
        ex ? patch.disconnect(ex) : errs.push(`${c.from} > ${c.to}: not connected`);
      }
      for (const c of inp?.connect || []) connect(c, rename, errs);
      return report(errs, rename, { applied: true });
    },
  };
  return {
    run(name, input) { try { return run[name] ? run[name](input || {}) : { error: `unknown tool ${name}` }; } catch (e) { return { error: String(e.message || e) }; } },
    undo() { const s = undo.pop(); if (s) load(JSON.parse(s)); return !!s; },
    canUndo: () => undo.length > 0,
  };
}

// ---------------------------------------------------------------- API
async function callClaude(key, body, signal) {
  const headers = { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2026-10-21', 'anthropic-dangerous-direct-browser-access': 'true' };
  if (body.fallbacks) headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
  let r;
  try { r = await fetch(API, { method: 'POST', headers, body: JSON.stringify(body), signal }); }
  catch (e) { if (e.name === 'AbortError') throw e; throw new Error('Could not reach api.anthropic.com. Check your connection (or a content blocker).'); }
  const j = await r.json().catch(() => null);
  if (r.ok) return j;
  const msg = j?.error?.message || `HTTP ${r.status}`;
  if (r.status === 401) throw new Error('That API key was not accepted. Check it and enter it again. (' + msg + ')');
  if (r.status === 429) throw new Error('Rate limited by the API. Wait a moment and try again. (' + msg + ')');
  if (r.status === 529 || r.status >= 500) throw new Error('The API is busy or unavailable right now. Try again shortly. (' + msg + ')');
  throw new Error(msg);
}

// ---------------------------------------------------------------- UI
export function initAssistant({ patch, load }) {
  const $ = id => document.getElementById(id);
  const panel = $('chat'), log = $('chatlog'), input = $('chatinput'), send = $('chatsend'), keyBox = $('chatkey'), usage = $('chatusage'), model = $('chatmodel');
  const tools = makeTools(patch, load);
  let messages = [], busy = null, key = '', tokens = { in: 0, out: 0 };
  try { key = localStorage.getItem(KEY_STORE) || sessionStorage.getItem(KEY_STORE) || ''; } catch { }

  MODELS.forEach(([id, name]) => model.add(new Option(name, id)));
  try { model.value = localStorage.getItem(MODEL_STORE) || MODELS[0][0]; } catch { }
  if (!model.value) model.value = MODELS[0][0];
  model.onchange = () => { try { localStorage.setItem(MODEL_STORE, model.value); } catch { } };

  const add = (cls, text) => { const d = document.createElement('div'); d.className = 'msg ' + cls; d.textContent = text; log.append(d); log.scrollTop = log.scrollHeight; return d; };
  const syncKey = () => {
    keyBox.hidden = !!key; $('chatform').hidden = !key; $('chatforget').hidden = !key;
    $('chatundo').disabled = !tools.canUndo();
  };
  const greet = () => add('note', 'Describe the patch you want: how many voices, what kind of modulation, the visuals, the mood. I will suggest a plan, then build it in the rack and matrix. Try: "A slow ambient patch with two detuned oscillators, three LFOs and a kaleidoscope that follows the filter."');

  $('assistant').onclick = () => { panel.hidden = !panel.hidden; $('assistant').classList.toggle('on', !panel.hidden); if (!panel.hidden) (key ? input : $('chatkeyinput')).focus(); };
  $('chatclose').onclick = () => { panel.hidden = true; $('assistant').classList.remove('on'); };
  $('chatkeysave').onclick = () => {
    const v = $('chatkeyinput').value.trim();
    if (!v) return;
    key = v; $('chatkeyinput').value = '';
    try { ($('chatkeyremember').checked ? localStorage : sessionStorage).setItem(KEY_STORE, v); } catch { }
    syncKey(); input.focus();
  };
  $('chatkeyinput').onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') $('chatkeysave').click(); };
  $('chatforget').onclick = () => { key = ''; try { localStorage.removeItem(KEY_STORE); sessionStorage.removeItem(KEY_STORE); } catch { } syncKey(); add('note', 'API key removed from this browser.'); };
  $('chatnew').onclick = () => { busy?.abort(); messages = []; log.textContent = ''; greet(); };
  $('chatundo').onclick = () => { if (tools.undo()) add('note', 'Undid the last change the assistant made.'); syncKey(); };

  async function turn(text) {
    messages.push({ role: 'user', content: text });
    add('user', text);
    const ctl = busy = new AbortController(), status = add('note busy', 'Thinking…');
    send.textContent = 'Stop';
    try {
      for (let step = 0; step < 12; step++) {
        const body = {
          model: model.value, max_tokens: 16000, thinking: { type: 'adaptive' }, output_config: { effort: 'medium' },
          system: [{ type: 'text', text: systemPrompt(), cache_control: { type: 'ephemeral' } }], tools: TOOLS, messages,
        };
        if (FALLBACK_OK.has(model.value)) body.fallbacks = 'default';
        const res = await callClaude(key, body, ctl.signal);
        tokens.in += (res.usage?.input_tokens || 0) + (res.usage?.cache_read_input_tokens || 0) + (res.usage?.cache_creation_input_tokens || 0);
        tokens.out += res.usage?.output_tokens || 0;
        usage.textContent = `${tokens.in.toLocaleString()} tokens in · ${tokens.out.toLocaleString()} out this chat`;
        if (res.stop_reason === 'refusal') { add('note', 'The model declined this request. Try rephrasing it.'); messages.pop(); break; }
        messages.push({ role: 'assistant', content: res.content }); // keep every block, unchanged, for the next request
        const said = res.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
        if (said) { log.insertBefore(Object.assign(document.createElement('div'), { className: 'msg bot', textContent: said }), status); }
        if (res.stop_reason === 'max_tokens') { add('note', 'The reply was cut off for length.'); break; }
        const calls = res.content.filter(b => b.type === 'tool_use');
        if (res.stop_reason !== 'tool_use' || !calls.length) break;
        const results = calls.map(c => {
          const out = tools.run(c.name, c.input);
          if (c.name !== 'get_patch') {
            const n = Array.isArray(out.problems) ? out.problems.length : 0;
            log.insertBefore(Object.assign(document.createElement('div'), { className: 'msg tool', textContent: out.error ? `Could not change the patch: ${out.error}` : `${c.name === 'apply_patch' ? 'Built a new patch' : 'Edited the patch'}: ${out.modules} modules, ${out.connections} connections${n ? ` · ${n} thing${n > 1 ? 's' : ''} to fix` : ''}` }), status);
          }
          return { type: 'tool_result', tool_use_id: c.id, content: JSON.stringify(out), ...(out.error ? { is_error: true } : {}) };
        });
        messages.push({ role: 'user', content: results }); // all results in one message
        status.textContent = 'Working on the patch…'; syncKey();
        log.scrollTop = log.scrollHeight;
      }
    } catch (e) {
      if (e.name !== 'AbortError') add('err', e.message);
      // Leave the history in a state the API will accept: drop a trailing user turn that got no reply.
      while (messages.length && messages[messages.length - 1].role === 'user') messages.pop();
      if (e.name === 'AbortError') add('note', 'Stopped.');
    } finally {
      status.remove(); busy = null; send.textContent = 'Send'; syncKey(); log.scrollTop = log.scrollHeight;
    }
  }
  const submit = () => {
    if (busy) { busy.abort(); return; }
    const t = input.value.trim();
    if (!t || !key) return;
    input.value = ''; turn(t);
  };
  send.onclick = submit;
  input.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } };
  input.onkeyup = e => e.stopPropagation();
  greet(); syncKey();
  return tools;
}
