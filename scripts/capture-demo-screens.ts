/**
 * Capture product screenshots of the seeded demo classroom for the marketing
 * pages (public/marketing/*). Drives the locally-running dev server with the
 * system Chrome via Playwright (channel: "chrome" — no browser download).
 *
 * Prereqs: `npm run dev` (or an existing server) and `scripts/seed-demo.ts` run.
 * Usage:   npx tsx scripts/capture-demo-screens.ts [baseUrl]
 */

import { chromium } from "playwright-core";
import * as fs from "fs";

const BASE = process.argv[2] || "http://localhost:3000";
const OUT = "public/marketing";
const EMAIL = "demo@fluencyscope.app";
const PASSWORD = process.env.DEMO_TEACHER_PASSWORD || "FluencyDemo!2026";

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });

  // Sign in as the demo teacher
  await page.goto(`${BASE}/auth/login`);
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL("**/dashboard", { timeout: 20000 });
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1500);

  // 1. Dashboard with grouped median-of-3 rows
  await page.screenshot({ path: `${OUT}/dashboard.png` });
  console.log("captured dashboard.png");

  // 2. Expand the first multi-passage group -> overall median report
  const groupRow = page.locator("text=/median/i").first();
  if (await groupRow.count()) {
    await groupRow.click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/median-report.png` });
    console.log("captured median-report.png");
  }

  // 3. Open a per-passage report (expand a sub-row) and capture the full report
  //    Navigate directly to a report page for a clean capture.
  await page.goto(`${BASE}/dashboard`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);

  const reportLink = await page.evaluate(() => {
    // find any element that navigates to /report/<uuid>
    const a = document.querySelector('a[href^="/report/"]');
    return a?.getAttribute("href") ?? null;
  });
  if (reportLink) {
    await page.goto(`${BASE}${reportLink}`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT}/report.png`, fullPage: false });
    await page.screenshot({ path: `${OUT}/report-full.png`, fullPage: true });
    console.log("captured report.png + report-full.png");
  } else {
    console.log("no /report/ link found on dashboard — skipping report capture");
  }

  await browser.close();
  console.log("done");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
