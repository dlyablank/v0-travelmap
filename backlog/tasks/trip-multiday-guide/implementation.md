# Implementation: weekend-гид маршрута (M1–M7)

Дата: 22 октября 2026. Ветка: `feature/trip-weekend-guide`.

## Что сделано

### M1 — Weekend model
- `lib/weekend-plan.ts`: optimize hook, greedy pack, degraded visit-only (A), 2–3 варианта (1 день / 2 дня / порядок пользователя), `fitStatus`, evening anchors, без туров на 3+ дня.
- При force 2 дня, если всё ещё влезает в один, делается mid-split для отличимого «спокойного» варианта.
- Unit: `tests/weekend-plan.test.ts`.

### M2 — Env + 2GIS client
- `.env.example`: `DGIS_API_KEY` (предпочтительно) и alias `DGIS_KEY` (если так уже задано в Vercel).
- `lib/dgis-client.ts`: чтение ключа, `dgisFetch` с timeout, без логирования значения ключа.

### M3 — Routing provider
- `lib/dgis-routing.ts` + normalize в `lib/dgis-route.ts`.
- `POST /api/route`: при ключе — 2GIS (car/walk/transit), иначе OSRM / straight / transit-policy как раньше.
- `RouteResult.source` расширен: `'dgis' | 'osrm' | 'straight'`.
- Fixture-тесты в `tests/route-api.test.ts`, `tests/dgis-route.test.ts` (без live-вызовов с секретом).

### M4 — Places hotels/meals
- `GET /api/pois/hotels`, `GET /api/pois/meals`.
- Без ключа: `{ items: [], fallback: 'links' }`; клиент показывает search-links Яндекс+2GIS.
- Normalize: `lib/dgis-places.ts`.

### M5 — Variants UI на `/trip`
- `components/weekend-variants.tsx`, интеграция в `components/trip-panel.tsx`.
- Выбор варианта, секции дней, отели (необязательный выбор), слоты еды, `durationDays` 1|2 в save/store.
- Смена mode/stops инвалидирует guide и пересобирает pipeline.

### M6 — Suggest-along + report + dual nav
- Catalog-only recommend: `lib/recommendations.ts` (corridor для osrm/dgis; geo-near для transit/straight).
- `components/trip-day-report.tsx` — video report на `/trip`, один активный плеер.
- Навигация: Яндекс (`lib/yandex-route.ts`) + 2GIS (`dgisRoute` / `dgisRouteParts`).
- E2E: обновлён `tests/e2e/trip-page.spec.ts`, добавлен `tests/e2e/trip-weekend.spec.ts`.
- Скриншоты: `backlog/tasks/trip-multiday-guide/weekend-desktop.png`, `weekend-mobile.png`.

### M7 — Проверки
- lint: OK
- typecheck: OK
- unit: 68 passed (11 files; после добавления 6-го weekend-теста — полный suite зелёный)
- e2e trip-page + trip-weekend: 8 passed (desktop + mobile)
- build: `next build --webpack` OK
- Локально серверный `DGIS_API_KEY` / `DGIS_KEY` **не использовался** в этой среде — проверены OSRM/fixture + link fallbacks. Ключ в чат не запрашивался и не логировался.

## Как проверить локально

```sh
# PATH с Node 24
npm ci
npm run db:generate
npm run dev
# открыть /trip?city=… с ≥2 остановками → «Собрать маршрут»
```

Опционально в `.env.local` (не коммитить):

```
DGIS_API_KEY=...
# или DGIS_KEY=...
NEXT_PUBLIC_DGIS_MAP_KEY=...
```

Без server key: варианты, отчёт, Yandex+2GIS nav links, OSRM/straight; отели/еда — внешние search-links + кафе каталога.

## Env

| Имя | Назначение |
| --- | --- |
| `DGIS_API_KEY` | Server Places + Routing (предпочтительно) |
| `DGIS_KEY` | Alias, если так уже названо в Vercel |
| `NEXT_PUBLIC_DGIS_MAP_KEY` | Браузерный MapGL (как раньше) |
| `ROUTING_URL` / `WALKING_ROUTING_URL` | OSRM fallback |

## Известные ограничения

- Transit 2GIS PT используется только при успешном ответе API; иначе straight + внешние ссылки, без выдуманных рейсов.
- Нет цен/наличия отелей, меню, живых расписаний ОТ.
- Suggest-along только из каталога продукта.
- Нет share/export «красивого» отчёта.
- Next guides в `node_modules/next/dist/docs/` в этой среде отсутствовали; следовали существующим App Router patterns репозитория.

## Затронутые модули

`lib/weekend-plan.ts`, `lib/dgis-*.ts`, `lib/types.ts`, `lib/recommendations.ts`, `lib/day-plan.ts` (без ломающих изменений API), `app/api/route`, `app/api/pois/*`, `components/trip-panel.tsx`, weekend/hotels/meals/report UI, `components/trip-cover.tsx`, `components/trip-recommendations.tsx`, `.env.example`, `app/globals.css`, tests.
