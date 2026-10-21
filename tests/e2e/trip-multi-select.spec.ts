import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('cross-city collection survives reload and city edits preserve other destinations', async ({
  page,
  isMobile,
}) => {
  await page.route('https://tiles.openfreemap.org/**', (r) => r.abort());
  await page.route('**/api/places', (r) => r.fulfill({ json: { places: [] } }));
  await page.goto('/');
  if (isMobile) await page.getByRole('button', { name: 'Исследовать', exact: true }).click();
  for (const name of [
    'Суйсари на острове',
    'Река Сюскюянйоки',
    'Река Иййоки',
    'Стены Коломенского кремля',
    'Улица Лажечникова',
    'Улица Зайцева',
    'Старо-Голутвин монастырь',
  ])
    await page.getByRole('button', { name: `Добавить в поездку ${name}`, exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: /Моя поездка, мест: 7/ }).click();
  await expect(page.locator('.trip-city-place')).toHaveCount(7);
  await expect(page.locator('.trip-city-card')).toHaveCount(5);
  await page.getByRole('link', { name: 'Составить маршрут: Коломна', exact: true }).click();
  await expect(page.locator('.stops > li')).toHaveCount(3);
  await page.getByRole('button', { name: 'Поднять Улица Лажечникова', exact: true }).click();
  await page.getByRole('button', { name: 'Удалить Улица Зайцева', exact: true }).click();
  await page.reload();
  await expect(page.locator('.stops > li')).toHaveCount(2);
  await expect(page.locator('.stops > li').first()).toContainText('Улица Лажечникова');
  let routeCount = 0;
  await page.route('**/api/route', (r) => {
    const body = r.request().postDataJSON();
    routeCount = body.stops.length;
    return r.fulfill({
      json: {
        coordinates: [],
        distance: 2000,
        duration: null,
        legs: [{ distance: 2000, duration: null }],
        source: 'straight',
      },
    });
  });
  await page.getByLabel('Предложить порядок по близости').uncheck();
  await page.getByRole('button', { name: 'Собрать маршрут', exact: true }).click();
  await expect(page.locator('.route-summary')).toBeVisible();
  expect(routeCount).toBe(2);
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать план', exact: true }).click();
  const data = JSON.parse(await readFile((await (await event).path())!, 'utf8'));
  expect(data.stops.map((p: { name: string }) => p.name)).toEqual([
    'Улица Лажечникова',
    'Стены Коломенского кремля',
  ]);
  await page.getByRole('button', { name: 'Все города и добавленные места', exact: true }).click();
  await expect(page.locator('.trip-city-place')).toHaveCount(6);
  await expect(page.locator('.trip-city-card')).toHaveCount(5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});
