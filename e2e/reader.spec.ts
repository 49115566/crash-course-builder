import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';

import { seedCourse } from './support/library-fixtures';

const RICH_COURSE = `# Orbital Mechanics: A Crash Course

> Understand how satellites move, and why orbits are just falling with style.

**Audience:** curious readers
**Summary:** Start with the balance of gravity and velocity, then build toward orbital transfers.

## 1. Foundations

Orbits balance gravity and forward velocity. The circular speed is $v = \\sqrt{GM/r}$.

| Term | Meaning |
| --- | --- |
| Apoapsis | The farthest point in an orbit |
| Periapsis | The closest point in an orbit |

![Remote image](https://example.invalid/tracker.png)

<img src="https://example.invalid/tracker.png" onerror="window.__ccbXss = true">

<script>window.__ccbXss = true</script>

[Unsafe Markdown link](javascript:window.__ccbXss = true)

<a href="javascript:window.__ccbXss = true">Unsafe HTML link</a>

### Gravity and velocity

A stable orbit is a continuous fall that keeps missing the ground.

## 2. Transfers

A Hohmann transfer uses two burns to move between circular orbits.

$$ \\Delta v = \\sqrt{\\frac{2\\mu}{r_1}} $$

> Slow down to speed up in orbital mechanics.
`;

test.describe.serial('course reader', () => {
  test.setTimeout(120_000);

  test('renders a safe, linked course and adapts to mobile and print', async ({
    page,
    request,
  }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const externalRequests: string[] = [];

    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('request', (requestEvent) => {
      const url = new URL(requestEvent.url());
      if (
        url.origin !== 'http://127.0.0.1:4310' &&
        url.protocol !== 'data:' &&
        url.protocol !== 'blob:'
      ) {
        externalRequests.push(requestEvent.url());
      }
    });

    const subjectName = `Astronomy ${String(Date.now())}`;
    const courseId = randomUUID();
    const created = await request.post('/api/subjects', { data: { name: subjectName } });
    expect(created.status()).toBe(201);

    const course = await seedCourse(subjectName, {
      id: courseId,
      topic: 'Orbital Mechanics',
      title: 'Orbital Mechanics: A Crash Course',
      audience: 'curious readers',
      readingMinutes: 9,
      folderName: 'Orbital Mechanics',
      courseMarkdown: RICH_COURSE,
      outlineMarkdown: '# Orbital Mechanics\n\n1. Foundations\n2. Transfers\n',
    });

    await page.goto('/');
    await page.getByRole('link', { name: course.title }).click();

    await expect(page).toHaveURL(new RegExp(`/courses/${courseId}$`));
    await expect(page.getByRole('heading', { name: course.title, level: 1 })).toBeVisible();
    await expect(page.getByText(subjectName).first()).toBeVisible();
    await expect(page.getByText('9 min read', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'What you will learn' })).toBeVisible();

    const outlineCard = page.locator('ccb-course-outline-card');
    await expect(outlineCard.getByRole('link', { name: /Foundations/ })).toBeVisible();
    await expect(outlineCard.getByRole('link', { name: /Transfers/ })).toBeVisible();

    await expect(page.locator('.reader-body h2').first()).toHaveAttribute('id', 'section-1');
    await expect(page.locator('.reader-body table')).toBeVisible();
    await expect(page.locator('.reader-body .katex').first()).toBeVisible();
    await expect(page.locator('.reader-body .katex-display')).toBeVisible();
    await expect(page.locator('.reader-body img')).toHaveCount(0);
    await expect(page.locator('.reader-body script')).toHaveCount(0);
    await expect(page.locator('.reader-body a[href^="javascript:"]')).toHaveCount(0);
    await expect(page.locator('.reader-table-scroll')).toHaveAttribute('tabindex', '0');

    expect(await page.evaluate(() => (window as { __ccbXss?: boolean }).__ccbXss)).toBeUndefined();

    const desktopAxe = await new AxeBuilder({ page }).analyze();
    expect(desktopAxe.violations).toEqual([]);

    await outlineCard.getByRole('link', { name: /Transfers/ }).click();
    await expect(page).toHaveURL(/#section-2$/);
    await expect(page.locator('#section-2')).toBeInViewport();
    await expect(page.locator('ccb-reader-sidebar a[aria-current="location"]')).toContainText(
      'Transfers',
    );

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('ccb-reader-sidebar')).toBeHidden();
    await page.getByRole('button', { name: 'Contents' }).click();
    const contentsDialog = page.getByRole('dialog', { name: 'Course contents' });
    await expect(contentsDialog).toBeVisible();

    const mobileAxe = await new AxeBuilder({ page }).analyze();
    expect(mobileAxe.violations).toEqual([]);

    await contentsDialog.getByRole('link', { name: /Foundations/ }).click();
    await expect(contentsDialog).toBeHidden();
    await expect(page).toHaveURL(/#section-1$/);
    await expect(page.locator('#section-1')).toBeInViewport();

    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.site-header')).toBeHidden();
    await expect(page.locator('.reader-toolbar')).toBeHidden();
    await expect(page.locator('.reader-article')).toBeVisible();
    await page.emulateMedia({ media: 'screen' });

    await page.goto(`/courses/${courseId}#section-2`);
    await expect(page.getByRole('heading', { name: course.title, level: 1 })).toBeVisible();
    await expect(page.locator('#section-2')).toBeInViewport();

    await page.goto(`/courses/${courseId}`);
    await expect(page.getByRole('heading', { name: course.title, level: 1 })).toBeVisible();
    await expect(page.locator('.reader-toolbar__progress')).toHaveCSS('width', '0px');

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(externalRequests).toEqual([]);
  });

  test('explains an incomplete course on disk without changing it', async ({ page, request }) => {
    const subjectName = `Incomplete ${String(Date.now())}`;
    const courseId = randomUUID();
    await request.post('/api/subjects', { data: { name: subjectName } });
    const course = await seedCourse(subjectName, {
      id: courseId,
      topic: 'Missing Pages',
      title: 'Missing Pages: A Broken Course',
      audience: 'curious readers',
      folderName: 'Missing Pages',
      courseMarkdown: null,
    });

    await page.goto(`/courses/${course.id}`);

    await expect(page.getByRole('heading', { name: 'This course is not available' })).toBeVisible();
    await expect(page.getByText(/missing course\.md/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to library' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
  });
});
