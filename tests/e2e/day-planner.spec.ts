import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('https://tiles.openfreemap.org/**', (r) => r.abort());
  await page.route('**/api/places', (r) => r.fulfill({ json: { places: [] } }));
});

test('saved places are grouped by location and legacy mixed trips remain separate after reload', async ({
  page,
  isMobile,
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
  await expect(groups.getByRole('button')).toHaveCount(3);
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
  const planner = page.getByRole('dialog', { name: /Моя поездка/ });
  await expect(planner.locator('.stops > li')).toHaveCount(1);
  await expect(planner.locator('.stops')).toContainText('Стены Коломенского кремля');
  const chooser = planner.getByRole('combobox', { name: 'Локация поездки' });
  await chooser.selectOption({ label: 'Онежское озеро' });
  await expect(planner.locator('.stops > li')).toHaveCount(1);
  await expect(planner.locator('.stops')).toContainText('Суйсари');
  await chooser.selectOption({ label: 'Питкярантский район' });
  await expect(planner.locator('.stops > li')).toHaveCount(1);
  await expect(planner.locator('.stops')).toContainText('Сюскюянйоки');
  await page.reload();
  await page
    .getByRole('button', { name: /Моя поездка/ })
    .filter({ visible: true })
    .first()
    .click();
  await expect(planner.locator('select[aria-label="Локация поездки"] option:checked')).toHaveText(
    'Питкярантский район',
  );
  await expect(planner.locator('.stops')).toContainText('Сюскюянйоки');
  if (isMobile) {
    const bounds = (await planner.boundingBox())!;
    expect(bounds.height).toBe(page.viewportSize()!.height);
    expect(bounds.y).toBe(0);
  }
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
  if (isMobile) await page.getByRole('button', { name: 'Лента', exact: true }).click();
  for (const name of ['Стены Коломенского кремля', 'Улица Лажечникова']) {
    await page.getByRole('button', { name: `Сохранить ${name}`, exact: true }).click();
  }
  await page
    .getByRole('button', { name: /Моя поездка/ })
    .filter({ visible: true })
    .first()
    .click();
  const planner = page.getByRole('dialog', { name: /Моя поездка/ });
  for (const name of ['Стены Коломенского кремля', 'Улица Лажечникова'])
    await planner
      .getByRole('button', { name: `Добавить сохранённое: ${name}`, exact: true })
      .click();
  await planner.getByRole('button', { name: 'Собрать маршрут', exact: true }).click();
  await expect(planner.getByRole('region', { name: 'Итоги дня' })).toContainText(
    'Финиш около 11:25',
  );
  await expect(planner.locator('.timeline-transfer')).toContainText('10 мин');
  await planner
    .getByRole('combobox', { name: 'Время посещения: Стены Коломенского кремля', exact: true })
    .selectOption('30');
  await expect(planner.getByRole('region', { name: 'Итоги дня' })).toContainText(
    'Финиш около 10:25',
  );
  await planner.getByLabel('Окончание дня', { exact: true }).fill('10:00');
  await expect(planner.locator('.day-overflow')).toContainText('25 мин');
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
  await page.screenshot({ path: `/tmp/day-plan-${isMobile ? 'mobile' : 'desktop'}.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  const close = planner.getByRole('button', { name: 'Закрыть поездку', exact: true });
  expect((await close.boundingBox())!.width).toBeGreaterThanOrEqual(44);
  await page.reload();
  await page
    .getByRole('button', { name: /Моя поездка/ })
    .filter({ visible: true })
    .first()
    .click();
  await expect(planner.locator('.stops > li')).toHaveCount(3);
  await expect(
    planner.getByRole('combobox', {
      name: 'Время посещения: Стены Коломенского кремля',
      exact: true,
    }),
  ).toHaveValue('30');
  await expect(planner.getByLabel('Окончание дня', { exact: true })).toHaveValue('10:00');
});
