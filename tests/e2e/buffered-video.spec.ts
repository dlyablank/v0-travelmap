import { expect, test, type Page } from '@playwright/test';

async function openKolomna(page: Page, mobile: boolean) {
  await page.route('https://tiles.openfreemap.org/**', (r) => r.abort());
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Регион путешествия' }).selectOption('kolomna');
  if (mobile) await page.getByRole('button', { name: 'Лента', exact: true }).click();
  await page
    .getByRole('button', { name: 'Открыть Стены Коломенского кремля', exact: true })
    .click();
  return page.getByRole('dialog', { name: 'Видео путешествий' });
}

test('neighbours load before selection and the same player is reused with one playing clip', async ({
  page,
  isMobile,
}) => {
  const requested = new Set<string>();
  page.on('request', (r) => {
    if (/\/media\/videos\/.*(?<!-preview)\.mp4$/.test(r.url()))
      requested.add(new URL(r.url()).pathname);
  });
  const reel = await openKolomna(page, isMobile);
  await expect(reel.locator('video')).toHaveCount(3);
  const upcoming = reel.locator('.reel-slide[data-active="true"] + .reel-slide video');
  await expect
    .poll(() => upcoming.evaluate((v: HTMLVideoElement) => v.readyState))
    .toBeGreaterThan(1);
  const src = await upcoming.getAttribute('src');
  expect(requested.has(src!)).toBe(true);
  expect(await upcoming.evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  await upcoming.evaluate((v) => {
    v.dataset.bufferProof = 'reused';
  });
  await reel.getByRole('button', { name: 'Включить звук', exact: true }).click();
  await reel.getByRole('button', { name: 'Следующее видео', exact: true }).click();
  const active = reel.locator('video[data-active="true"]');
  await expect(active).toHaveAttribute('data-buffer-proof', 'reused');
  await expect
    .poll(() => active.evaluate((v: HTMLVideoElement) => !v.paused && v.currentTime > 0.1))
    .toBe(true);
  expect(await active.evaluate((v: HTMLVideoElement) => v.muted)).toBe(false);
  await expect
    .poll(async () =>
      Number(
        await reel.getByRole('progressbar', { name: 'Ход видео' }).getAttribute('aria-valuenow'),
      ),
    )
    .toBeGreaterThan(0);
  for (let i = 0; i < 8; i++) {
    await reel.getByRole('button', { name: 'Следующее видео', exact: true }).click();
    await expect(reel.locator('video')).toHaveCount(3);
    await expect
      .poll(() =>
        reel
          .locator('video')
          .evaluateAll((vs) => vs.filter((v) => !(v as HTMLVideoElement).paused).length),
      )
      .toBe(1);
    expect(
      await reel
        .locator('video[data-active="false"]')
        .evaluateAll((vs) => vs.every((v) => (v as HTMLVideoElement).paused)),
    ).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(reel).toHaveCount(0);
});

test('Data Saver plays the chosen clip without loading neighbour videos', async ({
  page,
  isMobile,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value: Object.assign(new EventTarget(), { saveData: true, effectiveType: '4g' }),
    });
  });
  const reel = await openKolomna(page, isMobile);
  await expect(reel.locator('video')).toHaveCount(1);
  await expect(reel.locator('video')).toHaveAttribute('preload', 'auto');
  await reel.getByRole('button', { name: 'Следующее видео', exact: true }).click();
  await expect(reel.locator('video')).toHaveCount(1);
  await expect
    .poll(() => reel.locator('video').evaluate((v: HTMLVideoElement) => !v.paused))
    .toBe(true);
});

test('poster stays visible while loading, then fades after the first video frame', async ({
  page,
  isMobile,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/media/videos/kolomna-kremlin.mp4', async (r) => {
    await gate;
    await r.continue();
  });
  try {
    const reel = await openKolomna(page, isMobile);
    const cover = reel.locator('.reel-slide[data-active="true"] .video-cover');
    await expect(cover).not.toHaveClass(/is-ready/);
    await expect(reel.getByRole('status')).toContainText('Загружаем видео');
    await expect(reel.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    release();
    await expect(cover).toHaveClass(/is-ready/);
    await expect(reel.getByRole('status')).toHaveCount(0);
  } finally {
    release();
  }
});

