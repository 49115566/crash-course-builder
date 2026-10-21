import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

export interface CourseInput {
  subject: string;
  topic: string;
  audience?: string;
  instructions?: string;
}

export async function startCourse(page: Page, input: CourseInput): Promise<void> {
  await page.goto('/courses/new');
  await expect(page.getByRole('heading', { name: 'What should this course teach?' })).toBeVisible();

  const subject = page.getByRole('combobox', { name: 'Subject' });
  await subject.fill(input.subject);
  const createOption = page.getByRole('option', {
    name: new RegExp(`Create “${escapeRegExp(input.subject)}”`),
  });
  const existingOption = page.getByRole('option', {
    name: new RegExp(`^${escapeRegExp(input.subject)}`),
  });

  if (await createOption.isVisible().catch(() => false)) {
    await createOption.click();
  } else if (await existingOption.isVisible().catch(() => false)) {
    await existingOption.click();
  } else {
    await subject.press('Escape');
  }

  await page.getByLabel('Topic').fill(input.topic);
  await page.getByLabel('Audience').fill(input.audience ?? 'software engineers');
  if (input.instructions !== undefined) {
    await page.getByLabel(/Additional instructions/).fill(input.instructions);
  }
  await page.getByRole('button', { name: /Continue to prompt preview/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Check the brief before anything is sent' }),
  ).toBeVisible();
}

export async function generateOutline(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Generate outline/ }).click();
  await expect(page.getByRole('heading', { name: 'Review the outline' })).toBeVisible({
    timeout: 45_000,
  });
}

export async function approveOutline(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Approve & start writing/ }).click();
  await expect(page.getByRole('heading', { name: /Writing / })).toBeVisible({ timeout: 20_000 });
}

export async function waitForCourseReady(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { name: 'Your course is ready' })).toBeVisible({
    timeout: 90_000,
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
