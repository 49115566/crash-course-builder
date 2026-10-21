import { expect, test } from './support/app-fixtures';
import {
  approveOutline,
  generateOutline,
  startCourse,
  waitForCourseReady,
} from './support/wizard-fixtures';

test.use({ appKey: 'wizard-regeneration', appMode: 'streaming' });
test.setTimeout(120_000);

test('resets inputs from outline review and shows the regeneration guard', async ({ page }) => {
  await startCourse(page, {
    subject: 'Computer Science',
    topic: 'Event Sourcing',
    audience: 'senior engineers',
  });
  await generateOutline(page);

  await page.getByRole('button', { name: 'Edit inputs' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Edit inputs' }).click();
  await expect(page.getByRole('heading', { name: 'Adjust the brief' })).toBeVisible();
  await expect(page.getByText('This course already has an outline')).toBeVisible();

  await page.getByLabel('Topic').fill('Event Sourcing Basics');
  await page.getByRole('button', { name: /Save inputs & rebuild preview/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Check the brief before anything is sent' }),
  ).toBeVisible();
  await expect(page.getByText('Event Sourcing Basics').first()).toBeVisible();

  await generateOutline(page);
  await approveOutline(page);
  await page.getByRole('link', { name: 'View outline' }).click();
  await expect(page.getByText('Writing has already started')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Regenerate outline' })).toHaveCount(0);

  await page.getByRole('button', { name: 'View writing progress' }).click();
  await waitForCourseReady(page);
});
