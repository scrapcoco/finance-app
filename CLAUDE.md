# Финансы — PWA учёта доходов, расходов, платежей и долгов

Vanilla HTML/CSS/JS, **без сборки и без npm**. Бэкенд — PocketBase на `https://api.hardpointcyber.club`
(Oracle Cloud, nginx + certbot, тот же сервер, что hardpoint-bot). Деплой: push в `main` → Netlify (~30 с).
Интерфейс на русском, валюта zł. Макеты: https://claude.ai/artifact/6vHQMiDj8gsHPc7NrhBvp9

## Файлы

- `index.html` — оболочка: `#view`, `#tabbar`, `#sheet-root`, `#toast`; подключает `config.js`, SDK и `js/main.js` (ES-модуль)
- `js/config.js` — `window.APP_CONFIG`: `PB_URL`, `CURRENCY`, `LOCALE`, `VAPID_PUBLIC_KEY`
- `js/pocketbase.umd.js` — SDK PocketBase v0.28.1 (глобальный `PocketBase`), не трогать
- `css/app.css` — стили, цвета в CSS-переменных (`--ink`, `--soft`, `--muted`, `--inc`, `--exp`, `--line`, `--lens`, `--plate`, `--chip`, `--photo`). Тема «Новое стекло · Окно» (ветка account-mode, блок в конце файла): фон — фото `img/bg-leaf.jpg`, один раз размытое (`body::before/::after`); фото чётко видно только в «окнах» — блок баланса `.hero`, шапка с заголовком `.head:has(> h1)`, поле суммы `.amount-box` (текст на подложке `--plate`); списки — плиты `--glass` без своего размытия; белая «линза» `--lens` — только главное действие и выбранное. Шрифты: Unbounded (суммы, заголовки) + Onest. Меню на ПК: до 1240px — полоска значков, шире — остров с подписями. Макеты: https://claude.ai/artifact/1r32GTivn3pNUwV41A3FK6
- **Ветка `lenta` — новый вид «Лента»** (макеты — верхние ряды холста https://claude.ai/artifact/1r32GTivn3pNUwV41A3FK6): светлая тема поверх прежних стилей — последний блок `app.css` «Лента · светлая тема» (бумага `--paper`, чернила `--ink`, одно яркое пятно `--mesh`, шрифты Geologica + Golos Text; фото-фон и «окна» выключены; в файле выше литералы `rgba(255,255,255,…)` заменены на тёмные). На телефоне вкладок нет: `#tabbar` — чёрная строка `.lbar` (домой · шар-помощник `.orb` · «+»), её собирает `renderTabbar` в `router.js`; на ПК — прежняя полоска слева. Этапы: 1) макеты ✔ 2) лента ✔ 3) строка помощника вместо «+», умеет отмечать оплачено/сделано 4) карточка денег (потянуть цифру) 5) голос; отдельно — вид «месяц» (обратный отсчёт).
- `sw.js` — кэш оболочки (network-first), push и клик по уведомлению
- `manifest.webmanifest`, `icons/`, `netlify.toml`
- `server/` — копия серверной части (напоминания, systemd, миграции PocketBase); Netlify её не использует

## Карта `js/` (ES-модули, без сборки)

| Файл | Что внутри |
|---|---|
| `main.js` | точка входа: `hashchange` → `render`, `authRefresh`, регистрация `sw.js` |
| `router.js` | `ROUTES` (имя маршрута → функция экрана), `render`, нижнее меню `TABS` |
| `ui.js` | `$view`/`$tabbar`/`$sheetRoot`, `toast`, `errText`, `openSheet`/`closeSheet`, `txRow`, `monthSwitch` |
| `gestures.js` | жесты на телефоне (только касания): строки с `data-sw="pay|done|del"` + `data-sw-col`/`data-sw-id`/`data-sw-label` — смахнуть влево = нажать кнопку `[data-pay]`/`[data-done]` в строке, дальше = удалить (с «Отменить»); смахнуть экран вбок — месяц (`.month-switch [data-m]`) или день в «Делах»; потянуть вниз — `render()`; долгое нажатие — окно быстрых действий; у дел (`data-drag`) после удержания — перетаскивание, порядок в `tasks.sort` (`server/1793900000_tasks_sort.js`, сортировка `byOrder`). `initGestures()` вызывает `main.js` |
| (мелочи в `ui.js`) | `countUp` — баланс «докручивается»; `celebrate` — цветные точки, когда закрыто последнее дело дня (`tasks.js`) или долг погашен (`debts.js`, прошлые остатки в localStorage `debtLeft`); `sumsHidden`/`setSumsHidden` — «Скрыть суммы» (глаз на главной, класс `hide-sums` на `<html>`, localStorage `hideSums`, список размываемого — в конце `app.css`) |
| `core/pb.js` | `CFG`, `pb`, `uid`, `ownerFilter` |
| `core/util.js` | `esc`, деньги (`money`, `signed`, `parseAmount`), даты (`ymd`, `parseYmd`, `pbDate`, `nextOccurrence`), месяцы, подписи |
| `core/icons.js` | `ICON` — inline SVG |
| `core/state.js` | `state`: выбранный месяц/день/период/фильтры + `state.cache` справочников |
| `core/data.js` | вид аккаунта (`MODES`, `userMode`, `isBusiness`, `setMode` — сохраняет `users.mode` и создаёт стартовые категории), книги (`BOOKS`, `curBook`, `bookOf`, `bookFilter`, `withBook`), `getCats/getFields/getDebts/getProjects` (кэш), `txBetween`, `ensureDefaults(book)`, `markPaid`, `bumpDebtDue`, `getBalance` |
| `screens/login.js` | вход, регистрация по инвайт-коду, `termsSheet`, `COPYRIGHT` |
| `core/tasks.js` | дела: `TASK_REPEAT`, `TASK_REMIND`, `taskDay`, `byTime`, `tasksBetween`, `overdueTasks`, `somedayTasks`, `nextTaskDay`, `newTask`, `completeTask` (у повторяющегося создаёт следующее, возвращает «Отменить»), `timeLeft`, `isMissingCollection` |
| `screens/lenta.js` | **главная (ветка lenta)**: `lentaScreen` — вместо вкладок одна лента времени. Яркая карточка `.l-hero` («Сегодня свободно» = деньги на руках минус платежи до ближайшего дохода, поровну на оставшиеся дни — `freeToday`; у бизнеса «На счёте»), кнопки-фильтры `.l-chips` (Всё/Деньги/Дела/Долги — фильтруют на месте, состояние в `ui`), лента `.l-line`: просроченное → сегодня было → черта «сейчас» → сегодня впереди → дни на 2 недели («Показать дальше», до 8 недель) с «останется N» (`leftBy`). Строка `.l-row`: нажатие раскрывает на месте (`ui.open`, чёрная карточка: Оплачено/Сделано · Завтра · ···), кружок `.l-check` — готово одним касанием. `paint(d)` перерисовывает без запросов. Кнопка-список → окно «Все разделы» (`menuSheet`): старые экраны (Платежи, Дела, Долги, Обзор, История, Настройки) живут там |
| `screens/home.js` | **старая главная, в маршрутах больше не используется** (осталась ради `cashSheet`; `home-desk.js` тоже не вызывается). Было — `homeScreen`: баланс (нажатие → «Обзор», карандаш → `cashSheet`) и «Не пропустить» — платежи по завтра включительно и до двух ближайших дел со временем, остальное ссылкой; если срочного нет — под балансом пусто. Списков записей на главной нет. Карточки: «Не хватит N zł к дате» (платежи 7 дней > денег на руках, без ИИ) и «Итоги недели» (`POST /api/finance/review` раз в неделю, кэш в localStorage `asstReview`, ✕ скрывает) |
| `screens/tasks.js` | `tasksScreen` («Дела»: неделя, быстрое добавление, «Вчера остались…» → перенести/отложить, дела дня, «Сделано · N», «Когда-нибудь»), `taskSheet` (окно дела; «Напомнить» активно, когда есть время; если уведомления на устройстве выключены — ссылка в настройки), `bindTaskRows` |
| `screens/assistant.js` | `openAssistant(btn)` — помощник (ИИ): искорка на главной → голубая волна, стеклянное окно с перепиской «пузырями», рамка «дышит», пока думает, ответ печатается; предложенные записи (дела, расходы, доходы, будущие платежи) добавляются только по «Добавить всё»; первое открытие — согласие (localStorage `asstConsent`); «Запомнить» (kind remember → `assistant_memory`), фото чека/счёта (кнопка камеры, уменьшается до 1568 px, уходит только с этим вопросом) |
| `screens/form.js` | `addScreen`, `editScreen`, `viewForm`, `viewAdjust` (корректировка), `newCategorySheet` |
| `screens/calendar.js` | `calendarScreen` — сетка месяца, «Отметить оплаченным» |
| `screens/history.js` | `historyScreen` — оплаченные записи по месяцам, фильтр, «Показать ещё» (по 50) |
| `screens/overview.js` | `overviewScreen` — «Обзор» (бывшие «Отчёты»): день/неделя/месяц, плитки, кольцо по категориям (6 цветов без голубого/оранжевого, проверены валидатором), кольцо «доход периода», цифры, график за полгода, крупные траты. `#/reports` ведёт сюда же |
| `screens/debts.js` | `debtsScreen`, `debtSheet` — прогресс и прогноз погашения |
| `screens/records.js` | `recordsScreen` — «Записи» на ПК (вместо «Истории»; на телефоне `#/records` ↔ `#/history` переадресуются): таблица месяца, поиск/фильтры/сортировка в `state.rec`, тихая строка быстрого добавления (Enter), панель правки справа, действия над выбранными (категория, проект, «Оплачено», удалить), Esc закрывает панель/снимает выбор. Правило вида: важное на виду, редкое — тихо или по требованию |
| `screens/projects.js` | `projectsScreen` (проекты книги «Бизнес» по прибыли: рост к прошлому месяцу, маржа, линия за полгода), `projectScreen` (карточка: цифры месяца, год столбиками, кольцо расходов, записи), `projectSheet`. Пункт меню только на ПК, на телефоне — ссылка внизу «Обзора» |
| `screens/home-desk.js` | `deskHome(c)` — главная на ПК (от 960px; телефонная — в home.js): «Для себя» — баланс, предупреждения, «Куда уходят деньги» (5 категорий полосками) | дела на сегодня, платежи на 2 недели; «Для бизнеса» — 4 плитки (на счёте, выручка, расходы, прибыль с маржой), проекты по прибыли (`projectStats` из projects.js), итоги недели | платежи на 2 недели (придёт/уйдёт/итог), дела. Только разметка, кнопки навешивает homeScreen. Смена ширины окна на главной перерисовывает экран (router.js) |
| `screens/mode.js` | `modeScreen` — окно «Как будешь пользоваться?» (две карточки), `MODE_TEXT` — что входит в каждый вид (и для регистрации, и для Настроек), `modeSkipped` |
| `screens/tour.js` | знакомство с приложением (комикс-обучение убрано): `maybeTour(fresh)` (зовёт лента) → приветствие во весь экран `.ob` (шар, одна мысль на экран; у пустого аккаунта спрашивает деньги сейчас → запись `adjust`, и ближайший доход → плановый `income` monthly, потом показывает «Сегодня свободно»); дальше «Первые шаги» — карточка `.l-quest` в ленте (рисует `lenta.js` по `quest()`): шаги `open` → `done` → `swipe` (только телефон) → `ask`, выполняются настоящими действиями на учебной строке `[data-demo]` внутри карточки (`demo1`/`demo2`, на сервер не уходят; `gestures.js` их не удаляет и ставит `data-swiped`), `questDone(id)` засчитывает шаг и шлёт событие `quest` (лента перерисовывается без запросов), последний — `celebrate()`. Состояние — localStorage `quest:<id>`; `replayTour()` — Настройки → «Показать обучение». Старые стили `.spot`/`.tour-hole`/комикс в `app.css` больше не используются (можно удалить); `.tour-backdrop`/`.tour.news` нужны окну «Что нового» |
| `screens/gift.js` | подарок тем, кто зарегистрирован до выхода «Ленты» (`RELEASE`, по `users.created`): окно «Спасибо…» один раз (`maybeGift()`, зовёт лента; localStorage `gift1:<id>`), звание «Первопроходец» и свои цвета главной карточки — `SKINS` dawn/aurora/gold, `applySkin()` ставит `data-skin` на `<html>` (зовёт `render`), выбор хранится в `skin:<id>`, сменить — Настройки → «Интерфейс». На сервер не пишет |
| `screens/news.js` | «Что нового»: `NEWS` — список обновлений (новое — в начало, номер `n` на 1 больше); `maybeNews()` (зовёт главная) показывает окно с непросмотренными (localStorage `newsSeen:<id>`), `showNews(true)` — все, из Настроек. **При каждой заметной выкладке добавлять запись в `NEWS`** |
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

Вид аккаунта = книга: `users.mode` personal («Для себя») | business («Для бизнеса»), выбирается при регистрации; у старых аккаунтов (поле пустое) `render` один раз показывает окно выбора (`screens/mode.js`), сменить — в Настройках («Вид приложения»), данные другой книги не удаляются, а скрываются. `render` ставит `state.book = userMode() || 'all'` ('all' — вид не выбран или сервер без поля: всё вместе, как раньше). Личный вид: без «Проектов» (пункт меню `biz: true` скрыт, `#/projects` → `#/`); на телефонной главной тихая строка «Больше всего ушло · категория». Бизнес: без Apple Pay (блок ingest в Настройках скрыт); в нижнем меню телефона «Проекты» вместо «Долгов» (на телефоне долгов у бизнеса нет совсем, на ПК — в полоске); на телефонной главной «На счёте», «Выручка», «Прибыль» с маржой и тихие строки «Лучший проект» и «За неделю · придёт / уйдёт». Помощник и «Итоги недели» получают `book` и смотрят только его записи; дела и «Помощник помнит» общие. У записей, категорий и долгов поле `book` personal|business, пусто = «Личное». Запросы списков — через `withBook()`.

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
- `book_balances` (view): строка на книгу (`owner`, `book`, `balance`); `getBalance()` читает её, в режиме «Всё» складывает
- `balances` (view, только чтение, для старой версии сайта): `id` = id пользователя, `balance` — сумма оплаченных; клиент читает через `getBalance()`
  в `core/data.js` (при 404 — старый подсчёт по всем записям)
- `users`: + `invite`, `terms_version`, `mode` (personal|business, `server/1793800000_users_mode.js`), `ingest_key_hash` (скрытое, sha256 ключа для iPhone)

`adjust` меняет баланс, но не попадает в доходы, расходы и отчёты. Сумма платежа по долгу считается
из оплаченных `transactions` с этим `debt`: «я должен» гасится расходами, «мне должны» — доходами (`debtKind` в `core/data.js`). Рассылка push — `server/remind.py` (systemd-таймер, 9:00); см. `server/README.md`.
Свои эндпоинты PocketBase — `server/pb_hooks/finance_ingest.pb.js`: `GET/POST/DELETE /api/finance/key` (ключ),
`POST /api/finance/expense` (заголовок `X-Finance-Key`, тело `{amount, merchant}` → оплаченный расход;
помощник — `server/pb_hooks/finance_assistant.pb.js`: `POST /api/finance/assistant` `{messages, today, now, image?}` → `{reply, actions, left}` (в подсказке: деньги на руках, долги, «как обычно» за 3 мес., расчёт до дохода, привычки по истории, «Помощник помнит»; данные по всем книгам); разбор недели — `server/pb_hooks/finance_review.pb.js`: `POST /api/finance/review` `{today}` → `{week, text}` (Claude Haiku `claude-haiku-5-5`, структурированный ответ; ключ только на сервере в `/opt/pocketbase/secrets/anthropic_key`);
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
