import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const video = join(tmpdir(), 'weekend-e2e.mp4');
test.beforeAll(() => {
  execFileSync('ffmpeg', [
    '-f',
    'lavfi',
    '-i',
    'color=c=0x436b61:s=180x320:d=1',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    video,
    '-y',
    '-loglevel',
    'error',
  ]);
});
test('explore, filter, save, build route and retain trip after reload', async ({
  page,
  isMobile,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('[data-testid=map] canvas')).toBeVisible();
  await expect(page.locator('.video-marker,.map-cluster').first()).toBeVisible();
  if (isMobile)
    await page
      .locator('.mobile-bottom')
      .getByRole('button', { name: 'Лента', exact: true })
      .click();
  await page.getByRole('button', { name: 'Открыть Мраморный каньон', exact: true }).click();
  if (isMobile)
    await page
      .locator('.mobile-bottom')
      .getByRole('button', { name: 'Карта', exact: true })
      .click();
  await expect(page.locator('.active-preview h2')).toHaveText('Мраморный каньон');
  await page.getByRole('button', { name: 'Следующее место' }).click();
  await expect(page.locator('.active-preview h2')).toHaveText('Ладожские шхеры');
  await page.getByRole('button', { name: 'Закрыть место' }).click();
  if (isMobile)
    await page
      .locator('.mobile-bottom')
      .getByRole('button', { name: 'Лента', exact: true })
      .click();
  await page.getByRole('button', { name: 'Сохранить Мраморный каньон', exact: true }).click();
  await page
    .getByRole('button', { name: 'Добавить в поездку Мраморный каньон', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Добавить в поездку Водопады Ахвенкоски', exact: true })
    .click();
  await page.reload();
  if (isMobile)
    await page
      .locator('.mobile-bottom')
      .getByRole('button', { name: 'Лента', exact: true })
      .click();
  await expect(
    page.getByRole('button', { name: 'Убрать из поездки Мраморный каньон', exact: true }),
  ).toBeVisible();
  await page.locator('.category-tabs').getByRole('button', { name: 'Кафе', exact: true }).click();
  await expect(page.getByText('Пока ничего не найдено')).toBeVisible();
  await page.getByRole('button', { name: 'Показать все места', exact: true }).click();
  await page
    .getByRole('button', { name: /Моя поездка/ })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page.locator('.stops li')).toHaveCount(2);
  await page.getByRole('button', { name: 'Собрать маршрут', exact: true }).click();
  await expect(page.locator('.route-summary')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('.route-summary')).toContainText(/Маршрут собран|Предварительный план/);
  await page.getByRole('button', { name: 'Сохранить на сервере', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Поездка сохранена на сервере' }),
  ).toBeVisible();
  const width = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth,
  );
  expect(width).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({ path: `/tmp/weekend-${isMobile ? 'mobile' : 'desktop'}-trip.png` });
});
test('upload an owned MP4, persist a new geolocated point, and play only the active video', async ({
  page,
  isMobile,
  request,
}) => {
  await page.goto('/');
  if (isMobile)
    await page
      .locator('.mobile-bottom')
      .getByRole('button', { name: 'Добавить видео', exact: true })
      .click();
  else await page.getByRole('button', { name: 'Добавить видео', exact: true }).click();
  await page.getByRole('button', { name: 'Свой файл', exact: true }).click();
  await page.getByLabel('Видеофайл').setInputFiles(video);
  const title = `Тестовое своё видео ${isMobile ? 'mobile' : 'desktop'} ${Date.now()}`;
  await page.getByLabel('Название места', { exact: true }).fill(title);
  await page.getByLabel('Город / район', { exact: true }).fill('Сортавала');
  await page
    .getByLabel('Описание', { exact: true })
    .fill('Синтетическое тестовое видео. Не изображает реальное место.');
  await page.getByLabel('Широта', { exact: true }).fill('61.702');
  await page.getByLabel('Долгота', { exact: true }).fill('30.678');
  await page.getByRole('button', { name: 'Добавить место', exact: true }).click();
  await expect(
    page.getByText('Видео и место сохранены на сервере.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Закрыть', exact: true }).click();
  await expect(page.locator('.active-preview video')).toBeVisible();
  await expect
    .poll(() =>
      page.locator('.active-preview video').evaluate((v: HTMLVideoElement) => v.readyState),
    )
    .toBeGreaterThan(1);
  expect(await page.locator('video').count()).toBe(1);
  await page.getByRole('button', { name: 'Пауза', exact: true }).click();
  await expect
    .poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.paused))
    .toBe(true);
  const src = await page.locator('video').getAttribute('src');
  const media = await request.get(src!, { headers: { Range: 'bytes=0-99' } });
  expect(media.status()).toBe(206);
  expect((await media.body()).length).toBe(100);
  await page.getByRole('button', { name: 'Следующее место', exact: true }).click();
  // The current demo now has real videos: wrapping reaches another playable
  // place. Verify that the uploaded player is released, not that all video vanishes.
  await expect
    .poll(() =>
      page
        .locator('video')
        .evaluateAll(
          (videos, previousSrc) => videos.every((v) => v.getAttribute('src') !== previousSrc),
          src,
        ),
    )
    .toBe(true);
  await expect(page.locator('.active-preview video[data-active="true"]')).toHaveCount(1);
  const list = await request.get('/api/places');
  const data = await list.json();
  expect(data.places.some((p: { name: string }) => p.name === title)).toBe(true);
});
test('validates API inputs and limits uploads', async ({ request }) => {
  expect((await request.post('/api/route', { data: { stops: [], mode: 'car' } })).status()).toBe(
    400,
  );
  expect(
    (
      await request.post('/api/uploads', {
        data: 'this is not mp4',
        headers: { 'Content-Type': 'video/mp4' },
      })
    ).status(),
  ).toBe(415);
  expect(
    (await request.post('/api/places', { data: { name: 'bad', latitude: 999 } })).status(),
  ).toBe(400);
});
