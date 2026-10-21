import { expect, test } from './support/app-fixtures';

test.use({ appKey: 'wizard-fast' });
test.setTimeout(60_000);

test('supports the subject combobox from the keyboard', async ({ page }) => {
  await page.goto('/courses/new');
  const subject = page.getByRole('combobox', { name: 'Subject' });
  await subject.focus();
  await subject.fill('Keyboard Subject');
  await subject.press('ArrowDown');
  await subject.press('Enter');
  await expect(subject).toHaveValue('Keyboard Subject');

  await page.getByLabel('Topic').fill('Keyboard Course');
  await page.getByLabel('Audience').fill('keyboard users');
  await page.getByRole('button', { name: /Continue to prompt preview/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Check the brief before anything is sent' }),
  ).toBeVisible();
});
