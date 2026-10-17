// Pre-event content check: lists evidence items without a reviewer. Run: node tests/content-check.mjs
// Exits 1 if anything is unreviewed, so it can gate a deploy.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { CONTENT_VERSION, REVIEW, I18N } = require("../content.js");

const ids = new Set([
  ...I18N.en.R1.map(x => x.id), ...I18N.en.R2.map(x => x.id), ...I18N.en.R3.map(x => x.id),
  ...I18N.en.QUESTIONS.map(x => x.id), "ev"
]);
const missing = [...ids].filter(id => !REVIEW[id]);
const unreviewed = Object.entries(REVIEW).filter(([, r]) => !r.reviewedBy || !/^\d{4}-\d{2}-\d{2}$/.test(r.reviewedOn || ""));

console.log(`Content version ${CONTENT_VERSION}`);
if (missing.length) console.log(`No review record: ${missing.join(", ")}`);
if (unreviewed.length) console.log(`Not yet reviewed (${unreviewed.length}): ${unreviewed.map(([id]) => id).join(", ")}`);
if (!missing.length && !unreviewed.length) console.log("Every evidence item has a reviewer and date.");
process.exit(missing.length || unreviewed.length ? 1 : 0);
