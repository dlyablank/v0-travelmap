import { expect, test } from '@playwright/test';

test('discovery, author, mini-map, selected stops and trip cover stay connected', async ({
  page,
}, testInfo) => {
  await page.route('https://tiles.openfreemap.org/**', (route) => route.abort());
  await page.route('**/api/route', (route) =>
    route.fulfill({
      json: {
        coordinates: [
          [34.5596, 61.9845],
          [31.2731, 61.6639],
        ],
        distance: 25000,
        duration: 1800,
        legs: [{ distance: 25000, duration: 1800 }],
        source: 'osrm',
      },
    }),
  );
  await page.route('**/api/places', (r) => r.fulfill({ json: { places: [] } }));
  await page.goto('/');
  if (testInfo.project.name === 'mobile')
    await page.getByRole('button', { name: 'Лента', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Выходные в Карелии', exact: true }),
  ).toBeVisible();
  const open = page.getByRole('button', { name: 'Открыть Суйсари на острове', exact: true });
  const box = (await open.boundingBox())!;
  expect(box.y).toBeLessThan(testInfo.project.name === 'mobile' ? 400 : 390);
  await open.click();
  const reel = page.getByRole('dialog', { name: 'Видео путешествий' });
  const dot = reel.getByTestId('mini-map-current');
  await expect(dot).toHaveAttribute('data-place-id', 'suisaari');
  await expect(reel.locator('.reel-mini-map svg path').first()).toBeAttached();
  await reel.locator('.reel-place-details > summary').click();
  const author = reel.getByRole('region', { name: 'Автор и происхождение видео' });
  await expect(
    author.getByRole('link', { name: 'Автор видео: 基日島', exact: true }),
  ).toBeVisible();
  await expect(author).toContainText('2021');
  await expect(author).toContainText('Открытая лицензия');
  await expect(author).not.toContainText('С разрешения автора');
  await author.locator('summary').click();
  await expect(author.getByRole('link', { name: 'CC BY-SA 4.0', exact: true })).toBeVisible();
  await reel.getByRole('button', { name: 'Следующее видео', exact: true }).click();
  await expect(dot).toHaveAttribute('data-place-id', 'syskyanjoki');
  await reel.getByRole('button', { name: 'Добавить в поездку', exact: true }).click();
  await reel
    .getByRole('button', { name: 'Показать Река Сюскюянйоки на карте', exact: true })
    .click();
  await expect(reel).toHaveCount(0);
  const strip = page.getByRole('region', { name: 'Выбранные остановки' });
  if (testInfo.project.name === 'mobile') {
    await expect(strip).toBeHidden();
    await page.getByRole('button', { name: 'Закрыть место', exact: true }).click();
    await page.getByRole('button', { name: 'Лента', exact: true }).click();
  }
  await expect(strip).toBeVisible();
  await expect(
    strip.getByRole('button', { name: 'Остановка 1: Река Сюскюянйоки', exact: true }),
  ).toBeVisible();
  if (testInfo.project.name !== 'mobile')
    await page.getByRole('button', { name: 'Закрыть место', exact: true }).click();
  await page
    .getByRole('button', { name: 'Добавить в поездку Суйсари на острове', exact: true })
    .click();
  await expect(strip.getByRole('listitem')).toHaveCount(1);
  await page.getByRole('combobox', { name: 'Регион путешествия' }).selectOption('kolomna');
  for (const name of ['Стены Коломенского кремля', 'Улица Лажечникова'])
    await page.getByRole('button', { name: `Добавить в поездку ${name}`, exact: true }).click();
  await expect(strip.getByRole('listitem')).toHaveCount(2);
  await page.reload();
  if (testInfo.project.name === 'mobile')
    await page.getByRole('button', { name: 'Лента', exact: true }).click();
  await expect(strip.getByRole('listitem')).toHaveCount(2);
  await strip.getByRole('button', { name: 'Собрать поездку', exact: true }).click();
  const cover = page.getByRole('region', { name: 'Обложка поездки' });
  await expect(cover).toBeVisible();
  await expect(cover).toContainText('ВАША ИДЕЯ ПОЕЗДКИ');
  await page.getByRole('button', { name: 'Собрать маршрут', exact: true }).click();
  await expect(cover).toContainText('МАРШРУТ СОБРАН');
  await expect(cover).toContainText('25 км по дорогам');
  await expect(cover).toContainText('30 мин в пути');
  await page.getByRole('button', { name: 'Закрыть поездку', exact: true }).click();
  await strip
    .getByRole('button', { name: 'Убрать остановку: Стены Коломенского кремля', exact: true })
    .click();
  await expect(strip.getByRole('listitem')).toHaveCount(1);
  await strip.getByRole('button', { name: 'Собрать поездку', exact: true }).click();
  await expect(cover).toContainText('ВАША ИДЕЯ ПОЕЗДКИ');
  await expect(cover).not.toContainText('25 км');
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});
