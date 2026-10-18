// Browser flow tests for the workshop app (Phase 1: offline core), at 320, 390 and 768px.
// Run: node tests/flow.mjs   (PLAYWRIGHT_PATH can point at any installed playwright package)
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { chromium } = require(process.env.PLAYWRIGHT_PATH || path.resolve(ROOT, "../sassy-edtech-eval/node_modules/playwright"));
const { I18N } = require(path.join(ROOT, "content.js"));
const PORT = 8767, BASE = `http://localhost:${PORT}/`;

const ANSWERS = { r1a:"false", r1b:"unknown", r1c:"true", r2a:"true", r2b:"false", r2c:"false" };

let failures = 0, passes = 0;
function check(cond, msg){ if (cond) passes++; else { failures++; console.log("  FAIL:", msg); } }

const server = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], { cwd: ROOT, stdio: "ignore" });
await new Promise(r => setTimeout(r, 800));
const browser = await chromium.launch();

async function open(width, locale = "en-US", hash = "", opts = {}){
  const ctx = await browser.newContext({ viewport:{ width, height:780 }, locale, isMobile: width < 700, hasTouch: width < 700, ...opts });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push(String(e)));
  await page.goto(BASE + hash);
  return { ctx, page, errors };
}
const screen = page => page.evaluate(() => state.screen);
const lab = page => page.evaluate(() => state.lab);
// Tap the sticky language toggle where it sits on screen. Playwright's click() scrolls the page to
// "bring it into view" first, which a real tap never does.
async function tapLang(page, lang){
  const box = await page.locator(`[data-lang="${lang}"]`).boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}
const noHScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const overflowing = page => page.evaluate(() =>
  [...document.querySelectorAll("button, .chip, .stamp, h1, h2, h3, legend, a.btn, .tag, select, .badge, .p-badge")]
    .filter(el => el.offsetParent && el.scrollWidth > el.clientWidth + 1 && !el.closest("nav.steps"))
    .map(el => el.textContent.trim().slice(0, 40)));

async function playRound(page, rk, pick){
  for (let i = 0; i < 3; i++) {
    const id = await page.locator("[data-vote]").first().getAttribute("data-item");
    check(await page.locator("[data-vote]").count() === (rk === "r1" ? 3 : 2), `${rk}: vote button count`);
    await page.click(`[data-vote="${pick(id)}"]`);
    check(await page.locator(".reveal .headline").isVisible(), `${id}: evidence shown`);
    await page.click("[data-next]");
  }
}

const nextPart = page => page.click("main .row [data-part]:last-child");
// Walk the four stages with a complete design. Optional hooks run at each mentor part.
async function fillDesign(page, { q = "transfer", p = "testing", onPart = async () => {} } = {}){
  await page.goto(BASE + "#lab");
  await page.evaluate(() => { state.lab.step = 1; render(); });
  await page.check(`input[name="q"][value="${q}"]`);
  await page.click('main > .stack > button[data-step="2"]');
  const fits = await page.locator("fieldset > .picker > .fit").count();
  if (!(await page.locator(`input[name="p"][value="${p}"]`).isVisible())) await page.click("details.others summary");
  await page.check(`input[name="p"][value="${p}"]`);
  await page.click('main > .stack > button[data-step="3"]');
  await onPart(0);
  await page.fill("#f-grade", "7th grade science");
  await page.selectOption("#f-classes", "several");
  await nextPart(page);
  await onPart(1);
  await page.selectOption("#f-predict", "a");
  await nextPart(page);
  await onPart(2);
  await nextPart(page);
  await onPart(3);
  await page.click('[data-action="suggest"]');
  await page.selectOption("#f-length", "few");
  await nextPart(page);
  await onPart(4);
  await page.selectOption("#f-timing", "week");
  await page.check('input[data-f="noAI"]');
  await page.check('input[data-f="same"]');
  await page.check('input[data-f="feel"]');
  await nextPart(page);
  await onPart(5);
  await page.fill("#f-decision", "Drop it if A isn't better a week later");
  return fits;
}

