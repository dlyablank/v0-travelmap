import { expect, test } from '@playwright/test';
import { places as demoPlaces } from '../../lib/data';

test('Kolomna has seven playable videos and keeps each region trip separate', async ({
  page,
}, info) => {
  await page.route('https://tiles.openfreemap.org/**', (r) => r.abort());
  await page.route('**/api/places', (r) => r.fulfill({ json: { places: [] } }));
  await page.goto('/');
  const chooser = page.getByRole('combobox', { name: 'Регион путешествия' });
  await expect(chooser).toHaveValue('karelia');
  await expect(chooser).toBeEnabled();
  if (info.project.name === 'mobile')
    await page.getByRole('button', { name: 'Исследовать', exact: true }).click();
  await page
    .getByRole('button', { name: 'Добавить в поездку Суйсари на острове', exact: true })
    .click();
  await chooser.selectOption('kolomna');
  await expect(page.getByRole('heading', { name: 'Места для вашей поездки' })).toBeVisible();
  await expect(page.locator('.region-caption')).toContainText('38 мест · 14 видео');
  await expect(page.getByRole('region', { name: 'Выбранные остановки' })).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Открыть Суйсари на острове', exact: true }),
  ).toHaveCount(1);
  if (info.project.name === 'mobile')
    await page.getByRole('button', { name: 'Weekend Explorer — главная', exact: true }).click();
  await expect(page.locator('.priority-video')).toHaveCount(14);
  await expect
    .poll(() => page.locator('.priority-video[data-map-video-visible="true"]').count())
    // Larger readable cards take precedence over forcing five into a dense location.
    .toBeGreaterThanOrEqual(info.project.name === 'mobile' ? 3 : 4);
  await expect
    .poll(() =>
      page
        .locator('.map-wrap video')
        .evaluateAll(
          (v) =>
            v.filter(
              (el) =>
                !(el as HTMLVideoElement).paused && (el as HTMLVideoElement).currentTime > 0.2,
            ).length,
        ),
    )
    .toBe(await page.locator('.priority-video[data-map-video-visible="true"]').count());
  await expect
    .poll(() =>
      page.locator('.priority-video[data-map-video-visible="true"]').evaluateAll((markers) => {
        const rects = markers.map((m) => m.getBoundingClientRect());
        return rects.every((a, i) =>
          rects
            .slice(i + 1)
            .every(
              (b) =>
                a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top,
            ),
        );
      }),
    )
    .toBe(true);
  if (info.project.name === 'mobile')
    await page.getByRole('button', { name: 'Исследовать', exact: true }).click();
  await page
    .getByRole('button', { name: 'Открыть Стены Коломенского кремля', exact: true })
    .click();
  const reel = page.getByRole('dialog', { name: 'Видео путешествий' });
  await expect(reel).toBeVisible();
  await expect
    .poll(() =>
      reel
        .locator('video[data-active="true"]')
        .evaluate((v: HTMLVideoElement) => !v.paused && v.currentTime > 0.2),
    )
    .toBe(true);
  await expect(reel.locator('.reel-top small')).toHaveCount(0);
  await reel.locator('.reel-place-details > summary').click();
  await expect(reel.getByRole('region', { name: 'Автор и происхождение видео' })).toContainText(
    'Андрей Елбаев',
  );
  await expect(reel.locator('[data-testid="mini-map-current"]')).toHaveAttribute(
    'data-place-id',
    'kolomna-kremlin',
  );
  await reel.getByRole('button', { name: 'Добавить в поездку', exact: true }).click();
  await reel.getByRole('button', { name: 'Следующее видео' }).click();
  await expect(reel.getByRole('heading', { name: 'Улица Лажечникова' })).toBeVisible();
  await reel.getByRole('button', { name: 'Закрыть видеоленту' }).click();
  await page.reload();
  if (info.project.name === 'mobile')
    await page.getByRole('button', { name: 'Исследовать', exact: true }).click();
  for (const name of ['Стены Коломенского кремля', 'Суйсари на острове'])
    await expect(
      page.getByRole('button', { name: `Убрать из поездки ${name}`, exact: true }),
    ).toBeVisible();
  await expect(page.locator('.selected-stops')).toHaveCount(0);
  await page.getByRole('button', { name: /Моя поездка/ }).click();
  await expect(page.locator('.trip-city-card')).toHaveCount(2);
  await page.getByRole('link', { name: 'Составить маршрут: Коломна', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Обложка поездки' })).toContainText(
    'Коломна и окрестности',
  );
  await expect(page.locator('.trip-panel')).not.toContainText('Суйсари');
});

test('one persistent map contains both regions and the selector only changes its view', async ({
  page,
}) => {
  await page.route('https://tiles.openfreemap.org/**', (r) => r.abort());
  await page.route('**/api/places', (r) => r.fulfill({ json: { places: [] } }));
  await page.goto('/');
  const canvas = page.locator('.maplibregl-canvas');
  const markers = page.locator('.priority-video');
  await expect(markers).toHaveCount(14);
  await canvas.evaluate((el) => {
    el.dataset.instance = 'original';
  });
  await markers.evaluateAll((es) =>
    es.forEach((el) => {
      el.dataset.session = 'original';
    }),
  );
  const chooser = page.getByRole('combobox', { name: 'Регион путешествия' });
  for (const region of ['kolomna', 'karelia', 'kolomna']) {
    await chooser.selectOption(region);
    const prefix =
      region === 'kolomna' ? '[data-place-id^="kolomna-"]' : ':not([data-place-id^="kolomna-"])';
    await expect
      .poll(() => page.locator(`.priority-video${prefix}[data-map-video-visible="true"]`).count())
      .toBeGreaterThanOrEqual(3);
    await expect(canvas).toHaveAttribute('data-instance', 'original');
    await expect(page.locator('.priority-video[data-session="original"]')).toHaveCount(14);
  }
  // An overview reveals points from both regions without changing the selected region.
  await page.getByRole('button', { name: 'Показать все места', exact: true }).click();
  await page.waitForTimeout(1100);
  for (const prefix of ['[data-place-id^="kolomna-"]', ':not([data-place-id^="kolomna-"])'])
    await expect
      .poll(() => page.locator(`.video-marker${prefix}[data-map-marker-visible="true"]`).count())
      .toBeGreaterThan(0);
  await expect(canvas).toHaveAttribute('data-instance', 'original');
  const otherRegion = page
    .locator('.video-marker:not([data-place-id^="kolomna-"])[data-map-marker-visible="true"]')
    .first();
  const id = await otherRegion.getAttribute('data-place-id');
  const place = demoPlaces.find((p) => p.id === id)!;
  await otherRegion.click();
  await expect(page.locator('.active-preview h2')).toHaveText(place.name);
  // Navigating a card from the other region follows that place's region.
  const neighbours = demoPlaces.filter((p) => p.region === place.region);
  const nextPlace = neighbours[(neighbours.findIndex((p) => p.id === id) + 1) % neighbours.length];
  await page.getByRole('button', { name: 'Следующее место', exact: true }).click();
  await expect(page.locator('.active-preview h2')).toHaveText(nextPlace.name);
});
