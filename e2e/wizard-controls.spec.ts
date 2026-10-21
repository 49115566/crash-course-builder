import { activate, expect, test } from './support/app-fixtures';
import {
  approveOutline,
  generateOutline,
  startCourse,
  waitForCourseReady,
} from './support/wizard-fixtures';

test.use({ appKey: 'wizard-controls', appMode: 'streaming' });
test.setTimeout(120_000);

test.describe.serial('course generation controls', () => {
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

    await activate(page.getByRole('button', { name: 'Stop writing' }));
    await page.getByRole('dialog').getByRole('button', { name: 'Stop writing' }).click();
    await expect(page.getByRole('heading', { name: 'Writing paused' })).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole('button', { name: 'Resume writing' }).click();
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
});
