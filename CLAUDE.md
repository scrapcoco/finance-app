# Финансы — PWA учёта доходов, расходов, платежей и долгов

Vanilla HTML/CSS/JS, **без сборки и без npm**. Бэкенд — PocketBase на `https://api.hardpointcyber.club`
(Oracle Cloud, nginx + certbot, тот же сервер, что hardpoint-bot). Деплой: push в `main` → Netlify (~30 с).
Интерфейс на русском, валюта zł. Макеты: https://claude.ai/artifact/6vHQMiDj8gsHPc7NrhBvp9

## Файлы

Рабочие файлы лежат в **корне**. Папка `finance-app/` — устаревшая копия первой загрузки, не редактировать.

- `index.html` — оболочка: `#view`, `#tabbar`, `#sheet-root`, `#toast`; порядок скриптов важен
- `js/config.js` — `window.APP_CONFIG`: `PB_URL`, `CURRENCY`, `LOCALE`, `VAPID_PUBLIC_KEY`
- `js/app.js` — всё приложение в одном IIFE (~1100 строк), карта ниже
- `js/push.js` — push-напоминания; встраивается в экран «Настройки» через `MutationObserver`
- `js/pocketbase.umd.js` — SDK PocketBase v0.28.1, не трогать
- `css/app.css` — стили, цвета в CSS-переменных (`--ink`, `--soft`, `--muted`, `--inc`, `--exp`, `--line`)
- `sw.js` — кэш оболочки (network-first), push и клик по уведомлению
- `manifest.webmanifest`, `icons/`, `netlify.toml`
- `server/` — копия серверной части (напоминания, systemd, миграции PocketBase); Netlify её не использует

## Карта `js/app.js`

Разделы отмечены комментариями `/* ---------- name ---------- */` — ищи по ним, а не по номерам строк.

| Раздел | Что внутри |
|---|---|
| `helpers` | `esc`, `money`, `signed`, `parseAmount`, даты (`ymd`, `parseYmd`, `pbDate`, `nextOccurrence`), месяцы, `ICON`, `state`, `toast`, `errText` |
| `data` | `getCats/getFields/getDebts` (кэш в `state.cache`), `txBetween`, `ensureDefaults`, `markPaid`, `bumpDebtDue` |
| `shell` | `TABS`, `renderTabbar`, `parseRoute`, `ROUTES`, `render`, `monthSwitch`, `txRow` |
| `sheet` | `openSheet(html, bind)` / `closeSheet` — нижние модальные окна |
| `login` | `viewLogin`, регистрация по инвайт-коду, `TERMS_HTML` |
| `home` | `ROUTES['']`, `cashSheet`, `viewAdjust` (корректировка баланса) |
| `add / edit` | `ROUTES.add`, `ROUTES.edit`, `viewForm`, `newCategorySheet` |
| `calendar` | `ROUTES.calendar` — сетка месяца, «Отметить оплаченным» |
| `reports` | `ROUTES.reports` — день/неделя/месяц, график за полгода, по категориям |
| `debts` | `ROUTES.debts`, `debtSheet` — прогресс и прогноз погашения |
| `settings` | `ROUTES.settings`, `fieldSheet`, `deleteAccountSheet` |
| `boot` | `hashchange`, `authRefresh`, регистрация `sw.js` |

Маршруты — hash: `#/`, `#/add?kind=&date=&debt=&back=`, `#/edit/<id>`, `#/calendar`, `#/reports`, `#/debts`, `#/settings`.

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

- Экран = функция в `ROUTES`: собирает HTML строкой в `$view.innerHTML`, потом навешивает `onclick`.
  Любой текст пользователя в шаблоне — только через `esc()`.
- После `await` проверять `if (!alive()) return;` — защита от гонки при быстром переключении экранов.
- Деньги: `parseAmount` на вводе, округление `Math.round(v * 100) / 100`, вывод через `money`/`signed`.
- Даты в базу — `pbDate(ymd)` (полдень UTC, чтобы не съезжал день).
- После изменения категорий, полей или долгов сбрасывать `state.cache.<key> = null`.
- Новый JS/CSS-файл → добавить в `index.html` и в `SHELL` в `sw.js`, поднять версию `CACHE`.
- Любой новый запрос списка к PocketBase — с `ownerFilter()`.
- Репозиторий публичный: секреты только на сервере (`.env`), никогда в коде.
- Сборщик, фреймворк и npm не добавлять без явной просьбы.

## Проверка

Тестов нет. Локально: `python3 -m http.server 8080` в корне → http://localhost:8080 (работает с боевой базой).
