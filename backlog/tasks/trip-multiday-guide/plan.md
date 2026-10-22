# План: weekend-гид маршрута (отели, еда, 2GIS, видеоотчёт)

Дата плана: 22 октября 2026 (обновлён вечером по решениям пользователя). Код приложения планировщиком не менялся.

## 1. Понимание запроса

Пользователь хочет переработать планировщик на `/trip`, чтобы:

1. **Выходные.** Укладывать выбранные остановки в сценарий **одних выходных** (типично 1–2 дневных сегмента; при overnight — предложения отелей у вечерней точки), с **оптимизацией порядка** и **2–3 вариантами** плана.
2. **Еда.** По ходу каждого дня — предложения завтрака / обеда / ужина.
3. **«Заодно увидеть».** Доп. места из **каталога продукта** по пути, опционально добавить.
4. **Отчёт.** Красивый визуальный отчёт из видео и описаний на `/trip`: где сейчас, куда дальше (без share/export в этой задаче).
5. **Транспорт и 2GIS.** Серверный Places + Routing 2GIS (ключ уже в Vercel); смена режима **полностью пересчитывает** путь, варианты, отели, еду и доп. места. Навигация наружу — **и Яндекс, и 2GIS**.

Контекст продукта: Weekend Explorer — video-first / map-first. Регионы Карелия и Подмосковье; UI русский, светлая тема, desktop + mobile.

## 2. Что есть сейчас (факт по коду)

| Область | Состояние |
| --- | --- |
| Страница | `/trip` → выбор города → `TripPanel` (`components/trip-page.tsx`, `components/trip-panel.tsx`) |
| День | Один оконный день `daySettings` (start/end); `lib/day-plan.ts` считает arrival/departure из `visitMinutes` + leg.duration; при переполнении — предупреждение, **авторазбиения на дни нет**, **вариантов weekend нет** |
| `durationDays` | В store/API 1–2; UI поездки часто пишет «один день» |
| Транспорт | `car` / `walk` / `transit`; смена режима инвалидирует маршрут и пересобирает |
| Routing | `POST /api/route` → OSRM или straight; transit без OSRM, Яндекс-ссылки |
| Навигация наружу | Только Яндекс (`lib/yandex-route.ts`) |
| Карта 2GIS | MapGL JS через `NEXT_PUBLIC_DGIS_MAP_KEY`; без ключа — MapLibre overview |
| Серверный 2GIS в коде | **Ещё не подключён** (нет proxy Places/Routing). **Ключ на Vercel есть** (решение пользователя); в чат не запрашивать. Env: `DGIS_API_KEY` (предпочтительно) и/или фактическое имя уже заданное в Vercel — оба имени задокументировать в комментариях `.env.example` |
| Рекомендации | `lib/recommendations.ts`: до 3 видеомест каталога вдоль OSRM |
| Отели / кафе | Категории есть; демо пустое; вымышленных POI нет |
| Видеоотчёт | Текст + `TripCover`; нет visual day report |

## 3. Разрыв относительно запроса

| Требование | Сейчас | Разрыв |
| --- | --- | --- |
| Уложить в выходные + варианты | Один день + overflow | Нужны optimize + 2–3 weekend variants (1–2 дня) |
| Отели у вечера | Нет | Places (с fallback links); выбор не обязателен |
| Завтрак / обед / ужин | Нет | Meal slots + Places / links |
| Доп. места по пути | Частично (каталог) | Встроить в варианты/дни; **только каталог** |
| Красивый отчёт из видео | Текст | Visual report на `/trip` |
| 2GIS routing + динамика | MapGL + OSRM + только Яндекс | Server Routing/Places + обе навигации |
| Динамический пересчёт | Частично route | Полный pipeline вариантов/POI от mode |

## 4. Границы этой итерации vs позже

### Входит в эту итерацию (M1–M6 + weekend variants)

Цель: weekend-гид на `/trip` с оптимизацией, 2–3 вариантами плана, днями Sat–Sun style, отелями/едой, suggest-along из каталога, video report, серверным 2GIS Places+Routing и честными fallbacks.

