import { expect, test } from '@playwright/test';

test.use({ baseURL: 'http://127.0.0.1:4313' });
test.setTimeout(60_000);

test('shows persistent key guidance and disables generation', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('DeepSeek key not set — generation is paused')).toBeVisible();
  await expect(page.getByText('npm run key:set')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your library' })).toBeVisible();

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

  // No AI workflow can start without a key.
  await page.locator('.wizard__back').click();
  await expect(page.getByRole('heading', { name: 'Keyless Course' })).toBeVisible();
});
