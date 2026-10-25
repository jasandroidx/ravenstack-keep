import { chromium } from "../node_modules/playwright/index.mjs";
const OUT = "/workspace/apps/ravenstack-keep/shots/";
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const logs = [];
page.on("pageerror", e => logs.push(`pageerror: ${String(e).slice(0,200)}`));
page.on("response", r => { const u=r.url(); if (r.status()>=400 || /_serverFn|api\//.test(u)) logs.push(`HTTP ${r.status()} ${u.slice(0,140)}`); });
await page.goto("http://127.0.0.1:8130/", { waitUntil: "networkidle" });
await page.waitForSelector("canvas"); await page.waitForTimeout(4000);
const box = await page.locator("canvas").first().boundingBox();
console.log("canvas", JSON.stringify(box));
// Raziel was at ~(680,235) in the 1280x800 spawn shot (screenshot scaled 1024 -> x1.25)
await page.mouse.click(680*1.25, 240*1.25);
await page.waitForTimeout(3500);
await page.screenshot({ path: OUT + "desktop-talk-open.png" });
await page.waitForTimeout(30000);
await page.screenshot({ path: OUT + "desktop-talk-30s.png" });
const txt = await page.evaluate(() => document.body.innerText.slice(0, 3000));
console.log("---TEXT---\n" + txt);
console.log("---LOGS---\n" + logs.join("\n"));
await browser.close();