for (const width of [320, 390, 768]) {
  for (const lang of ["en", "lv"]) {
    console.log(`Full flow, ${lang}, ${width}px`);
    const t = I18N[lang];
    const { ctx, page, errors } = await open(width, lang === "lv" ? "lv-LV" : "en-US", "", { permissions:["clipboard-read", "clipboard-write"] });
    check(await page.evaluate(() => document.documentElement.lang) === lang, "default language from locale");
    check(await page.locator(".howto li").count() === 4, "intro: four how-to lines");
    check(await page.locator("nav.steps button").count() === 7, "seven screens in the top bar");
    await page.click('.hero [data-go="r1"]');
    const correct = new Set(["r1a", "r2b"]);
    const pick = id => correct.has(id) ? ANSWERS[id] : (ANSWERS[id] === "true" ? "false" : "true");
    await playRound(page, "r1", pick);
    await playRound(page, "r2", pick);
    const r3 = await page.locator(".lede").textContent();
    check(r3.includes("2") && r3.includes("6"), `r3 score: ${r3}`);
    await page.click('main [data-go="lab"]');

    // Stage 1
    check(await page.locator(".progress .cur").textContent().then(x => x.includes(t.ui.steps[0])), "stage 1 is current");
    check(await page.locator('main > .stack > button[data-step="2"]').isDisabled(), "stage 1: Next disabled until a question is picked");
    check(await page.locator(".progress .off").count() === 3, "later stages locked");
    const seen = {};
    const fits = await fillDesign(page, { onPart: async i => {
      seen[i] = (await page.locator(".mentor h2").textContent()) === t.ui.MENTOR[i].title;
      if (i === 1) seen.expect = (await page.locator(".mentor blockquote").textContent()).includes(t.FIT.transfer.find(f => f.p === "testing").expect);
      if (i === 3) seen.suggest = (await page.locator('[data-action="suggest"]').count()) === 1 &&
                                 (await page.locator(".mentor .says p").first().textContent()) === t.ui.MENTOR[3].saysSeveral;
      if (i === 5) seen.reading = (await page.locator(".mentor li").count()) === 5;
      if (width === 320) { const o = await overflowing(page); if (o.length) seen.overflow = (seen.overflow || []).concat(o); }
      if (!(await noHScroll(page))) seen.hscroll = true;
    }});
    check(fits === 2, "stage 2 shows the two best-fit principles");
    for (let i = 0; i < 6; i++) check(seen[i], `mentor part ${i + 1} title`);
    check(seen.expect, "part 2 quotes what the research suggests for this pairing");
    check(seen.suggest, "part 4 advice and suggestion tailored to several classes");
    check(seen.reading, "part 6 lists how to read results");
    check(!seen.overflow, `${lang} @320 overflow in mentor parts: ${seen.overflow}`);
    check(!seen.hscroll, `${width}: no horizontal scroll in mentor parts`);
    const L = await lab(page);
    check(L.assign === "sections", "suggested split applied");
    check(L.a === t.PRINCIPLES.find(x => x.id === "testing").serve && L.measure === t.QUESTIONS.find(x => x.id === "transfer").measure, "starters prefilled");
    check(await page.locator("#partfb .tag").count() === 1, "live feedback on the decision part");

    // Stage 4: protocol
    await page.click('main [data-step="4"]');
    check(await screen(page) === "check" && page.url().endsWith("#check"), "see my protocol -> #check");
    check((await page.locator(".verdict h2").textContent()) === t.VERDICT_COPY.good[0], "good enough to try");
    const proto = await page.locator(".protocol").textContent();
    for (const k of ["protoTitle", "pQ", "pHunch", "pResearch", "pVersions", "pBefore", "pResults", "pReading", "pDecide"])
      check(proto.includes(t.ui[k]), `protocol has ${k}`);
    check(proto.includes("7th grade science") && proto.includes(t.PREDICT[0][1]) && proto.includes(t.ASSIGN[0][1]), "protocol shows the player's answers");
    check(await page.locator(".protocol .tbd").count() === 0, "complete design leaves nothing to decide");
    check(await page.locator(".protocol .tickbox").count() === 5 && await page.locator(".protocol .res").count() === 5, "printable tick boxes and results sheet");
    check(await page.locator(".link-card").count() === 3, "next-step cards");
    await page.click('[data-action="copy"]');
    await page.waitForTimeout(100);
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    check(clip.includes(t.ui.protoTitle.toUpperCase()) && clip.includes("7th grade science") && clip.includes(t.VERDICT_COPY.good[0]), "copy puts the protocol text on the clipboard");
    if (width === 320) check((await overflowing(page)).length === 0, `${lang} protocol @320 overflow: ${await overflowing(page)}`);
    check(await noHScroll(page), `${width} protocol: no horizontal scroll`);
    // Print layout: only the protocol
    await page.emulateMedia({ media:"print" });
    check(await page.locator("header.bar").isHidden() && await page.locator(".verdict").isHidden() && await page.locator(".link-card").first().isHidden(), "print hides everything but the protocol");
    check(await page.locator(".protocol").isVisible(), "print shows the protocol");
    await page.emulateMedia({ media:"screen" });
    check(errors.length === 0, `console errors: ${errors.join(" | ")}`);
    await ctx.close();
  }
}

