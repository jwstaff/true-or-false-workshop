// Unit tests for the good-enough-to-try checklist. Run: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { evaluate, ASSIGN_IDS, LENGTH_IDS, TIMING_IDS } = require("../rubric.js");
const { I18N } = require("../content.js");

// A design that passes every required rule and every advisory rule.
const GOOD = Object.freeze({
  q:"transfer", p:"testing", grade:"7th grade science", a:"Quiz from memory", b:"Reread a summary",
  assign:"sections", length:"few", measure:"A short quiz without AI", timing:"week",
  noAI:true, same:true, feel:true, decision:"Drop it if A isn't better"
});
const with_ = patch => ({ ...GOOD, ...patch });
const keys = r => r.items.map(x => x.key);
const item = (r, key) => r.items.find(x => x.key === key);

test("a complete design is good enough to try, with every rule Done", () => {
  const r = evaluate(GOOD);
  assert.equal(r.verdict, "good");
  assert.equal(r.failing, 0);
  assert.deepEqual(keys(r), ["compOk", "noAIOk", "sameOk", "tasksOk", "weekOk", "feelOk", "decOk"]);
  assert.ok(r.items.every(x => x.s === "done"));
});

test("comparison: every assign id except none passes; none and empty fail", () => {
  for (const a of ASSIGN_IDS.filter(x => x !== "none")) assert.equal(item(evaluate(with_({ assign:a })), "compOk").s, "done", a);
  for (const a of ["none", "", undefined, "bogus"]) {
    const r = evaluate(with_({ assign:a }));
    assert.equal(item(r, "compFix").s, "fix", String(a));
    assert.equal(item(r, "compFix").req, true);
  }
});

test("fair assignment: choose adds a tip and still counts as a comparison", () => {
  const r = evaluate(with_({ assign:"choose" }));
  assert.equal(item(r, "chooseTip").s, "tip");
  assert.equal(item(r, "chooseTip").req, false);
  assert.equal(r.verdict, "good");
  for (const a of ["sections", "swap", "random", "none", ""]) assert.equal(item(evaluate(with_({ assign:a })), "chooseTip"), undefined, a);
});

test("measured without AI: only noAI === true passes", () => {
  assert.equal(item(evaluate(GOOD), "noAIOk").s, "done");
  for (const v of [false, undefined, "true", 1]) assert.equal(item(evaluate(with_({ noAI:v })), "noAIFix").s, "fix", String(v));
});

test("same measure: only same === true passes", () => {
  assert.equal(item(evaluate(GOOD), "sameOk").s, "done");
  for (const v of [false, undefined, "yes"]) assert.equal(item(evaluate(with_({ same:v })), "sameFix").s, "fix", String(v));
});

test("both groups described: a and b must be non-empty after trim", () => {
  for (const patch of [{ a:"" }, { b:"" }, { a:"   " }, { b:"\n\t" }, { a:undefined }, { a:"", b:"" }]) {
    const r = evaluate(with_(patch));
    assert.equal(item(r, "tasksFix").s, "fix", JSON.stringify(patch));
    assert.equal(r.items.filter(x => x.key === "tasksFix").length, 1, "one Fix even when both are empty");
  }
  assert.equal(item(evaluate(with_({ a:" x ", b:"y" })), "tasksOk").s, "done");
});

test("delay: week is Done, days is Done (weaker), anything else is a Tip", () => {
  assert.equal(item(evaluate(with_({ timing:"week" })), "weekOk").s, "done");
  assert.equal(item(evaluate(with_({ timing:"days" })), "daysOk").s, "done");
  for (const v of ["same", "", undefined]) assert.equal(item(evaluate(with_({ timing:v })), "sameDayTip").s, "tip", String(v));
  for (const v of TIMING_IDS) assert.equal(evaluate(with_({ timing:v })).verdict, "good", "timing never changes the verdict");
});

test("experience measured: feel is Done, otherwise a Tip", () => {
  assert.equal(item(evaluate(GOOD), "feelOk").s, "done");
  const r = evaluate(with_({ feel:false }));
  assert.equal(item(r, "feelTip").s, "tip");
  assert.equal(r.verdict, "good");
});

test("decision rule: non-empty after trim is Done, otherwise a Tip", () => {
  assert.equal(item(evaluate(GOOD), "decOk").s, "done");
  for (const v of ["", "  ", undefined]) assert.equal(item(evaluate(with_({ decision:v })), "decTip").s, "tip", String(v));
});

test("length: one lesson adds a Tip; few and unit add nothing", () => {
  assert.equal(item(evaluate(with_({ length:"one" })), "oneTip").s, "tip");
  for (const v of LENGTH_IDS.filter(x => x !== "one").concat([""])) assert.equal(item(evaluate(with_({ length:v })), "oneTip"), undefined, v);
  assert.equal(evaluate(with_({ length:"one" })).verdict, "good");
});

