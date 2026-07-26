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

  // 3. Capture the full report. Reports render inline on the dashboard (no
  //    direct /report/ links in the collapsed list), but every expanded
  //    session row carries a Print link (/report/<id>/print) — expand rows
  //    until one appears, then strip "/print" for the standalone report page.
  await page.goto(`${BASE}/dashboard`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(1000);

  let reportLink: string | null = null;
  const findPrintLink = () =>
    page.evaluate(() => {
      const a = document.querySelector('a[href^="/report/"]');
      return a?.getAttribute("href") ?? null;
    });

  reportLink = await findPrintLink();
  if (!reportLink) {
    // Expand a group, then its first per-passage sub-row, to mount the inline report.
    const group = page.locator("text=/median/i").first();
    if (await group.count()) {
      await group.click();
      await page.waitForTimeout(1000);
      const subRow = page.locator("text=/Passage 1/i").first();
      if (await subRow.count()) {
        await subRow.click();
        await page.waitForTimeout(2500);
      }
      reportLink = await findPrintLink();
    }
  }
  if (reportLink) reportLink = reportLink.replace(/\/print$/, "");
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