console.log("Stage gating and navigation");
{
  const { ctx, page } = await open(390, "en-US", "#lab");
  await page.evaluate(() => { state.lab.step = 3; render(); });
  check(await page.locator(".progress .cur").textContent().then(x => x.includes("The AI effect")), "stage 3 without picks falls back to stage 1");
  await page.check('input[name="q"][value="enjoy"]');
  await page.click('main > .stack > button[data-step="2"]');
  const order = await page.locator(".fit input").evaluateAll(xs => xs.slice(0, 2).map(x => x.value));
  check(JSON.stringify(order) === JSON.stringify(["difficulty", "testing"]), `best fits for enjoy: ${order}`);
  check(await page.locator(".fit .badge.best").count() === 2, "best-fit badges");
  check(await page.locator("details.others").getAttribute("open") === null, "other principles collapsed");
  check(await page.locator('main > .stack > button[data-step="3"]').isDisabled(), "stage 2: Next disabled until a principle is picked");
  await page.click("details.others summary");
  await page.check('input[name="p"][value="feedback"]');
  await page.click('main > .stack > button[data-step="3"]');
  await nextPart(page);
  const q = await page.locator(".mentor blockquote").textContent();
  check(q.includes(I18N.en.RESEARCH.feedback.says), "non-fit principle falls back to its general research line");
  await page.click(".progress button >> nth=0");
  check(await page.locator('input[name="q"][value="enjoy"]').isChecked(), "progress bar jumps back to stage 1 with the pick kept");
  await page.goto(BASE + "#check");
  check(await page.locator(".protocol .tbd").count() > 0, "unfinished design shows 'still to decide'");
  await ctx.close();
}

console.log("Checklist verdicts and live feedback");
{
  const { ctx, page } = await open(390, "en-US");
  await fillDesign(page, { onPart: async i => {
    if (i === 4) {
      await page.selectOption("#f-timing", "same");
      check((await page.locator("#partfb").textContent()).includes(I18N.en.ui.ev.sameDayTip), "live feedback updates without re-render");
    }
  }});
  await page.evaluate(() => { state.lab.noAI = false; });
  await page.goto(BASE + "#check");
  check((await page.locator(".verdict h2").textContent()) === "Almost there", "one required rule failing -> Almost there");
  check((await page.locator(".checklist .tag").first().textContent()) === "Fix", "Fix sorted first");
  await page.evaluate(() => { state.lab.assign = "none"; render(); });
  check((await page.locator(".verdict h2").textContent()) === "Not yet", "two failing -> Not yet");
  await ctx.close();
}

console.log("Language switch: starters swap, edits stay");
{
  const { ctx, page, errors } = await open(390, "en-US");
  await fillDesign(page, { q:"writing", p:"generation", onPart: async i => { if (i === 2) await page.fill("#f-b", "My own Group B plan"); } });
  await page.click('main .row [data-part="4"]');
  await page.click('main .row [data-part="3"]');
  await page.click('main .row [data-part="2"]');
  await page.evaluate(() => window.scrollTo(0, 400));
  const y0 = await page.evaluate(() => window.scrollY);
  await tapLang(page, "lv");
  let L = await lab(page);
  const lv = I18N.lv;
  check(L.a === lv.PRINCIPLES.find(x => x.id === "generation").serve, "unedited Group A swapped to Latvian");
  check(L.measure === lv.QUESTIONS.find(x => x.id === "writing").measure, "unedited measure swapped to Latvian");
  check(L.b === "My own Group B plan" && await page.inputValue("#f-b") === "My own Group B plan", "edited Group B kept");
  check((await page.locator(".mentor h2").textContent()) === lv.ui.MENTOR[2].title, "mentor part stays put, now in Latvian");
  check(Math.abs(await page.evaluate(() => window.scrollY) - y0) < 2, "scroll position kept");
  check(await page.evaluate(() => document.documentElement.lang) === "lv", "html lang = lv");
  await tapLang(page, "en");
  // Re-pick: unedited starter replaced, edited kept
  await page.click(".progress button >> nth=1");
  await page.click("details.others summary");
  await page.check('input[name="p"][value="feedback"]');
  L = await lab(page);
  check(L.a === I18N.en.PRINCIPLES.find(x => x.id === "feedback").serve, "re-pick replaces unedited Group A");
  check(L.b === "My own Group B plan", "re-pick keeps edited Group B");
  check(errors.length === 0, `console errors: ${errors.join(" | ")}`);
  await ctx.close();
}

