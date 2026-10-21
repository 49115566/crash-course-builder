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

test.use({ baseURL: 'http://127.0.0.1:4311' });
test.setTimeout(120_000);

test.describe.serial('course creation wizard', () => {
  test('creates a course through both gates and writes the three files', async ({ page }) => {
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

    const coursePath = path.join(libraryRoot('wizard'), 'Computer Science', 'Vector Databases');
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

  test('leaves during active generation and resumes from the library', async ({ page }) => {
    const topic = 'Live Search';
    await startCourse(page, {
      subject: 'Computer Science',
      topic,
      audience: 'search engineers',
    });
    await generateOutline(page);
    await approveOutline(page);
    await expect(page.getByText('Live', { exact: true })).toBeVisible();

    await page.locator('.wizard__back').click();
    const activeCard = page.locator('.in-progress__card').filter({ hasText: topic });
    await expect(activeCard).toBeVisible();
    await expect(activeCard.getByText('Writing', { exact: true })).toBeVisible();
    await activeCard.getByRole('link', { name: 'Watch progress' }).click();
    await waitForCourseReady(page);
  });

  test('stops an active section and resumes only the missing work', async ({ page }) => {
    const topic = 'Search Ranking';
    await startCourse(page, {
      subject: 'Computer Science',
      topic,
      audience: 'product engineers',
    });
    await generateOutline(page);
    await approveOutline(page);

    await page.getByRole('button', { name: 'Stop writing' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Stop writing' }).click();
    await expect(page.getByRole('heading', { name: 'Writing paused' })).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole('button', { name: 'Resume writing' }).click();
    await waitForCourseReady(page);
  });

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

  test('shows GENERATION_BUSY and links to the active course', async ({ page, request }) => {
    await startCourse(page, {
      subject: 'Computer Science',
      topic: 'Streaming Systems',
      audience: 'platform engineers',
    });
    await generateOutline(page);
    await approveOutline(page);
    await expect(page.getByText('Live', { exact: true })).toBeVisible();

    const library = await request.get('/api/library');
    const libraryBody = (await library.json()) as {
      data: { subjects: Array<{ id: string; name: string }> };
    };
    const subject = libraryBody.data.subjects.find((entry) => entry.name === 'Computer Science');
    expect(subject).toBeDefined();

    const created = await request.post('/api/sessions', {
      data: {
        subjectId: subject?.id,
        topic: 'Second Active Course',
        audience: 'developers',
      },
    });
    expect(created.status()).toBe(201);
    const createdBody = (await created.json()) as { data: { session: { id: string } } };
    const secondId = createdBody.data.session.id;

    await page.goto(`/courses/new/${secondId}/prompts`);
    await page.getByRole('button', { name: /Generate outline/ }).click();
    await expect(page.getByText('Another course is being generated')).toBeVisible();
    await page.getByRole('link', { name: /Open the active course/ }).click();
    await expect(page.getByRole('heading', { name: /Writing / })).toBeVisible();
    await waitForCourseReady(page);
  });

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
});
