import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { createServer } from 'vite';

mkdirSync('scratch-visual', { recursive: true });

// Start Vite dev server in demo mode on an ephemeral free port
const vite = await createServer({
  mode: 'demo',
  configFile: './vite.config.ts',
  server: { port: 0, host: '127.0.0.1' },
});
await vite.listen();
const port = vite.httpServer?.address()?.port;
const BASE = `http://127.0.0.1:${port}`;
console.log(`[Vite] Server started dynamically in DEMO mode at ${BASE}`);

const VIEWPORTS = [
  { name: '390', width: 390, height: 844 },
  { name: '768', width: 768, height: 1024 },
  { name: '1440', width: 1440, height: 900 },
];

const screensToCheck = [
  { name: 'overview', hash: '#overview' },
  { name: 'prototype', hash: '#prototype' },
  { name: 'dossier', hash: '#prototype/case/demo-app-0' },
  { name: 'visits', hash: '#visits' },
  { name: 'compliance', hash: '#compliance' },
  { name: 'reports', hash: '#reports' },
  { name: 'alerts', hash: '#alerts' },
];

const browser = await chromium.launch();
let failures = 0;

const expect = (label, cond) => {
  if (!cond) failures += 1;
  console.log(`[Assertion] ${label}: ${cond ? 'PASS' : 'FAIL'}`);
};