test('a map card opens the shared reel and closing restores the current place', async ({
  page,
}) => {
  await page.route('https://tiles.openfreemap.org/**', (r) => r.abort());
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Регион путешествия' }).selectOption('kolomna');
  await page
    .getByRole('button', { name: 'Показать Стены Коломенского кремля', exact: true })
    .click();
  await page.getByRole('button', { name: 'Смотреть видео', exact: true }).click();
  const reel = page.getByRole('dialog', { name: 'Видео путешествий' });
  await expect(reel.locator('video')).toHaveCount(3);
  await expect(page.locator('.active-preview')).toHaveCount(0);
  await expect(reel.locator('.reel-info-sheet')).not.toBeVisible();
  await expect(reel.getByRole('button', { name: 'Добавить в поездку', exact: true })).toBeVisible();
  await reel.locator('.reel-place-details>summary').click();
  await expect(reel.locator('.reel-info-sheet')).toContainText('Краснокирпичные стены');
  await expect(reel.getByRole('region', { name: 'Автор и происхождение видео' })).toContainText(
    'Андрей Елбаев',
  );
  await reel.getByRole('button', { name: 'Следующее видео', exact: true }).click();
  await expect(reel.locator('.reel-info-sheet')).not.toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.active-preview h2')).toHaveText('Улица Лажечникова');
  await expect(page.getByRole('button', { name: 'Смотреть видео', exact: true })).toBeFocused();
});

test('one- and two-clip feeds use poster mirrors without duplicate players', async ({
  page,
  isMobile,
}) => {
  await page.route('https://tiles.openfreemap.org/**', (r) => r.abort());
  let count = 1;
  await page.route('**/api/places', (r) =>
    r.fulfill({
      json: {
        places: Array.from({ length: count }, (_, i) => ({
          id: `buffer-test-${i}`,
          name: `Проверка буфера ${i + 1}`,
          description: 'Тестовое место для проверки окна видео.',
          city: 'Тест',
          region: 'Карелия',
          category: 'Природа',
          latitude: 61.9,
          longitude: 34.5,
          visitMinutes: 30,
          thumbnailUrl: '/media/fallback.svg',
          video: {
            sourceType: 'upload',
            playbackUrl: `/media/videos/${i === 0 ? 'kivach' : 'suisaari'}.mp4`,
          },
        })),
      },
    }),
  );
  for (count = 1; count <= 2; count++) {
    await page.goto('/');
    if (isMobile) await page.getByRole('button', { name: 'Лента', exact: true }).click();
    await page.getByRole('textbox', { name: 'Поиск по городу и региону' }).fill('Проверка буфера');
    await page.getByRole('button', { name: 'Открыть Проверка буфера 1', exact: true }).click();
    const reel = page.getByRole('dialog', { name: 'Видео путешествий' });
    await expect(reel.locator('video')).toHaveCount(count);
    for (let i = 0; i < 3; i++) {
      await reel.getByRole('button', { name: 'Следующее видео', exact: true }).click();
      await expect(reel.locator('video')).toHaveCount(count);
      await expect
        .poll(() =>
          reel
            .locator('video')
            .evaluateAll((vs) => vs.filter((v) => !(v as HTMLVideoElement).paused).length),
        )
        .toBe(1);
    }
    await page.keyboard.press('Escape');
  }
});

test('a failed clip keeps its poster and can be retried', async ({ page, isMobile }) => {
  let fail = true;
  await page.route('**/media/videos/kolomna-kremlin.mp4', (r) => (fail ? r.abort() : r.continue()));
  const reel = await openKolomna(page, isMobile);
  await expect(reel.getByRole('alert')).toContainText('Видео не загрузилось');
  fail = false;
  await reel.getByRole('button', { name: 'Повторить', exact: true }).click();
  await expect(reel.getByRole('alert')).toHaveCount(0);
  await expect(reel.locator('.reel-slide[data-active="true"] .video-cover')).toHaveClass(
    /is-ready/,
  );
  await expect
    .poll(() =>
      reel
        .locator('video')
        .evaluateAll((vs) => vs.filter((v) => !(v as HTMLVideoElement).paused).length),
    )
    .toBe(1);
});
