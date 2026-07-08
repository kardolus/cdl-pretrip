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
  // non-side-effecting reads (do NOT materialize a blank progress record)
  function masteryOf(id) { var p = S.progress[id]; return p ? p.mastery : 0; }
  function dueOf(id) { var p = S.progress[id]; return !!(p && p.due && p.due <= todayStr()); }
  function sectionPct(sid) {
    var all = ITEMS.filter(function (i) { return i.section === sid; });
    if (!all.length) return 0;
    var m = all.filter(function (i) { return masteryOf(i.id) >= 5; }).length;
    return Math.round((m / all.length) * 100);
  }

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
  // analytics — thin wrapper over Umami (index.html loads the script). No-op if blocked.
  function track(name, data) { try { if (window.umami && umami.track) umami.track(name, data || undefined); } catch (e) { /* ignore */ } }

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
  // small qualifier tag from item.note (e.g. gladhand color: blue = service, red = emergency)
  function noteTag(it) {
    var n = (it.note || "").trim(); if (!n) return "";
    var cls = /^blue$/i.test(n) ? "ntag blue" : /^red$/i.test(n) ? "ntag red" : "ntag";
    return '<span class="' + cls + '">' + esc(n) + "</span>";
  }

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
      var sc = document.getElementById("spotcheck"); if (sc) sc.addEventListener("click", function () { startQuiz(ITEMS.filter(function (i) { return masteryOf(i.id) >= 5; }).map(function (i) { return i.id; })); });
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
      '<span class="item-name">' + esc(i.name) + noteTag(i) + (i.critical ? '<span class="crit-flag">critical</span>' : "") + "</span>" +
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
  function bindItemRows(rerender) {
    var rr = rerender || renderLearn;
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
      rr();
    });
  }

  // =====================================================================
  // QUIZ
  // =====================================================================
  var QUIZ = null;
  var QTYPE = { condition: "Identify the check", odd: "Odd one out", reverse: "Name the part",
    order: "What comes next", section: "Where on the truck", critical: "Critical item",
    diagram: "On the diagram", fact: "By the numbers" };
  function quizCtx() {
    return { items: ITEMS, sections: SEC, secById: secById, diagrams: DIAGRAMS,
      diagramsBySection: diagramsBySection, masteryOf: masteryOf, dueOf: dueOf };
  }
  function scopeLabel(scope) {
    if (secById[scope]) return secById[scope].title;
    return ({ mixed: "Quick practice", weak: "Weak spots", critical: "Critical & numbers", numbers: "Numbers" }[scope] || "Quiz");
  }
  function startQuiz(spec) {
    var opts;
    if (Array.isArray(spec)) opts = { ids: spec.slice(), count: Math.min(Math.max(spec.length * 2, 4), 10), label: "Targeted drill" };
    else if (typeof spec === "string") opts = { scope: spec, label: scopeLabel(spec) };
    else opts = spec || {};
    var scope = opts.scope || "mixed";
    var gen = window.PRETRIP_QUIZGEN;
    var count = opts.count || (scope === "numbers" ? gen.FACTS.length : 10);
    var qs = gen.build(quizCtx(), { scope: scope, ids: opts.ids, count: count });
    if (!qs.length) { QUIZ = null; renderQuizHub(); return; }
    QUIZ = { questions: qs, i: 0, answered: false, chosen: -1, right: 0, wrong: 0, score: 0, streak: 0, best: 0, missed: [], label: opts.label || "Quiz", sprint: !!opts.sprint };
    track("quiz_start", { scope: scope, sprint: !!opts.sprint, n: qs.length });
    if ((location.hash || "").indexOf("quiz") < 0) location.hash = "#/quiz"; else renderQuizSession();
  }

  function renderQuiz() { if (QUIZ) renderQuizSession(); else renderQuizHub(); }

  function qcard(id, title, sub) {
    return '<button class="qcard-btn" id="' + id + '"><div class="qc-t">' + esc(title) + '</div><div class="qc-s">' + esc(sub) + "</div></button>";
  }
  function renderQuizHub() {
    var due = ITEMS.filter(function (i) { return dueOf(i.id); }).length;
    var weak = ITEMS.filter(function (i) { var m = masteryOf(i.id); return m >= 1 && m <= 2; }).length;
    var crit = ITEMS.filter(function (i) { return i.critical; });
    var mastered = ITEMS.filter(function (i) { return masteryOf(i.id) >= 5; }).length;
    var overall = Math.round((mastered / ITEMS.length) * 100);
    var critPct = crit.length ? Math.round((crit.filter(function (i) { return masteryOf(i.id) >= 5; }).length / crit.length) * 100) : 0;
    var html = '<div class="page-head"><h1>Quiz</h1><p>Fast multiple-choice practice — the right check, the right number, the right order. Every answer is graded and feeds your review schedule.</p></div>';
    html += '<div class="qhero"><div class="qhero-txt"><div class="qhero-t">Quick 10</div><div class="qhero-s">' +
      (weak + due > 0 ? "10 mixed questions from your weak &amp; due items" : "10 mixed questions across the whole inspection") +
      '</div></div><button class="btn primary big" id="q-quick">Start</button></div>';
    html += '<div class="qcards">';
    html += qcard("q-weak", "Weak spots", weak + " item" + (weak === 1 ? "" : "s") + " to shore up");
    html += qcard("q-crit", "Critical & numbers", crit.length + " auto-fail items + air-brake facts");
    html += qcard("q-sect", "By section", "In-cab, air brakes, coupling, tractor, trailer");
    html += qcard("q-walk", "Walk-around", "Timed run in inspection order");
    html += "</div>";
    html += '<div id="q-sectlist" class="row" style="display:none;margin-top:8px">' +
      SEC.map(function (s) { return '<button class="btn sm" data-sect="' + s.id + '">' + esc(s.title) + "</button>"; }).join("") + "</div>";
    html += '<div class="grp-label" style="margin-top:24px">Your progress</div>';
    html += '<div class="dash-grid">' + dashKpi(mastered + "/" + ITEMS.length, "Mastered") + dashKpi(overall + "%", "Overall") + dashKpi(critPct + "%", "Critical ready") + dashKpi(due, "Due today") + "</div>";
    html += '<div class="secbars">';
    SEC.forEach(function (s) {
      var all = ITEMS.filter(function (i) { return i.section === s.id; });
      var m = all.filter(function (i) { return masteryOf(i.id) >= 5; }).length;
      var pct = Math.round((m / all.length) * 100);
      html += '<div class="secbar"><span class="nm">' + esc(s.title) + '</span><div class="bar"><i style="width:' + pct + '%"></i></div><span class="pct">' + pct + "%</span></div>";
    });
    html += "</div>";
    html += '<div class="row" style="margin-top:12px"><button class="btn sm" id="q-numbers">Numbers drill</button><a class="btn sm" href="#/progress">Full progress &amp; backup</a></div>';
    mount(html, function () {
      document.getElementById("q-quick").addEventListener("click", function () { startQuiz({ scope: "mixed", count: 10, label: "Quick practice" }); });
      document.getElementById("q-weak").addEventListener("click", function () { startQuiz({ scope: "weak", count: 12, label: "Weak spots" }); });
      document.getElementById("q-crit").addEventListener("click", function () { startQuiz({ scope: "critical", count: 12, label: "Critical & numbers" }); });
      document.getElementById("q-numbers").addEventListener("click", function () { startQuiz({ scope: "numbers", label: "Numbers" }); });
      document.getElementById("q-walk").addEventListener("click", function () { location.hash = "#/walk"; });
      document.getElementById("q-sect").addEventListener("click", function () { var el = document.getElementById("q-sectlist"); el.style.display = el.style.display === "none" ? "flex" : "none"; });
      on("[data-sect]", "click", function () { startQuiz(this.getAttribute("data-sect")); });
    });
  }

  function renderQuizSession() {
    if (!QUIZ || QUIZ.i >= QUIZ.questions.length) { renderQuizDone(); return; }
    var q = QUIZ.questions[QUIZ.i], n = QUIZ.questions.length;
    var html = '<div class="runbar"><span>' + esc(QUIZ.label) + " · " + (QUIZ.i + 1) + " / " + n + '</span><div class="bar" style="height:6px"><i style="width:' + Math.round((QUIZ.i / n) * 100) + '%"></i></div><span class="timer">' + QUIZ.score + " pts</span></div>";
    html += '<div class="qcard quizq"><div class="qtype">' + (QTYPE[q.type] || "Question") + "</div>";
    html += '<div class="qprompt">' + esc(q.prompt) + "</div>";
    if (q.diagramId) { var d = diagramById(q.diagramId); if (d) html += '<div class="qdiagram"><img src="' + d.img + '" alt="' + esc(d.title) + '"></div>'; }
    html += '<div class="qopts">';
    q.options.forEach(function (o, idx) {
      var cls = "qopt";
      if (QUIZ.answered) { cls += idx === q.correct ? " correct" : (idx === QUIZ.chosen ? " wrong" : " dim"); }
      html += '<button class="' + cls + '" data-opt="' + idx + '"' + (QUIZ.answered ? " disabled" : "") + ">" + esc(o) + "</button>";
    });
    html += "</div>";
    if (QUIZ.answered) {
      var right = QUIZ.chosen === q.correct;
      html += '<div class="qfeedback ' + (right ? "good" : "bad") + '">' + (right ? "✓ Correct. " : "✗ Not quite. ") + esc(q.explanation) + "</div>";
      html += '<div class="grade-row"><button class="btn primary big" id="qnext">' + (QUIZ.i + 1 >= n ? "See results" : "Next question") + "</button></div>";
    }
    html += "</div>";
    html += '<div class="row" style="margin-top:8px"><button class="btn sm" id="qquit">End quiz</button></div>';
    mount(html, function () {
      on("[data-opt]", "click", function () {
        if (QUIZ.answered) return;
        QUIZ.chosen = +this.getAttribute("data-opt");
        QUIZ.answered = true;
        var ok = QUIZ.chosen === q.correct;
        if (ok) { QUIZ.right++; QUIZ.streak++; if (QUIZ.streak > QUIZ.best) QUIZ.best = QUIZ.streak; QUIZ.score += 100 + Math.min(QUIZ.streak - 1, 5) * 10; }
        else { QUIZ.wrong++; QUIZ.streak = 0; if (q.itemId) QUIZ.missed.push(q.itemId); }
        if (q.itemId) grade(q.itemId, ok ? "nailed" : "missed");
        track("quiz_answer", { type: q.type, correct: ok });
        renderQuizSession();
      });
      var nx = document.getElementById("qnext"); if (nx) nx.addEventListener("click", function () { QUIZ.i++; QUIZ.answered = false; QUIZ.chosen = -1; renderQuizSession(); });
      document.getElementById("qquit").addEventListener("click", function () { QUIZ = null; renderQuizHub(); });
    });
  }
  function renderQuizDone() {
    var n = QUIZ.questions.length, r = QUIZ.right;
    var pct = n ? Math.round((r / n) * 100) : 0;
    var verdict = pct >= 90 ? "SHARP" : pct >= 70 ? "GETTING THERE" : "KEEP DRILLING";
    var vclass = pct >= 90 ? "pass" : pct >= 70 ? "almost" : "fail";
    var missedIds = QUIZ.missed.slice();
    track("quiz_complete", { pct: pct, n: n, label: QUIZ.label });
    var html = '<div class="page-head"><h1>Quiz complete</h1></div><div class="scorecard">';
    html += '<div class="verdict ' + vclass + '">' + verdict + "</div>";
    html += '<div class="meta">' + esc(QUIZ.label) + " · best streak " + QUIZ.best + "</div>";
    html += '<div class="score-grid">' + kpi(r + "/" + n, "Correct") + kpi(pct + "%", "Score") + kpi(QUIZ.score, "Points") + kpi(QUIZ.best, "Streak") + "</div>";
    html += '<div class="row" style="margin-top:16px"><button class="btn primary" id="q-again">Another 10</button>';
    if (missedIds.length) html += '<button class="btn" id="q-missed">Drill missed (' + missedIds.length + ")</button>";
    html += '<button class="btn" id="q-hub">Quiz menu</button></div></div>';
    mount(html, function () {
      document.getElementById("q-again").addEventListener("click", function () { startQuiz({ scope: "mixed", count: 10, label: "Quick practice" }); });
      var qm = document.getElementById("q-missed"); if (qm) qm.addEventListener("click", function () { startQuiz(missedIds); });
      document.getElementById("q-hub").addEventListener("click", function () { QUIZ = null; renderQuizHub(); });
    });
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
    if ((location.hash || "").indexOf("diagrams") < 0) location.hash = "#/diagrams";
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
      html += '<div class="prompt">' + esc(i.name) + noteTag(i) + (i.critical ? '<span class="crit-flag">critical</span>' : "") + "</div>";
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
  // HOME — instant single-tap flashcard landing (the funnel for new visitors)
  // =====================================================================
  var HOME = null;
  function homeStart() { HOME = { queue: homeQueue(), i: 0, revealed: false, done: 0, showNext: false }; }
  // ordered study queue with zero side-effects: due -> weak -> brand-new -> the rest.
  function homeQueue() {
    var seen = {}, q = [];
    function add(list) { list.forEach(function (i) { if (!seen[i.id]) { seen[i.id] = 1; q.push(i.id); } }); }
    var byOrder = ITEMS.slice().sort(function (a, b) { return a.order - b.order; });
    add(byOrder.filter(function (i) { return dueOf(i.id); }));
    add(byOrder.filter(function (i) { var m = masteryOf(i.id); return m >= 1 && m <= 2; }));
    add(byOrder.filter(function (i) { return !S.progress[i.id]; }));
    add(byOrder);
    return q;
  }
  function renderHome() {
    if (!HOME) homeStart();
    if (HOME.showNext) { renderHomeNext(); return; }
    var firstTime = Object.keys(S.progress).length === 0 && !localStorage.getItem("pretrip.seenHome");
    var id = HOME.queue[HOME.i % HOME.queue.length];
    var it = ITEMS.find(function (x) { return x.id === id; });
    var sec = secById[it.section];
    var mastered = ITEMS.filter(function (i) { return masteryOf(i.id) >= 5; }).length;
    var streak = S.stats.streak.count;
    var html = '<div class="home">';
    html += '<div class="home-top"><span class="home-streak">' +
      (streak > 0 ? "🔥 " + streak + " day" + (streak > 1 ? "s" : "") : "Start your streak") +
      '</span><span>' + HOME.done + " practiced · " + mastered + "/" + ITEMS.length + " mastered</span></div>";
    if (firstTime) html += '<div class="home-coach">👋 New here? Tap the card, say the answer out loud, then grade yourself. That’s the whole app — one item at a time.</div>';
    html += '<div class="flash">';
    html += '<div class="flash-loc">' + esc(sec.part) + " · " + esc(sec.title) + " · " + esc(it.group) + "</div>";
    html += '<div class="flash-name">' + esc(it.name) + noteTag(it) + (it.critical ? '<span class="crit-flag">critical</span>' : "") + "</div>";
    if (!HOME.revealed) {
      html += '<div class="flash-hint">' + (it.conditions.length ? "Say what you check out loud — at least two conditions." : "Identify and name this item.") + "</div>";
      html += '<button class="btn primary big" id="reveal">Tap to reveal</button>';
    } else {
      html += it.conditions.length
        ? '<div class="conds">' + it.conditions.map(function (c) { return '<span class="cond">' + esc(c) + "</span>"; }).join("") + "</div>"
        : '<p class="meta" style="margin-top:12px">Just identify and name it.</p>';
      if (it.subchecks.length) html += '<ul class="subs">' + it.subchecks.map(function (sc) { return "<li><b>" + esc(sc.name) + "</b>" + (sc.conditions.length ? " — " + esc(sc.conditions.join(", ")) : "") + "</li>"; }).join("") + "</ul>";
      html += '<div class="grade-row big-grade"><button class="btn good big" data-hg="nailed">✓ Got it</button><button class="btn bad big" data-hg="missed">↻ Review</button></div>';
    }
    html += "</div>"; // .flash
    html += '<div class="home-alt"><button class="btn sm" id="h-skip">Skip →</button><a class="btn sm" href="#/truck">Tap-the-Truck</a><a class="btn sm" href="#/learn">Browse all</a></div>';
    html += "</div>"; // .home
    mount(html, function () {
      var rv = document.getElementById("reveal");
      if (rv) rv.addEventListener("click", function () { HOME.revealed = true; track("home_reveal"); renderHome(); });
      on("[data-hg]", "click", function () {
        var res = this.getAttribute("data-hg");
        var firstEver = Object.keys(S.progress).length === 0;
        grade(id, res);
        track("home_grade", { result: res });
        if (firstEver) track("first_grade");
        localStorage.setItem("pretrip.seenHome", "1");
        HOME.done++; HOME.i++; HOME.revealed = false;
        if (HOME.done % 4 === 0) HOME.showNext = true;
        renderHome();
      });
      var sk = document.getElementById("h-skip");
      if (sk) sk.addEventListener("click", function () { HOME.i++; HOME.revealed = false; renderHome(); });
    });
  }
  function renderHomeNext() {
    var mastered = ITEMS.filter(function (i) { return masteryOf(i.id) >= 5; }).length;
    var streak = S.stats.streak.count;
    var html = '<div class="home"><div class="home-mile">';
    html += '<div class="mile-badge">🔥 ' + streak + "</div>";
    html += "<h1>" + HOME.done + " items practiced</h1>";
    html += '<p class="meta">' + mastered + " of " + ITEMS.length + " mastered. Keep the momentum, or switch it up.</p>";
    html += '<div class="row" style="justify-content:center;margin-top:16px">';
    html += '<button class="btn primary" id="cont">Keep practicing</button>';
    html += '<a class="btn" href="#/truck" data-na="truck">Tap-the-Truck</a>';
    html += '<a class="btn" href="#/walk" data-na="walk">Full walk-around</a>';
    html += "</div></div></div>";
    mount(html, function () {
      document.getElementById("cont").addEventListener("click", function () { HOME.showNext = false; renderHome(); });
      on("[data-na]", "click", function () { track("next_action_click", { to: this.getAttribute("data-na") }); });
    });
  }

  // =====================================================================
  // TAP-THE-TRUCK — interactive walk-around map (truckmap.js + truck-map.svg)
  // =====================================================================
  var TMSEL = null;
  function renderTruckMap() {
    if (TMSEL) { renderTruckZone(TMSEL); return; }
    var map = window.PRETRIP_TRUCKMAP || { svg: "img/diagrams/truck-map.svg", zones: [] };
    var html = '<div class="page-head"><h1>Tap the truck</h1><p>Walk the rig the way the examiner will. Tap any area to study its items — each zone is shaded by how much you’ve mastered.</p></div>';
    html += '<div class="qhero"><div class="qhero-txt"><div class="qhero-t">Practice now</div><div class="qhero-s">10 quick questions from your weak spots</div></div><button class="btn primary big" id="home-quick">Start</button></div>';
    html += '<div class="truckwrap" id="truckwrap"><div class="truck-loading meta">Loading diagram…</div></div>';
    html += '<div class="row" style="margin-top:10px"><a class="btn sm" href="#/diagrams">Picture dictionary</a><a class="btn sm" href="#/walk">Full walk-around</a></div>';
    mount(html, function () {
      var hq = document.getElementById("home-quick");
      if (hq) hq.addEventListener("click", function () { startQuiz({ scope: "mixed", count: 10, label: "Quick practice" }); });
      var wrap = document.getElementById("truckwrap");
      fetch(map.svg).then(function (r) { return r.text(); }).then(function (svg) {
        wrap.innerHTML = svg;
        map.zones.forEach(function (z) {
          var g = wrap.querySelector("#zone-" + z.id); if (!g) return;
          var pct = sectionPct(z.section);
          var rect = g.querySelector("rect"); if (rect) rect.setAttribute("fill-opacity", (0.10 + 0.006 * pct).toFixed(3));
          var pctEl = g.querySelector(".zpct"); if (pctEl) pctEl.textContent = pct + "%";
          function open() { track("truckzone_tap", { zone: z.id }); TMSEL = z.section; renderTruckZone(z.section); }
          g.addEventListener("click", open);
          g.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
        });
      }).catch(function () {
        wrap.innerHTML = '<p class="empty">Couldn’t load the truck diagram. <a href="#/learn">Browse all items</a> instead.</p>';
      });
    });
  }
  function renderTruckZone(sid) {
    var s = secById[sid];
    var all = ITEMS.filter(function (i) { return i.section === sid; }).sort(function (a, b) { return a.order - b.order; });
    var mastered = all.filter(function (i) { return masteryOf(i.id) >= 5; }).length;
    var pct = all.length ? Math.round((mastered / all.length) * 100) : 0;
    var html = '<div class="row" style="margin:10px 0 4px"><button class="btn sm" id="tm-back">← Truck map</button></div>';
    html += '<div class="sec"><div class="sec-head"><span class="part-tag">' + esc(s.part) + '</span><h2>' + esc(s.title) + '</h2><span class="count">' + mastered + "/" + all.length + " mastered</span></div>";
    html += '<div class="bar"><i style="width:' + pct + '%"></i></div>';
    var diags = diagramsBySection[sid] || [];
    if (diags.length) {
      html += '<div class="diag-strip">' + diags.map(function (d) {
        return '<span class="diag-chip" data-diag="' + d.id + '"><img src="' + d.img + '" alt=""> ' + esc(d.title) + "</span>";
      }).join("") + "</div>";
    }
    html += '<div class="row" style="margin:8px 0 14px"><button class="btn primary" id="tm-drill">Quiz this area</button><button class="btn" id="tm-walk">Walk this area</button></div>';
    var curGroup = null;
    all.forEach(function (i) {
      if (i.group !== curGroup) { curGroup = i.group; html += '<div class="grp-label">' + esc(i.group) + "</div>"; }
      html += itemRow(i);
    });
    html += "</div>";
    mount(html, function () {
      document.getElementById("tm-back").addEventListener("click", function () { TMSEL = null; renderTruckMap(); });
      document.getElementById("tm-drill").addEventListener("click", function () { TMSEL = null; startQuiz(sid); });
      document.getElementById("tm-walk").addEventListener("click", function () { TMSEL = null; startRun("walk", sid); });
      on(".diag-chip", "click", function () { openLightbox(this.getAttribute("data-diag")); });
      bindItemRows(function () { renderTruckZone(sid); });
    });
  }

  // =====================================================================
  // ROUTER
  // =====================================================================
  // Home is now the Tap-the-Truck map; the old instant-flashcard (renderHome) is retired
  // (unreachable — quick single-tap practice lives in the Quiz hub + the "Practice now" CTA).
  // Examiner dropped (its self-graded run overlapped the Quiz walk-around card). The shared
  // runner + renderExaminer remain in the file but are unreachable (no nav entry / route).
  var ROUTES = { home: renderTruckMap, truck: renderTruckMap, diagrams: renderDiagrams, learn: renderLearn, quiz: renderQuiz, walk: renderWalk, progress: renderProgress };
  // the floating "Quiz me" button is hidden inside a quiz/run so it never overlaps the action
  function updateFab(name) {
    var f = document.getElementById("fab"); if (!f) return;
    f.style.display = (name === "quiz" || name === "walk" || name === "examiner" || QUIZ || RUN) ? "none" : "flex";
  }
  function route() {
    if (TIMER && !(RUN && (location.hash.indexOf("walk") >= 0 || location.hash.indexOf("examiner") >= 0))) endRun();
    var name = (location.hash.replace(/^#\//, "") || "home").split("/")[0];
    if (!ROUTES[name]) name = "home";
    if (name !== "truck" && name !== "home") TMSEL = null; // leaving the map resets to the overview
    document.querySelectorAll("#nav a").forEach(function (a) { a.classList.toggle("active", a.getAttribute("data-route") === name); });
    track("mode_enter", { mode: name });
    ROUTES[name]();
    updateFab(name);
  }
  window.addEventListener("hashchange", route);

  // ---------- boot ----------------------------------------------------------
  document.getElementById("foot-count").textContent = ITEMS.length + " items · 6 sections";
  var fab = document.getElementById("fab");
  if (fab) fab.addEventListener("click", function () { startQuiz({ scope: "mixed", count: 5, sprint: true, label: "Quick sprint" }); });
  if (!location.hash) location.hash = "#/home";
  route();
})();
