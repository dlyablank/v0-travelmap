import { expect, test } from '@playwright/test';

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
    await page.getByRole('button', { name: 'Лента', exact: true }).click();
  await page
    .getByRole('button', { name: 'Добавить в поездку Суйсари на острове', exact: true })
    .click();
  await chooser.selectOption('kolomna');
  await expect(page.getByRole('heading', { name: 'Выходные в Коломне' })).toBeVisible();
  await expect(page.locator('.region-caption')).toContainText('9 мест · 7 видео');
  await expect(page.getByRole('region', { name: 'Выбранные остановки' })).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Открыть Суйсари на острове', exact: true }),
  ).toHaveCount(0);
  if (info.project.name === 'mobile')
    await page.getByRole('button', { name: 'Карта', exact: true }).click();
  await expect(page.locator('.priority-video')).toHaveCount(7);
  await expect
    .poll(() => page.locator('.priority-video[data-map-video-visible="true"]').count())
    .toBeGreaterThanOrEqual(info.project.name === 'mobile' ? 4 : 5);
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
    await page.getByRole('button', { name: 'Лента', exact: true }).click();
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
  await expect(chooser).toHaveValue('kolomna');
  if (info.project.name === 'mobile')
    await page.getByRole('button', { name: 'Лента', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Выбранные остановки' })).toContainText(
    'Стены Коломенского кремля',
  );
  await chooser.selectOption('karelia');
  await expect(page.getByRole('region', { name: 'Выбранные остановки' })).toContainText('Суйсари');
  await expect(page.locator('.region-caption')).toContainText('29 мест · 7 видео');
  await chooser.selectOption('kolomna');
  await page.getByRole('button', { name: 'Собрать поездку' }).click();
  await expect(page.getByRole('region', { name: 'Обложка поездки' })).toContainText(
    'Коломна и окрестности',
  );
  await expect(page.locator('.trip-panel')).not.toContainText('Суйсари');
});
