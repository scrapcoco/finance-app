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
| `core/data.js` | `getCats/getFields/getDebts` (кэш), `txBetween`, `ensureDefaults`, `markPaid`, `bumpDebtDue` |
| `screens/login.js` | вход, регистрация по инвайт-коду, `termsSheet`, `COPYRIGHT` |
| `screens/home.js` | `homeScreen` (баланс, платежи и записи месяца), `cashSheet` |
| `screens/form.js` | `addScreen`, `editScreen`, `viewForm`, `viewAdjust` (корректировка), `newCategorySheet` |
| `screens/calendar.js` | `calendarScreen` — сетка месяца, «Отметить оплаченным» |
| `screens/history.js` | `historyScreen` — оплаченные записи по месяцам, фильтр, «Показать ещё» (по 50) |
| `screens/reports.js` | `reportsScreen` — день/неделя/месяц, график за полгода, категории |
| `screens/debts.js` | `debtsScreen`, `debtSheet` — прогресс и прогноз погашения |
| `screens/settings.js` | `settingsScreen`, `fieldSheet`, `deleteAccountSheet` |
| `screens/push.js` | `mountPushBlock` — блок push-напоминаний в настройках |

Новый экран: файл в `screens/` с `export async function xxxScreen(route, alive)` + строка в `ROUTES` в `router.js`.

Маршруты — hash: `#/`, `#/add?kind=&date=&debt=&back=`, `#/edit/<id>`, `#/calendar`, `#/history`, `#/reports`, `#/debts`, `#/settings`.

## Данные (коллекции PocketBase)

У всех записей есть `owner` (id пользователя). Изоляцию обеспечивают **API rules в PocketBase**
(`owner = @request.auth.id`); клиент дополнительно добавляет `ownerFilter()` в каждый `getFullList`/`getList`.

- `transactions`: `kind` income|expense|adjust, `amount`, `date`, `category`→categories, `note`,
  `status` planned|paid, `repeat` none|weekly|monthly|yearly, `debt`→debts, `extra` (json: id поля → значение)
- `categories`: `name`, `kind` income|expense, `sort`
- `custom_fields`: `label`, `field_type` text|number|select|date|bool|url, `options`, `sort`, `hidden`
- `debts`: `name`, `total`, `monthly_payment`, `next_due`, `note`, `closed`
- `push_subscriptions`: `endpoint`, `p256dh`, `auth`, `device`
- `users`: + `invite`, `terms_version`

`adjust` меняет баланс, но не попадает в доходы, расходы и отчёты. Сумма платежа по долгу считается
из оплаченных `transactions` с этим `debt`. Рассылка push — `server/remind.py` (systemd-таймер, 9:00); см. `server/README.md`.

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
