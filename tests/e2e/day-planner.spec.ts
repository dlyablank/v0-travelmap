import { test, expect } from '@playwright/test';
import { places } from '../../lib/data';
import { locationId } from '../../lib/locations';

test.beforeEach(async ({ page }) => {
  await page.route('https://tiles.openfreemap.org/**', (r) => r.abort());
  await page.route('**/api/places', (r) => r.fulfill({ json: { places: [] } }));
});

test('saved places are grouped by city and legacy trips merge within each region after reload', async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('weekend-explorer-v1'))
      localStorage.setItem(
        'weekend-explorer-v1',
        JSON.stringify({
          state: {
            regionId: 'karelia',
            trip: ['suisaari', 'syskyanjoki'],
            regionTrips: { kolomna: ['kolomna-kremlin'] },
            saved: ['suisaari', 'syskyanjoki', 'kolomna-kremlin'],
            customPlaces: [],
            durationDays: 1,
            transportMode: 'car',
          },
          version: 0,
        }),
      );
  });
  await page.goto('/');
  await expect(page.getByRole('combobox', { name: 'Регион путешествия' })).toBeEnabled();
  await page.getByRole('button', { name: /^Сохранённое/ }).click();
  const groups = page.getByRole('navigation', { name: 'Сохранённое по локациям' });
  await expect(groups.getByRole('button')).toHaveCount(4);
  await groups.getByRole('button', { name: /Коломна.*1 мест/ }).click();
  await expect(
    page.getByRole('button', { name: 'Открыть Стены Коломенского кремля', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Открыть Суйсари на острове', exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole('button', { name: /Моя поездка/ })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page.locator('.trip-city-card')).toHaveCount(3);
  await page.getByRole('link', { name: 'Составить маршрут: Коломна', exact: true }).click();
  const planner = page.getByRole('main', { name: 'Создание поездки' });
  await expect(planner.locator('.stops > li')).toHaveCount(1);
  const chooser = planner.getByRole('combobox', { name: 'Город поездки' });
  await chooser.selectOption(locationId(places.find((p) => p.id === 'suisaari')!));
  await expect(planner.locator('.stops > li')).toHaveCount(1);
  await expect(planner.locator('.stops')).toContainText('Суйсари');
  await page.reload();
  await expect(planner.locator('.stops')).toContainText('Суйсари');
  await page.getByRole('button', { name: 'Все города и добавленные места', exact: true }).click();
  await expect(page.locator('.trip-city-card')).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test('one-day timeline includes visits, recalculates order, and adds at most three verified detours', async ({
  page,
  isMobile,
}) => {
  const requests: { stops: { latitude: number; longitude: number }[] }[] = [];
  await page.route('**/api/route', async (r) => {
    const body = r.request().postDataJSON();
    requests.push(body);
    const count = body.stops.length - 1;
    await r.fulfill({
      json: {
        coordinates: body.stops.map((p: { latitude: number; longitude: number }) => [
          p.longitude,
          p.latitude,
        ]),
        distance: count * 2000,
        duration: count * 600,
        legs: Array.from({ length: count }, () => ({ distance: 2000, duration: 600 })),
        source: 'osrm',
      },
    });
  });
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Регион путешествия' }).selectOption('kolomna');
  if (isMobile) await page.getByRole('button', { name: 'Исследовать', exact: true }).click();
  for (const name of ['Стены Коломенского кремля', 'Улица Лажечникова']) {
    await page.getByRole('button', { name: `Сохранить ${name}`, exact: true }).click();
  }
  await page
    .getByRole('button', { name: /Моя поездка/ })
    .filter({ visible: true })
    .first()
    .click();
  await page
    .getByRole('combobox', { name: 'Выбрать город поездки' })
    .selectOption(locationId(places.find((p) => p.id === 'kolomna-kremlin')!));
  const planner = page.getByRole('main', { name: 'Создание поездки' });
  for (const name of ['Стены Коломенского кремля', 'Улица Лажечникова'])
    await planner
      .getByRole('button', { name: `Добавить сохранённое: ${name}`, exact: true })
      .click();
  await planner.getByRole('button', { name: 'Собрать маршрут', exact: true }).click();
  await expect(planner.getByRole('region', { name: 'Итоги дня' })).toContainText(
    'Финиш около 11:25',
  );
  await expect(planner.locator('.timeline-transfer')).toContainText('10 мин');
  await expect(planner.getByRole('combobox', { name: /^Время посещения/ })).toHaveCount(0);
  await planner.getByLabel('Окончание дня', { exact: true }).fill('10:00');
  await expect(planner.locator('.day-overflow')).toContainText('1 ч 25 мин');
  await planner.getByRole('button', { name: 'Поднять Улица Лажечникова', exact: true }).click();
  await expect(planner.locator('.stops > li').first()).toContainText('Улица Лажечникова');
  await expect(planner.getByRole('region', { name: 'Итоги дня' })).toContainText('Маршрут собран');
  const recs = planner.getByRole('region', { name: 'Места по пути' });
  await expect(recs.locator('article')).toHaveCount(3);
  await expect(recs.locator('article').first()).toContainText('Заезд +10 мин');
  await recs
    .getByRole('button', { name: /^Добавить по пути:/ })
    .first()
    .click();
  await expect(planner.locator('.stops > li')).toHaveCount(3);
  await expect(planner.getByRole('region', { name: 'Итоги дня' })).toContainText('Маршрут собран');
  expect(requests.every((r) => r.stops.every((p) => p.latitude > 55 && p.latitude < 55.2))).toBe(
    true,
  );
  expect(await recs.locator('article').count()).toBeLessThanOrEqual(3);
  await page.screenshot({
    path: `backlog/tasks/trip-planner-page/developer-${isMobile ? 'mobile' : 'desktop'}.png`,
    fullPage: true,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  const close = planner.getByRole('button', { name: 'Вернуться к местам', exact: true });
  expect((await close.boundingBox())!.width).toBeGreaterThanOrEqual(44);
  await page.reload();
  await expect(planner.locator('.stops > li')).toHaveCount(3);
  await expect(planner.getByRole('combobox', { name: /^Время посещения/ })).toHaveCount(0);
  await expect(planner.getByLabel('Окончание дня', { exact: true })).toHaveValue('10:00');
});
