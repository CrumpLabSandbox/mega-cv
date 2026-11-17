// Matrix patch bay: rows are outputs (sources), columns are inputs (destinations).
// Two matrices share this class: 'a' (audio + CV, with per-pin level) and 'v' (video, one source per input).
import { CAT_COLORS } from './defs.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class Matrix {
  constructor(el, patch, status, pop) {
    this.el = el; this.patch = patch; this.status = status; this.pop = pop;
    this.kind = 'a'; this.rows = []; this.cols = []; this.cells = []; this.hl = [];
    el.addEventListener('click', e => { const td = e.target.closest('td'); if (td) this.toggle(td); });
    el.addEventListener('mouseover', e => this.hover(e.target.closest('td')));
    el.addEventListener('mouseleave', () => this.hover(null));
    el.addEventListener('contextmenu', e => {
      const td = e.target.closest('td'); if (!td) return;
      e.preventDefault();
      const c = this.connOf(td); if (c && c.type === 'a') this.openPop(td, c);
    });
    el.addEventListener('wheel', e => {
      if (!e.shiftKey) return;
      const td = e.target.closest('td'), c = td && this.connOf(td);
      if (!c || c.type !== 'a') return;
      e.preventDefault();
      const d = (e.deltaY || e.deltaX) > 0 ? -0.05 : 0.05;
      patch.setAmt(c, Math.max(-2, Math.min(2, +(c.amt + d).toFixed(2))));
      this.hover(td);
    }, { passive: false });
    pop.querySelector('input').addEventListener('input', e => { if (this.popConn) { patch.setAmt(this.popConn, +e.target.value); this.syncPop(); } });
    pop.addEventListener('click', e => { const v = e.target.dataset.v; if (v != null && this.popConn) { patch.setAmt(this.popConn, +v); this.syncPop(); } });
    addEventListener('pointerdown', e => { if (!pop.hidden && !pop.contains(e.target)) pop.hidden = true; });
  }

  setKind(k) { this.kind = k; this.el.classList.toggle('kv', k === 'v'); this.render(); this.hover(null); }

  render() {
    const k = this.kind, rows = this.rows = [], cols = this.cols = [];
    for (const m of this.patch.mods) {
      for (const p of m.def.outs) if (p.type === k) rows.push({ m, p });
      for (const p of m.def.ins) if (p.type === k) cols.push({ m, p });
    }
    this.pop.hidden = true;
    if (!rows.length || !cols.length) {
      this.el.innerHTML = `<p class="empty">No ${k === 'v' ? 'video' : 'audio / CV'} ${rows.length ? 'inputs' : 'outputs'} yet. Add modules with <b>+ Module</b>.</p>`;
      this.cells = []; return;
    }
    const span = (list, i) => { let n = 1; while (list[i + n] && list[i + n].m === list[i].m) n++; return n; };
    const col = m => CAT_COLORS[m.def.cat] || '#888';
    let h = '<table class="mx"><thead><tr><th class="corner" colspan="2" rowspan="2"><span>OUT &#8595;</span><span>IN &#8594;</span></th>';
    for (let c = 0; c < cols.length; c++) if (!c || cols[c].m !== cols[c - 1].m)
      h += `<th class="cm" colspan="${span(cols, c)}" style="--c:${col(cols[c].m)}"><span>${esc(cols[c].m.name)}</span></th>`;
    h += '</tr><tr>';
    cols.forEach((x, c) => { h += `<th class="cp${!c || x.m !== cols[c - 1].m ? ' g' : ''}"><span>${esc(x.p.label)}</span></th>`; });
    h += '</tr></thead><tbody>';
    rows.forEach((x, r) => {
      const first = !r || x.m !== rows[r - 1].m;
      h += `<tr class="${first ? 'g' : ''}">`;
      if (first) h += `<th class="rm" rowspan="${span(rows, r)}" style="--c:${col(x.m)}">${esc(x.m.name)}</th>`;
      h += `<th class="rp">${esc(x.p.label)}</th>`;
      for (let c = 0; c < cols.length; c++) h += `<td${!c || cols[c].m !== cols[c - 1].m ? ' class="g"' : ''} data-r="${r}" data-c="${c}"></td>`;
      h += '</tr>';
    });
    this.el.innerHTML = h + '</tbody></table>';
    this.cells = [...this.el.querySelectorAll('tbody tr')].map(tr => [...tr.querySelectorAll('td')]);
    this.colHeads = [...this.el.querySelectorAll('th.cp')];
    this.rowHeads = [...this.el.querySelectorAll('th.rp')];
    this.refresh();
  }

  refresh() {
    if (!this.cells.length) return;
    for (const td of this.el.querySelectorAll('td.on')) { td.classList.remove('on', 'neg'); td.style.removeProperty('--o'); }
    const ri = new Map(this.rows.map((x, i) => [x.m.id + '.' + x.p.id, i])), ci = new Map(this.cols.map((x, i) => [x.m.id + '.' + x.p.id, i]));
    for (const c of this.patch.conns) {
      if (c.type !== this.kind) continue;
      const td = this.cells[ri.get(c.from + '.' + c.out)]?.[ci.get(c.to + '.' + c.inp)];
      if (!td) continue;
      td.classList.add('on'); td.classList.toggle('neg', c.amt < 0);
      td.style.setProperty('--o', 0.3 + 0.7 * Math.min(1, Math.abs(c.amt)));
    }
  }

  ends(td) { return [this.rows[+td.dataset.r], this.cols[+td.dataset.c]]; }
  connOf(td) { const [r, c] = this.ends(td); return this.patch.find(r.m.id, r.p.id, c.m.id, c.p.id); }
  toggle(td) {
    const [r, c] = this.ends(td), ex = this.connOf(td);
    if (ex) this.patch.disconnect(ex); else this.patch.connect(r.m.id, r.p.id, c.m.id, c.p.id, 1);
    this.hover(td);
  }
  hover(td) {
    this.hl.forEach(e => e.classList.remove('hl')); this.hl = [];
    if (!td) { this.status.textContent = this.kind === 'a' ? 'Click a pin to patch · right-click or shift+scroll a pin to set its level' : 'Click a pin to patch · one source per video input'; return; }
    const [r, c] = this.ends(td), cn = this.connOf(td);
    this.hl = [this.rowHeads[+td.dataset.r], this.colHeads[+td.dataset.c]];
    this.hl.forEach(e => e.classList.add('hl'));
    this.status.innerHTML = `<b>${esc(r.m.name)}</b> ${esc(r.p.label)} &#8594; <b>${esc(c.m.name)}</b> ${esc(c.p.label)}${cn && cn.type === 'a' ? ` &nbsp;·&nbsp; level ${cn.amt.toFixed(2)}` : ''}`;
  }

  openPop(td, c) {
    this.popConn = c;
    const r = td.getBoundingClientRect(), p = this.pop;
    p.hidden = false;
    p.style.left = Math.max(8, Math.min(innerWidth - p.offsetWidth - 8, r.left - p.offsetWidth / 2)) + 'px';
    p.style.top = Math.min(innerHeight - p.offsetHeight - 8, r.bottom + 6) + 'px';
    this.syncPop();
  }
  syncPop() {
    const c = this.popConn;
    this.pop.querySelector('input').value = c.amt;
    this.pop.querySelector('output').textContent = c.amt.toFixed(2);
    this.pop.querySelector('.t').textContent = `${this.patch.get(c.from).name} ${c.out} → ${this.patch.get(c.to).name} ${c.inp}`;
  }
}