1. **Оптимизация порядка** (существующий nearest-neighbour / refine) как явный шаг «чтобы успеть за выходные».
2. **2–3 варианта weekend-плана** для одного набора остановок и текущего `transportMode`:
   - типично **1 день** (всё в одном day window) и/или **2 дня** (overnight между сегментами);
   - при необходимости overnight в рамках weekend — до **2 ночёвок** только если иначе не уложить (редкий edge; не позиционировать как «тур на неделю»);
   - если точки **нельзя** уложить даже в 2 дня при текущем окне — честное сообщение + предложение убрать остановки / сузить набор / сменить режим; **не** строить 3–7-дневный тур.
3. **Разбиение сегмента на дни** по `visitMinutes` + travel (если известно) + `start`/`end`. Вечерняя точка = последняя остановка дня перед overnight.
4. **Degraded без travel time (подтверждено: A):** pack по сумме `visitMinutes` в бюджет дня; travel не выдумывать; UI: время в пути неизвестно, дни ориентировочные по посещениям.
5. **Отели:** несколько предложений у вечерней точки (Places при ключе; иначе search-links Яндекс+2GIS). **Выбор отеля не обязателен.**
6. **Еда:** слоты завтрак/обед/ужин; Places при ключе + catalog «Кафе» / links fallback. Без меню/цен/часов как факта.
7. **«Заодно увидеть»:** только места **каталога продукта** (как `recommendationCandidates`); не 2GIS attractions в этой задаче.
8. **Visual day report** только на `/trip` после выбора/построения варианта; без share/export отдельной ссылки (существующий JSON download поездки можно сохранить как есть, не расширять в «красивый шаринг»).
9. **Навигация:** для переходов и целых частей — **и Яндекс, и 2GIS** deep/web links (оба набора).
10. **M5 Places + M6 Routing в этой же итерации:** server env, proxy API; на Vercel ключ есть; **локально без ключа** — OSRM/straight + link fallbacks, UI не падает и не врёт что POI «из 2GIS».
11. **Смена транспорта** → полный пересчёт route, variants, hotels, meals, suggestions.
12. **Карта:** MapGL линия при `NEXT_PUBLIC_DGIS_MAP_KEY`; geometry из 2GIS Routing когда доступен, иначе OSRM/straight.

### Env / секреты (обязательно для developer)

- Предпочтительное имя: `DGIS_API_KEY` (server-only, не `NEXT_PUBLIC_*`).
- В комментариях `.env.example` указать: если в Vercel уже задано другое имя серверного ключа 2GIS — читать его же в коде **или** завести alias; не требовать ключ в чате.
- MapGL остаётся `NEXT_PUBLIC_DGIS_MAP_KEY` (отдельный браузерный ключ).
- Никогда не логировать и не коммитить значения ключей.

### Вне этой итерации

- Бронирования, цены, наличие номеров, меню, живые рейсы ОТ внутри приложения.
- Share/export «красивого отчёта» отдельной публичной ссылкой.
- Многодневные туры > weekend (3+ дня как продукт).
- Suggest-along из 2GIS POI / attractions.
- Межрегиональный один маршрут Карелия↔Подмосковье.
- AI-агент; снятие лимита 20 остановок; новый Vercel-проект.

### Политика без ключа локально / preview

- Pipeline работает: variants + report + Yandex/2GIS **nav links** + OSRM/straight.
- Hotels/meals без Places: честные search-link карточки / catalog café, подпись что каталог 2GIS недоступен локально.
- Routing без ключа: текущий OSRM/transit policy; при появлении ключа — предпочитать 2GIS Routing с fallback на OSRM.

## 5. Архитектура (weekend variants)

```text
Stops + TransportMode + DayWindow (start/end)
        │
        ▼
   optimizeOrder(stops)                    ← явная оптимизация под weekend
        │
        ▼
   POST /api/route  (2GIS Routing | OSRM | straight | transit-policy)
        │
        ▼
   weekendVariants(ordered, route, window) ← NEW: 2–3 плана
        │  Variant A: 1-day if fits
        │  Variant B: 2-day split (greedy pack) if overnight needed
        │  Variant C: alternate split / tighterier order tweak (optional 3rd)
        │  each: daySegments[], evening anchors, fitStatus
        ▼
   enrichVariant(variant)                  ← Places hotels/meals | link fallback
        │  suggestAlong per day ← product catalog only
        ▼
   Trip UI: выбрать вариант → Visual weekend report на /trip
        │  Yandex + 2GIS nav links на переходах/частях
        ▼
   Mode / stops change → invalidate → full pipeline
```

