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
  [...document.querySelectorAll("button, .chip, .stamp, h1, h2, h3, legend, a.btn, .tag, select")]
    .filter(el => el.offsetParent && el.scrollWidth > el.clientWidth + 1 && !el.closest("nav"))
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

async function fillDesign(page, { q = "transfer", p = "testing" } = {}){
  await page.check(`input[name="q"][value="${q}"]`);
  await page.check(`input[name="p"][value="${p}"]`);
  await page.fill("#f-grade", "7th grade science");
  await page.selectOption("#f-assign", "sections");
  await page.selectOption("#f-length", "few");
  await page.selectOption("#f-timing", "week");
  await page.check('input[data-f="noAI"]');
  await page.check('input[data-f="same"]');
  await page.check('input[data-f="feel"]');
  await page.fill("#f-decision", "Drop it if A isn't better a week later");
}

for (const width of [320, 390, 768]) {
  for (const lang of ["en", "lv"]) {
    console.log(`Full flow, ${lang}, ${width}px`);
    const t = I18N[lang];
    const { ctx, page, errors } = await open(width, lang === "lv" ? "lv-LV" : "en-US", "", { permissions:["clipboard-read", "clipboard-write"] });
    check(await page.evaluate(() => document.documentElement.lang) === lang, "default language from locale");
    check(await page.locator(".note").first().textContent() === t.ui.dataLocal, "intro: data-handling line");
    check(await page.locator(".howto li").count() === 4, "intro: four how-to lines");
    check(await page.locator("nav button").count() === 7, "seven screens in the top bar");
    await page.click('.hero [data-go="r1"]');
    const correct = new Set(["r1a", "r2b"]);
    const pick = id => correct.has(id) ? ANSWERS[id] : (ANSWERS[id] === "true" ? "false" : "true");
    await playRound(page, "r1", pick);
    await playRound(page, "r2", pick);
    check(await screen(page) === "r3", "rounds -> r3");
    const r3 = await page.locator(".lede").textContent();
    check(r3.includes("2") && r3.includes("6"), `r3 score: ${r3}`);
    await page.click('main [data-go="lab"]');
    check(await screen(page) === "lab" && page.url().endsWith("#lab"), "r3 -> lab");
    check(await page.locator("#f-a").count() === 0, "form hidden until both picks");
    await fillDesign(page);
    const L = await lab(page);
    const P = t.PRINCIPLES.find(x => x.id === "testing"), Q = t.QUESTIONS.find(x => x.id === "transfer");
    check(L.a === P.serve && L.b === P.bypass && L.measure === Q.measure, "starters prefilled from picks");
    check(await noHScroll(page), `${width} lab: no horizontal scroll`);
    if (width === 320) check((await overflowing(page)).length === 0, `${lang} lab @320 overflow: ${await overflowing(page)}`);
    await page.click('main [data-go="check"]');
    check(await screen(page) === "check", "lab -> check");
    check((await page.locator(".verdict h2").textContent()) === t.VERDICT_COPY.good[0], "complete design is good enough to try");
    check(await page.locator(".checklist li").count() === 7, "seven checklist rows");
    check((await page.locator(".note").allTextContents()).includes(t.ui.ethics), "ethics note under checklist");
    check(await page.locator(".link-card").count() === 2, "check: two next-step cards");
    check((await page.locator(".link-card a").first().getAttribute("href")).includes("aitinkery"), "playbook first");
    check(await page.locator('[data-action="share"], [data-action="claude"]').count() === 0, "share and AI buttons hidden in local mode");
    await page.click('[data-action="copy"]');
    await page.waitForTimeout(100);
    const clip = await page.evaluate(() => navigator.clipboard.readText());
    check(clip.includes(Q.title) && clip.includes(t.VERDICT_COPY.good[0]) && clip.includes("7th grade science") && !clip.includes("\n\n\n"), "copy puts the design on the clipboard");
    check((await page.locator('[role="status"]').textContent()) === t.ui.copied, "copy confirms");
    if (width === 320) check((await overflowing(page)).length === 0, `${lang} check @320 overflow: ${await overflowing(page)}`);
    check(await noHScroll(page), `${width} check: no horizontal scroll`);
    await page.click('main [data-go="wall"]');
    check(await screen(page) === "wall" && await page.locator(".link-card").count() === 2, "wall: off note and next-step cards");
    check(errors.length === 0, `console errors: ${errors.join(" | ")}`);
    await ctx.close();
  }
}

