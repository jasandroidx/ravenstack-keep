import { chromium } from "../node_modules/playwright/index.mjs";
const KEEP = process.env.KEEP_URL || "http://127.0.0.1:8130/";
const OUT = new URL("../shots/", import.meta.url).pathname;
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const logs = [];
async function run(name, vp, mobile) {
  const ctx = await browser.newContext({ viewport: vp, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: mobile ? 2 : 1 });
  const page = await ctx.newPage();
  page.on("console", m => { if (["error","warning"].includes(m.type())) logs.push(`[${name}] ${m.type()}: ${m.text().slice(0,200)}`); });
  page.on("pageerror", e => logs.push(`[${name}] pageerror: ${String(e).slice(0,200)}`));
  page.on("response", r => { if (r.status() >= 400) logs.push(`[${name}] HTTP ${r.status()} ${r.url()}`); });
  await page.goto(KEEP, { waitUntil: "networkidle", timeout: 60000 }).catch(e => logs.push(`[${name}] goto: ${e.message}`));
  await page.waitForSelector("canvas", { timeout: 30000 }).catch(() => logs.push(`[${name}] no canvas`));
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${OUT}${name}-hall.png` });
  if (!mobile) {
    await page.locator("canvas").first().click({ position: { x: 5, y: 5 } }).catch(()=>{});
    for (const [k, ms] of [["ArrowUp", 1200], ["ArrowLeft", 900], ["ArrowRight", 1800]]) {
      await page.keyboard.down(k); await page.waitForTimeout(ms); await page.keyboard.up(k);
    }
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${OUT}${name}-walked.png` });
  }
  return { page, ctx };
}
const d = await run("desktop", { width: 1280, height: 800 }, false);
globalThis.__page = d.page;
await run("phone", { width: 390, height: 844 }, true);
console.log(logs.join("\n"));
await browser.close();