### 5.1 Weekend variants (вместо «max 7 дней»)

Вход: упорядоченные (и опционально отдельно «как выбрал пользователь») остановки, `RouteResult`, day window.

Для каждого кандидата варианта:

1. **Fit-check 1 day:** жадный pack в один сегмент; если все точки входят в `[start, end]` с travel+visit (или visit-only degraded) → вариант «Один день».
2. **Split 2 days:** жадный pack; закрывать день при `cursor + cost > end`; overnight после evening; день 2 с `start`. Если остатки не влезают во второй день → `fitStatus: overflow` для этого варианта.
3. **Третий вариант (если осмыслен):** например порядок пользователя без optimize vs optimized; или более «плотный» / «спокойный» split (раньше/позже overnight), без третьего календарного дня тура. Если второй осмысленный вариант не отличается — показать 2, не плодить клоны.

Правила:

- Не предлагать планы на 3+ дня как нормальный продукт; max сегментов в UI weekend = **2 дня** (+ честный overflow если не влезло).
- `durationDays` для save/API: 1 или 2 по выбранному варианту (уже совместимо с max 2).
- Лимит остановок: по-прежнему ≤20.
- Острова / inaccessible: честный straight message; не выдумывать паром.

**Degraded (нет duration) — подтверждено A:** в бюджете дня учитывать только `visitMinutes`; travel=0 в pack; копирайт: путь/ETA неизвестны, раскладка по длительности посещений ориентировочная.

### 5.2 Отели

- Якорь: `eveningPlace` между днём 1 и 2 (если variant с overnight).
- При `DGIS_API_KEY` (или alias): `app/api/pois/hotels` → 3–5 POI (name, address, coords, 2GIS link); **без** цены/наличия если API не даёт достоверно.
- Fallback: 2–3 карточки search-links (2GIS + Яндекс) по lat/lon.
- Выбор пользователем **не обязателен**; блок информационный.

### 5.3 Еда

- Слоты: завтрак / обед / ужин относительно расписания дня или якорей first/mid/evening при неполном schedule.
- Places restaurants/café при ключе; иначе links + product `category === 'Кафе'` в радиусе.
- Пересчёт при смене варианта/режима/порядка.

### 5.4 Suggest-along-route

- Только **product catalog** (видеоместа региона/локации), corridor logic по дню.
- UI «Можно заодно» → add → полный rebuild variants.
- Transit: без ложного road-detour OSRM; geo-near stops или скрыть с пояснением (предпочтение: geo-near без заявлений о дорожном объезде).

### 5.5 Visual weekend report

- На `/trip` после выбора варианта: по дням timeline — видео/постер, описание, «вы здесь / дальше».
- Один активный плеер; desktop + mobile; video-first.
- Нет отдельного share/export отчёта.

### 5.6 Routing и навигация

| Режим | С ключом 2GIS | Без ключа (local) |
| --- | --- | --- |
| car | 2GIS Routing → geometry/ETA; fallback OSRM | OSRM → straight |
| walk | 2GIS walk если доступно; else walking OSRM/straight | walking URL / straight |
| transit | 2GIS PT **если** API реально даёт; иначе straight + внешние ссылки, без выдуманных рейсов | как сейчас: straight + внешние ссылки |

Навигация UI: для каждого перехода и для частей маршрута — кнопки/ссылки **Яндекс** и **2GIS** (helpers `yandex-route` + новый `dgis-route` / maps URL). Лимиты точек внешних URL соблюдать честно (части с пояснением), по аналогии с Яндекс parts.

Динамика: `buildWeekendGuide(mode)` после `/api/route` + `/api/pois/*`.

## 6. Источники данных и fallbacks

| Данные | С ключом | Fallback без ключа |
| --- | --- | --- |
| Порядок / visit | Store + `Place.visitMinutes` | то же |
| Путь / ETA | 2GIS Routing | OSRM → straight, null duration |
| Линия на карте | coordinates → MapGL | overview / OSRM line |
| Навигация | Яндекс **и** 2GIS links | те же link helpers (не требуют server key) |
| Отели | 2GIS Places | search-links Яндекс+2GIS |
| Еда | 2GIS Places ± catalog café | links ± catalog café |
| Доп. места | Product catalog only | то же |
| Видеоотчёт | demo/server/custom media | постер |

