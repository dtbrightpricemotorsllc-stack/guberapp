import { chromium, devices } from "playwright";
import fs from "node:fs";

const BASE = "http://localhost:5000";
const EMAIL = "admin@guberapp.com";
const PASS = "Bouncer76!";

const PAGES = [
  { path: "/dashboard", name: "01_dashboard", waitFor: 2500 },
  { path: "/map", name: "02_map", waitFor: 4500 },
  { path: "/verify-inspect", name: "03_verify_inspect", waitFor: 2500 },
  { path: "/ai-or-not", name: "04_ai_or_not", waitFor: 2500 },
];

const OUT = "attached_assets/appstore/real";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: "/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium",
  args: ["--no-sandbox"],
});
const context = await browser.newContext({
  viewport: { width: 414, height: 896 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
});

// API login → token
const apiRes = await context.request.post(`${BASE}/api/auth/login`, {
  data: { email: EMAIL, password: PASS },
});
if (!apiRes.ok()) throw new Error(`login failed: ${apiRes.status()} ${await apiRes.text()}`);
const { token } = await apiRes.json();
if (!token) throw new Error("no token returned");

const page = await context.newPage();
// seed localStorage on origin
await page.goto(`${BASE}/login?nosplash=1`, { waitUntil: "domcontentloaded" });
await page.evaluate((t) => localStorage.setItem("guber_token", t), token);

for (const p of PAGES) {
  console.log(`→ ${p.path}`);
  try {
    await page.goto(`${BASE}${p.path}`, { waitUntil: "networkidle", timeout: 20000 });
  } catch (e) {
    console.warn(`  networkidle timeout, continuing`);
  }
  await page.waitForTimeout(p.waitFor);
  const file = `${OUT}/${p.name}.png`;
  await page.screenshot({ path: file, fullPage: false });
  console.log(`  saved ${file}`);
}

await browser.close();
console.log("done");
