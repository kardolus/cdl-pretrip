/* CDL Pretrip — NY Class A pre-trip inspection trainer.
   Vanilla JS, hash router, all state in localStorage. Content from data.js
   (window.PRETRIP_DATA, generated from the user's Notion script). */
(function () {
  "use strict";

  // ---------- data ----------------------------------------------------------
  var D = window.PRETRIP_DATA || { sections: [], items: [] };
  var SEC = D.sections;
  var ITEMS = D.items;
  var secById = {};
  SEC.forEach(function (s) { secById[s.id] = s; });
  var PARTS = ["Cab", "Tractor", "Trailer"];

  // picture-dictionary diagrams (window.PRETRIP_DIAGRAMS from diagrams.js)
  var DIAGRAMS = window.PRETRIP_DIAGRAMS || [];
  var diagramsBySection = {};
  DIAGRAMS.forEach(function (d) { (diagramsBySection[d.section] = diagramsBySection[d.section] || []).push(d); });
  function diagramById(id) { return DIAGRAMS.find(function (d) { return d.id === id; }); }

  // ---------- store ---------------------------------------------------------
  var KEY = "pretrip.v1";
  var INTERVALS = [0, 1, 2, 4, 7, 14]; // days, indexed by mastery level
  function blank() {
    return {
      progress: {},
      settings: { hideMastered: true, part: "all", showParked: false, filters: {} },
      stats: { streak: { count: 0, last: "" }, bestRun: null, lastExam: null },
    };
  }
  var S = blank();
  try {
    var saved = JSON.parse(localStorage.getItem(KEY) || "{}");
    S.progress = saved.progress || {};
    S.settings = Object.assign(S.settings, saved.settings || {});
    S.stats = Object.assign(S.stats, saved.stats || {});
  } catch (e) { /* fresh */ }
  function save() { localStorage.setItem(KEY, JSON.stringify(S)); }
  function prog(id) {
    if (!S.progress[id]) S.progress[id] = { mastery: 0, due: "", hidden: false, parked: false, hits: 0, misses: 0 };
    return S.progress[id];
  }
  function isMastered(id) { return prog(id).mastery >= 5; }

  // ---------- date utils ----------------------------------------------------
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function addDays(s, n) {
    var p = s.split("-"); var d = new Date(+p[0], +p[1] - 1, +p[2]);
    d.setDate(d.getDate() + n);
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  function isDue(id) { var p = prog(id); return p.due && p.due <= todayStr(); }
  function fmtTime(s) { var m = Math.floor(s / 60); return m + ":" + pad(s % 60); }

  // ---------- grading / spaced repetition ----------------------------------
  function grade(id, result) {
    var p = prog(id);
    if (result === "nailed") { p.mastery = Math.min(5, p.mastery + 1); p.hits++; }
    else if (result === "partial") { p.mastery = Math.max(1, p.mastery); p.hits++; }
    else { p.mastery = Math.max(1, p.mastery - 2); p.misses++; } // missed
    p.due = addDays(todayStr(), INTERVALS[p.mastery]);
    bumpStreak();
    save();
  }
  function bumpStreak() {
    var t = todayStr(), st = S.stats.streak;
    if (st.last === t) return;
    st.count = st.last === addDays(t, -1) ? st.count + 1 : 1;
    st.last = t;
  }

  // ---------- dom utils -----------------------------------------------------
  var app = document.getElementById("app");
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function mount(html, after) { app.innerHTML = html; window.scrollTo(0, 0); if (after) after(); }
  function on(sel, ev, fn, root) { (root || app).querySelectorAll(sel).forEach(function (n) { n.addEventListener(ev, fn); }); }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  // significant words of a condition string, for keyword matching in the quiz
  var STOP = { the: 1, and: 1, are: 1, "for": 1, that: 1, with: 1, not: 1, "no": 1, is: 1, of: 1, to: 1, a: 1, in: 1, on: 1, it: 1, me: 1, up: 1 };
  function keywords(str) {
    return str.toLowerCase().replace(/[^a-z0-9\/ ]/g, " ").split(/\s+/).filter(function (w) { return w.length >= 3 && !STOP[w]; });
  }
  function condHit(cond, userText) {
    var u = userText.toLowerCase();
    var ks = keywords(cond);
    if (!ks.length) return false;
    return ks.some(function (k) { return u.indexOf(k) >= 0; });
  }

  // ---------- icons ---------------------------------------------------------
  function dotClass(id) { return "dot m" + prog(id).mastery; }

  // ---------- diagram lightbox ----------------------------------------------
  function openLightbox(id) {
    var d = diagramById(id); if (!d) return;
    closeLightbox();
    var legend = d.legend.map(function (l) { return '<li><span class="num">' + l.n + '</span><span>' + esc(l.label) + "</span></li>"; }).join("");
    var lb = document.createElement("div");
    lb.className = "lb"; lb.id = "lightbox";
    lb.innerHTML = '<div class="lb-win">' +
      '<div class="lb-img"><img src="' + d.img + '" alt="' + esc(d.title) + '"></div>' +
      '<div class="lb-side"><button class="lb-close" aria-label="Close">×</button>' +
      '<span class="part-tag">' + esc(secById[d.section].part) + '</span>' +
      "<h2>" + esc(d.title) + "</h2>" +
      '<div class="meta">' + esc(secById[d.section].title) + (d.schematic ? " · schematic" : "") + "</div>" +
      '<ul class="legend">' + legend + "</ul>" +
      '<div class="row" style="margin-top:18px"><button class="btn primary" data-pq="' + d.id + '">Quiz this diagram</button></div>' +
      "</div></div>";
    document.body.appendChild(lb);
    lb.addEventListener("click", function (e) { if (e.target === lb) closeLightbox(); });
    lb.querySelector(".lb-close").addEventListener("click", closeLightbox);
    lb.querySelector("[data-pq]").addEventListener("click", function () { closeLightbox(); startPictureQuiz(d.id); });
    document.addEventListener("keydown", lbEsc);
  }
  function lbEsc(e) { if (e.key === "Escape") closeLightbox(); }
  function closeLightbox() { var x = document.getElementById("lightbox"); if (x) x.remove(); document.removeEventListener("keydown", lbEsc); }

  // =====================================================================
  // LEARN
  // =====================================================================
  function partChips(active) {
    var opts = [["all", "All"], ["Cab", "Cab"], ["Tractor", "Tractor"], ["Trailer", "Trailer"]];
    return opts.map(function (o) {
      return '<button class="chip ' + (active === o[0] ? "on" : "") + '" data-part="' + o[0] + '">' + o[1] + "</button>";
    }).join("");
  }

  function renderLearn() {
    var st = S.settings;
    var fl = st.filters || {};
    var html = "";
    html += '<div class="page-head"><h1>Learn</h1><p>Every inspection item in walk-around order. Expand to see the conditions you must call out. Mark items <b>mastered</b> to hide them, or <b>park</b> ones you’ll skip for now.</p></div>';
    html += '<div class="toolbar">' + partChips(st.part);
    html += '<span class="spacer"></span>';
    html += filterChip("due", "Due", fl) + filterChip("weak", "Weak", fl) + filterChip("critical", "Critical", fl);
    html += "</div>";
    html += '<div class="toolbar">';
    html += '<label class="switch"><input type="checkbox" id="hm" ' + (st.hideMastered ? "checked" : "") + "> Hide mastered</label>";
    html += '<label class="switch"><input type="checkbox" id="sp" ' + (st.showParked ? "checked" : "") + "> Show parked</label>";
    html += "</div>";

    // confidence-trap nudge
    var hiddenMastered = ITEMS.filter(function (i) { return isMastered(i.id) && passPart(i); }).length;
    if (st.hideMastered && hiddenMastered >= 15) {
      html += '<div class="nudge">⚠️ You’ve mastered <b>' + hiddenMastered + "</b> items — hidden ≠ exam-ready. <button class=\"btn sm\" id=\"spotcheck\">Spot-check 10</button></div>";
    }

    var any = false;
    SEC.forEach(function (s) {
      if (st.part !== "all" && s.part !== st.part) return;
      var items = ITEMS.filter(function (i) { return i.section === s.id && visible(i); });
      var all = ITEMS.filter(function (i) { return i.section === s.id; });
      if (!items.length) return;
      any = true;
      var mastered = all.filter(function (i) { return isMastered(i.id); }).length;
      var pct = Math.round((mastered / all.length) * 100);
      html += '<div class="sec"><div class="sec-head"><span class="part-tag">' + esc(s.part) + '</span><h2>' + esc(s.title) + '</h2>';
      html += '<span class="count">' + mastered + "/" + all.length + " mastered</span></div>";
      html += '<div class="bar"><i style="width:' + pct + '%"></i></div>';
      var diags = diagramsBySection[s.id] || [];
      if (diags.length) {
        html += '<div class="diag-strip">' + diags.map(function (d) {
          return '<span class="diag-chip" data-diag="' + d.id + '"><img src="' + d.img + '" alt=""> ' + esc(d.title) + "</span>";
        }).join("") + "</div>";
      }
      var curGroup = null;
      items.forEach(function (i) {
        if (i.group !== curGroup) { curGroup = i.group; html += '<div class="grp-label">' + esc(i.group) + "</div>"; }
        html += itemRow(i);
      });
      html += "</div>";
    });
    if (!any) html += '<div class="empty">No items match these filters. Try turning off “Hide mastered” or clearing the filter chips.</div>';

    mount(html, function () {
      on("[data-part]", "click", function () { st.part = this.getAttribute("data-part"); save(); renderLearn(); });
      on(".chip[data-filter]", "click", function () { var f = this.getAttribute("data-filter"); fl[f] = !fl[f]; st.filters = fl; save(); renderLearn(); });
      var hm = document.getElementById("hm"); if (hm) hm.addEventListener("change", function () { st.hideMastered = this.checked; save(); renderLearn(); });
      var sp = document.getElementById("sp"); if (sp) sp.addEventListener("change", function () { st.showParked = this.checked; save(); renderLearn(); });
      var sc = document.getElementById("spotcheck"); if (sc) sc.addEventListener("click", function () { startQuiz("mastered"); });
      on(".diag-chip", "click", function () { openLightbox(this.getAttribute("data-diag")); });
      bindItemRows();
    });
  }
  function filterChip(key, label, fl) { return '<button class="chip ' + (fl[key] ? "on" : "") + '" data-filter="' + key + '">' + label + "</button>"; }
  function passPart(i) { var st = S.settings; return st.part === "all" || secById[i.section].part === st.part; }
  function visible(i) {
    var st = S.settings, p = prog(i.id), fl = st.filters || {};
    if (st.hideMastered && isMastered(i.id)) return false;
    if (p.parked && !st.showParked) return false;
    if (fl.due && !isDue(i.id)) return false;
    if (fl.weak && p.mastery > 2) return false;
    if (fl.critical && !i.critical) return false;
    return true;
  }
  function itemRow(i) {
    var p = prog(i.id);
    var conds = i.conditions.length
      ? '<div class="conds">' + i.conditions.map(function (c) { return '<span class="cond">' + esc(c) + "</span>"; }).join("") + "</div>"
      : '<p class="meta" style="margin-top:12px">Identify and name this item.</p>';
    var subs = i.subchecks.length
      ? '<ul class="subs">' + i.subchecks.map(function (sc) {
        return "<li><b>" + esc(sc.name) + "</b>" + (sc.conditions.length ? " — " + esc(sc.conditions.join(", ")) : "") + "</li>";
      }).join("") + "</ul>" : "";
    return '<div class="item ' + (i.critical ? "crit" : "") + '" data-id="' + i.id + '">' +
      '<div class="item-row"><span class="' + dotClass(i.id) + '"></span>' +
      '<span class="item-name">' + esc(i.name) + (i.critical ? '<span class="crit-flag">critical</span>' : "") + "</span>" +
      '<span class="caret">▶</span></div>' +
      '<div class="item-body">' + conds + subs +
      '<div class="item-actions">' +
      '<button class="btn sm good" data-act="got">Got it ✓</button>' +
      '<button class="btn sm" data-act="drill">Drill this</button>' +
      '<button class="btn sm" data-act="master">Master &amp; hide</button>' +
      '<button class="btn sm" data-act="park">' + (p.parked ? "Unpark" : "Park") + "</button>" +
      '<button class="btn sm bad" data-act="reset">Reset</button>' +
      "</div></div></div>";
  }
  function bindItemRows() {
    on(".item-row", "click", function () { this.parentNode.classList.toggle("open"); });
    on(".item-actions .btn", "click", function (e) {
      e.stopPropagation();
      var id = this.closest(".item").getAttribute("data-id");
      var act = this.getAttribute("data-act"), p = prog(id);
      if (act === "got") grade(id, "nailed");
      else if (act === "master") { p.mastery = 5; p.due = addDays(todayStr(), 14); save(); }
      else if (act === "park") { p.parked = !p.parked; save(); }
      else if (act === "reset") { p.mastery = 0; p.parked = false; p.due = ""; save(); }
      else if (act === "drill") { startQuiz([id]); return; }
      renderLearn();
    });
  }

  // =====================================================================
  // QUIZ
  // =====================================================================
  var QUIZ = null;
  function startQuiz(source) {
    var ids;
    if (Array.isArray(source)) ids = source.slice();
    else ids = quizQueue(source);
    if (!ids.length) ids = ITEMS.map(function (i) { return i.id; });
    QUIZ = { queue: shuffle(ids), i: 0, revealed: false, results: { nailed: 0, partial: 0, missed: 0 }, source: Array.isArray(source) ? "drill" : source };
    location.hash = "#/quiz";
    if ((location.hash || "").indexOf("quiz") >= 0) renderQuiz();
  }
  function quizQueue(source) {
    var pool = ITEMS;
    if (source === "due") pool = ITEMS.filter(function (i) { return isDue(i.id); });
    else if (source === "weak") pool = ITEMS.filter(function (i) { return prog(i.id).mastery <= 2; });
    else if (source === "critical") pool = ITEMS.filter(function (i) { return i.critical; });
    else if (source === "mastered") pool = shuffle(ITEMS.filter(function (i) { return isMastered(i.id); })).slice(0, 10);
    else if (secById[source]) pool = ITEMS.filter(function (i) { return i.section === source; });
    return pool.map(function (i) { return i.id; });
  }

  function renderQuiz() {
    if (!QUIZ) { renderQuizPicker(); return; }
    if (QUIZ.i >= QUIZ.queue.length) { renderQuizDone(); return; }
    var i = ITEMS.find(function (x) { return x.id === QUIZ.queue[QUIZ.i]; });
    var sec = secById[i.section];
    var hint = sec.type === "procedure"
      ? "Recall this step in the sequence — what you do and the values to watch."
      : (i.conditions.length ? "Say the item out loud, then name at least 2 conditions you check." : "Identify and name this item.");
    var html = "";
    html += '<div class="page-head"><h1>Quiz</h1><p class="meta">' + quizSourceLabel() + " · " + (QUIZ.i + 1) + " / " + QUIZ.queue.length + "</p></div>";
    html += '<div class="qcard"><div class="loc">' + esc(sec.title) + " · " + esc(i.group) + "</div>";
    html += '<div class="prompt">' + esc(i.name) + (i.critical ? '<span class="crit-flag">critical</span>' : "") + "</div>";
    html += '<div class="hint">' + hint + "</div>";
    html += '<textarea id="ans" placeholder="Type the conditions you would call out…" ' + (QUIZ.revealed ? "disabled" : "") + ">" + esc(QUIZ.answer || "") + "</textarea>";
    if (!QUIZ.revealed) {
      html += '<div class="grade-row"><button class="btn primary" id="reveal">Reveal answer</button><button class="btn" id="skip">Skip</button></div>';
    } else {
      var userText = QUIZ.answer || "";
      var conds = i.conditions.length
        ? '<div class="conds">' + i.conditions.map(function (c) { return '<span class="cond ' + (condHit(c, userText) ? "hit" : "") + '">' + esc(c) + "</span>"; }).join("") + "</div>"
        : '<p class="meta">(No specific conditions — just identify it.)</p>';
      var subs = i.subchecks.length ? '<ul class="subs">' + i.subchecks.map(function (sc) { return "<li><b>" + esc(sc.name) + "</b>" + (sc.conditions.length ? " — " + esc(sc.conditions.join(", ")) : "") + "</li>"; }).join("") + "</ul>" : "";
      html += '<div class="reveal"><div class="lbl">Conditions to call out</div>' + conds + subs + "</div>";
      html += '<div class="grade-row"><button class="btn good" data-grade="nailed">✓ Nailed (2+)</button><button class="btn warn" data-grade="partial">~ Partial</button><button class="btn bad" data-grade="missed">✗ Missed</button></div>';
    }
    html += "</div>";
    mount(html, function () {
      var ta = document.getElementById("ans");
      var rv = document.getElementById("reveal");
      if (rv) rv.addEventListener("click", function () { QUIZ.answer = ta.value; QUIZ.revealed = true; renderQuiz(); });
      var sk = document.getElementById("skip"); if (sk) sk.addEventListener("click", next);
      on("[data-grade]", "click", function () { grade(i.id, this.getAttribute("data-grade")); QUIZ.results[this.getAttribute("data-grade")]++; next(); });
      if (ta && !QUIZ.revealed) ta.focus();
    });
    function next() { QUIZ.i++; QUIZ.revealed = false; QUIZ.answer = ""; renderQuiz(); }
  }
  function quizSourceLabel() {
    var s = QUIZ.source;
    if (s === "drill") return "Single-item drill";
    if (secById[s]) return secById[s].title;
    return ({ due: "Due items", weak: "Weak items", critical: "Critical items", mastered: "Mastered spot-check", all: "All items" }[s] || "Quiz");
  }
  function renderQuizDone() {
    var r = QUIZ.results, tot = r.nailed + r.partial + r.missed;
    var html = '<div class="page-head"><h1>Quiz complete</h1></div><div class="scorecard">';
    html += '<div class="score-grid">' +
      kpi(r.nailed, "Nailed") + kpi(r.partial, "Partial") + kpi(r.missed, "Missed") + kpi(tot, "Total") + "</div>";
    html += '<div class="row"><button class="btn primary" id="again">Quiz again</button><button class="btn" onclick="location.hash=\'#/learn\'">Back to Learn</button></div></div>';
    mount(html, function () { document.getElementById("again").addEventListener("click", function () { QUIZ = null; renderQuizPicker(); }); });
  }
  function renderQuizPicker() {
    var due = ITEMS.filter(function (i) { return isDue(i.id); }).length;
    var weak = ITEMS.filter(function (i) { return prog(i.id).mastery <= 2; }).length;
    var crit = ITEMS.filter(function (i) { return i.critical; }).length;
    var html = '<div class="page-head"><h1>Quiz</h1><p>Recall mode. You’re shown an item; say it out loud with at least two conditions, then reveal and grade yourself. Grades feed spaced repetition.</p></div>';
    html += '<div class="panel"><h3>Smart queues</h3><p>The fastest way to study — the app picks what you most need.</p><div class="row">';
    html += '<button class="btn primary" data-q="due">Due today (' + due + ")</button>";
    html += '<button class="btn" data-q="weak">Weak items (' + weak + ")</button>";
    html += '<button class="btn" data-q="critical">Critical only (' + crit + ")</button>";
    html += '<button class="btn" data-q="all">All items</button></div></div>';
    html += '<div class="panel"><h3>By section</h3><p>Drill one area at a time.</p><div class="row">';
    SEC.forEach(function (s) { html += '<button class="btn" data-q="' + s.id + '">' + esc(s.title) + "</button>"; });
    html += "</div></div>";
    mount(html, function () { on("[data-q]", "click", function () { startQuiz(this.getAttribute("data-q")); }); });
  }
  function kpi(n, l) { return '<div class="score-kpi"><div class="n">' + n + '</div><div class="l">' + l + "</div></div>"; }

  // =====================================================================
  // DIAGRAMS (picture dictionary) + Picture quiz
  // =====================================================================
  var PQUIZ = null;
  function renderDiagrams() {
    if (PQUIZ) { drawPictureQuiz(); return; }
    var html = '<div class="page-head"><h1>Picture dictionary</h1><p>Labeled walk-around diagrams from the International Prostar manual. Tap a plate to see its parts; or quiz yourself — name the numbered callout.</p></div>';
    html += '<div class="row"><button class="btn primary" id="pq-all">Quiz me on the diagrams</button></div>';
    // group the gallery by exam part
    PARTS.forEach(function (part) {
      var ds = DIAGRAMS.filter(function (d) { return secById[d.section].part === part; });
      if (!ds.length) return;
      html += '<div class="grp-label" style="margin-top:20px">' + esc(part) + "</div>";
      html += '<div class="diag-gallery">' + ds.map(function (d) {
        return '<div class="diag-card" data-diag="' + d.id + '"><div class="thumb"><img src="' + d.img + '" alt="' + esc(d.title) + '" loading="lazy"></div>' +
          '<div class="cap"><h3>' + esc(d.title) + '</h3><div class="meta">' + d.legend.length + " labeled parts · " + esc(secById[d.section].title) + "</div></div></div>";
      }).join("") + "</div>";
    });
    mount(html, function () {
      on(".diag-card", "click", function () { openLightbox(this.getAttribute("data-diag")); });
      document.getElementById("pq-all").addEventListener("click", function () { startPictureQuiz("all"); });
    });
  }
  function startPictureQuiz(scope) {
    var ds = scope === "all" ? DIAGRAMS : [diagramById(scope)];
    var q = [];
    ds.forEach(function (d) { d.legend.forEach(function (l) { q.push({ img: d.img, title: d.title, n: l.n, label: l.label }); }); });
    PQUIZ = { queue: shuffle(q), i: 0, revealed: false, answer: "", hit: 0, miss: 0, scope: scope };
    if ((location.hash || "").indexOf("truck") < 0 && (location.hash || "").indexOf("diagrams") < 0) location.hash = "#/truck";
    else renderDiagrams();
  }
  function drawPictureQuiz() {
    if (PQUIZ.i >= PQUIZ.queue.length) {
      var html = '<div class="page-head"><h1>Picture quiz complete</h1></div><div class="scorecard"><div class="score-grid">' +
        kpi(PQUIZ.hit, "Knew it") + kpi(PQUIZ.miss, "Missed") + kpi(PQUIZ.queue.length, "Total") + "</div>" +
        '<div class="row"><button class="btn primary" id="pq-again">Again</button><button class="btn" id="pq-back">Back to diagrams</button></div></div>';
      mount(html, function () {
        document.getElementById("pq-again").addEventListener("click", function () { startPictureQuiz(PQUIZ.scope); });
        document.getElementById("pq-back").addEventListener("click", function () { PQUIZ = null; renderDiagrams(); });
      });
      return;
    }
    var c = PQUIZ.queue[PQUIZ.i];
    var html = '<div class="page-head"><h1>Picture quiz</h1><p class="meta">' + (PQUIZ.i + 1) + " / " + PQUIZ.queue.length + " · " + esc(c.title) + "</p></div>";
    html += '<div class="qcard"><div class="loc">' + esc(c.title) + '</div><div class="prompt">What is part #' + c.n + "?</div>";
    html += '<div class="diag-stage"><img src="' + c.img + '" alt="' + esc(c.title) + '"></div>';
    html += '<textarea id="pans" placeholder="Name the part at callout #' + c.n + '…" ' + (PQUIZ.revealed ? "disabled" : "") + ">" + esc(PQUIZ.answer) + "</textarea>";
    if (!PQUIZ.revealed) {
      html += '<div class="grade-row"><button class="btn primary" id="preveal">Reveal</button><button class="btn" id="pskip">Skip</button></div>';
    } else {
      var ok = condHit(c.label, PQUIZ.answer);
      html += '<div class="reveal"><div class="lbl">Part #' + c.n + ' is</div><div class="conds"><span class="cond ' + (ok ? "hit" : "") + '">' + esc(c.label) + "</span></div></div>";
      html += '<div class="grade-row"><button class="btn good" data-pg="hit">✓ Knew it</button><button class="btn bad" data-pg="miss">✗ Missed</button></div>';
    }
    html += "</div>";
    html += '<div class="row" style="margin-top:8px"><button class="btn sm" id="pq-quit">Quit</button></div>';
    mount(html, function () {
      var ta = document.getElementById("pans");
      var rv = document.getElementById("preveal"); if (rv) rv.addEventListener("click", function () { PQUIZ.answer = ta.value; PQUIZ.revealed = true; drawPictureQuiz(); });
      var sk = document.getElementById("pskip"); if (sk) sk.addEventListener("click", pnext);
      on("[data-pg]", "click", function () { PQUIZ[this.getAttribute("data-pg")]++; pnext(); });
      document.getElementById("pq-quit").addEventListener("click", function () { PQUIZ = null; renderDiagrams(); });
      if (ta && !PQUIZ.revealed) ta.focus();
    });
    function pnext() { PQUIZ.i++; PQUIZ.revealed = false; PQUIZ.answer = ""; drawPictureQuiz(); }
  }

  // =====================================================================
  // RUNNER (Walk-Around + Examiner)
  // =====================================================================
  var RUN = null, TIMER = null;
  function startRun(mode, scope) {
    var pool = scope === "full" ? ITEMS.slice() : ITEMS.filter(function (i) { return i.section === scope; });
    pool.sort(function (a, b) { return a.order - b.order; });
    RUN = {
      mode: mode, scope: scope, queue: pool, i: 0, revealed: false,
      hits: 0, partial: 0, missed: 0, missedItems: [], bySection: {},
      seconds: 0, failed: null,
    };
    if (TIMER) clearInterval(TIMER);
    TIMER = setInterval(function () { if (RUN) { RUN.seconds++; var t = document.getElementById("timer"); if (t) t.textContent = fmtTime(RUN.seconds); } }, 1000);
    location.hash = mode === "examiner" ? "#/examiner" : "#/walk";
    drawRun();
  }
  function endRun() { if (TIMER) { clearInterval(TIMER); TIMER = null; } }

  function drawRun() {
    if (!RUN) return;
    if (RUN.failed) { drawExamFail(); return; }
    if (RUN.i >= RUN.queue.length) { endRun(); drawScorecard(); return; }
    var i = RUN.queue[RUN.i], sec = secById[i.section];
    var examiner = RUN.mode === "examiner";
    var html = '<div class="page-head"><h1>' + (examiner ? "Examiner" : "Walk-Around") + '</h1></div>';
    html += '<div class="runbar"><span>Item ' + (RUN.i + 1) + " / " + RUN.queue.length + '</span><div class="bar" style="height:6px"><i style="width:' + Math.round((RUN.i / RUN.queue.length) * 100) + '%"></i></div><span class="timer" id="timer">' + fmtTime(RUN.seconds) + "</span></div>";
    html += '<div class="qcard"><div class="loc">' + esc(sec.title) + " · " + esc(i.group) + "</div>";
    if (!RUN.revealed) {
      html += '<div class="prompt">What’s next?</div>';
      html += '<div class="hint">' + (examiner ? "Point, name it, and state your conditions out loud. No peeking." : "Recall the next item in order and its conditions, out loud.") + (i.critical ? " <b>(critical item)</b>" : "") + "</div>";
      html += '<div class="grade-row"><button class="btn primary" id="reveal">I said it — reveal</button></div>';
    } else {
      html += '<div class="prompt">' + esc(i.name) + (i.critical ? '<span class="crit-flag">critical</span>' : "") + "</div>";
      html += i.conditions.length
        ? '<div class="conds">' + i.conditions.map(function (c) { return '<span class="cond">' + esc(c) + "</span>"; }).join("") + "</div>"
        : '<p class="meta">Identify and name this item.</p>';
      if (i.subchecks.length) html += '<ul class="subs">' + i.subchecks.map(function (sc) { return "<li><b>" + esc(sc.name) + "</b>" + (sc.conditions.length ? " — " + esc(sc.conditions.join(", ")) : "") + "</li>"; }).join("") + "</ul>";
      html += '<div class="grade-row"><button class="btn good" data-grade="nailed">✓ Had it</button><button class="btn warn" data-grade="partial">~ Partial</button><button class="btn bad" data-grade="missed">✗ Missed</button></div>';
    }
    html += "</div>";
    html += '<div class="row" style="margin-top:8px"><button class="btn sm" id="quit">Quit run</button></div>';
    mount(html, function () {
      var rv = document.getElementById("reveal"); if (rv) rv.addEventListener("click", function () { RUN.revealed = true; drawRun(); });
      on("[data-grade]", "click", function () { gradeRun(i, this.getAttribute("data-grade")); });
      document.getElementById("quit").addEventListener("click", function () { endRun(); RUN = null; location.hash = "#/" + (examiner ? "examiner" : "walk"); route(); });
    });
  }
  function gradeRun(i, result) {
    grade(i.id, result);
    var bs = RUN.bySection[i.section] || (RUN.bySection[i.section] = { hit: 0, tot: 0 });
    bs.tot++;
    if (result === "nailed") { RUN.hits++; bs.hit++; }
    else if (result === "partial") { RUN.partial++; bs.hit += 0.5; }
    else { RUN.missed++; RUN.missedItems.push(i); }
    if (RUN.mode === "examiner" && i.critical && result === "missed") { RUN.failed = i; endRun(); drawRun(); return; }
    RUN.i++; RUN.revealed = false; drawRun();
  }
  function drawExamFail() {
    var i = RUN.failed;
    var html = '<div class="examfail"><div class="box"><h2>NOT READY</h2><p>You missed a critical item. On the real test, this is an automatic failure.</p><div class="item">' + esc(secById[i.section].title) + " · " + esc(i.name) + '</div><br><button class="btn" id="ok">See scorecard</button></div></div>';
    app.insertAdjacentHTML("beforeend", html);
    document.getElementById("ok").addEventListener("click", function () { document.querySelector(".examfail").remove(); drawScorecard(); });
  }
  function drawScorecard() {
    var total = RUN.hits + RUN.partial + RUN.missed;
    var pct = total ? Math.round(((RUN.hits + RUN.partial * 0.5) / total) * 100) : 0;
    var critMiss = RUN.missedItems.filter(function (x) { return x.critical; }).length;
    var examiner = RUN.mode === "examiner";
    var verdict, vclass;
    if (RUN.failed || critMiss > 0) { verdict = "NOT READY"; vclass = "fail"; }
    else if (pct >= 90) { verdict = "PASS-READY"; vclass = "pass"; }
    else if (pct >= 80) { verdict = "ALMOST THERE"; vclass = "almost"; }
    else { verdict = "NEEDS WORK"; vclass = "fail"; }

    // persist stats
    if (examiner) S.stats.lastExam = { verdict: verdict, pct: pct, seconds: RUN.seconds, day: todayStr() };
    else if (RUN.scope === "full" && !RUN.failed) {
      if (!S.stats.bestRun || RUN.seconds < S.stats.bestRun.seconds) S.stats.bestRun = { seconds: RUN.seconds, pct: pct, day: todayStr() };
    }
    save();

    var html = '<div class="page-head"><h1>' + (examiner ? "Examiner result" : "Walk-Around complete") + '</h1></div>';
    html += '<div class="scorecard"><div class="verdict ' + vclass + '">' + verdict + "</div>";
    html += '<div class="meta">' + scopeLabel(RUN.scope) + " · " + fmtTime(RUN.seconds) + "</div>";
    html += '<div class="score-grid">' + kpi(pct + "%", "Score") + kpi(RUN.hits, "Had it") + kpi(RUN.partial, "Partial") + kpi(RUN.missed, "Missed") + kpi(critMiss, "Critical miss") + "</div>";
    // weakest sections
    var rows = Object.keys(RUN.bySection).map(function (sid) { var b = RUN.bySection[sid]; return { sid: sid, p: b.hit / b.tot }; }).sort(function (a, b) { return a.p - b.p; });
    if (rows.length) {
      html += '<div class="lbl" style="font-family:var(--font-ui);font-weight:600;text-transform:uppercase;letter-spacing:.05em;font-size:12px;color:var(--meta);margin:6px 0">Weakest sections</div>';
      html += '<ul class="miss-list">' + rows.slice(0, 3).map(function (r) { return "<li><b>" + esc(secById[r.sid].title) + "</b> — " + Math.round(r.p * 100) + "%</li>"; }).join("") + "</ul>";
    }
    if (RUN.missedItems.length) {
      html += '<div class="lbl" style="font-family:var(--font-ui);font-weight:600;text-transform:uppercase;letter-spacing:.05em;font-size:12px;color:var(--meta);margin:14px 0 4px">Missed items</div>';
      html += '<ul class="miss-list">' + RUN.missedItems.slice(0, 14).map(function (x) { return "<li>" + esc(x.name) + " <span class=\"meta\">(" + esc(secById[x.section].title) + ")</span></li>"; }).join("") + "</ul>";
    }
    html += '<div class="row" style="margin-top:18px">';
    if (RUN.missedItems.length) html += '<button class="btn primary" id="drillmiss">Drill missed items</button>';
    html += '<button class="btn" id="restart">Run again</button><button class="btn" onclick="location.hash=\'#/progress\'">Progress</button></div></div>';
    mount(html, function () {
      var dm = document.getElementById("drillmiss"); if (dm) dm.addEventListener("click", function () { startQuiz(RUN.missedItems.map(function (x) { return x.id; })); });
      document.getElementById("restart").addEventListener("click", function () { var m = RUN.mode, sc = RUN.scope; RUN = null; (m === "examiner" ? renderExaminer : renderWalk)(); });
    });
  }
  function scopeLabel(scope) { return scope === "full" ? "Full walk-around" : secById[scope].title; }

  function renderWalk() {
    if (RUN && RUN.mode === "walk") { drawRun(); return; }
    var html = '<div class="page-head"><h1>Walk-Around</h1><p>Step through the inspection in the real clockwise order. For each spot, recall what’s next and say your conditions out loud, then reveal and grade yourself. Scored on completeness and time.</p></div>';
    html += '<div class="panel"><h3>Full walk-around</h3><p>All ' + ITEMS.length + ' items, in order — the complete run.' + (S.stats.bestRun ? " Best: <b>" + fmtTime(S.stats.bestRun.seconds) + "</b>." : "") + '</p><div class="row"><button class="btn primary" data-run="full">Start full run</button></div></div>';
    html += '<div class="panel"><h3>By section</h3><p>Practice one part of the truck.</p><div class="row">';
    SEC.forEach(function (s) { html += '<button class="btn" data-run="' + s.id + '">' + esc(s.title) + "</button>"; });
    html += "</div></div>";
    mount(html, function () { on("[data-run]", "click", function () { startRun("walk", this.getAttribute("data-run")); }); });
  }
  function renderExaminer() {
    if (RUN && RUN.mode === "examiner") { drawRun(); return; }
    var le = S.stats.lastExam;
    var html = '<div class="page-head"><h1>Examiner</h1><p>The real-pressure simulation: full run, in order, no hints until you commit. <b>Miss any critical item and you fail on the spot</b> — just like the DMV examiner. End with a pass-ready verdict.</p></div>';
    html += '<div class="panel"><h3>Take the exam</h3><p>' + (le ? "Last result: <b class=\"" + (le.verdict === "PASS-READY" ? "" : "") + "\">" + esc(le.verdict) + "</b> (" + le.pct + "%, " + fmtTime(le.seconds) + ").</p>" : "All " + ITEMS.length + " items. Critical items insta-fail.</p>");
    html += '<div class="row"><button class="btn primary" data-run="full">Begin examiner run</button></div></div>';
    mount(html, function () { on("[data-run]", "click", function () { startRun("examiner", this.getAttribute("data-run")); }); });
  }

  // =====================================================================
  // PROGRESS
  // =====================================================================
  function renderProgress() {
    var mastered = ITEMS.filter(function (i) { return isMastered(i.id); }).length;
    var due = ITEMS.filter(function (i) { return isDue(i.id); }).length;
    var be = S.stats.bestRun, le = S.stats.lastExam;
    var html = '<div class="page-head"><h1>Progress</h1></div>';
    html += '<div class="dash-grid">';
    html += dashKpi(mastered + "/" + ITEMS.length, "Mastered");
    html += dashKpi(S.stats.streak.count + "🔥", "Day streak");
    html += dashKpi(due, "Due today");
    html += dashKpi(be ? fmtTime(be.seconds) : "—", "Best run");
    html += dashKpi(le ? le.pct + "%" : "—", "Last exam");
    html += "</div>";

    // per-section bars
    html += '<div class="secbars"><div class="grp-label">Mastery by section</div>';
    SEC.forEach(function (s) {
      var all = ITEMS.filter(function (i) { return i.section === s.id; });
      var m = all.filter(function (i) { return isMastered(i.id); }).length;
      var pct = Math.round((m / all.length) * 100);
      html += '<div class="secbar"><span class="nm">' + esc(s.title) + '</span><div class="bar"><i style="width:' + pct + '%"></i></div><span class="pct">' + pct + "%</span></div>";
    });
    html += "</div>";

    // weak-spot radar
    var weak = ITEMS.filter(function (i) { return prog(i.id).mastery <= 2; }).sort(function (a, b) { return prog(a.id).mastery - prog(b.id).mastery || a.order - b.order; }).slice(0, 8);
    html += '<div class="grp-label">Weak-spot radar</div>';
    if (weak.length) {
      html += '<div class="weak">' + weak.map(function (i) { return '<a href="#" data-drill="' + i.id + '"><span class="' + dotClass(i.id) + '"></span><b>' + esc(i.name) + "</b> <span class=\"meta\">· " + esc(secById[i.section].title) + "</span></a>"; }).join("") + "</div>";
    } else { html += '<p class="meta">No weak items — nice. Everything is at mastery 3+.</p>'; }

    // data controls
    html += '<div class="grp-label" style="margin-top:24px">Your data</div>';
    html += '<p class="meta">Progress is stored only in this browser. Export a backup before clearing site data.</p>';
    html += '<div class="row"><button class="btn" id="export">Export progress</button><button class="btn" id="import">Import</button><button class="btn bad" id="reset">Reset all</button><input type="file" id="file" accept="application/json" hidden></div>';
    mount(html, function () {
      on("[data-drill]", "click", function (e) { e.preventDefault(); startQuiz([this.getAttribute("data-drill")]); });
      document.getElementById("export").addEventListener("click", exportData);
      document.getElementById("import").addEventListener("click", function () { document.getElementById("file").click(); });
      document.getElementById("file").addEventListener("change", importData);
      document.getElementById("reset").addEventListener("click", function () { if (confirm("Erase all progress? This cannot be undone.")) { S = blank(); save(); renderProgress(); } });
    });
  }
  function dashKpi(n, l) { return '<div class="dash-kpi"><div class="n">' + n + '</div><div class="l">' + l + "</div></div>"; }
  function exportData() {
    var blob = new Blob([JSON.stringify(S, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "cdl-pretrip-progress.json"; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  function importData(e) {
    var f = e.target.files[0]; if (!f) return;
    var r = new FileReader();
    r.onload = function () {
      try {
        var d = JSON.parse(r.result);
        S.progress = d.progress || S.progress;
        S.settings = Object.assign(S.settings, d.settings || {});
        S.stats = Object.assign(S.stats, d.stats || {});
        save(); alert("Progress imported."); renderProgress();
      } catch (err) { alert("Could not read that file."); }
    };
    r.readAsText(f);
  }

  // =====================================================================
  // ROUTER
  // =====================================================================
  var ROUTES = { truck: renderDiagrams, diagrams: renderDiagrams, learn: renderLearn, quiz: renderQuiz, walk: renderWalk, examiner: renderExaminer, progress: renderProgress };
  function route() {
    if (TIMER && !(RUN && (location.hash.indexOf("walk") >= 0 || location.hash.indexOf("examiner") >= 0))) endRun();
    var name = (location.hash.replace(/^#\//, "") || "truck").split("/")[0];
    if (!ROUTES[name]) name = "truck";
    document.querySelectorAll("#nav a").forEach(function (a) { a.classList.toggle("active", a.getAttribute("data-route") === name); });
    ROUTES[name]();
  }
  window.addEventListener("hashchange", route);

  // ---------- boot ----------------------------------------------------------
  document.getElementById("foot-count").textContent = ITEMS.length + " items · 6 sections";
  if (!location.hash) location.hash = "#/truck";
  route();
})();