Секреты: не в backlog/отчёты/чат; только Vercel / `.env.local`.

## 7. Упорядоченные мини-задачи для `/developer`

Одна итерация: **M1–M6**, затем проверки. Зависимости сверху вниз.

1. **M1 — Weekend model + variants + unit-тесты.**  
   `lib/weekend-plan.ts` (или рядом с `day-plan.ts`): optimize hook, greedy day pack, degraded visit-only (A), генерация **2–3 variants** (1-day / 2-day / alternate), `fitStatus`, evening anchors, отказ от 3+ дневных туров. Фикстуры: всё влезает в 1 день; нужен overnight → 2 дня; не влезает в 2 дня → overflow; null travel.  
   *Блокеров нет.*

2. **M2 — Env + 2GIS server client skeleton.**  
   Документировать в `.env.example`: `DGIS_API_KEY` и комментарий про возможное фактическое имя в Vercel / alias. Читать server-only; never expose. Общий helper fetch с timeout, без логирования ключа.  
   *Блокеров нет (ключ в чат не нужен).*

3. **M3 — M6 Routing: `/api/route` provider.**  
   При наличии ключа — 2GIS Routing по mode; иначе текущий OSRM/transit/straight. Нормализовать legs/geometry/instructions в существующий `RouteResult` (+ source tag вроде `dgis`|`osrm`|`straight`). Fixture/contract tests без платных live-вызовов.  
   *Зависит от M2.*

4. **M4 — M5 Places: `/api/pois` hotels + meals.**  
   Proxy к 2GIS Places; normalize name/address/coords/link; 3–5 hotels у lat/lon; meals по слоту/точке. Без ключа — 200 с пустым `items` + `fallback: 'links'` или клиент сам строит links. Unit на normalize/fixture.  
   *Зависит от M2; можно после/параллельно M3 по разным файлам.*

5. **M5 — Интеграция variants UI на `/trip`.**  
   После build: показать 2–3 варианта (кратко: дни, умещается ли, overnight), выбор варианта, секции дней, invalidate при mode/stops. Hotels (Places или links), meals slots; выбор отеля не обязателен. Mobile одна колонка. Save/`durationDays` = 1|2.  
   *Зависит от M1, M3, M4.*

6. **M6 — Suggest-along (catalog) + visual report + dual nav links.**  
   Рекомендации только из каталога по дням выбранного варианта; video weekend report на `/trip`; ссылки **Яндекс и 2GIS** на переходах/частях; один активный preview. E2E trip-page / day-planner / новые weekend scenarios.  
   *Зависит от M5.*

7. **M7 — Проверки и `implementation.md`.**  
   lint, typecheck, unit, e2e; скриншоты desktop/mobile; явно: работало ли с ключом локально или только fallback; не печатать секреты.  
   *Зависит от M6.*

8. **M8 — Независимое QA `/tester`.**  
   По §8; PASS/FAIL/BLOCKED.  
   *Зависит от M7.*

## 8. Критерии приёмки (desktop + mobile)

1. После построения пользователь видит **2–3 различимых weekend-варианта** (или честно меньше, если клоны бессмысленны) с кратким отличием (1 день vs 2 дня / порядок); нет позиционирования как тур на много дней.
2. Короткий набор остановок даёт вариант **одного дня**; набор с overnight — вариант **двух дней** с подписанной вечерней точкой; если не влезает в 2 дня при window — понятный overflow и призыв убрать точки / сменить режим, без 3-дневного тура.
3. Есть явное действие/шаг **оптимизации порядка** (или вариант «оптимизированный»), помогающий уложить выходные; ручной порядок пользователя не теряется без возможности вернуться (хотя бы как один из вариантов или undo через текущий reorder).
4. Degraded (нет travel): pack по `visitMinutes`, честный копирайт; не выдумывается ETA.
5. У overnight-варианта блок отелей: **несколько** предложений у вечера (Places и/или links); **выбор не обязателен** для продолжения просмотра отчёта.
6. У каждого дня слоты завтрак/обед/ужин (или честное «недоступно») с Places/links/catalog café; без цен/меню как факта.
7. «Заодно увидеть» — только каталог продукта; add пересобирает variants; без 2GIS attractions.
8. Visual report на `/trip` по выбранному варианту: видео/постер + описание + «куда дальше»; desktop 1440×1000 и mobile iPhone 13; без обязательного share/export отчёта.
9. На переходах/частях маршрута доступны ссылки **и Яндекс, и 2GIS**; лимиты внешних URL объяснены при разбиении на части.
10. Переключение car ↔ walk ↔ transit сбрасывает guide и пересчитывает route, variants, hotels, meals, suggestions; stale responses не применяются.
11. При наличии server key: Places/Routing используются (проверяемо fixture или env-gated live без утечки секрета). Без ключа локально: OSRM/link fallbacks, приложение не падает, UI не выдаёт пустые карточки за «подтверждённые отели 2GIS».
12. MapGL при `NEXT_PUBLIC_DGIS_MAP_KEY` показывает линию; без него overview жив.
13. Нет заявлений о бронях, живых рейсах ОТ, меню; transit честен.
14. lint/typecheck/unit/релевантные E2E зелёные; build (webpack при необходимости) проходит.

