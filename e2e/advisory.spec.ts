import { test, expect } from '@playwright/test';

test('the advisory panel is read-only and advisory-only', async ({ page }) => {
  await page.goto('/#analysis');
  await page.getByRole('button', { name: 'Risk & notice', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Breach-risk advisory', exact: true })).toBeVisible();
  await expect(page.getByText('Advisory only', { exact: true })).toBeVisible();
  await expect(page.getByText('It does not read document contents, predict an official decision, or change the workflow.')).toBeVisible();
  await page.locator('summary', { hasText: /Model card and limitations/ }).click();
  await expect(page.getByText('This panel is read-only. It records no review event, changes no claim or document state, and issues no notice.')).toBeVisible();
});
