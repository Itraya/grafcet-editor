(function () {
  'use strict';
  const G = window.Graph;
  const vscode = acquireVsCodeApi();
  const CW = 200, RH = 60, X0 = 20, MINCOLS = 3, MAXCOLS = 16, MINROWS = 8, MAXROWS = 60;
  const NS = 'http://www.w3.org/2000/svg';
  const KEYS = { '1': 'step', '2': 'init', '3': 'trans', '4': 'jump', '5': 'odiv', '6': 'oconv', '7': 'adiv', '8': 'aconv' };
  const TOOLS = [
    ['step', '1', 'Étape', 'Étape'], ['init', '2', 'Initiale', 'Étape initiale'], ['trans', '3', 'Transition', 'Transition'],
    ['jump', '4', 'Renvoi', 'Renvoi vers une étape'], ['odiv', '5', 'Div. OU', 'Divergence en OU (sélection de séquence)'],
    ['oconv', '6', 'Conv. OU', 'Convergence en OU'], ['adiv', '7', 'Div. ET', 'Divergence en ET (séquences simultanées)'],
    ['aconv', '8', 'Conv. ET', 'Convergence en ET']
  ];
  const newDoc = () => ({ version: 1, cols: 4, rows: 12, nextId: 1, nodes: [] });
  let doc = newDoc(), sel = { r: 0, c: 0 }, lastSent = '', editing = false;

  const nodeAt = (r, c) => doc.nodes.find(n => n.r === r && G.cover(n).includes(c));
  const clip = (s, k) => (s.length > k ? s.slice(0, k - 1) + '…' : s);

  function H(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const k in attrs || {}) { if (k === 'value') el.value = attrs[k]; else el.setAttribute(k, attrs[k]); }
    kids.forEach(k => el.append(k));
    return el;
  }
  function S(tag, attrs, parent) {
    const el = document.createElementNS(NS, tag);
    for (const k in attrs || {}) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  }
  const line = (g, x1, y1, x2, y2, cls) => S('line', { x1, y1, x2, y2, class: cls || 'edge' }, g);
  function text(g, x, y, str, cls) { const t = S('text', { x, y, class: cls }, g); t.textContent = str; return t; }

  function drawNode(g, n) {
    const cx = X0 + n.c * CW + CW / 2, cy = n.r * RH + RH / 2 + 2;
    if (G.isStep(n)) {
      S('rect', { x: cx - 30, y: cy - 16, width: 60, height: 32, class: 'box' }, g);
      if (n.t === 'init') S('rect', { x: cx - 26, y: cy - 12, width: 52, height: 24, class: 'box inner' }, g);
      text(g, cx, cy + 4, clip(n.n || '', 7), 'sname');
      const acts = n.acts || [], hh = 20, top = cy - acts.length * hh / 2;
      acts.forEach((a, i) => {
        const y = top + i * hh;
        if (i === 0) line(g, cx + 30, cy, cx + 44, cy, 'edge thin');
        S('rect', { x: cx + 44, y, width: 26, height: hh, class: 'abox' }, g);
        S('rect', { x: cx + 70, y, width: 96, height: hh, class: 'abox' }, g);
        text(g, cx + 57, y + 14, a.q, 'aq');
        const t = text(g, cx + 75, y + 14, clip(a.v, 12), 'an');
        S('title', {}, t).textContent = a.q + ' ' + a.v;
      });
    } else if (n.t === 'trans') {
      line(g, cx - 14, cy, cx + 14, cy, 'tbar');
      if (n.cond) text(g, cx + 22, cy + 4, clip(n.cond, 30), 'cond');
      if (n.n) text(g, cx - 22, cy + 4, n.n, 'tname');
    } else if (n.t === 'jump') {
      S('path', { d: `M${cx - 7} ${cy - 8} L${cx + 7} ${cy - 8} L${cx} ${cy + 6} Z`, class: 'jarrow' }, g);
      text(g, cx + 14, cy + 4, '>> ' + (n.tg || '?'), 'cond' + (n.tg ? '' : ' missing'));
    } else {
      const x1 = cx - 40, x2 = cx + (G.span(n) - 1) * CW + 40;
      if (n.t === 'adiv' || n.t === 'aconv') { line(g, x1, cy - 3, x2, cy - 3, 'bar2'); line(g, x1, cy + 3, x2, cy + 3, 'bar2'); }
      else line(g, x1, cy, x2, cy, 'bar2');
    }
  }

  function renderBar() {
    const bar = document.getElementById('bar');
    bar.textContent = '';
    TOOLS.forEach(([t, key, label, tip]) => {
      const svg = S('svg', { viewBox: '70 4 100 52', width: 60, height: 31 });
      drawNode(svg, { t, r: 0, c: 0, span: 1, n: '', cond: '', tg: '', acts: [] });
      const b = H('button', { class: 'tool', title: `${tip} (touche ${key})` }, svg, H('span', {}, label));
      b.addEventListener('click', () => place(t));
      bar.appendChild(b);
    });
    bar.appendChild(H('div', { class: 'sep' }));
    const mk = (label, tip, fn, cls) => { const b = H('button', { title: tip, class: cls || '' }, label); b.addEventListener('click', fn); bar.appendChild(b); };
    mk('Actions', 'Actions de l’étape : « N Moteur; S Alarme » (touche A)', () => editField('acts'));
    mk('Élargir', 'Élargit la barre sélectionnée (touche ])', () => resize(1));
    mk('Rétrécir', 'Rétrécit la barre sélectionnée (touche [)', () => resize(-1));
    mk('Effacer', 'Efface l’élément (touche Suppr)', erase);
    bar.appendChild(H('div', { class: 'sep' }));
    mk('+ Col.', 'Ajouter une colonne', () => { if (doc.cols < MAXCOLS) { doc.cols++; commit(); } });
    mk('− Col.', 'Retirer la dernière colonne (si vide)', () => {
      const used = doc.nodes.some(n => G.cover(n).includes(doc.cols - 1));
      if (doc.cols > MINCOLS && !used) { doc.cols--; commit(); } else status('Colonne utilisée ou minimum atteint.');
    });
    mk('+ Ligne', 'Ajouter une ligne', () => { if (doc.rows < MAXROWS) { doc.rows++; commit(); } });
    mk('− Ligne', 'Retirer la dernière ligne (si vide)', () => {
      if (doc.rows > MINROWS && !doc.nodes.some(n => n.r === doc.rows - 1)) { doc.rows--; commit(); } else status('Ligne utilisée ou minimum atteint.');
    });
    mk('Exporter en ST', 'Génère le code Structured Text', () => vscode.postMessage({ type: 'exportST' }), 'primary');
    bar.appendChild(H('span', { class: 'status', id: 'status' }, ''));
  }
  const status = m => { const s = document.getElementById('status'); if (s) s.textContent = m; };

  function render() {
    const root = document.getElementById('root');
    root.textContent = '';
    const E = G.edges(doc), V = G.validate(doc, E);
    const by = new Map(doc.nodes.map(n => [n.id, n]));
    const W = X0 * 2 + doc.cols * CW, Ht = doc.rows * RH + 6;
    const wrap = H('div', { class: 'canvas' });
    const svg = S('svg', { width: W, height: Ht, viewBox: `0 0 ${W} ${Ht}` });
    wrap.appendChild(svg);
    const selr = S('rect', { class: 'selrect', id: 'selrect', width: CW, height: RH - 4, rx: 3 }, svg);

    for (let r = 0; r < doc.rows; r++) for (let c = 0; c < doc.cols; c++)
      if (!nodeAt(r, c)) S('circle', { cx: X0 + c * CW + CW / 2, cy: r * RH + RH / 2 + 2, r: 1.5, class: 'dot' }, svg);
    E.forEach((e, i) => {
      const a = by.get(e.a), b = by.get(e.b), x = X0 + e.x * CW + CW / 2;
      line(svg, x, a.r * RH + RH / 2 + 2, x, b.r * RH + RH / 2 + 2, 'edge' + (V.badEdges.has(i) ? ' bad' : ''));
    });
    doc.nodes.forEach(n => drawNode(svg, n));
    const msgs = new Map();
    V.warnings.forEach(w => msgs.set(w.id, (msgs.get(w.id) ? msgs.get(w.id) + ' · ' : '') + w.msg));
    msgs.forEach((m, id) => {
      const n = by.get(id);
      const d = S('circle', { cx: X0 + n.c * CW + CW / 2 - 40, cy: n.r * RH + RH / 2 - 14, r: 5, class: 'warn' }, svg);
      S('title', {}, d).textContent = m;
    });
    for (let r = 0; r < doc.rows; r++) for (let c = 0; c < doc.cols; c++) {
      const hit = S('rect', { class: 'hit', x: X0 + c * CW, y: r * RH + 2, width: CW, height: RH - 4 }, svg);
      hit.addEventListener('mousedown', () => { if (!editing) { sel = { r, c }; updateSel(); } });
      hit.addEventListener('dblclick', () => editField('main'));
    }
    root.appendChild(wrap);
    updateSel();
    const n = msgs.size + (V.noInit ? 1 : 0);
    status(n ? (V.noInit ? 'Aucune étape initiale. ' : '') + (msgs.size ? msgs.size + ' avertissement(s) : survole les points rouges' : '') : 'Flèches : déplacer · 1-8 : placer · Entrée : modifier · A : actions');
  }
  function updateSel() {
    const el = document.getElementById('selrect'); if (!el) return;
    el.setAttribute('x', X0 + sel.c * CW); el.setAttribute('y', sel.r * RH + 2);
  }
  function commit() {
    lastSent = JSON.stringify(doc, null, 2);
    vscode.postMessage({ type: 'edit', text: lastSent });
    render();
  }

  function uniqueName(prefix) {
    const used = new Set(doc.nodes.map(n => n.n));
    let k = 1; while (used.has(prefix + k)) k++;
    return prefix + k;
  }

  function place(t) {
    const bar = ['odiv', 'oconv', 'adiv', 'aconv'].includes(t);
    const old = nodeAt(sel.r, sel.c);
    const c = old ? old.c : sel.c, r = sel.r;
    const span = bar ? Math.min(old && G.isBar(old) ? G.span(old) : 2, doc.cols - c) : 1;
    for (let x = c; x < c + span; x++) {
      const o = nodeAt(r, x);
      if (o && (!old || o.id !== old.id)) { status('Emplacement occupé.'); return; }
    }
    const nn = { id: old ? old.id : doc.nextId++, t, r, c };
    if (bar) nn.span = span;
    if (t === 'step' || t === 'init') { const keep = old && G.isStep(old); nn.n = keep ? old.n : uniqueName('S'); nn.acts = keep ? old.acts || [] : []; }
    if (t === 'trans') { const keep = old && old.t === 'trans'; nn.n = keep ? old.n : uniqueName('T'); nn.cond = keep ? old.cond : ''; }
    if (t === 'jump') nn.tg = old && old.t === 'jump' ? old.tg : '';
    if (old) doc.nodes[doc.nodes.indexOf(old)] = nn; else doc.nodes.push(nn);
    sel.c = c;
    commit();
    if (!bar) editField('main');
  }
  function erase() {
    const n = nodeAt(sel.r, sel.c); if (!n) return;
    doc.nodes.splice(doc.nodes.indexOf(n), 1); commit();
  }
  function resize(d) {
    const n = nodeAt(sel.r, sel.c);
    if (!n || !G.isBar(n)) { status('Sélectionne une barre de divergence ou de convergence.'); return; }
    const k = G.span(n) + d;
    if (k < 1 || n.c + k > doc.cols) { status('Taille impossible.'); return; }
    for (let x = n.c; x < n.c + k; x++) { const o = nodeAt(n.r, x); if (o && o.id !== n.id) { status('Emplacement occupé.'); return; } }
    n.span = k; commit();
  }

  const parseActs = s => s.split(/[;,]/).map(x => x.trim()).filter(Boolean).map(x => {
    const m = /^(N|S|R)\s+(.+)$/i.exec(x);
    return m ? { q: m[1].toUpperCase(), v: m[2].trim() } : { q: 'N', v: x };
  });

  function editField(which) {
    const n = nodeAt(sel.r, sel.c);
    if (!n) { status('Sélectionne un élément.'); return; }
    const cx = X0 + n.c * CW + CW / 2, cy = n.r * RH + RH / 2 + 2;
    let f = null;
    if (which === 'acts') {
      if (!G.isStep(n)) { status('Les actions se règlent sur une étape.'); return; }
      f = { left: cx + 44, width: 190, ph: 'N Moteur; S Alarme', get: () => (n.acts || []).map(a => a.q + ' ' + a.v).join('; '), set: v => { n.acts = parseActs(v); } };
    } else if (which === 'name' && (G.isStep(n) || n.t === 'trans')) {
      f = { left: n.t === 'trans' ? cx - 120 : cx - 30, width: n.t === 'trans' ? 96 : 60, ph: 'Nom', get: () => n.n || '', set: v => { n.n = v; } };
    } else if (G.isStep(n)) f = { left: cx - 30, width: 60, ph: 'Nom', get: () => n.n || '', set: v => { n.n = v; } };
    else if (n.t === 'trans') f = { left: cx + 20, width: 200, ph: 'Condition (ex. Start AND NOT Stop)', get: () => n.cond || '', set: v => { n.cond = v; } };
    else if (n.t === 'jump') f = { left: cx + 14, width: 120, ph: 'Étape cible', get: () => n.tg || '', set: v => { n.tg = v; } };
    if (!f) { status('Pas de champ à modifier pour une barre.'); return; }
    const wrap = document.querySelector('.canvas');
    const inp = H('input', { class: 'namebox', placeholder: f.ph, value: f.get() });
    inp.style.left = f.left + 'px'; inp.style.top = (cy - 11 + 8) + 'px'; inp.style.width = f.width + 'px';
    wrap.appendChild(inp);
    editing = true; inp.focus(); inp.select();
    const done = save => { if (!editing) return; editing = false; if (save) f.set(inp.value.trim()); inp.remove(); commit(); };
    inp.addEventListener('keydown', ev => {
      if (ev.key === 'Enter') { ev.preventDefault(); done(true); }
      else if (ev.key === 'Escape') done(false);
      ev.stopPropagation();
    });
    inp.addEventListener('blur', () => done(true));
  }

  function move(dr, dc) {
    sel = { r: Math.max(0, Math.min(doc.rows - 1, sel.r + dr)), c: Math.max(0, Math.min(doc.cols - 1, sel.c + dc)) };
    updateSel();
  }

  document.addEventListener('keydown', ev => {
    if (editing || ev.target.tagName === 'INPUT' || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const k = ev.key;
    if (k === 'ArrowRight') move(0, 1); else if (k === 'ArrowLeft') move(0, -1);
    else if (k === 'ArrowDown') move(1, 0); else if (k === 'ArrowUp') move(-1, 0);
    else if (KEYS[k]) place(KEYS[k]);
    else if (k === 'Delete' || k === 'Backspace') erase();
    else if (k === 'Enter' || k === 'F2') editField('main');
    else if (k === 'a' || k === 'A') editField('acts');
    else if (k === 'n' || k === 'N') editField('name');
    else if (k === ']') resize(1); else if (k === '[') resize(-1);
    else return;
    ev.preventDefault();
  });

  function load(txt) {
    let d;
    try { d = JSON.parse(txt); } catch (e) { status('JSON invalide : ' + e.message); return; }
    if (!d || !Array.isArray(d.nodes)) d = newDoc();
    d.nodes.forEach(n => { if (G.isStep(n)) n.acts = Array.isArray(n.acts) ? n.acts : []; });
    d.nextId = Math.max(d.nextId || 1, ...d.nodes.map(n => n.id + 1), 1);
    d.cols = Math.min(MAXCOLS, Math.max(d.cols || 4, MINCOLS, ...d.nodes.map(n => n.c + G.span(n))));
    d.rows = Math.min(MAXROWS, Math.max(d.rows || 12, MINROWS, ...d.nodes.map(n => n.r + 1)));
    doc = d; sel = { r: Math.min(sel.r, d.rows - 1), c: Math.min(sel.c, d.cols - 1) };
    render();
  }

  window.addEventListener('message', ev => {
    const m = ev.data;
    if (m.type !== 'doc' || m.text === lastSent) return;
    lastSent = m.text;
    if (m.text.trim()) load(m.text); else { doc = newDoc(); render(); }
  });

  renderBar(); render();
  vscode.postMessage({ type: 'ready' });
})();