console.log("Checklist verdicts in the UI");
{
  const { ctx, page } = await open(390, "en-US", "#lab");
  await fillDesign(page);
  await page.uncheck('input[data-f="noAI"]');
  await page.goto(BASE + "#check");
  check((await page.locator(".verdict h2").textContent()) === "Almost there", "one required rule failing -> Almost there");
  check((await page.locator(".checklist .tag").first().textContent()) === "Fix", "Fix sorted first");
  await page.goto(BASE + "#lab");
  await page.selectOption("#f-assign", "none");
  await page.goto(BASE + "#check");
  check((await page.locator(".verdict h2").textContent()) === "Not yet", "two failing -> Not yet");
  await ctx.close();
}

console.log("Language switch: starters swap, edits stay");
{
  const { ctx, page, errors } = await open(390, "en-US", "#lab");
  await page.check('input[name="q"][value="writing"]');
  await page.check('input[name="p"][value="generation"]');
  await page.fill("#f-b", "My own Group B plan");
  await page.evaluate(() => window.scrollTo(0, 600));
  const y0 = await page.evaluate(() => window.scrollY);
  await tapLang(page, "lv");
  let L = await lab(page);
  const lv = I18N.lv;
  check(L.a === lv.PRINCIPLES.find(x => x.id === "generation").serve, "unedited Group A swapped to Latvian");
  check(L.measure === lv.QUESTIONS.find(x => x.id === "writing").measure, "unedited measure swapped to Latvian");
  check(L.b === "My own Group B plan", "edited Group B kept");
  check(await page.inputValue("#f-b") === "My own Group B plan", "edited Group B still in the form");
  check(Math.abs(await page.evaluate(() => window.scrollY) - y0) < 2, "scroll position kept");
  check(await page.evaluate(() => document.documentElement.lang) === "lv", "html lang = lv");
  await tapLang(page, "en");
  L = await lab(page);
  check(L.a === I18N.en.PRINCIPLES.find(x => x.id === "generation").serve, "swaps back to English");
  // Re-pick: unedited starter replaced, edited kept
  await page.check('input[name="p"][value="feedback"]');
  L = await lab(page);
  check(L.a === I18N.en.PRINCIPLES.find(x => x.id === "feedback").serve, "re-pick replaces unedited Group A");
  check(L.b === "My own Group B plan", "re-pick keeps edited Group B");
  check(errors.length === 0, `console errors: ${errors.join(" | ")}`);
  await ctx.close();
}

console.log("Reload, hashes, play state");
{
  const { ctx, page } = await open(390, "en-US", "#lab");
  await fillDesign(page);
  await page.fill("#f-grade", "Typed just before reload");
  await page.reload();
  check(await screen(page) === "lab", "reload keeps screen");
  check(await page.inputValue("#f-grade") === "Typed just before reload", "reload keeps the last keystrokes");
  for (const h of ["intro", "r1", "r2", "r3", "lab", "check", "wall"]) {
    await page.goto(BASE + "#" + h); await page.waitForTimeout(40);
    check(await screen(page) === h, `#${h} opens ${h}`);
  }
  await ctx.close();
}

console.log("Check without a pairing; copy fallback");
{
  const { ctx, page } = await open(390, "en-US", "#check");
  check(await page.locator(".verdict").count() === 0 && await page.locator('main [data-go="lab"]').count() === 1, "check asks for a pairing first");
  await page.goto(BASE + "#lab");
  await fillDesign(page);
  await page.goto(BASE + "#check");
  await page.evaluate(() => { Object.defineProperty(navigator, "clipboard", { value:{ writeText:() => Promise.reject(new Error("denied")) } }); });
  await page.click('[data-action="copy"]');
  check(await page.locator("#copybox").isVisible(), "blocked clipboard shows selectable text");
  check(await page.evaluate(() => document.activeElement.id) === "copybox", "fallback text focused for copying");
  await ctx.close();
}

console.log("Keyboard-only through the lab");
{
  const { ctx, page } = await open(390, "en-US", "#lab");
  const tabTo = async sel => { for (let i = 0; i < 40; i++) { await page.keyboard.press("Tab"); if (await page.evaluate(s => document.activeElement.matches(s), sel)) return true; } return false; };
  check(await tabTo('input[name="q"]'), "keyboard reaches question picker");
  await page.keyboard.press("Space");
  check(await tabTo('input[name="p"]'), "keyboard reaches principle picker");
  await page.keyboard.press("Space");
  check(await page.locator("#f-a").count() === 1, "keyboard picks open the form");
  check(await tabTo('main button[data-go="check"]'), "keyboard reaches Check my design");
  await page.keyboard.press("Enter");
  check(await screen(page) === "check", "keyboard opens the checklist");
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
  await page.goto(BASE + "#check");
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
  await page.goto(BASE + "#lab");
  await fillDesign(page);
  await page.click('main [data-go="check"]');
  check(await page.locator(".verdict h2").isVisible(), "lab and checklist work offline");
  check(await page.evaluate(() => document.fonts.check('600 20px "Oswald"')), "fonts available offline");
  await ctx.close();
}

await browser.close();
server.kill();
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
