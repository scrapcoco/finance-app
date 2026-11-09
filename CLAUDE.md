# Финансы — PWA учёта доходов, расходов, платежей и долгов

Vanilla HTML/CSS/JS, **без сборки и без npm**. Бэкенд — PocketBase на `https://api.hardpointcyber.club`
(Oracle Cloud, nginx + certbot, тот же сервер, что hardpoint-bot). Деплой: push в `main` → Netlify (~30 с).
Интерфейс на русском, валюта zł. Макеты: https://claude.ai/artifact/6vHQMiDj8gsHPc7NrhBvp9

## Файлы

- `index.html` — оболочка: `#view`, `#tabbar`, `#sheet-root`, `#toast`; подключает `config.js`, SDK и `js/main.js` (ES-модуль)
- `js/config.js` — `window.APP_CONFIG`: `PB_URL`, `CURRENCY`, `LOCALE`, `VAPID_PUBLIC_KEY`
- `js/pocketbase.umd.js` — SDK PocketBase v0.28.1 (глобальный `PocketBase`), не трогать
- `css/app.css` — стили, цвета в CSS-переменных (`--ink`, `--soft`, `--muted`, `--inc`, `--exp`, `--line`)
- `sw.js` — кэш оболочки (network-first), push и клик по уведомлению
- `manifest.webmanifest`, `icons/`, `netlify.toml`
- `server/` — копия серверной части (напоминания, systemd, миграции PocketBase); Netlify её не использует

## Карта `js/` (ES-модули, без сборки)

| Файл | Что внутри |
|---|---|
| `main.js` | точка входа: `hashchange` → `render`, `authRefresh`, регистрация `sw.js` |
| `router.js` | `ROUTES` (имя маршрута → функция экрана), `render`, нижнее меню `TABS` |
| `ui.js` | `$view`/`$tabbar`/`$sheetRoot`, `toast`, `errText`, `openSheet`/`closeSheet`, `txRow`, `monthSwitch` |
| `core/pb.js` | `CFG`, `pb`, `uid`, `ownerFilter` |
| `core/util.js` | `esc`, деньги (`money`, `signed`, `parseAmount`), даты (`ymd`, `parseYmd`, `pbDate`, `nextOccurrence`), месяцы, подписи |
| `core/icons.js` | `ICON` — inline SVG |
| `core/state.js` | `state`: выбранный месяц/день/период/фильтры + `state.cache` справочников |
| `core/data.js` | книги (`BOOKS`, `curBook`, `bookOf`, `bookFilter`, `withBook`), `getCats/getFields/getDebts/getProjects` (кэш), `txBetween`, `ensureDefaults(book)`, `markPaid`, `bumpDebtDue`, `getBalance` |
| `screens/login.js` | вход, регистрация по инвайт-коду, `termsSheet`, `COPYRIGHT` |
| `core/tasks.js` | дела: `TASK_REPEAT`, `TASK_REMIND`, `taskDay`, `byTime`, `tasksBetween`, `overdueTasks`, `somedayTasks`, `nextTaskDay`, `newTask`, `completeTask` (у повторяющегося создаёт следующее, возвращает «Отменить»), `timeLeft`, `isMissingCollection` |
| `screens/home.js` | `homeScreen`: баланс (нажатие → «Обзор», карандаш → `cashSheet`) и «Не пропустить» — платежи по завтра включительно и до двух ближайших дел со временем, остальное ссылкой; если срочного нет — под балансом пусто. Списков записей на главной нет. Карточки: «Не хватит N zł к дате» (платежи 7 дней > денег на руках, без ИИ) и «Итоги недели» (`POST /api/finance/review` раз в неделю, кэш в localStorage `asstReview`, ✕ скрывает) |
| `screens/tasks.js` | `tasksScreen` («Дела»: неделя, быстрое добавление, «Вчера остались…» → перенести/отложить, дела дня, «Сделано · N», «Когда-нибудь»), `taskSheet` (окно дела; «Напомнить» активно, когда есть время; если уведомления на устройстве выключены — ссылка в настройки), `bindTaskRows` |
| `screens/assistant.js` | `openAssistant(btn)` — помощник (ИИ): искорка на главной → голубая волна, стеклянное окно с перепиской «пузырями», рамка «дышит», пока думает, ответ печатается; предложенные записи (дела, расходы, доходы, будущие платежи) добавляются только по «Добавить всё»; первое открытие — согласие (localStorage `asstConsent`); «Запомнить» (kind remember → `assistant_memory`), фото чека/счёта (кнопка камеры, уменьшается до 1568 px, уходит только с этим вопросом) |
| `screens/form.js` | `addScreen`, `editScreen`, `viewForm`, `viewAdjust` (корректировка), `newCategorySheet` |
| `screens/calendar.js` | `calendarScreen` — сетка месяца, «Отметить оплаченным» |
| `screens/history.js` | `historyScreen` — оплаченные записи по месяцам, фильтр, «Показать ещё» (по 50) |
| `screens/overview.js` | `overviewScreen` — «Обзор» (бывшие «Отчёты»): день/неделя/месяц, плитки, кольцо по категориям (6 цветов без голубого/оранжевого, проверены валидатором), кольцо «доход периода», цифры, график за полгода, крупные траты. `#/reports` ведёт сюда же |
| `screens/debts.js` | `debtsScreen`, `debtSheet` — прогресс и прогноз погашения |
| `screens/records.js` | `recordsScreen` — «Записи» на ПК (вместо «Истории»; на телефоне `#/records` ↔ `#/history` переадресуются): таблица месяца, поиск/фильтры/сортировка в `state.rec`, тихая строка быстрого добавления (Enter), панель правки справа, действия над выбранными (категория, проект, «Оплачено», удалить), Esc закрывает панель/снимает выбор. Правило вида: важное на виду, редкое — тихо или по требованию |
| `screens/projects.js` | `projectsScreen` (проекты книги «Бизнес» по прибыли: рост к прошлому месяцу, маржа, линия за полгода), `projectScreen` (карточка: цифры месяца, год столбиками, кольцо расходов, записи), `projectSheet`. Пункт меню только на ПК, на телефоне — ссылка внизу «Обзора» |
| `screens/trading.js` | `mountTradingCard` (карточка «Торговый бот · LINK» сверху во вкладке «Проекты»), `tradingScreen` (`#/trading`: «ждёт сигнала / в сделке» словами, шкалы до уровня и объёма, график 4 ч, шкала сделки, события, закрытые сделки; обновление раз в 30 с), `mountTradingCodeBlock` (Настройки → «Торговый бот»: код доступа), `hasTradingAccess`. Данные — коллекции `trading_status`/`trading_events`, их шлёт Mac (`~/freqtrade/user_data/desk_watch.py`) |
| `screens/settings.js` | `settingsScreen`, `fieldSheet`, `deleteAccountSheet`, блок «Помощник помнит» (`assistant_memory`, удалить = забыть) |
| `screens/push.js` | `mountPushBlock` — блок push-напоминаний в настройках |
| `screens/ingest.js` | `mountIngestBlock` — ключ для записи расходов с iPhone (Apple Pay → Быстрая команда) |

