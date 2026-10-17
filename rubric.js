/* The good-enough-to-try checklist. Runs on the device, no network, same verdict for the same design.
 * Returns copy keys (ui.ev.*), not text, so the caller renders them in the current language.
 * Shared by the page and the unit tests; the Phase 2 server will reuse it to validate verdicts.
 */
(function (root) {
"use strict";

const ASSIGN_IDS = ["sections", "swap", "random", "choose", "none"];
const LENGTH_IDS = ["one", "few", "unit"];
const TIMING_IDS = ["same", "days", "week"];
const ORDER = { fix:0, done:1, tip:2 };

const filled = v => String(v ?? "").trim() !== "";

/** @returns {{ items: {s:"done"|"fix"|"tip", key:string, req:boolean}[], failing:number, verdict:"good"|"almost"|"notyet" }} */
function evaluate(d) {
  const out = [];
  const req = (ok, done, fix) => out.push(ok ? { s:"done", key:done, req:true } : { s:"fix", key:fix, req:true });

  // Required
  req(ASSIGN_IDS.includes(d.assign) && d.assign !== "none", "compOk", "compFix");
  if (d.assign === "choose") out.push({ s:"tip", key:"chooseTip", req:false });
  req(d.noAI === true, "noAIOk", "noAIFix");
  req(d.same === true, "sameOk", "sameFix");
  req(filled(d.a) && filled(d.b), "tasksOk", "tasksFix");

  // Advisory
  if (d.timing === "week") out.push({ s:"done", key:"weekOk", req:false });
  else if (d.timing === "days") out.push({ s:"done", key:"daysOk", req:false });
  else out.push({ s:"tip", key:"sameDayTip", req:false });
  out.push(d.feel === true ? { s:"done", key:"feelOk", req:false } : { s:"tip", key:"feelTip", req:false });
  out.push(filled(d.decision) ? { s:"done", key:"decOk", req:false } : { s:"tip", key:"decTip", req:false });
  if (d.length === "one") out.push({ s:"tip", key:"oneTip", req:false });

  out.sort((x, y) => ORDER[x.s] - ORDER[y.s]); // stable: rule order kept within each group
  const failing = out.filter(x => x.s === "fix").length;
  return { items:out, failing, verdict: failing === 0 ? "good" : failing === 1 ? "almost" : "notyet" };
}

const RUBRIC = { evaluate, ASSIGN_IDS, LENGTH_IDS, TIMING_IDS };
if (typeof module !== "undefined" && module.exports) module.exports = RUBRIC;
else root.TOF_RUBRIC = RUBRIC;
})(typeof window !== "undefined" ? window : globalThis);
