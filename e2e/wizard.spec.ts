import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from './support/app-fixtures';
import { libraryRoot } from './support/library-paths';
import {
  approveOutline,
  generateOutline,
  startCourse,
  waitForCourseReady,
} from './support/wizard-fixtures';

test.use({ appKey: 'wizard-flow', appMode: 'streaming' });
test.setTimeout(120_000);

test.describe.serial('course creation wizard', () => {
  test('creates a course through both gates and writes the three files @smoke', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));

    const topic = 'Vector Databases';
    await page.goto('/courses/new');
    await expect(
      page.getByRole('heading', { name: 'What should this course teach?' }),
    ).toBeVisible();

    const detailsAxe = await new AxeBuilder({ page }).analyze();
    expect(detailsAxe.violations).toEqual([]);

    await startCourse(page, {
      subject: 'Computer Science',
      topic,
      audience: 'software engineers',
      instructions: 'Use practical examples and prefer e-commerce scenarios.',
    });

    await expect(page.getByText('No AI call has happened yet')).toBeVisible();
    await expect(
      page.getByText('Use practical examples and prefer e-commerce scenarios.'),
    ).toBeVisible();

    const promptsAxe = await new AxeBuilder({ page }).analyze();
    expect(promptsAxe.violations).toEqual([]);

    await generateOutline(page);
    await expect(
      page.getByRole('heading', { name: 'Vector Databases: A 30-Minute Crash Course' }),
    ).toBeVisible();
    await expect(page.getByText('7', { exact: true }).first()).toBeVisible();

    const firstPrompt = page.locator('.outline__prompt').first();
    await firstPrompt.locator('summary').click();
    await expect(firstPrompt.locator('pre').first()).toContainText(
      'Use practical examples and prefer e-commerce scenarios.',
    );

    const outlineAxe = await new AxeBuilder({ page }).analyze();
    expect(outlineAxe.violations).toEqual([]);

    await approveOutline(page);
    await expect(page.getByText('Live', { exact: true })).toBeVisible();
    await expect(page.getByRole('progressbar', { name: 'Course writing progress' })).toBeVisible();
    const writingAxe = await new AxeBuilder({ page }).analyze();
    expect(writingAxe.violations).toEqual([]);

    await waitForCourseReady(page);
    await expect(page.getByText('Computer Science/Vector Databases')).toBeVisible();

    const coursePath = path.join(libraryRoot(), 'Computer Science', 'Vector Databases');
    const meta = JSON.parse(await readFile(path.join(coursePath, 'meta.json'), 'utf8')) as {
      topic: string;
      subject: { name: string };
      stats: { sections: number };
    };
    expect(meta.topic).toBe(topic);
    expect(meta.subject.name).toBe('Computer Science');
    expect(meta.stats.sections).toBe(7);
    expect(await readFile(path.join(coursePath, 'course.md'), 'utf8')).toContain(
      '## 1. Foundations',
    );
    expect(await readFile(path.join(coursePath, 'outline.md'), 'utf8')).toContain(
      '## Course outline',
    );

    const successAxe = await new AxeBuilder({ page }).analyze();
    expect(successAxe.violations).toEqual([]);

    await page.getByRole('link', { name: 'Read course' }).click();
    await expect(
      page.getByRole('heading', { name: 'Vector Databases: A 30-Minute Crash Course', level: 1 }),
    ).toBeVisible();
    await expect(page.locator('.reader-body h2').first()).toContainText('Foundations');
    await expect(page.getByRole('heading', { name: 'What you will learn' })).toBeVisible();

    await page.getByRole('link', { name: 'Back to library' }).click();
    await expect(
      page.getByRole('heading', { name: 'Vector Databases: A 30-Minute Crash Course' }),
    ).toBeVisible();

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  test('pauses, leaves, resumes from the library, and discards a draft', async ({ page }) => {
    const topic = 'Graph Databases';
    await startCourse(page, {
      subject: 'Computer Science',
      topic,
      audience: 'backend developers',
      instructions: 'Use practical examples.',
    });
    await generateOutline(page);
    await approveOutline(page);

    await page.getByRole('button', { name: 'Pause after this section' }).click();
    await expect(page.getByRole('heading', { name: 'Writing paused' })).toBeVisible({
      timeout: 20_000,
    });

    await page.locator('.wizard__back').click();
    await expect(page.getByRole('heading', { name: 'Your library' })).toBeVisible();
    const pausedCard = page.locator('.in-progress__card').filter({ hasText: topic });
    await expect(pausedCard).toBeVisible();
    await pausedCard.getByRole('link', { name: 'Resume' }).click();
    await expect(page.getByRole('heading', { name: 'Writing paused' })).toBeVisible();
    await page.getByRole('button', { name: 'Resume writing' }).click();
    await waitForCourseReady(page);

    await page.goto('/courses/new');
    await page.getByRole('combobox', { name: 'Subject' }).fill('Computer Science');
    await page.getByRole('option', { name: /^Computer Science/ }).click();
    await page.getByLabel('Topic').fill('Disposable Draft');
    await page.getByLabel('Audience').fill('curious readers');
    await page.getByRole('button', { name: /Continue to prompt preview/ }).click();
    await expect(
      page.getByRole('heading', { name: 'Check the brief before anything is sent' }),
    ).toBeVisible();

    await page.locator('.wizard__back').click();
    const draftCard = page.locator('.in-progress__card').filter({ hasText: 'Disposable Draft' });
    await expect(draftCard).toBeVisible();
    await draftCard.getByRole('button', { name: 'Discard' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Discard session' }).click();
    await expect(draftCard).toHaveCount(0);
  });
});
