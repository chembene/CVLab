import { test, expect } from '@playwright/test';

test('landing page shows the CVLab AI heading', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: /cvlab ai/i })).toBeVisible();
});
