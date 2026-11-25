'use strict';
const G = require('./media/graph.js');
const san = s => String(s || '').replace(/[^A-Za-z0-9_]/g, '_');

function toST(doc) {
  const nodes = doc.nodes || [];
  const E = G.edges(doc);
  const by = new Map(nodes.map(n => [n.id, n]));
  const ins = id => E.filter(e => e.b === id).map(e => by.get(e.a));
  const outs = id => E.filter(e => e.a === id).map(e => by.get(e.b));
  const uniq = l => [...new Map(l.map(n => [n.id, n])).values()];

  const steps = nodes.filter(G.isStep).sort((a, b) => a.r - b.r || a.c - b.c);
  const used = new Set(), xv = new Map();
  const unique = base => { let v = base, k = 2; while (used.has(v)) v = base + '_' + k++; used.add(v); return v; };
  steps.forEach(s => xv.set(s.id, unique('X_' + san(s.n || 'S' + s.id))));
  const byName = new Map(steps.map(s => [s.n, s]));

  const up = (n, seen) => {
    if (!n || seen.has(n.id)) return []; seen.add(n.id);
    if (G.isStep(n)) return [n];
    if (G.isBar(n)) return ins(n.id).flatMap(a => up(a, seen));
    return [];
  };
  const down = (n, seen) => {
    if (!n || seen.has(n.id)) return []; seen.add(n.id);
    if (G.isStep(n)) return [n];
    if (n.t === 'jump') return [byName.get(n.tg)].filter(Boolean);
    if (G.isBar(n)) return outs(n.id).flatMap(b => down(b, seen));
    return [];
  };

  const trans = nodes.filter(n => n.t === 'trans').sort((a, b) => a.r - b.r || a.c - b.c);
  const tv = new Map();
  trans.forEach(t => tv.set(t.id, unique('T_' + san(t.n || 'T' + t.id))));
  const info = trans.map(t => ({
    t,
    ups: uniq(ins(t.id).flatMap(a => up(a, new Set()))),
    downs: uniq(outs(t.id).flatMap(b => down(b, new Set())))
  }));

  const L = [];
  L.push('(* Généré par Grafcet Editor — déclare tes variables d’entrées/sorties dans ton projet *)');
  L.push('PROGRAM Grafcet', 'VAR');
  steps.forEach(s => L.push('  ' + xv.get(s.id) + ' : BOOL' + (s.t === 'init' ? ' := TRUE' : '') + ';'));
  trans.forEach(t => L.push('  ' + tv.get(t.id) + ' : BOOL;'));
  L.push('END_VAR', '');

  L.push('(* 1. Transitions franchissables : toutes évaluées avant toute évolution *)');
  info.forEach(({ t, ups }) => {
    const cond = (t.cond || '').trim();
    const c = cond ? '(' + cond + ')' : 'TRUE';
    const en = ups.map(s => xv.get(s.id));
    L.push(tv.get(t.id) + ' := ' + (en.length ? en.join(' AND ') + ' AND ' + c : 'FALSE') + ';' +
      (en.length ? '' : ' (* aucune étape en amont *)') + (cond ? '' : ' (* condition vide = TRUE *)'));
  });
  L.push('', '(* 2. Désactivation des étapes amont *)');
  info.forEach(({ t, ups }) => ups.forEach(s => L.push('IF ' + tv.get(t.id) + ' THEN ' + xv.get(s.id) + ' := FALSE; END_IF;')));
  L.push('', '(* 3. Activation des étapes aval *)');
  info.forEach(({ t, downs }) => downs.forEach(s => L.push('IF ' + tv.get(t.id) + ' THEN ' + xv.get(s.id) + ' := TRUE; END_IF;')));

  const N = new Map(), S = new Map(), R = new Map();
  steps.forEach(s => (s.acts || []).forEach(a => {
    const m = a.q === 'S' ? S : a.q === 'R' ? R : N;
    if (!m.has(a.v)) m.set(a.v, []);
    m.get(a.v).push(xv.get(s.id));
  }));
  if (N.size || S.size || R.size) {
    L.push('', '(* 4. Actions *)');
    N.forEach((xs, v) => L.push(v + ' := ' + xs.join(' OR ') + '; (* N *)'));
    S.forEach((xs, v) => L.push('IF ' + xs.join(' OR ') + ' THEN ' + v + ' := TRUE; END_IF; (* S *)'));
    R.forEach((xs, v) => L.push('IF ' + xs.join(' OR ') + ' THEN ' + v + ' := FALSE; END_IF; (* R *)'));
  }
  L.push('', 'END_PROGRAM', '');
  return L.join('\n');
}

module.exports = { toST };
