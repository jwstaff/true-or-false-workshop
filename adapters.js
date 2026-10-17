/* Data and AI adapters, chosen at deploy time.
 *
 * Phase 1 (this build) ships with both adapters off: rounds, lab, checklist and "Copy my design"
 * run entirely on the device. The UI treats a missing or failing adapter as "feature off" and hides
 * room results, sharing and AI feedback. Nothing else changes.
 *
 * Phase 2 adds an open-mode DataAdapter (own EU backend, anonymous device id) and an org-mode one
 * (claude.ai artifact db + user capabilities). Phase 3 adds the FeedbackAdapters.
 *
 * @typedef {"true"|"false"|"unknown"} Verdict
 * @typedef {{ true:number, false:number, unknown:number }} Counts
 * @typedef {() => void} Unsubscribe
 * @typedef {{ q:string, p:string, grade:string, a:string, b:string, assign:string, length:string,
 *             measure:string, timing:string, noAI:boolean, same:boolean, feel:boolean, decision:string,
 *             verdict:"good"|"almost"|"notyet", lang:"en"|"lv" }} Design
 *
 * @typedef {object} DataAdapter
 * @property {() => Promise<{ id: string|null, canWrite: boolean }>} identity
 * @property {(votes: Record<string, Verdict>) => Promise<void>} saveVote
 * @property {(cb: (counts: Record<string, Counts>) => void) => Unsubscribe} watchVoteCounts
 * @property {(d: Design) => Promise<{ status: "pending"|"approved" }>} shareDesign
 * @property {(cb: (designs: Design[]) => void) => Unsubscribe} watchWall
 * @property {() => Promise<void>} deleteMyData
 *
 * @typedef {object} FeedbackAdapter
 * @property {() => Promise<boolean>} available
 * @property {(d: Design, lang: "en"|"lv", onText: (t: string) => void, signal: AbortSignal) => Promise<string>} feedback
 */
(function (root) {
"use strict";
root.TOF_ADAPTERS = {
  mode: "local",   // "local" (Phase 1), later "open" or "org"
  data: null,      // DataAdapter | null
  feedback: null   // FeedbackAdapter | null
};
})(window);