Новый экран: файл в `screens/` с `export async function xxxScreen(route, alive)` + строка в `ROUTES` в `router.js`.

Версия для ПК (от 960px) — только CSS в конце `app.css`: `#tabbar` становится узкой полоской значков слева (подписи — подсказки из `data-label`; пункты `desk: true` в `TABS`
видны только там), экраны раскладываются в колонки по `#view[data-screen="<маршрут>"]` (ставит `render`).
На телефоне меню прячется атрибутом `data-mobile-hidden`, а не `hidden` (`hidden` — только экран входа).
Подсветка выбранного (`placeGlow` в `ui.js`) тянется по обеим осям; капсулу вырезает clip-path из переменных --gt/--gr/--gb/--gl,
каждый край — свой твин (передний быстрее), как в ролике; углы и обводка не искажаются. Нижнее меню на телефоне: Главная · Дела · + · Платежи · Долги («Обзор» — только в полоске на ПК). Меню (`#tabbar`) собирается один раз, `render` вызывает `freezeGlows()`. Клавиши: N — новая запись, ←/→ — месяц, Esc — закрыть окно.
Отклик на нажатие (`ui.js`, pointerdown): «тик» через Web Audio (выключатель «Звук нажатий» в настройках, localStorage `clickSound`)
и пружинка через свойство `scale`. Новый экран: блоки выезжают по очереди (`.view-enter > *` в app.css).

Маршруты — hash: `#/`, `#/add?kind=&date=&debt=&project=&back=`, `#/edit/<id>`, `#/calendar`, `#/history` (на ПК → `#/records`), `#/overview` (`#/reports` — то же; на телефоне в меню нет — открывается нажатием на баланс), `#/tasks`, `#/debts`, `#/projects`, `#/project/<id>`, `#/settings`.

Книги: переключателя нет (убран 2026-11-08) — `state.book` всегда `all`: видно всё вместе, новые записи — в «Личное», выбора книги в форме нет. Позже книгу выберут при регистрации («для себя / для бизнеса»). У записей, категорий и долгов поле `book` personal|business, пусто = «Личное». Запросы списков — через `withBook()`.

## Данные (коллекции PocketBase)

У всех записей есть `owner` (id пользователя). Изоляцию обеспечивают **API rules в PocketBase**
(`owner = @request.auth.id`); клиент дополнительно добавляет `ownerFilter()` в каждый `getFullList`/`getList`.

- `transactions`: `kind` income|expense|adjust, `amount`, `date`, `category`→categories, `note`,
  `status` planned|paid, `repeat` none|weekly|monthly|yearly, `repeat_day` (1–31, «родной» день серии; пусто = день из даты),
  `debt`→debts, `extra` (json: id поля → значение)
