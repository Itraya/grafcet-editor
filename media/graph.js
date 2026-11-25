(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Graph = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const BARS = { odiv: 1, oconv: 1, adiv: 1, aconv: 1 };
  const isBar = n => !!BARS[n.t];
  const isStep = n => n.t === 'step' || n.t === 'init';
  const span = n => (isBar(n) ? Math.max(1, n.span || 2) : 1);
  const range = (c, k) => Array.from({ length: k }, (_, i) => c + i);
  const cover = n => range(n.c, span(n));
  // Colonnes par lesquelles un nœud reçoit / émet le flux (vers le bas).
  const inCols = n => (n.t === 'oconv' || n.t === 'aconv') ? range(n.c, span(n)) : [n.c];
  const outCols = n => n.t === 'jump' ? [] : (n.t === 'odiv' || n.t === 'adiv') ? range(n.c, span(n)) : [n.c];
  const kind = n => (isStep(n) || n.t === 'jump') ? 'S' : n.t === 'trans' ? 'T' : null;
  // Ce qu'une barre attend au-dessus / en dessous : S = étape, T = transition.
  const BELOW = { odiv: 'T', adiv: 'S', oconv: 'S', aconv: 'T' };
  const ABOVE = { odiv: 'S', adiv: 'T', oconv: 'T', aconv: 'S' };

  // Liens verticaux déduits de l'adjacence : un nœud lié au nœud de la ligne suivante qui reçoit la même colonne.
  function edges(doc) {
    const rows = new Map();
    doc.nodes.forEach(n => { if (!rows.has(n.r)) rows.set(n.r, []); rows.get(n.r).push(n); });
    const out = [];
    doc.nodes.forEach(a => {
      const below = rows.get(a.r + 1) || [];
      outCols(a).forEach(x => {
        const b = below.find(n => inCols(n).includes(x));
        if (b) out.push({ a: a.id, b: b.id, x });
      });
    });
    return out;
  }

  function validate(doc, E) {
    const by = new Map(doc.nodes.map(n => [n.id, n]));
    const warnings = [], badEdges = new Set();
    const warn = (id, msg) => warnings.push({ id, msg });
    E.forEach((e, i) => {
      const a = by.get(e.a), b = by.get(e.b);
      let msg = '';
      if (!isBar(a) && !isBar(b)) {
        if (kind(a) === kind(b)) msg = kind(a) === 'S' ? 'Deux étapes consécutives : insère une transition' : 'Deux transitions consécutives : insère une étape';
      } else if (isBar(a) && !isBar(b)) {
        if (kind(b) !== BELOW[a.t]) msg = 'Sous cette barre il faut ' + (BELOW[a.t] === 'T' ? 'une transition' : 'une étape');
      } else if (!isBar(a) && isBar(b)) {
        if (kind(a) !== ABOVE[b.t]) msg = 'Au-dessus de cette barre il faut ' + (ABOVE[b.t] === 'T' ? 'une transition' : 'une étape');
      }
      if (msg) { badEdges.add(i); warn(b.id, msg); }
    });
    const hasIn = new Set(E.map(e => e.b)), hasOut = new Set(E.map(e => e.a));
    const names = new Map();
    doc.nodes.forEach(n => {
      if (isStep(n)) names.set(n.n, (names.get(n.n) || 0) + 1);
    });
    const stepNames = new Set(doc.nodes.filter(isStep).map(n => n.n));
    doc.nodes.forEach(n => {
      if (n.t === 'step' && !hasIn.has(n.id)) warn(n.id, 'Étape sans transition en amont (inaccessible)');
      if (n.t === 'init' && !hasOut.has(n.id)) warn(n.id, 'Étape initiale sans transition en aval');
      if (n.t !== 'jump' && n.t !== 'init' && !hasOut.has(n.id)) warn(n.id, 'Rien en dessous : ajoute la suite ou un renvoi');
      if (n.t === 'trans' && !hasIn.has(n.id)) warn(n.id, 'Transition sans étape en amont');
      if (n.t === 'jump' && !hasIn.has(n.id)) warn(n.id, 'Renvoi sans transition en amont');
      if (n.t === 'jump' && !stepNames.has(n.tg)) warn(n.id, 'Renvoi : étape cible introuvable');
      if (isBar(n) && !hasIn.has(n.id)) warn(n.id, 'Barre sans élément au-dessus');
      if (isStep(n) && (!n.n || names.get(n.n) > 1)) warn(n.id, 'Nom d’étape vide ou en double');
    });
    const noInit = !doc.nodes.some(n => n.t === 'init');
    return { warnings, badEdges, noInit };
  }

  return { isBar, isStep, span, cover, inCols, outCols, edges, validate };
});
