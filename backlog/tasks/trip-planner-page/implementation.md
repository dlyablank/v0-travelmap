# Реализация

## Изменения

- Все входы в «Моя поездка» ведут на отдельную `/trip`. Прямой URL, загрузка мест, hydration, старые поездки, разделение по локациям, сохранённое, начало/конец дня и порядок поддерживаются существующим store. Метаданные мест из видео/карты сохраняются при добавлении в поездку. Можно вернуться в каталог и открыть конкретную остановку на карте.
- Удалён весь блок `.map-nudge` с обеими заданными надписями.
- Ручного выбора времени на месте нет. `dayPlan`, расписание и JSON используют только `Place.visitMinutes`; legacy overrides игнорируются. В интерфейсе указано, что это ориентировочная редакционная оценка, а не измеренная статистика.
- Итог показывает старт, финиш, все описания остановок, посещения и N−1 переходов с обоими названиями и способом передвижения. OSRM API запрашивает steps и нормализует подтверждённые манёвры/названия дорог; неизвестные манёвры не превращаются в выдуманные повороты.
- Добавлен общественный транспорт во все типы, настройки, API, серверное сохранение и JSON. Transit никогда не обращается к driving/walking provider, не выдумывает рейсы/время и даёт ссылки на актуальные варианты и пересадки для каждой пары остановок. Рекомендации дорожных заездов для transit исключены.
- Яндекс ссылки используют `rtext=latitude,longitude~…`, `rtt=auto|pd|mt`. Для 11–20 точек маршрут разделён на части до 10 точек с общей границей; UI объясняет лимит и подписывает диапазоны. Есть ссылки для каждого перехода. Координаты и порядок проверены для 2/3/10/11/20 точек во всех режимах.
- Пеший путь использует только настроенный walking provider. При отсутствии провайдера, сбое либо недоступной точке сохраняется честный straight fallback: «по прямой», неизвестное время и дальнейшее расписание, внешняя ссылка. Ответы от устаревших запросов не заменяют текущий маршрут.
- Сохранились оптимизация, перестановка/удаление, максимум 20 мест, рекомендации, скачивание JSON и серверное сохранение. Prisma `transportMode` — String, миграция не нужна.
- Страница обычной прокрутки в прежних цветах и компонентах. На телефоне действия остановки расположены в ряд. `.cache/` добавлен в `.gitignore`.

## Запуск

Установить зависимости, сгенерировать Prisma (`npm run db:generate`), затем `npm run dev`. В текущей Windows-среде системный npm отсутствует; использован runtime Node 24.19.0:

```powershell
$env:PATH = 'C:/Users/dlyab/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin;' + $env:PATH
$env:NEXT_TELEMETRY_DISABLED = '1'
node node_modules/next/dist/bin/next build --webpack
node node_modules/next/dist/bin/next start --hostname 0.0.0.0
```

Результат: http://localhost:3000/trip ; каталог: http://localhost:3000/ . Для QA оставлен production сервер вне сетевой песочницы; процесс указан в status.md. Не запускать build одновременно с сервером в этой рабочей копии.

## Проверки разработчика

- Прочитаны локальные Next 16.4.2 docs про layouts/pages, navigation и client/server components после установки зависимостей (до установки docs отсутствовали).
- `node node_modules/tsx/dist/cli.mjs scripts/generate-client.ts` — успешно; Prisma client с WASM compiler.
- `node node_modules/typescript/bin/tsc --noEmit` — успешно после генерации клиента (первый запуск до генерации показывал отсутствующий PrismaClient).
- `node node_modules/eslint/bin/eslint.js .` — успешно. Первые временные implementation scripts, попавшие в анализ `.cache`, удалены; проверки не отключались.
- `node node_modules/vitest/vitest.mjs run` — 43/43, 6 файлов. Включены legacy duration, unknown schedule, store location migration, routing API walking steps/fallback/transit без fetch, сохранение transit и порядка через mock DB, части ссылок Яндекса.
- `node node_modules/next/dist/bin/next build` (Turbopack) — ошибка среды: `Failed to write app endpoint /page`, CSS `maplibre-gl.css`, child node process exited before connection. Повтор вне sandbox показал ту же ошибку. Отдельный запуск без отключения telemetry столкнулся с EXDEV при записи внешнего Next config.
- `node node_modules/next/dist/bin/next build --webpack` — успешно вне sandbox, включая TypeScript и построение `/trip`. Первая sandbox попытка получила EPERM создания `.next/static/chunks/app/api/route`; повтор вне sandbox успешен. Финальная сборка после CSS исправления также успешна.
- Browser E2E: `CHROMIUM_PATH='C:/Program Files/Google/Chrome/Application/chrome.exe'`, `node node_modules/@playwright/test/cli.js test tests/e2e/trip-page.spec.ts tests/e2e/day-planner.spec.ts tests/e2e/journey-ui.spec.ts tests/e2e/regions.spec.ts` (вне sandbox). Финальный результат: **16/16 успешно**, 1.1 минуты. Desktop 1440×1000, mobile iPhone 13, актуальная production сборка после CSS исправления.
- Первый browser прогон: 11/16. Четыре ошибки новых тестов: неоднозначный alert из-за Next route announcer; селекторы ограничены main. Journey mobile требовал переключения «Лента» после возврата на новую страницу каталога; тест адаптирован. По скриншотам исправлена вертикальная компоновка действий mobile; затем выполнена новая production сборка.
- Скриншоты страницы и итога: `developer-desktop.png`, `developer-mobile.png`, `full-walk-desktop.png`, `full-walk-mobile.png` в этой папке. Desktop и mobile осмотрены разработчиком; проверяется отсутствие горизонтального overflow.

## Первичные источники

- [Официальные URL Яндекс Карт](https://yandex.com/dev/yandex-apps-launch-maps/doc/en/concepts/yandexmaps-web): широта/долгота в rtext и auto/mt/pd в rtt.
- [Официальная справка маршрутов](https://yandex.ru/support/maps/ru/concept/rout): не более восьми добавленных точек (10 с началом и концом).

## Ограничения проверки

Живая PostgreSQL и настоящее сохранение в БД не проверялись; API-порядок/режим проверены с mock DB, честная локальная копия — в браузере. Online walking provider не настроен и его реальное покрытие не проверено; подтверждены fixture instructions и fallback. Актуальные рейсы доступны через внешний Яндекс, внутреннего поиска рейсов нет. Реальный внешний расчёт Яндекса не подтверждён браузером разработчика; проверены href/порядок/режим и первичная документация. Полный upload E2E требует внешнего storage/ffmpeg и к этой задаче не запускался. Итоговый независимый QA ещё не проведён; разработчик не выставляет приёмку.