- `categories`: `name`, `kind` income|expense, `sort`, `book`
- `custom_fields`: `label`, `field_type` text|number|select|date|bool|url, `options`, `sort`, `hidden`
- `debts`: `name`, `total`, `monthly_payment`, `next_due`, `note`, `closed`, `direction` owe|lent (пусто = owe), `book`
- `projects`: `name`, `kind` online|physical|other, `color`, `archived`, `note`; у `transactions` — `book` и `project`→projects (только у «Бизнеса»)
- `tasks` (`server/1793400000_tasks.js`): `title`, `day` (пусто = «Когда-нибудь»), `time` «ЧЧ:ММ», `note`, `done`, `done_at`, `repeat` none|daily|weekdays|weekly|monthly, `remind` none|at|15|30|60 — push-напоминание (у нового дела со временем по умолчанию `at`), шлёт `server/task_push.py` раз в минуту
- `assistant_usage` (`server/1793500000_assistant_usage.js`): `owner`, `day`, `count`, `tokens_in`, `tokens_out` — вопросы помощнику за день (лимит 30), пишет только хук
- `assistant_memory` (`server/1793600000_assistant_memory_reviews.js`): `owner`, `text` — что попросили запомнить; создаёт приложение, читает хук помощника
- `assistant_reviews` (там же): `owner`, `week` (понедельник), `text`, токены — «Итоги недели», пишет только `finance_review.pb.js`
- `push_subscriptions`: `endpoint`, `p256dh`, `auth`, `device`
- торговый бот: `trading_members` (`user`; создаёт только хук по коду), `trading_status` (одна запись `tradingstatus00`, `data` json), `trading_events` (`type`, `bot`, `text`, `at`); читать могут только участники; `trading_config` закрыт
- `book_balances` (view): строка на книгу (`owner`, `book`, `balance`); `getBalance()` читает её, в режиме «Всё» складывает
- `balances` (view, только чтение, для старой версии сайта): `id` = id пользователя, `balance` — сумма оплаченных; клиент читает через `getBalance()`
  в `core/data.js` (при 404 — старый подсчёт по всем записям)
- `users`: + `invite`, `terms_version`, `ingest_key_hash` (скрытое, sha256 ключа для iPhone)

`adjust` меняет баланс, но не попадает в доходы, расходы и отчёты. Сумма платежа по долгу считается
из оплаченных `transactions` с этим `debt`: «я должен» гасится расходами, «мне должны» — доходами (`debtKind` в `core/data.js`). Рассылка push — `server/remind.py` (systemd-таймер, 9:00); см. `server/README.md`.
Свои эндпоинты PocketBase — `server/pb_hooks/finance_ingest.pb.js`: `GET/POST/DELETE /api/finance/key` (ключ),
`POST /api/finance/expense` (заголовок `X-Finance-Key`, тело `{amount, merchant}` → оплаченный расход;
помощник — `server/pb_hooks/finance_assistant.pb.js`: `POST /api/finance/assistant` `{messages, today, now, image?}` → `{reply, actions, left}` (в подсказке: деньги на руках, долги, «как обычно» за 3 мес., расчёт до дохода, привычки по истории, «Помощник помнит»; данные по всем книгам); разбор недели — `server/pb_hooks/finance_review.pb.js`: `POST /api/finance/review` `{today}` → `{week, text}` (Claude Haiku `claude-haiku-5-5`, структурированный ответ; ключ только на сервере в `/opt/pocketbase/secrets/anthropic_key`); торговый бот — `server/pb_hooks/finance_trading.pb.js`: `GET /api/finance/trading/access`, `POST /api/finance/trading/code` `{code}`, `POST /api/finance/trading/push` (заголовок `X-Trading-Key`);
такой же расход за 2 минуты не дублируется — ответ `duplicate: true`).

## Правила

- Экран = функция `xxxScreen(route, alive)`: собирает HTML строкой в `$view.innerHTML`, потом навешивает `onclick`.
  Любой текст пользователя в шаблоне — только через `esc()`.
- После `await` проверять `if (!alive()) return;` — защита от гонки при быстром переключении экранов.
- Деньги: `parseAmount` на вводе, округление `Math.round(v * 100) / 100`, вывод через `money`/`signed`.
- Даты в базу — `pbDate(ymd)` (полдень UTC, чтобы не съезжал день).
- После изменения категорий, полей или долгов сбрасывать `state.cache.<key> = null`.
- Новый JS/CSS-файл → импортировать там, где нужен, добавить в `SHELL` в `sw.js`, поднять версию `CACHE`.
- Модули импортируют друг друга по кругу (экраны ↔ `router.js`/`ui.js`): импортированное использовать только внутри функций, не на верхнем уровне модуля.
- Любой новый запрос списка к PocketBase — с `ownerFilter()`.
- Репозиторий публичный: секреты только на сервере (`.env`), никогда в коде.
- Сборщик, фреймворк и npm не добавлять без явной просьбы.

## Проверка

Тестов нет. Локально: `python3 -m http.server 8080` в корне → http://localhost:8080 (работает с боевой базой).
