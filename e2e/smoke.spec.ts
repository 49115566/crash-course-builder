import { expect, test } from '@playwright/test';

const appOrigin = 'http://127.0.0.1:4310';

test('serves the accessible app shell and a healthy local API', async ({ page, request }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const externalRequests: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });
  page.on('request', (requestEvent) => {
    const url = new URL(requestEvent.url());
    const isExternal =
      url.origin !== appOrigin && url.protocol !== 'data:' && url.protocol !== 'blob:';

    if (isExternal) {
      externalRequests.push(requestEvent.url());
    }
  });

  const healthResponse = await request.get('/api/health');
  expect(healthResponse.status()).toBe(200);

  const healthBody = (await healthResponse.json()) as {
    data: { status: string };
    requestId: string;
  };
  expect(healthBody.data.status).toBe('ok');
  expect(healthBody.requestId).toBeTruthy();

  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Your library' })).toBeVisible();
  await expect(page.getByText('Local service connected')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Crash Course Builder home' })).toBeVisible();

  await page.keyboard.press('Tab');
  const skipLink = page.getByRole('link', { name: 'Skip to content' });
  await expect(skipLink).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(externalRequests).toEqual([]);
});
