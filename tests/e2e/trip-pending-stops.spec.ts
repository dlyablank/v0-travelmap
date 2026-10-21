import { test, expect } from '@playwright/test';
import { places } from '../../lib/data';
import { locationId } from '../../lib/locations';

test('legacy pending id survives visible deletion, reorder, optimization and reload until metadata arrives', async ({
  page,
}) => {
  const source = places.find((p) => p.id === 'suisaari')!;
  const known = Array.from({ length: 22 }, (_, i) => ({
    ...source,
    id: `pending-known-${i}`,
    name: `Проверка миграции ${i}`,
    city: i < 11 ? 'Первая city' : 'Вторая city',
    longitude: source.longitude + i / 100,
    video: undefined,
  }));
  const late = { ...known[21], id: 'pending-late', name: 'Позднее место' };
  let includeLate = false;
  await page.route('**/api/places', (r) =>
    r.fulfill({ json: { places: includeLate ? [late] : [] } }),
  );
  await page.route('**/api/route', (r) => {
    const { stops } = r.request().postDataJSON();
    return r.fulfill({
      json: {
        source: 'straight',
        coordinates: [],
        distance: 1000,
        duration: null,
        legs: stops.slice(1).map(() => ({ distance: 50, duration: null })),
        message: 'Время неизвестно.',
      },
    });
  });
  await page.addInitScript(
    ({ known, first, second, lateId }) => {
      if (!localStorage.getItem('weekend-explorer-v1'))
        localStorage.setItem(
          'weekend-explorer-v1',
          JSON.stringify({
            version: 0,
            state: {
              regionId: 'karelia',
              locationId: first,
              locationsMigrated: true,
              trip: known.slice(0, 11).map((p) => p.id),
              locationTrips: {
                [first]: known.slice(0, 11).map((p) => p.id),
                [second]: [...known.slice(11).map((p) => p.id), lateId],
              },
              customPlaces: known,
              saved: [],
              regionTrips: {},
            },
          }),
        );
    },
    { known, first: locationId(known[0]), second: locationId(known[21]), lateId: late.id },
  );
  const stored = () =>
    page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('weekend-explorer-v1')!).state as {
          trip: string[];
          unassignedStops: string[];
        },
    );
  await page.goto('/trip');
  await expect(page.locator('.stops > li')).toHaveCount(22);
  await expect(page.getByRole('button', { name: 'Собрать маршрут', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: `Удалить ${known[0].name}`, exact: true }).click();
  await page.reload();
  expect((await stored()).trip).toContain(late.id);
  expect((await stored()).unassignedStops).toContain(late.id);
  await expect(page.locator('.stops > li')).toHaveCount(21);
  for (const place of known.slice(1, 3))
    await page.getByRole('button', { name: `Удалить ${place.name}`, exact: true }).click();
  await page.getByRole('button', { name: `Опустить ${known[3].name}`, exact: true }).click();
  await page.getByLabel('Предложить порядок по близости').check();
  await page.getByRole('button', { name: 'Собрать маршрут', exact: true }).click();
  await expect(page.locator('.route-summary')).toBeVisible();
  expect((await stored()).trip).toHaveLength(20);
  expect((await stored()).trip).toContain(late.id);
  expect((await stored()).unassignedStops).toContain(late.id);
  includeLate = true;
  await page.reload();
  await expect(page.locator('.stops > li')).toHaveCount(20);
  await expect(page.locator('.stops')).toContainText(late.name);
  expect((await stored()).unassignedStops).toEqual([]);
  for (const removed of known.slice(0, 3)) expect((await stored()).trip).not.toContain(removed.id);
});
