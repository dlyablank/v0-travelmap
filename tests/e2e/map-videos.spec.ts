import { expect, test } from '@playwright/test';

test('map previews play within budget and hand playback to the selected card', async ({
  page,
}, testInfo) => {
  // Keep the test independent of external tile availability and PostgreSQL/S3.
  await page.route('https://tiles.openfreemap.org/**', (route) => route.abort());
  await page.route('**/api/places', (route) => route.fulfill({ json: { places: [] } }));
  await page.goto('/');
  if (testInfo.project.name === 'mobile') {
    const map = (await page.locator('.map-panel').boundingBox())!;
    expect(Math.abs(map.y + map.height - page.viewportSize()!.height)).toBeLessThan(2);
    await expect(page.getByRole('navigation', { name: 'Действия на телефоне' })).toBeVisible();
  }
  const videoMarkers = page.locator('.priority-video');
  await expect(videoMarkers).toHaveCount(7);
  await expect
    .poll(() =>
      videoMarkers.evaluateAll((markers) =>
        markers.every((marker) => {
          const rect = marker.getBoundingClientRect();
          const map = marker.closest('.map-wrap')!.getBoundingClientRect();
          return (
            rect.left >= map.left &&
            rect.right <= map.right &&
            rect.top >= map.top &&
            rect.bottom <= map.bottom
          );
        }),
      ),
    )
    .toBe(true);
  const previews = page.locator('.map-wrap video');
  await expect
    .poll(() =>
      previews.evaluateAll(
        (videos) =>
          videos.length === 5 &&
          videos.every((v) => {
            const video = v as HTMLVideoElement;
            return !video.paused && video.currentTime > 0.2;
          }),
      ),
    )
    .toBe(true);
  await expect(previews).toHaveCount(5);
  expect(
    await previews.evaluateAll((videos) =>
      videos.every((element) => {
        const video = element as HTMLVideoElement;
        return (
          video.muted &&
          video.defaultMuted &&
          video.playsInline &&
          video.autoplay &&
          getComputedStyle(video).opacity === '1' &&
          !!video.poster
        );
      }),
    ),
  ).toBe(true);

  const toggle = page.getByRole('button', { name: 'Видео на карте', exact: true });
  await toggle.click();
  await expect(previews).toHaveCount(0);
  await toggle.click();
  await expect.poll(() => previews.count()).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Показать Нижний водопад Койриноя', exact: true }).click();
  await expect
    .poll(() =>
      page
        .locator('.active-preview video')
        .evaluate((v: HTMLVideoElement) => !v.paused && v.currentTime > 0.2),
    )
    .toBe(true);
  await expect(previews).toHaveCount(0);
  await expect(page.locator('.video-credit')).toContainText('CC BY-SA 4.0');
  const close = page.getByRole('button', { name: 'Закрыть место', exact: true });
  const closeBox = (await close.boundingBox())!;
  expect(closeBox.width).toBeGreaterThanOrEqual(44);
  expect(closeBox.height).toBeGreaterThanOrEqual(44);
  await page.getByRole('button', { name: 'Закрыть место', exact: true }).click();
  await expect.poll(() => previews.count()).toBeGreaterThan(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(previews).toHaveCount(0);
  await page.getByRole('button', { name: 'Уменьшить масштаб', exact: true }).click();
  await expect(videoMarkers).toHaveCount(7);
  await page.getByRole('button', { name: 'Природа', exact: true }).click();
  await expect(videoMarkers).toHaveCount(4);
  await expect(page.getByRole('button', { name: 'Показать Остров Кижи', exact: true })).toHaveCount(
    0,
  );
});

test('a browser autoplay refusal retries map previews on the first touch', async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    const nativePlay = HTMLMediaElement.prototype.play;
    let touched = false;
    document.addEventListener(
      'click',
      () => {
        touched = true;
      },
      true,
    );
    HTMLMediaElement.prototype.play = function () {
      if (this.closest('.map-wrap') && !touched) {
        // Simulate mobile browser policy, including its refusal of native autoplay.
        this.autoplay = false;
        return Promise.reject(new DOMException('User gesture required', 'NotAllowedError'));
      }
      return nativePlay.call(this);
    };
  });
  await page.route('https://tiles.openfreemap.org/**', (route) => route.abort());
  await page.route('**/api/places', (route) => route.fulfill({ json: { places: [] } }));
  await page.goto('/');
  const previews = page.locator('.map-wrap video');
  await expect(previews).toHaveCount(5);
  await expect
    .poll(() =>
      previews.evaluateAll((videos) => videos.every((v) => (v as HTMLVideoElement).paused)),
    )
    .toBe(true);
  const search = page.getByRole('textbox', { name: 'Поиск по городу и региону' });
  if (testInfo.project.name === 'mobile') await search.tap();
  else await search.click();
  await expect
    .poll(() =>
      previews.evaluateAll(
        (videos) =>
          videos.length === 5 &&
          videos.every(
            (v) => !(v as HTMLVideoElement).paused && (v as HTMLVideoElement).currentTime > 0.2,
          ),
      ),
    )
    .toBe(true);
  await page.getByRole('button', { name: 'Видео на карте', exact: true }).click();
  await expect(previews).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Поиск по городу и региону' }).click();
  await expect(previews).toHaveCount(0);
});
