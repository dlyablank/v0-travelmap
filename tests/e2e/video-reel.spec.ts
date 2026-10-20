import { expect, test } from '@playwright/test';

test('feed previews loop and the vertical reel cycles with a single active player', async ({
  page,
}, testInfo) => {
  await page.route('https://tiles.openfreemap.org/**', (route) => route.abort());
  await page.goto('/');
  if (testInfo.project.name === 'mobile')
    await page.getByRole('button', { name: 'Лента', exact: true }).click();
  const cards = page.locator('.poster-open video');
  await expect
    .poll(() =>
      cards.evaluateAll((videos) =>
        videos.some(
          (v) => !(v as HTMLVideoElement).paused && (v as HTMLVideoElement).currentTime > 0.2,
        ),
      ),
    )
    .toBe(true);
  expect(await cards.count()).toBeLessThanOrEqual(4);
  const preview = cards.first();
  await expect
    .poll(() => preview.evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 10000 })
    .toBeGreaterThan(5);
  await expect
    .poll(() => preview.evaluate((v: HTMLVideoElement) => v.currentTime), { timeout: 4000 })
    .toBeLessThan(2);
  const open = page.getByRole('button', { name: 'Открыть Суйсари на острове', exact: true });
  await open.click();
  const reel = page.getByRole('dialog', { name: 'Видео путешествий' });
  await expect(reel).toBeVisible();
  await expect(
    reel.getByRole('heading', { name: 'Суйсари на острове', exact: true }),
  ).toBeVisible();
  const player = reel.locator('video');
  await expect(player).toHaveCount(1);
  await expect
    .poll(() => player.evaluate((v: HTMLVideoElement) => !v.paused && v.currentTime > 0.2))
    .toBe(true);
  await expect(page.locator('.map-wrap video, .poster-open video')).toHaveCount(0);
  await expect
    .poll(() =>
      reel.locator('.reel-track').evaluate((el) => Math.abs(el.scrollTop - el.clientHeight)),
    )
    .toBeLessThan(2);
  await reel.getByRole('button', { name: 'Сохранить место', exact: true }).click();
  await expect(
    reel.getByRole('button', { name: 'Убрать из сохранённого', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await reel.getByRole('button', { name: 'Добавить в поездку', exact: true }).click();
  await expect(
    reel.getByRole('button', { name: 'Убрать из поездки', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  if (testInfo.project.name === 'mobile') {
    const viewport = page.viewportSize()!;
    const session = await page.context().newCDPSession(page);
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: viewport.width / 2, y: viewport.height * 0.55 }],
    });
    for (let i = 1; i <= 8; i++)
      await session.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: viewport.width / 2, y: viewport.height * (0.55 - i * 0.05) }],
      });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await session.detach();
  } else {
    const bounds = (await reel.locator('.reel-track').boundingBox())!;
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height * 0.3);
    await page.mouse.wheel(0, bounds.height);
  }
  await expect(reel.getByRole('heading', { name: 'Река Сюскюянйоки', exact: true })).toBeVisible();
  await expect(player).toHaveCount(1);
  for (let i = 0; i < 6; i++)
    await reel.getByRole('button', { name: 'Следующее видео', exact: true }).click();
  await expect(
    reel.getByRole('heading', { name: 'Суйсари на острове', exact: true }),
  ).toBeVisible();
  await page.keyboard.press('ArrowUp');
  await expect(reel.getByRole('heading', { name: 'Остров Кижи', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(reel).toHaveCount(0);
  await expect(open).toBeFocused();
  await open.click();
  await reel.getByRole('button', { name: 'Показать на карте', exact: true }).click();
  await expect(reel).toHaveCount(0);
  await expect(page.locator('.active-preview h2')).toHaveText('Суйсари на острове');
});