## 9. Вопросы координатору / пользователю

| # | Тема | Статус |
| --- | --- | --- |
| 1 | Серверный ключ 2GIS (не MapGL) | **Решено:** есть в Vercel; в чат не просить; env `DGIS_API_KEY` + document alias/имя из Vercel в `.env.example` |
| 2 | Degraded без travel | **Решено:** option A — pack по `visitMinutes` + честный UI |
| 3 | Горизонт дней | **Решено:** фокус **одни выходные**, 2–3 варианта (1–2 дня), не max 7 |
| 4 | Отели | **Решено:** несколько предложений; выбор не обязателен; Places + link fallback |
| 5 | Suggest-along | **Решено:** только каталог продукта |
| 6 | Отчёт | **Решено:** только `/trip`, без share/export |
| 7 | Навигация | **Решено:** и Яндекс, и 2GIS |
| 8 | M5/M6 в этой итерации | **Решено:** да, с OSRM/link fallbacks без локального ключа |

**Остаточных блокирующих вопросов к пользователю нет.** Единственный операционный риск для developer: подобрать фактическое имя server env в Vercel при чтении ключа (через `DGIS_API_KEY` и документированный fallback alias) — без запроса значения ключа в чат.

## 10. Риски

- Имя env в Vercel ≠ `DGIS_API_KEY` → читать alias; не блокировать чатом.
- 2GIS PT API может не покрывать transit так, как ожидает UX → сохранить внешние Яндекс+2GIS links, не выдумывать рейсы.
- Карелия: вода/straight → degraded variants грубее.
- Публичный OSRM rate limits при suggest-along × variants → лимит кандидатов/кеш.
- Video report на mobile — один активный плеер.
- Places без цен легко перепутать с «можно забронировать» — копирайт.

## 11. Вне scope

- Бронирования, оплата, аккаунты, модерация.
- Вымышленные POI, цены, меню, рейсы.
- Share/export красивого отчёта; туры на 3+ дня.
- 2GIS attractions в suggest-along.
- Скачивание чужих видео; новый Vercel-проект.
- Ключ в чате; коммит секретов.
- Коммит/push/deploy — после PASS по HANDOFF.

## 12. Затронутые модули (ориентир)

`lib/day-plan.ts`, новый weekend/variants helper, `lib/recommendations.ts`, `lib/yandex-route.ts`, `lib/dgis-route.ts` (new), `lib/dgis-client.ts` (new), `lib/types.ts`, `lib/store.ts`, `components/trip-panel.tsx`, `components/trip-page.tsx`, guide/report UI, `app/api/route/route.ts`, `app/api/pois/*` (new), `.env.example`, tests unit/e2e.

## 13. Рекомендуемый slice одной итерации

**Вся поставка сразу: M1–M6** (weekend variants + optimize, UI, Places, Routing, catalog suggest-along, visual report, dual Yandex+2GIS nav) **+ M7/M8** проверки.

Не откладывать M5/M6: ключ на Vercel подтверждён; локально обязательны честные OSRM/link fallbacks.

После PASS: пользователь видит на `/trip` варианты выходных с видеоотчётом, отелями/едой и навигацией в оба сервиса; ограничения degraded/fallback явно подписаны.
