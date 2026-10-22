import { test, expect } from '@playwright/test';
import { places } from '../../lib/data';
import { locationId } from '../../lib/locations';

const cityStops = places.filter((p) => p.city === 'Коломна');

test.beforeEach(async ({ page }) => {
  await page.route('https://tiles.openfreemap.org/**', (r) => r.abort());
  await page.route('**/api/places', (r) => r.fulfill({ json: { places: [] } }));
  await page.route('**/api/pois/**', (r) =>
    r.fulfill({ json: { items: [], fallback: 'links', source: null } }),
  );
});

test('weekend variants, hotel links and dual navigation on desktop and mobile', async ({
  page,
  isMobile,
}) => {
  const selected = cityStops.slice(0, 5);
  await page.addInitScript(
    ({ stops, id }) => {
      localStorage.setItem(
        'weekend-explorer-v1',
        JSON.stringify({
          version: 0,
          state: {
            regionId: 'podmoskovye',
            locationId: id,
            locationsMigrated: true,
            regionTripsMigrated: true,
            trip: stops.map((p: { id: string }) => p.id),
            saved: [],
            customPlaces: [],
            locationTrips: { [id]: stops.map((p: { id: string }) => p.id) },
            daySettings: { [id]: { start: '09:00', end: '14:00', visits: {} } },
            transportMode: 'car',
          },
        }),
      );
    },
    { stops: selected, id: locationId(selected[0]) },
  );

  await page.route('**/api/route', async (route) => {
    const body = route.request().postDataJSON();
    return route.fulfill({
      json: {
        source: 'osrm',
        distance: 8000,
        duration: 2400,
        coordinates: body.stops.map((s: { longitude: number; latitude: number }) => [
          s.longitude,
          s.latitude,
        ]),
        legs: body.stops.slice(1).map(() => ({
          distance: 1600,
          duration: 480,
          instructions: [{ text: 'Прямо по набережной', distance: 200 }],
        })),
      },
    });
  });

  await page.goto(`/trip?city=${encodeURIComponent(locationId(selected[0]))}`);
  const planner = page.getByRole('main', { name: 'Создание поездки' });
  await expect(planner.locator('.stops > li')).toHaveCount(5);
  await planner.getByRole('button', { name: 'Собрать маршрут', exact: true }).click();

  await expect(planner.locator('.weekend-variants')).toBeVisible({ timeout: 15000 });
  await expect(planner.locator('.weekend-variant-card').first()).toBeVisible();
  expect(await planner.locator('.weekend-variant-card').count()).toBeGreaterThanOrEqual(2);
  const twoDay = planner.locator('.weekend-variant-card').filter({ hasText: '2 дня' }).first();
  await expect(twoDay).toBeVisible();
  await twoDay.click();
  await expect(planner.locator('.trip-hotels')).toBeVisible();
  await expect(planner.getByRole('link', { name: /Отели рядом/ }).first()).toBeVisible();

  await expect(planner.locator('.trip-meals').first()).toBeVisible();
  await expect(planner.locator('.trip-day-report')).toBeVisible();
  await expect(planner.getByRole('link', { name: 'Маршрут в Яндекс Картах', exact: true })).toBeVisible();
  await expect(planner.getByRole('link', { name: 'Маршрут в 2GIS', exact: true })).toBeVisible();
  await expect(planner.getByRole('link', { name: 'Уточнить путь в Яндекс Картах' }).first()).toBeVisible();
  await expect(planner.getByRole('link', { name: 'Открыть путь в 2GIS' }).first()).toBeVisible();

  await page.screenshot({
    path: `backlog/tasks/trip-multiday-guide/weekend-${isMobile ? 'mobile' : 'desktop'}.png`,
    fullPage: true,
  });
});
