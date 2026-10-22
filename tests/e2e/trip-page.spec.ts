import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { places } from '../../lib/data';
import { locationId } from '../../lib/locations';

const stops = places.filter((p) => p.city === 'Коломна').slice(0, 3);
test.beforeEach(async ({ page }) => {
  await page.route('https://tiles.openfreemap.org/**', (r) => r.abort());
  await page.route('**/api/places', (r) => r.fulfill({ json: { places: [] } }));
});

async function seed(page: import('@playwright/test').Page, count = 3) {
  await page.addInitScript(
    ({ stops, id, count }) => {
      if (!localStorage.getItem('weekend-explorer-v1'))
        localStorage.setItem(
          'weekend-explorer-v1',
          JSON.stringify({
            version: 0,
            state: {
              regionId: 'kolomna',
              locationId: id,
              locationsMigrated: true,
              trip: stops.slice(0, count).map((p) => p.id),
              saved: [],
              customPlaces: [],
              locationTrips: { [id]: stops.slice(0, count).map((p) => p.id) },
              daySettings: { [id]: { start: '09:00', end: '19:00', visits: { [stops[0].id]: 1 } } },
              transportMode: 'car',
            },
          }),
        );
    },
    { stops, id: locationId(stops[0]), count },
  );
}

test('direct trip page shows full walking instructions, current Yandex order, automatic visits and JSON', async ({
  page,
  isMobile,
}) => {
  await seed(page);
  await page.route('**/api/route', (r) => {
    const body = r.request().postDataJSON();
    return r.fulfill({
      json: {
        source: 'osrm',
        distance: 2000,
        duration: 600,
        coordinates: [],
        legs: body.stops.slice(1).map(() => ({
          distance: 1000,
          duration: 300,
          instructions: [{ text: 'Поверните налево · Набережная', distance: 100 }],
        })),
      },
    });
  });
  await page.goto(`/trip?city=${encodeURIComponent(locationId(stops[0]))}`);
  const planner = page.getByRole('main', { name: 'Создание поездки' });
  await expect(planner.locator('.stops > li')).toHaveCount(3);
  await expect(planner.getByRole('combobox', { name: /^Время посещения/ })).toHaveCount(0);
  await expect(planner.locator('.visit-duration').first()).toContainText('1 ч 30 мин');
  await planner.getByLabel('Предложить порядок по близости').uncheck();
  await planner.getByRole('button', { name: 'Пешком', exact: true }).click();
  await planner.getByRole('button', { name: 'Собрать маршрут', exact: true }).click();
  await expect(planner.locator('.transfer-instructions')).toHaveCount(2);
  await expect(planner.locator('.timeline-transfer').first()).toContainText(
    `Пешком: ${stops[0].name} → ${stops[1].name}`,
  );
  const navigation = planner.getByRole('link', { name: 'Маршрут в Яндекс Картах', exact: true });
  await expect(navigation).toHaveAttribute('href', /rtt=pd/);
  await planner.getByRole('button', { name: `Поднять ${stops[1].name}`, exact: true }).click();
  await expect(planner.locator('.stops > li').first()).toContainText(stops[1].name);
  await expect(navigation).toBeVisible();
  const url = new URL((await navigation.getAttribute('href'))!);
  expect(url.searchParams.get('rtext')!.split('~')[0]).toBe(
    `${stops[1].latitude},${stops[1].longitude}`,
  );
  const downloadEvent = page.waitForEvent('download');
  await planner.getByRole('button', { name: 'Скачать план', exact: true }).click();
  const downloaded = await downloadEvent;
  const data = JSON.parse(await readFile((await downloaded.path())!, 'utf8'));
  expect(data.schedule[0].visit).toBe(stops[1].visitMinutes);
  expect(
    data.schedule.find((e: { place: { id: string } }) => e.place.id === stops[0].id).visit,
  ).toBe(90);
  expect(data.route.legs[0].instructions).toHaveLength(1);
  expect(data.settings.visits).toEqual({});
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  await page.screenshot({
    path: `backlog/tasks/trip-planner-page/full-walk-${isMobile ? 'mobile' : 'desktop'}.png`,
    fullPage: true,
  });
  await page.reload();
  await expect(planner.locator('.stops > li').first()).toContainText(stops[1].name);
  await expect(planner.getByRole('button', { name: 'Пешком', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('transit has pair links and unknown times; retry works and server save is honest', async ({
  page,
}) => {
  await seed(page);
  let fail = true;
  await page.route('**/api/route', (r) => {
    if (fail) return r.fulfill({ status: 503, json: { error: 'Тестовая ошибка маршрута' } });
    return r.fulfill({
      json: {
        source: 'straight',
        coordinates: [],
        distance: 2000,
        duration: null,
        legs: [
          { distance: 1000, duration: null },
          { distance: 1000, duration: null },
        ],
        message: 'Актуальные рейсы и пересадки в Яндекс Картах. Время неизвестно.',
      },
    });
  });
  let savedMode = '';
  await page.route('**/api/trips', (r) => {
    savedMode = r.request().postDataJSON().transportMode;
    return r.fulfill({
      status: 503,
      json: { error: 'Поездка сохранена только в браузере. База не подключена.' },
    });
  });
  await page.goto(`/trip?city=${encodeURIComponent(locationId(stops[0]))}`);
  await page.getByRole('button', { name: 'Общественный транспорт', exact: true }).click();
  await page.getByRole('button', { name: 'Собрать маршрут', exact: true }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('Тестовая ошибка');
  fail = false;
  await page.getByRole('button', { name: 'Собрать маршрут', exact: true }).click();
  await expect(page.locator('.route-summary')).toContainText('Предварительный план');
  await expect(page.locator('.timeline-transfer')).toHaveCount(2);
  const links = page.getByRole('link', {
    name: 'Посмотреть транспорт и пересадки в Яндекс Картах',
  });
  await expect(links).toHaveCount(2);
  await expect(links.first()).toHaveAttribute('href', /rtt=mt/);
  await expect(page.locator('.route-summary')).toContainText('Расписание после первой остановки');
  await expect(page.locator('.trip-recommendations')).toHaveCount(0);
  await page.getByRole('button', { name: 'Сохранить на сервере', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('только в браузере');
  expect(savedMode).toBe('transit');
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Общественный транспорт', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
});

test('empty, single stop and invalid day have useful states', async ({ page }) => {
  await page.goto('/trip');
  await expect(page.getByText('Соберите идеи для поездки')).toBeVisible();
  await page.getByRole('link', { name: 'Найти места' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.locator('.map-nudge')).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Регион путешествия' }).selectOption('podmoskovye');
  if (await page.getByRole('button', { name: 'Исследовать', exact: true }).isVisible())
    await page.getByRole('button', { name: 'Исследовать', exact: true }).click();
  await page
    .getByRole('button', { name: `Добавить в поездку ${stops[0].name}`, exact: true })
    .click();
  await page
    .getByRole('button', { name: /Моя поездка/ })
    .filter({ visible: true })
    .first()
    .click();
  await page.getByRole('link', { name: 'Составить маршрут: Коломна', exact: true }).click();
  await expect(page.locator('.stops > li')).toHaveCount(1);
  await expect(page.getByText('Добавьте минимум два места в этой локации')).toBeVisible();
  await page.getByLabel('Окончание дня', { exact: true }).fill('08:00');
  await expect(page.getByRole('main').getByRole('alert')).toContainText('позже начала');
  await expect(page.getByRole('button', { name: 'Собрать маршрут', exact: true })).toBeDisabled();
});
