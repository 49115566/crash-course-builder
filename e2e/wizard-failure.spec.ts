import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { libraryRoot } from './support/library-paths';
import {
  approveOutline,
  generateOutline,
  startCourse,
  waitForCourseReady,
} from './support/wizard-fixtures';

test.use({ baseURL: 'http://127.0.0.1:4312' });
test.setTimeout(120_000);

test('pauses with an error, preserves completed sections, and resumes manually', async ({
  page,
}) => {
  await startCourse(page, {
    subject: 'Incident Response',
    topic: 'Failure Recovery',
    audience: 'on-call engineers',
    instructions: 'Use practical examples.',
  });
  await generateOutline(page);
  await approveOutline(page);

  await expect(page.getByRole('heading', { name: 'Paused — needs attention' })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText(/The AI call timed out/)).toBeVisible();
  await expect(page.locator('.attention__manual')).toContainText('Nothing restarts automatically');
  await expect(page.locator('.write__section-item.is-completed')).toHaveCount(2);
  await expect(page.locator('.write__section-item.is-failed')).toHaveCount(1);

  const failureAxe = await new AxeBuilder({ page }).analyze();
  expect(failureAxe.violations).toEqual([]);

  await page.getByRole('button', { name: 'Resume writing' }).click();
  await waitForCourseReady(page);

  const coursePath = path.join(libraryRoot('failure'), 'Incident Response', 'Failure Recovery');
  const meta = JSON.parse(await readFile(path.join(coursePath, 'meta.json'), 'utf8')) as {
    stats: { sections: number };
  };
  expect(meta.stats.sections).toBe(7);
});
