import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';

import { expect, test } from './support/app-fixtures';
import { seedCourse } from './support/library-fixtures';
import { libraryRoot } from './support/library-paths';

test.use({ appKey: 'accessibility' });

test.describe.serial('keyboard and accessibility release checks', () => {
  test('moves focus through menus and restores it on Escape', async ({ page, request }) => {
    const subjectName = `Keyboard ${String(Date.now())}`;
    const created = await request.post('/api/subjects', { data: { name: subjectName } });
    expect(created.status()).toBe(201);

    await page.goto('/');
    const trigger = page.getByRole('button', { name: `Actions for ${subjectName}` });
    await trigger.focus();
    await page.keyboard.press('Enter');

    const menu = page.getByRole('menu');
    await expect(menu).toBeVisible();
    await expect(menu.getByRole('menuitem').first()).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('opens the reader contents drawer from the keyboard and restores focus', async ({
    page,
    request,
  }) => {
    const subjectName = `Drawer ${String(Date.now())}`;
    const created = await request.post('/api/subjects', { data: { name: subjectName } });
    expect(created.status()).toBe(201);

    const courseId = randomUUID();
    await seedCourse(
      subjectName,
      {
        id: courseId,
        topic: 'Keyboard Reading',
        title: 'Keyboard Reading: A Crash Course',
        audience: 'keyboard users',
        folderName: 'Keyboard Reading',
        courseMarkdown:
          '# Keyboard Reading: A Crash Course\n\nA short course.\n\n## 1. First Section\n\nSome text.\n\n## 2. Second Section\n\nMore text.\n',
        outlineMarkdown: '# Keyboard Reading\n\n1. First Section\n2. Second Section\n',
      },
      libraryRoot(),
    );

    await page.goto(`/courses/${courseId}`);
    await expect(
      page.getByRole('heading', { name: 'Keyboard Reading: A Crash Course', level: 1 }),
    ).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    const contents = page.getByRole('button', { name: 'Contents' });
    await contents.focus();
    await page.keyboard.press('Enter');

    const dialog = page.getByRole('dialog', { name: 'Course contents' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Close course contents' })).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(contents).toBeFocused();

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});