try {
  // 1. Multi-viewport render & 0 horizontal overflow check
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
    });
    const page = await context.newPage();
    await page.goto(`${BASE}/#overview`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.app-shell', { timeout: 10000 });

    for (const screen of screensToCheck) {
      await page.goto(`${BASE}/${screen.hash}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(300);

      const metrics = await page.evaluate(() => {
        const de = document.documentElement;
        return {
          scrollWidth: de.scrollWidth,
          clientWidth: de.clientWidth,
          hasHScroll: de.scrollWidth > de.clientWidth + 1,
        };
      });

      const bodyText = await page.evaluate(() => document.body.innerText);
      const rendered = bodyText.trim().length > 0;

      const status = metrics.hasHScroll ? 'OVERFLOW' : 'ok';
      if (metrics.hasHScroll || !rendered) failures += 1;
      console.log(
        `${vp.name}px ${screen.name}: ${status} ` +
          `(scrollW=${metrics.scrollWidth} clientW=${metrics.clientWidth} textLen=${bodyText.trim().length})`,
      );

      await page.screenshot({
        path: `scratch-visual/${screen.name}-${vp.name}.png`,
        fullPage: true,
      });
    }

    await context.close();
  }

  // 2. Regulatory & Section Enhancements Checks (Desktop 1440px)
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    // Section C: 3-Expert EVC Panel in #visits
    await page.goto(`${BASE}/#visits`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.app-shell', { timeout: 10000 });
    await page.waitForTimeout(300);
    const visitsText = await page.evaluate(() => document.body.innerText);
    expect(
      'Section C: 3-expert EVC panel displayed',
      visitsText.includes('Academic (Chairman)') &&
        visitsText.includes('Architectural / Civil') &&
        visitsText.includes('Regional Nominee'),
    );
    expect(
      'Section C: Conflict of interest sign-offs present',
      visitsText.includes('conflict-of-interest'),
    );
    await page.screenshot({ path: 'scratch-visual/visits-detail-1440.png', fullPage: true });

    // Section D & E: 30-Year Lease & Multi-tier Escalation in #compliance
    await page.goto(`${BASE}/#compliance`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.app-shell', { timeout: 10000 });
    await page.waitForTimeout(300);
    const complianceText = await page.evaluate(() => document.body.innerText);
    expect(
      'Section D&E: 30-year registered lease norm tracked',
      complianceText.includes('Registered Lease:') &&
        complianceText.includes('Min 30 years'),
    );
    expect(
      'Section D&E: Escalation ladder schedule displayed',
      complianceText.includes('T-90') &&
        complianceText.includes('T-30') &&
        complianceText.includes('T+7'),
    );
    await page.screenshot({ path: 'scratch-visual/compliance-detail-1440.png', fullPage: true });

    // Section B: Pan-India Regional Pendency Breakdown in #reports
    await page.goto(`${BASE}/#reports`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.app-shell', { timeout: 10000 });
    await page.waitForTimeout(300);
    const reportsText = await page.evaluate(() => document.body.innerText);
    expect(
      'Section B: Regional matrix section 03 rendered',
      reportsText.includes('Pan-India Regional Pendency & Bottlenecks') &&
        reportsText.includes('Northern') &&
        reportsText.includes('Eastern'),
    );
    await page.screenshot({ path: 'scratch-visual/reports-detail-1440.png', fullPage: true });

    // Section F: Deep-linked Alerts in #alerts
    await page.goto(`${BASE}/#alerts`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.app-shell', { timeout: 10000 });
    await page.waitForTimeout(300);
    const alertsInspectCount = await page.locator('button:has-text("Inspect case")').count();
    expect('Section F: Deep-linked inspect case buttons present in alerts', alertsInspectCount > 0);
    await page.screenshot({ path: 'scratch-visual/alerts-detail-1440.png', fullPage: true });

    // 3. Option A Interactive Flow: Institution filing SAC/SHC appeal on demo-app-10
    // Switch role to "institution"
    await page.goto(`${BASE}/#overview`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.app-shell', { timeout: 10000 });
    await page.locator('select[aria-label="Demo role"]').selectOption('institution');
    await page.waitForTimeout(500);

    const currentRole = await page.locator('select[aria-label="Demo role"]').inputValue();
    expect('Demo role switched to institution', currentRole === 'institution');

    // Navigate to rejected application demo-app-10
    await page.goto(`${BASE}/#case/demo-app-10`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.app-shell', { timeout: 10000 });
    await page.waitForTimeout(400);

    const caseText = await page.evaluate(() => document.body.innerText);
    expect('Case workspace opened for demo-app-10', caseText.includes('DEMO-2026-10'));
    expect('Application rejection status is visible', caseText.includes('Rejected'));

    // Check for "File SHC appeal" action button
    const appealBtn = page.locator('button:has-text("File SHC appeal")');
    const appealBtnVisible = await appealBtn.isVisible();
    expect('Option A: "File SHC appeal" button visible for institution', appealBtnVisible);

    if (appealBtnVisible) {
      await appealBtn.click();
      await page.waitForTimeout(300);

      // Verify SHC Appeal Dialog opens with statutory callout
      const dialogText = await page.evaluate(() => document.body.innerText);
      expect(
        'Option A: Statutory SHC appeal modal contains regulatory callout',
        dialogText.includes('Standing Hearing Committee (SHC) Appeal') &&
          dialogText.includes('APH Chapter 1 & 2'),
      );

      await page.screenshot({ path: 'scratch-visual/shc-appeal-dialog-1440.png' });

      // Fill appeal rationale and submit
      const commentInput = page.locator('textarea').first();
      await commentInput.fill('Filing statutory appeal under APH Chapter 2 with verified 30-year registered lease deed.');
      await page.waitForTimeout(200);

      // Confirm action
      const confirmBtn = page.locator('button:has-text("Confirm file shc appeal")').first();
      await confirmBtn.click();
      await page.waitForTimeout(600);

      // Post-action verification: status should transition to 'pending_decision' with SHC appeal active
      const postCaseText = await page.evaluate(() => document.body.innerText);
      expect(
        'Option A: Application transitioned to Decision pending status under SHC appeal',
        postCaseText.includes('Decision pending') || postCaseText.includes('Final decision'),
      );
      expect(
        'Option A: SHC Appeal In Progress callout is displayed',
        postCaseText.includes('APH Standing Hearing Committee (SHC) Appeal In Progress'),
      );
      await page.screenshot({ path: 'scratch-visual/shc-appeal-submitted-1440.png', fullPage: true });

      // Check prototype view as well
      await page.goto(`${BASE}/#prototype/case/demo-app-10`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(400);
      const protoCaseText = await page.evaluate(() => document.body.innerText);
      expect(
        'Option A: Prototype view also displays SHC Appeal In Progress alert',
        protoCaseText.includes('APH Standing Hearing Committee (SHC) Appeal In Progress'),
      );
      await page.screenshot({ path: 'scratch-visual/prototype-shc-1440.png', fullPage: true });
    }

    await context.close();
  }
} finally {
  await browser.close();
  await vite.close();
  console.log('[Vite] Server closed');
}

console.log(failures === 0 ? '=== ALL VISUAL & STATUTORY CHECKS PASSED ===' : `=== VISUAL CHECKS FAILED: ${failures} ===`);
process.exit(failures === 0 ? 0 : 1);
