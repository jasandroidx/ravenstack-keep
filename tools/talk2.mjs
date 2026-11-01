import { chromium } from "../node_modules/playwright/index.mjs";
const OUT = "/workspace/apps/ravenstack-keep/shots/";
const browser = await chromium.launch({ executablePath: "/usr/bin/google-chrome", headless: true,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const logs = [];
page.on("pageerror", e => logs.push(`pageerror: ${String(e).slice(0,200)}`));
page.on("response", r => { if (r.status()>=400) logs.push(`HTTP ${r.status()} ${r.url().slice(0,140)}`); });
await page.goto("http://127.0.0.1:8130/", { waitUntil: "load", timeout: 90000 });
await page.waitForSelector("canvas", { timeout: 90000 }); await page.waitForTimeout(4000);
await page.mouse.click(850, 300); await page.waitForTimeout(3500);
const input = page.getByPlaceholder(/Transmit neural query/i);
await input.fill("Who are you and what room is this?");
const t0 = Date.now();
await page.getByRole("button", { name: /transmit/i }).click();
for (let i = 0; i < 45; i++) { await page.waitForTimeout(2000);
  const t = await page.evaluate(() => document.body.innerText);
  if (/who are you/i.test(t) && t.split("Who are you")[1]?.length > 120) break; }
console.log("waited ms", Date.now()-t0);
await page.screenshot({ path: OUT + "desktop-talk-reply.png" });
const t = await page.evaluate(() => document.body.innerText);
console.log(t.slice(t.indexOf("RAZIEL"), t.indexOf("RAZIEL")+1500));
await page.keyboard.press("Escape"); await page.waitForTimeout(1000);
await page.getByText(/^registry$/i).first().click({timeout:5000}).catch(e=>logs.push("registry "+e.message.slice(0,80)));
await page.waitForTimeout(2500); await page.screenshot({ path: OUT + "desktop-registry.png" });
console.log("---LOGS---\n"+logs.join("\n"));
await browser.close();