console.log("Reload, hashes");
{
  const { ctx, page } = await open(390, "en-US");
  await fillDesign(page);
  await page.fill("#f-decision", "Typed just before reload");
  await page.reload();
  check(await screen(page) === "lab" && (await page.locator(".mentor h2").textContent()) === I18N.en.ui.MENTOR[5].title, "reload returns to the same mentor part");
  check(await page.inputValue("#f-decision") === "Typed just before reload", "reload keeps the last keystrokes");
  for (const h of ["intro", "r1", "r2", "r3", "lab", "check", "wall"]) {
    await page.goto(BASE + "#" + h); await page.waitForTimeout(40);
    check(await screen(page) === h, `#${h} opens ${h}`);
  }
  await ctx.close();
}

console.log("Copy fallback; protocol without picks");
{
  const { ctx, page } = await open(390, "en-US", "#check");
  check(await page.locator(".protocol").count() === 0 && await page.locator('main [data-go="lab"]').count() === 1, "protocol asks for picks first");
  await fillDesign(page);
  await page.goto(BASE + "#check");
  await page.evaluate(() => { Object.defineProperty(navigator, "clipboard", { value:{ writeText:() => Promise.reject(new Error("denied")) } }); });
  await page.click('[data-action="copy"]');
  check(await page.locator("#copybox").isVisible() && await page.evaluate(() => document.activeElement.id) === "copybox", "blocked clipboard shows selectable text");
  await ctx.close();
}

console.log("Keyboard-only through the stages");
{
  const { ctx, page } = await open(390, "en-US", "#lab");
  const tabTo = async sel => { for (let i = 0; i < 60; i++) { await page.keyboard.press("Tab"); if (await page.evaluate(s => document.activeElement.matches(s), sel)) return true; } return false; };
  check(await tabTo('input[name="q"]'), "keyboard reaches question picker");
  await page.keyboard.press("Space");
  check(await tabTo('main > .stack > button[data-step="2"]'), "keyboard reaches Next");
  await page.keyboard.press("Enter");
  check(await tabTo('input[name="p"]'), "keyboard reaches principle picker");
  await page.keyboard.press("Space");
  check(await tabTo('main > .stack > button[data-step="3"]'), "keyboard reaches Next to the mentor");
  await page.keyboard.press("Enter");
  check(await tabTo("#f-grade"), "keyboard reaches the first field");
  check(await tabTo('main .row [data-part="1"]'), "keyboard reaches Next part");
  await page.keyboard.press("Enter");
  check(await page.evaluate(() => state.lab.mstep) === 1, "keyboard advances a mentor part");
  await ctx.close();
}

console.log("Storage unavailable");
{
  const ctx = await browser.newContext({ viewport:{ width:390, height:780 } });
  await ctx.addInitScript(() => { Object.defineProperty(window, "localStorage", { get(){ throw new Error("blocked"); } }); });
  const page = await ctx.newPage();
  const errors = []; page.on("pageerror", e => errors.push(String(e)));
  await page.goto(BASE + "#lab");
  await fillDesign(page);
  await page.click('main [data-step="4"]');
  check(await page.locator(".protocol").isVisible(), "protocol without storage");
  check(errors.length === 0, `errors without storage: ${errors.join(" | ")}`);
  await ctx.close();
}

console.log("Offline after first load");
{
  const { ctx, page } = await open(390, "en-US");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await ctx.setOffline(true);
  await page.reload();
  check(await page.locator(".hero h1").isVisible(), "page loads offline");
  await page.goto(BASE + "#r1");
  await page.click('[data-vote="false"]');
  check(await page.locator(".stamp").isVisible(), "rounds play offline");
  await fillDesign(page);
  await page.click('main [data-step="4"]');
  check(await page.locator(".protocol").isVisible(), "all four stages work offline");
  await ctx.close();
}

await browser.close();
server.kill();
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
