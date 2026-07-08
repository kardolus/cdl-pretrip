// CDL Pretrip — objective quiz question generator.
// Pure functions: given the content (items/sections/diagrams) + progress readers, produce
// auto-graded multiple-choice questions. No self-grading. app.js renders + grades them and
// feeds correctness into the Leitner schedule. Exposed as window.PRETRIP_QUIZGEN.
(function () {
  "use strict";

  // ---- CDL numeric facts (auto-fail-adjacent; the AAMVA/NY-manual values people must know) ----
  var FACTS = [
    { id: "gov-cutout", tag: "air", prompt: "The governor cut-out (compressor stops) should happen at about:",
      correct: "125 psi", distractors: ["55 psi", "100 psi", "150 psi"],
      explanation: "Cut-out is around 120–140 psi (commonly taught as ~125 psi)." },
    { id: "gov-cutin", tag: "air", prompt: "The governor cut-in (compressor starts again) is at about:",
      correct: "100 psi", distractors: ["55 psi", "125 psi", "150 psi"],
      explanation: "Cut-in is around 100 psi — no more than ~25 psi below cut-out." },
    { id: "low-air", tag: "air", prompt: "The low-air warning must come on before pressure drops below:",
      correct: "60 psi", distractors: ["30 psi", "90 psi", "120 psi"],
      explanation: "The low-air warning must activate before the tanks fall below 60 psi." },
    { id: "spring-brakes", tag: "air", prompt: "The spring (parking) brakes come on automatically when pressure falls to about:",
      correct: "20 to 45 psi", distractors: ["55 to 75 psi", "60 to 90 psi", "5 to 15 psi"],
      explanation: "Spring brakes apply automatically somewhere between 20 and 45 psi." },
    { id: "buildup", tag: "air", prompt: "Air pressure should build from 85 to 100 psi within about:",
      correct: "45 seconds", distractors: ["10 seconds", "3 minutes", "5 minutes"],
      explanation: "A dual air system should build 85–100 psi within ~45 seconds." },
    { id: "safety-valve", tag: "air", prompt: "The air-tank safety (pop-off) valve is usually set to release at about:",
      correct: "150 psi", distractors: ["60 psi", "100 psi", "125 psi"],
      explanation: "The safety valve protects the tank and typically releases around 150 psi." },
    { id: "pushrod", tag: "brakes", prompt: "Brake pushrod free play (slack) should be no more than about:",
      correct: "1 inch", distractors: ["1/4 inch", "3 inches", "6 inches"],
      explanation: "When pulled by hand, the pushrod should not move more than ~1 inch." },
    { id: "tread-steer", tag: "tires", prompt: "Minimum tread depth on STEER (front) tires is:",
      correct: "4/32 inch", distractors: ["2/32 inch", "6/32 inch", "8/32 inch"],
      explanation: "Steer tires need at least 4/32 inch — more than other tires." },
    { id: "tread-other", tag: "tires", prompt: "Minimum tread depth on all tires OTHER than the steer tires is:",
      correct: "2/32 inch", distractors: ["4/32 inch", "1/32 inch", "6/32 inch"],
      explanation: "All non-steer tires need at least 2/32 inch of tread." },
  ];

  // ---- helpers ----
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function sample(arr, n, rejectSet) {
    var out = [], seen = {};
    var pool = shuffle(arr);
    for (var i = 0; i < pool.length && out.length < n; i++) {
      var v = pool[i], k = String(v).toLowerCase();
      if (seen[k]) continue;
      if (rejectSet && rejectSet[k]) continue;
      seen[k] = 1; out.push(v);
    }
    return out;
  }
  function setOf(list) { var s = {}; (list || []).forEach(function (v) { s[String(v).toLowerCase()] = 1; }); return s; }
  // build {options, correct} by shuffling the correct answer among distractors
  function mc(correct, distractors) {
    var opts = shuffle([correct].concat(distractors));
    return { options: opts, correct: opts.indexOf(correct) };
  }

  // conditions of every item except `item`, optionally scoped to the same section first
  function foreignConditions(ctx, item, sameSectionFirst) {
    var mine = setOf(item.conditions);
    var acc = [];
    ctx.items.forEach(function (o) {
      if (o.id === item.id) return;
      if (sameSectionFirst && o.section !== item.section) return;
      o.conditions.forEach(function (c) {
        var cc = c.trim();
        if (cc.length >= 4 && !/^(same|none|n\/a|ok)$/i.test(cc) && !mine[cc.toLowerCase()]) acc.push(cc);
      });
    });
    return acc;
  }

  // ---- generators (return a question object or null if not applicable) ----
  // question: {type, prompt, options[], correct, explanation, itemId?, factId?, diagramId?}

  function genCondition(ctx, item) {
    if (!item.conditions.length) return null;
    var correct = pick(item.conditions);
    var pool = foreignConditions(ctx, item, true);
    if (pool.length < 3) pool = pool.concat(foreignConditions(ctx, item, false));
    var d = sample(pool, 3, setOf([correct]));
    if (d.length < 3) return null;
    var m = mc(correct, d);
    return { type: "condition", prompt: "Which of these must you call out when you inspect the “" + item.name + "”?",
      options: m.options, correct: m.correct, itemId: item.id,
      explanation: item.name + " — you check: " + item.conditions.join("; ") + "." };
  }

  function genOdd(ctx, item) {
    if (item.conditions.length < 3) return null;
    var reals = sample(item.conditions, 3);
    var pool = foreignConditions(ctx, item, true);
    if (!pool.length) pool = foreignConditions(ctx, item, false);
    var foreign = sample(pool, 1, setOf(reals))[0];
    if (!foreign) return null;
    var m = mc(foreign, reals);
    return { type: "odd", prompt: "Which of these is NOT a check for the “" + item.name + "”?",
      options: m.options, correct: m.correct, itemId: item.id,
      explanation: "“" + foreign + "” is not part of the " + item.name + " check." };
  }

  function genReverse(ctx, item) {
    if (item.conditions.length < 2) return null;
    var clue = sample(item.conditions, Math.min(3, item.conditions.length));
    var names = ctx.items.filter(function (o) { return o.id !== item.id && o.section === item.section; }).map(function (o) { return o.name; });
    if (names.length < 3) names = names.concat(ctx.items.filter(function (o) { return o.id !== item.id; }).map(function (o) { return o.name; }));
    var d = sample(names, 3, setOf([item.name]));
    if (d.length < 3) return null;
    var m = mc(item.name, d);
    return { type: "reverse", prompt: "You call out: “" + clue.join(", ") + ".” Which item are you inspecting?",
      options: m.options, correct: m.correct, itemId: item.id,
      explanation: "Those are the checks for the " + item.name + "." };
  }

  function genOrder(ctx, item) {
    var next = ctx.items.filter(function (o) { return o.order === item.order + 1; })[0];
    if (!next) return null;
    var cand = ctx.items.filter(function (o) { return o.id !== next.id && Math.abs(o.order - item.order) <= 4 && o.order !== item.order; }).map(function (o) { return o.name; });
    if (cand.length < 3) cand = cand.concat(ctx.items.filter(function (o) { return o.id !== next.id && o.id !== item.id; }).map(function (o) { return o.name; }));
    var d = sample(cand, 3, setOf([next.name, item.name]));
    if (d.length < 3) return null;
    var m = mc(next.name, d);
    return { type: "order", prompt: "In the walk-around sequence, what do you inspect right after the “" + item.name + "”?",
      options: m.options, correct: m.correct, itemId: next.id,
      explanation: "After the " + item.name + " comes the " + next.name + "." };
  }

  function genSection(ctx, item) {
    var correct = ctx.secById[item.section].title;
    var others = ctx.sections.map(function (s) { return s.title; });
    var d = sample(others, 3, setOf([correct]));
    if (d.length < 3) return null;
    var m = mc(correct, d);
    return { type: "section", prompt: "During which part of the inspection do you check the “" + item.name + "”?",
      options: m.options, correct: m.correct, itemId: item.id,
      explanation: "The " + item.name + " belongs to " + correct + "." };
  }

  function genCritical(ctx) {
    var crit = ctx.items.filter(function (i) { return i.critical; });
    var non = ctx.items.filter(function (i) { return !i.critical; });
    if (crit.length < 1 || non.length < 3) return null;
    var critItem = pick(crit), correct = critItem.name;
    var d = sample(non.map(function (i) { return i.name; }), 3, setOf([correct]));
    if (d.length < 3) return null;
    var m = mc(correct, d);
    return { type: "critical", prompt: "Which of these is a CRITICAL item — an automatic fail if it is defective?",
      options: m.options, correct: m.correct, itemId: critItem.id,
      explanation: "The " + correct + " is a critical / auto-fail item." };
  }

  function genDiagram(ctx, item) {
    var diags = (ctx.diagramsBySection[item.section] || []).filter(function (d) { return d.legend && d.legend.length >= 4; });
    if (!diags.length) return null;
    var d = pick(diags);
    var entry = pick(d.legend);
    var nums = d.legend.map(function (l) { return String(l.n); });
    var dd = sample(nums, 3, setOf([String(entry.n)]));
    if (dd.length < 3) return null;
    var m = mc(String(entry.n), dd);
    return { type: "diagram", prompt: "On the “" + d.title + "” diagram, which number points to the " + entry.label + "?",
      options: m.options, correct: m.correct, diagramId: d.id, itemId: item.id,
      explanation: "#" + entry.n + " is the " + entry.label + "." };
  }

  function genFact(fact) {
    var m = mc(fact.correct, fact.distractors);
    return { type: "fact", prompt: fact.prompt, options: m.options, correct: m.correct,
      factId: fact.id, explanation: fact.explanation };
  }

  var ITEM_GENS = { condition: genCondition, odd: genOdd, reverse: genReverse, order: genOrder, section: genSection, diagram: genDiagram };

  // ---- session builder ----
  // opts: {count, scope: 'mixed'|'weak'|'critical'|'numbers'|<sectionId>}
  function build(ctx, opts) {
    opts = opts || {};
    var count = opts.count || 10;
    var scope = opts.scope || "mixed";
    ctx.FACTS = FACTS;

    if (scope === "numbers") return shuffle(FACTS.slice()).slice(0, count).map(genFact);

    var items = ctx.items, pool, isSection = !!ctx.secById[scope], idsMode = !!(opts.ids && opts.ids.length);
    if (idsMode) { var idset = {}; opts.ids.forEach(function (id) { idset[id] = 1; }); pool = items.filter(function (i) { return idset[i.id]; }); }
    else if (scope === "critical") pool = items.filter(function (i) { return i.critical; });
    else if (scope === "weak") pool = items.filter(function (i) { var m = ctx.masteryOf(i.id); return m >= 1 && m <= 2; });
    else if (isSection) pool = items.filter(function (i) { return i.section === scope; });
    else pool = null;

    if (idsMode) {
      pool = shuffle(pool.slice());
    } else if (!pool || pool.length < 4) {
      var weak = items.filter(function (i) { var m = ctx.masteryOf(i.id); return m >= 1 && m <= 2; });
      var due = items.filter(function (i) { return ctx.dueOf(i.id); });
      var fresh = items.filter(function (i) { return ctx.masteryOf(i.id) === 0; });
      var merged = shuffle(weak).concat(shuffle(due), shuffle(fresh), shuffle(items.slice()));
      var seen = {}; pool = [];
      merged.forEach(function (i) { if (!seen[i.id]) { seen[i.id] = 1; pool.push(i); } });
    } else {
      pool = shuffle(pool.slice());
    }
    if (!pool.length) return [];

    // type rotation — targeted/section quizzes stay item-based (+ facts only for air-brake)
    var seq;
    if (idsMode) seq = ["condition", "odd", "reverse", "order", "diagram", "section"];
    else if (isSection) seq = (scope === "air-brake")
      ? ["condition", "fact", "order", "odd", "reverse", "diagram"]
      : ["condition", "order", "reverse", "diagram", "odd"];
    else seq = ["condition", "fact", "order", "reverse", "diagram", "odd", "section", "fact", "condition", "critical", "diagram", "fact"];

    var qs = [], ti = 0, pi = 0, fi = 0, guard = 0, used = {};
    while (qs.length < count && guard++ < count * 15) {
      var type = seq[ti % seq.length]; ti++;
      var q = null;
      if (type === "fact") { q = genFact(FACTS[fi % FACTS.length]); fi++; }
      else if (type === "critical") { q = genCritical(ctx); }
      else {
        var item = pool[pi % pool.length]; pi++;
        q = (ITEM_GENS[type] && ITEM_GENS[type](ctx, item)) || genCondition(ctx, item) || genOrder(ctx, item) || genDiagram(ctx, item);
        if (!q && (!isSection || scope === "air-brake")) { q = genFact(FACTS[fi % FACTS.length]); fi++; }
      }
      if (!q) continue;
      var key = (q.factId || "") + (q.itemId || q.prompt) + ":" + q.type;
      if (used[key]) continue;
      used[key] = 1;
      qs.push(q);
    }
    return qs.slice(0, count);
  }

  window.PRETRIP_QUIZGEN = { FACTS: FACTS, build: build };
})();
