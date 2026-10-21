import AxeBuilder from '@axe-core/playwright';
import { readFile, rename } from 'node:fs/promises';
import path from 'node:path';

import { expect, test } from './support/app-fixtures';
import { libraryRoot } from './support/library-paths';
import { readLibraryOrder, seedCourse } from './support/library-fixtures';

test.use({ appKey: 'library' });

test.describe.serial('library without AI', () => {
  test('creates subjects and persists the library order', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Your shelf is empty' })).toBeVisible();
    await page.getByRole('button', { name: 'Create your first subject' }).click();
    await page.getByLabel('Subject name').fill('Computer Science');
    await page.getByRole('button', { name: 'Create subject' }).click();

    await expect(page.getByRole('heading', { name: 'Computer Science' })).toBeVisible();
    await expect(page.getByText('1 subject · 0 courses')).toBeVisible();

    await page.getByRole('button', { name: 'New subject' }).click();
    await page.getByLabel('Subject name').fill('Marketing');
    await page.getByRole('button', { name: 'Create subject' }).click();
    await expect(page.getByRole('heading', { name: 'Marketing' })).toBeVisible();

    const subjectFiles = await readFile(
      path.join(libraryRoot(), 'Computer Science', '.subject.json'),
      'utf8',
    );
    expect(JSON.parse(subjectFiles)).toMatchObject({
      schemaVersion: 1,
      name: 'Computer Science',
    });
    expect(await readLibraryOrder()).toHaveLength(2);
  });

  test('shows seeded course metadata and filters it', async ({ page }) => {
    const course = await seedCourse('Computer Science');
    await page.goto('/');

    await expect(page.getByRole('heading', { name: course.title })).toBeVisible();
    await expect(page.getByText(course.audience)).toBeVisible();
    await expect(page.getByText('22 min')).toBeVisible();

    const search = page.getByLabel('Search courses');
    await search.fill('vector');
    await expect(page.getByText('1 of 1 courses')).toBeVisible();
    await search.fill('no matching course');
    await expect(page.getByRole('heading', { name: 'No courses match' })).toBeVisible();
    await page.getByRole('button', { name: 'Clear search' }).click();
    await expect(page.getByRole('heading', { name: course.title })).toBeVisible();
  });

  test('reorders with the keyboard menu and persists after reload', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Actions for Marketing' }).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('menuitem', { name: 'Move up' }).press('Enter');

    await expect
      .poll(async () =>
        page
          .locator('.subject__title')
          .allTextContents()
          .then((titles) => titles.map((title) => title.trim())),
      )
      .toEqual(['Marketing', 'Computer Science']);

    await page.reload();
    await expect(page.locator('.subject__title')).toHaveText([
      /^\s*Marketing\s*$/,
      /^\s*Computer Science\s*$/,
    ]);
    expect(await readLibraryOrder()).toHaveLength(2);
  });

  test('renames a subject, moves a course, and deletes with confirmation', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'Actions for Computer Science' }).click();
    await page.getByRole('menuitem', { name: 'Rename subject…' }).click();
    await page.getByLabel('Subject name').fill('Computing');
    await page.getByRole('button', { name: 'Rename subject' }).click();

    await expect(page.getByRole('heading', { name: 'Computing' })).toBeVisible();
    const repaired = JSON.parse(
      await readFile(
        path.join(libraryRoot(), 'Computing', 'Vector Databases', 'meta.json'),
        'utf8',
      ),
    ) as { subject: { name: string } };
    expect(repaired.subject.name).toBe('Computing');

    await page
      .getByRole('button', { name: 'Actions for Vector Databases: A Crash Course' })
      .click();
    await page.getByRole('menuitem', { name: 'Move to another subject…' }).click();
    await page.getByLabel('Destination').selectOption({ label: 'Marketing' });
    await page.getByRole('button', { name: 'Move course' }).click();

    await expect(
      page.getByRole('heading', { name: 'Marketing' }).locator('..').getByText('1 course'),
    ).toBeVisible();
    const moved = JSON.parse(
      await readFile(
        path.join(libraryRoot(), 'Marketing', 'Vector Databases', 'meta.json'),
        'utf8',
      ),
    ) as { subject: { name: string } };
    expect(moved.subject.name).toBe('Marketing');

    await page
      .getByRole('button', { name: 'Actions for Vector Databases: A Crash Course' })
      .click();
    await page.getByRole('menuitem', { name: 'Delete course…' }).click();
    await page.getByRole('button', { name: 'Delete course' }).click();
    await expect(
      page.getByRole('heading', { name: 'Vector Databases: A Crash Course' }),
    ).toHaveCount(0);

    await page.getByRole('button', { name: 'Actions for Marketing' }).click();
    await page.getByRole('menuitem', { name: 'Delete subject…' }).click();
    await page.getByRole('button', { name: 'Delete subject' }).click();
    await expect(page.getByRole('heading', { name: 'Marketing' })).toHaveCount(0);
  });

  test('cascade-deletes a populated subject with typed confirmation', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'New subject' }).click();
    await page.getByLabel('Subject name').fill('Temporary');
    await page.getByRole('button', { name: 'Create subject' }).click();
    await expect(page.getByRole('heading', { name: 'Temporary' })).toBeVisible();

    const course = await seedCourse('Temporary', {
      id: '123e4567-e89b-42d3-a456-426614174099',
      topic: 'Temporary Topic',
      title: 'Temporary Course',
      folderName: 'Temporary Topic',
    });
    await page.reload();
    await expect(page.getByRole('heading', { name: course.title })).toBeVisible();

    await page.getByRole('button', { name: 'Actions for Temporary', exact: true }).click();
    await page.getByRole('menuitem', { name: 'Delete subject…' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('1 course');
    await dialog.locator('#delete-subject-confirm').fill('Temporary');
    await dialog.getByRole('button', { name: 'Delete subject' }).click();

    await expect(page.getByRole('heading', { name: 'Temporary' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Temporary Course' })).toHaveCount(0);
    await expect(
      readFile(path.join(libraryRoot(), 'Temporary', 'meta.json'), 'utf8'),
    ).rejects.toMatchObject({ code: 'ENOENT' });
  });

  test('reconciles a manual folder rename and warns without overwriting', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'New subject' }).click();
    await page.getByLabel('Subject name').fill('History');
    await page.getByRole('button', { name: 'Create subject' }).click();
    await expect(page.getByRole('heading', { name: 'History' })).toBeVisible();

    await rename(path.join(libraryRoot(), 'History'), path.join(libraryRoot(), 'World History'));
    await page.reload();

    await expect(page.getByRole('heading', { name: 'World History' })).toBeVisible();
    await expect(page.getByText('Library needed a few repairs')).toBeVisible();
    const repaired = JSON.parse(
      await readFile(path.join(libraryRoot(), 'World History', '.subject.json'), 'utf8'),
    ) as { name: string };
    expect(repaired.name).toBe('World History');
  });

  test('reorders subjects by dragging the handle', async ({ page }) => {
    await page.goto('/');

    const world = page
      .locator('ccb-subject-section')
      .filter({ has: page.getByRole('heading', { name: 'World History' }) });
    const computing = page
      .locator('ccb-subject-section')
      .filter({ has: page.getByRole('heading', { name: 'Computing' }) });

    const handleBox = await world.locator('.subject__drag-handle').boundingBox();
    const targetBox = await computing.locator('.subject').boundingBox();
    expect(handleBox).not.toBeNull();
    expect(targetBox).not.toBeNull();

    if (handleBox === null || targetBox === null) {
      return;
    }

    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + 20, { steps: 5 });
    await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + 4, { steps: 12 });
    await page.mouse.up();

    await expect
      .poll(async () =>
        page
          .locator('.subject__title')
          .allTextContents()
          .then((titles) => titles.map((title) => title.trim())),
      )
      .toEqual(['World History', 'Computing']);

    await page.reload();
    await expect(page.locator('.subject__title')).toHaveText([
      /^\s*World History\s*$/,
      /^\s*Computing\s*$/,
    ]);
  });

  test('passes an axe accessibility scan on a populated library', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'World History' })).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);

    await page.getByRole('button', { name: 'Actions for Computing' }).click();
    await page.getByRole('menuitem', { name: 'Rename subject…' }).click();
    const dialogResults = await new AxeBuilder({ page }).analyze();
    expect(dialogResults.violations).toEqual([]);
    await page.keyboard.press('Escape');
  });
});
