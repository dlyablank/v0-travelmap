# QA: weekend-гид маршрута (M8)

Дата: 22 октября 2026. Ветка: `feature/trip-weekend-guide`.  
Роль: независимый `/tester`. Код приложения не менялся.

## Вердикт: PASS

Все критерии приёмки `plan.md` §8 выполнены в доступной локальной среде (без серверного ключа 2GIS). Ограничения ниже не блокируют приёмку: честные fallbacks подтверждены; live Places/Routing на Vercel не проверялись в этой сессии.

## Чеклист vs plan.md §8

| # | Критерий | Результат | Доказательство |
| --- | --- | --- | --- |
| 1 | 2–3 различимых weekend-варианта (или честно меньше) | **PASS** | Браузер: «Один день» + «Выходные · 2 дня»; E2E `trip-weekend` ≥2 карточки |
| 2 | Короткий набор → 1 день; overnight → 2 дня + вечерняя точка; overflow без 3-дневного тура | **PASS** | Unit `weekend-plan.test.ts` (fits / overnight / overflow ≤2 дня); UI: overflow на 1-дневном при 7 точках 09:00–14:00; 2 дня с ночёвкой |
| 3 | Оптимизация порядка; ручной порядок не теряется | **PASS** | Чекбокс «Предложить порядок по близости» + подсказка про сохранение порядка; unit/variants с `optimized` / порядок пользователя |
| 4 | Degraded без travel: pack по visitMinutes, честный копирайт | **PASS** | Unit degraded; UI walk/transit: «Время в пути неизвестно…»; без выдуманного ETA |
| 5 | Отели у overnight: несколько предложений; выбор не обязателен | **PASS** | Блок «Где переночевать», вечерняя точка, 2 search-link карточки (2GIS+Яндекс), копирайт «выбор отеля не обязателен» |
| 6 | Завтрак / обед / ужин (или честное недоступно) | **PASS** | Слоты с внешним поиском «Внешний поиск»; без цен/меню как факта |
| 7 | «Заодно увидеть» — только каталог; add пересобирает | **PASS** | Заголовок «Можно заодно увидеть» / «По пути…» из catalog recommend; E2E + код `recommendations.ts` (attractions 2GIS нет) |
| 8 | Visual report на `/trip`; desktop 1440×1000 + iPhone 13 | **PASS** | `.trip-day-report` «Видеоотчёт: где вы и куда дальше»; скриншоты QA + E2E |
| 9 | Яндекс **и** 2GIS на переходах/частях | **PASS** | Ссылки «Уточнить путь в Яндекс Картах» / «Открыть путь в 2GIS» + полные «Маршрут в Яндекс Картах» / «Маршрут в 2GIS» |
| 10 | Смена car ↔ walk ↔ transit → полный пересчёт, без stale | **PASS** | Браузер: Пешком и ОТ пересобирают variants/meals; guide не падает |
| 11 | С ключом Places/Routing; без ключа — честные OSRM/links | **PASS*** | Локально `DGIS_API_KEY`/`DGIS_KEY` **отсутствуют**. `/api/pois/hotels|meals` → `fallback=links`, `items=[]`. UI: «каталог 2GIS здесь недоступен». Live Places не проверялись |
| 12 | MapGL при ключе; без — overview жив | **PASS*** | `NEXT_PUBLIC_DGIS_MAP_KEY` отсутствует; на `/` MapLibre overview (`maplibregl-map`, canvas). MapGL-линия не проверялась (нет ключа) |
| 13 | Нет броней / живых рейсов / меню; transit честен | **PASS** | Нет fake schedule; ОТ — внешние ссылки/пересадки; отели без цен/наличия |
| 14 | lint / typecheck / unit / релевантные E2E / build | **PASS*** | lint OK; typecheck OK; unit weekend+route+dgis+yandex 33/33; E2E trip-page+trip-weekend **8/8**. `next build` в этой сессии не повторялся (чтобы не конфликтовать с живым `.next`); developer M7: build OK |

\* с оговоркой среды (нет ключей / build не перезапускался).

## Автотесты (эта сессия)

```text
vitest: weekend-plan, route-api, dgis-route, yandex-route — 33 passed
playwright: trip-page.spec.ts + trip-weekend.spec.ts — 8 passed (desktop + mobile/iPhone 13)
eslint: OK
tsc --noEmit: OK
```

## Браузер

- Сервер: `http://127.0.0.1:3000` (уже запущен).
- Сценарий: Коломна, 7 остановок, окно 09:00–14:00 → «Собрать маршрут».
- Desktop viewport 1440×1000; mobile Emulation iPhone 13 (390×844, touch).
- Режимы: авто → пешком → ОТ — guide пересобирается; dual nav сохраняется.

## Env / секреты

| Проверка | Значение |
| --- | --- |
| `DGIS_API_KEY` / `DGIS_KEY` в `.env.local` | **нет** |
| `NEXT_PUBLIC_DGIS_MAP_KEY` | **нет** |
| Значения ключей | не запрашивались и не печатались |

POI API (без ключа): `fallback=links`, пустой `items` — ожидаемо и честно.

## Скриншоты

| Файл | Источник |
| --- | --- |
| `weekend-desktop.png` / `weekend-mobile.png` | E2E `trip-weekend` (перезаписаны при прогоне QA) |
| `qa-weekend-desktop.png` / `qa-weekend-mobile.png` | Ручной браузерный QA (variants + overflow + selected 2-day) |

## Ограничения

1. Live 2GIS Places/Routing с серверным ключом **не** проверялись локально — ключа нет; на Vercel ожидается при деплое.
2. MapGL polyline с браузерным ключом не проверялась; без ключа подтверждён MapLibre overview на главной.
3. Production `next build` в этой сессии не гонялся (живой dev server).
4. Safari / реальный iOS не проверялись (HANDOFF: Chromium desktop + iPhone 13 emulation).
5. Полный ручной клик «добавить suggest-along → rebuild» не отделён от E2E/кода; блок каталога на UI виден.

## Как воспроизвести

```sh
# PATH с Node 24
npm run dev   # или уже работающий localhost:3000
# /trip → город Коломна → ≥5 остановок, окно дня короткое → «Собрать маршрут»
# выбрать «Выходные · 2 дня» → отели/еда/видеоотчёт/Яндекс+2GIS
# переключить Пешком / ОТ → guide пересчитывается

npm test -- tests/weekend-plan.test.ts tests/route-api.test.ts tests/dgis-route.test.ts tests/yandex-route.test.ts
npx playwright test tests/e2e/trip-page.spec.ts tests/e2e/trip-weekend.spec.ts
```