test("verdict boundaries: 0 failing = good, 1 = almost, 2, 3 and 4 = notyet", () => {
  const breaks = [{ assign:"none" }, { noAI:false }, { same:false }, { a:"" }];
  assert.equal(evaluate(GOOD).verdict, "good");
  for (const b of breaks) {
    const r = evaluate(with_(b));
    assert.equal(r.failing, 1, JSON.stringify(b));
    assert.equal(r.verdict, "almost", JSON.stringify(b));
  }
  // Every pair, triple and the full set
  const subsets = n => { const out = []; const go = (start, acc) => { if (acc.length === n) return out.push(acc); for (let i = start; i < breaks.length; i++) go(i + 1, acc.concat([breaks[i]])); }; go(0, []); return out; };
  for (const n of [2, 3, 4]) for (const set of subsets(n)) {
    const r = evaluate(with_(Object.assign({}, ...set)));
    assert.equal(r.failing, n);
    assert.equal(r.verdict, "notyet", JSON.stringify(set));
  }
});

test("advisory rules never change the verdict", () => {
  const worst = { timing:"same", feel:false, decision:"", length:"one", assign:"choose" };
  assert.equal(evaluate(with_(worst)).verdict, "good");
  assert.equal(evaluate(with_({ ...worst, noAI:false })).verdict, "almost");
});

test("order: Fix first, then Done, then Tip; rule order kept within each group", () => {
  const r = evaluate(with_({ assign:"choose", noAI:false, same:false, timing:"days", feel:false, decision:"", length:"one" }));
  const groups = r.items.map(x => x.s);
  assert.deepEqual(groups, [...groups].sort((x, y) => ({ fix:0, done:1, tip:2 }[x] - { fix:0, done:1, tip:2 }[y])));
  assert.deepEqual(keys(r), ["noAIFix", "sameFix", "compOk", "tasksOk", "daysOk", "chooseTip", "feelTip", "decTip", "oneTip"]);
});

test("an empty design fails all four required rules", () => {
  const r = evaluate({});
  assert.equal(r.failing, 4);
  assert.equal(r.verdict, "notyet");
  assert.deepEqual(r.items.filter(x => x.s === "fix").map(x => x.key), ["compFix", "noAIFix", "sameFix", "tasksFix"]);
});

test("deterministic: the same design always gets the same result", () => {
  const d = with_({ assign:"choose", same:false, length:"one" });
  const first = JSON.stringify(evaluate(d));
  for (let i = 0; i < 50; i++) assert.equal(JSON.stringify(evaluate({ ...d })), first);
});

test("every rule key has copy in both languages", () => {
  const all = ["compOk","compFix","chooseTip","noAIOk","noAIFix","sameOk","sameFix","tasksOk","tasksFix","weekOk","daysOk","sameDayTip","feelOk","feelTip","decOk","decTip","oneTip"];
  for (const lang of ["en", "lv"]) for (const k of all) assert.ok(I18N[lang].ui.ev[k], `${lang}.ui.ev.${k}`);
  assert.equal(I18N.en.VERDICT_COPY.good[0], "Good enough to try");
  assert.equal(I18N.lv.VERDICT_COPY.good[0], "Pietiekami labs, lai izmēģinātu");
  assert.equal(I18N.en.VERDICT_COPY.almost[0], "Almost there");
  assert.equal(I18N.lv.VERDICT_COPY.almost[0], "Gandrīz gatavs");
  assert.equal(I18N.en.VERDICT_COPY.notyet[0], "Not yet");
  assert.equal(I18N.lv.VERDICT_COPY.notyet[0], "Vēl ne");
});

test("content ids match in both languages and the rubric's id lists", () => {
  const ids = (lang, k) => I18N[lang][k].map(x => Array.isArray(x) ? x[0] : x.id);
  for (const k of ["R1", "R2", "R3", "QUESTIONS", "PRINCIPLES", "ASSIGN", "TIMING", "LENGTH"]) assert.deepEqual(ids("en", k), ids("lv", k), k);
  assert.deepEqual(ids("en", "ASSIGN"), ASSIGN_IDS);
  assert.deepEqual(ids("en", "TIMING"), TIMING_IDS);
  assert.deepEqual(ids("en", "LENGTH"), LENGTH_IDS);
  assert.deepEqual(ids("en", "QUESTIONS"), ["transfer", "writing", "reasoning", "gaps", "enjoy", "creation"]);
  assert.deepEqual(ids("en", "PRINCIPLES"), ["difficulty", "protege", "testing", "generation", "examples", "feedback"]);
});
