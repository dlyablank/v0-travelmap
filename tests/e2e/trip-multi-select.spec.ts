import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('ordinary cross-city selection keeps all stops, reloads and separates regions', async ({
  page,
  isMobile,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  if (isMobile) await page.getByRole('button', { name: 'Лента', exact: true }).click();
  const karelia = ['Суйсари на острове', 'Река Сюскюянйоки', 'Река Иййоки'];
  for (let i = 0; i < karelia.length; i++) {
    await page
      .getByRole('button', { name: `Добавить в поездку ${karelia[i]}`, exact: true })
      .click();
    for (const name of karelia.slice(0, i + 1))
      await expect(
        page.getByRole('button', { name: `Убрать из поездки ${name}`, exact: true }),
      ).toBeVisible();
  }
  const strip = page.getByRole('region', { name: 'Выбранные остановки' });
  await expect(strip.getByRole('listitem')).toHaveCount(3);
  await strip.getByRole('button', { name: 'Собрать поездку', exact: true }).click();
  await expect(page.locator('.stops > li')).toHaveCount(3);
  for (const name of karelia) await expect(page.locator('.stops')).toContainText(name);
  await page.getByRole('button', { name: `Поднять ${karelia[1]}`, exact: true }).click();
  await page.getByRole('button', { name: `Удалить ${karelia[2]}`, exact: true }).click();
  await page.reload();
  await expect(page.locator('.stops > li')).toHaveCount(2);
  await expect(page.locator('.stops > li').first()).toContainText(karelia[1]);
  await page.getByRole('button', { name: 'Вернуться к местам', exact: true }).click();
  if (isMobile) await page.getByRole('button', { name: 'Лента', exact: true }).click();
  await expect(
    page.getByRole('button', { name: `Убрать из поездки ${karelia[0]}`, exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: `Добавить в поездку ${karelia[2]}`, exact: true }).click();
  const chooser = page.getByRole('combobox', { name: 'Регион путешествия' });
  await chooser.selectOption('kolomna');
  const kolomna = [
    'Стены Коломенского кремля',
    'Старо-Голутвин монастырь',
    'Улица Лажечникова',
    'Улица Зайцева',
  ];
  for (const name of kolomna)
    await page.getByRole('button', { name: `Добавить в поездку ${name}`, exact: true }).click();
  await expect(strip.getByRole('listitem')).toHaveCount(4);
  // A second click removes only that stop, then re-add has no duplicates.
  await page.getByRole('button', { name: `Убрать из поездки ${kolomna[2]}`, exact: true }).click();
  await expect(strip.getByRole('listitem')).toHaveCount(3);
  await page.getByRole('button', { name: `Добавить в поездку ${kolomna[2]}`, exact: true }).click();
  await strip.getByRole('button', { name: 'Собрать поездку', exact: true }).click();
  await expect(page.locator('.stops > li')).toHaveCount(4);
  await page.getByRole('combobox', { name: 'Регион поездки' }).selectOption('karelia');
  await expect(page.locator('.stops > li')).toHaveCount(3);
  await expect(page.locator('.stops > li').first()).toContainText(karelia[1]);
  // Route fixture verifies every actually selected coordinate is sent; selection above was unseeded.
  let routeCount = 0;
  await page.route('**/api/route', (r) => {
    const body = r.request().postDataJSON();
    routeCount = body.stops.length;
    return r.fulfill({
      json: {
        coordinates: body.stops.map((p: { latitude: number; longitude: number }) => [
          p.longitude,
          p.latitude,
        ]),
        distance: 2000,
        duration: null,
        legs: body.stops.slice(1).map(() => ({ distance: 1000, duration: null })),
        source: 'straight',
        message: 'Расстояния по прямой; время неизвестно.',
      },
    });
  });
  await page.getByLabel('Предложить порядок по близости').uncheck();
  await page.getByRole('button', { name: 'Собрать маршрут', exact: true }).click();
  await expect(page.locator('.route-summary')).toBeVisible();
  expect(routeCount).toBe(3);
  await expect(page.locator('.timeline-transfer')).toHaveCount(2);
  const link = page.getByRole('link', { name: 'Маршрут в Яндекс Картах', exact: true });
  expect(
    new URL((await link.getAttribute('href'))!).searchParams.get('rtext')!.split('~'),
  ).toHaveLength(3);
  const event = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать план', exact: true }).click();
  const data = JSON.parse(await readFile((await (await event).path())!, 'utf8'));
  expect(data.stops.map((p: { name: string }) => p.name)).toEqual([
    karelia[1],
    karelia[0],
    karelia[2],
  ]);
  await page.screenshot({
    path: `backlog/tasks/trip-multi-select-${isMobile ? 'mobile' : 'desktop'}.png`,
    fullPage: true,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
  expect(errors).toEqual([]);
});
