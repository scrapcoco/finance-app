# Финансы — PWA для учёта доходов, расходов, платежей и долгов

Фронтенд без сборки: обычные HTML, CSS и JS. Данные хранятся в PocketBase
по адресу из `js/config.js` (сейчас `https://api.hardpointcyber.club`).

## Что в папке

- `index.html` — оболочка приложения
- `css/app.css` — стили (тема «Графит»)
- `js/app.js` — всё приложение: экраны, логика, работа с базой
- `js/config.js` — адрес сервера и валюта
- `js/pocketbase.umd.js` — официальный JS SDK PocketBase (v0.28.1)
- `manifest.webmanifest`, `sw.js`, `icons/` — установка на телефон как приложение
- `netlify.toml` — настройки для Netlify (сборка не нужна)

## Как обновлять

Меняешь файл → коммит в GitHub → Netlify сам выкладывает новую версию за ~30 секунд.
