import AxeBuilder from '@axe-core/playwright';

import { expect, test } from './support/app-fixtures';

test.use({ appKey: 'wizard-keyless', appMode: 'keyless' });
test.setTimeout(60_000);

test('shows persistent key guidance and disables generation', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('DeepSeek key not set — generation is paused')).toBeVisible();
  await expect(page.getByText('npm run key:set')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your library' })).toBeVisible();

  const libraryAxe = await new AxeBuilder({ page }).analyze();
  expect(libraryAxe.violations).toEqual([]);

  await page.getByRole('link', { name: 'New course' }).click();
  await expect(page.getByRole('heading', { name: 'What should this course teach?' })).toBeVisible();

  const subject = page.getByRole('combobox', { name: 'Subject' });
  await subject.fill('Keyless Subject');
  await page.getByRole('option', { name: /Create/ }).click();
  await page.getByLabel('Topic').fill('Keyless Course');
  await page.getByLabel('Audience').fill('curious readers');
  await page.getByRole('button', { name: /Continue to prompt preview/ }).click();

  await expect(page.getByText('Generation needs a DeepSeek key')).toBeVisible();
  await expect(page.getByRole('button', { name: /Generate outline/ })).toBeDisabled();

  const promptsAxe = await new AxeBuilder({ page }).analyze();
  expect(promptsAxe.violations).toEqual([]);

  // No AI workflow can start without a key.
  await page.locator('.wizard__back').click();
  await expect(page.getByRole('heading', { name: 'Keyless Course' })).toBeVisible();
});
