# Серверная часть

Netlify эту папку не отдаёт (правило в `netlify.toml`), но репозиторий публичный. Здесь лежит копия того,
что работает на сервере Oracle, чтобы её не потерять.

| Файл здесь | Где на сервере |
|---|---|
| `remind.py` | `/opt/finance-reminders/remind.py` |
| `finance-reminders.service` | `/etc/systemd/system/finance-reminders.service` |
| `finance-reminders.timer` | `/etc/systemd/system/finance-reminders.timer` (ежедневно в 9:00 по Варшаве) |
| `requirements.txt` | пакеты из `/opt/finance-reminders/venv` |
| `1792846263_owner_update_rule.js` | `/opt/pocketbase/pb_migrations/` — запрет менять `owner` при обновлении |
| `1792900000_users_ingest_key.js` | `/opt/pocketbase/pb_migrations/` — скрытое поле `users.ingest_key_hash` |
| `1792950000_debts_direction.js` | `/opt/pocketbase/pb_migrations/` — `debts.direction`: я должен / мне должны |
| `1793000000_transactions_repeat_day.js` | `/opt/pocketbase/pb_migrations/` — `transactions.repeat_day`: «родной» день повторяющегося платежа |
| `1793100000_balances_view.js` | `/opt/pocketbase/pb_migrations/` — view-коллекция `balances`: баланс считает база |
| `pb_hooks/finance_ingest.pb.js` | `/opt/pocketbase/pb_hooks/` — ключ и приём расходов с iPhone |
| `1793300000_trading.js` | `/opt/pocketbase/pb_migrations/` — торговый бот: `trading_members`, `trading_status`, `trading_events`, `trading_config` |
| `1793400000_tasks.js` | `/opt/pocketbase/pb_migrations/` — «Дела»: коллекция `tasks` |
| `1793500000_assistant_usage.js` | `/opt/pocketbase/pb_migrations/` — помощник: счётчик вопросов за день |
| `pb_hooks/finance_assistant.pb.js` | `/opt/pocketbase/pb_hooks/` — помощник (ИИ): `POST /api/finance/assistant`; ключ Anthropic — файл `/opt/pocketbase/secrets/anthropic_key` (pocketbase, 600), в репозиторий не кладём |
| `pb_hooks/finance_trading.pb.js` | `/opt/pocketbase/pb_hooks/` — доступ к боту по коду, приём сводки с Mac (`X-Trading-Key`) |
| `trading_push.py` | `/opt/finance-reminders/trading_push.py` — push о сделках бота участникам (раз в минуту) |
| `finance-trading-push.service` / `.timer` | `/etc/systemd/system/` — запуск `trading_push.py` раз в минуту |

Что **не** кладём в репозиторий (он публичный):
- `vapid_private.pem` — приватный ключ push-уведомлений, лежит только на сервере рядом с `remind.py`;
- остальные файлы из `pb_migrations/` — в правилах `users` записан код приглашения; `1793300001_trading_secrets.js` — отпечатки кода бота и ключа Mac;
- email в `finance-reminders.service` — здесь заменён на `YOUR_EMAIL`.

`remind.py` читает базу PocketBase напрямую (`/opt/pocketbase/pb_data/data.db`) и работает от пользователя `pocketbase`.
Ручные команды: `remind.py test` — тестовое уведомление, `remind.py --force` — повторная рассылка.

## Выложить изменённый `remind.py` на сервер

```bash
scp server/remind.py oracle:/tmp/remind.py
ssh oracle 'sudo mv /tmp/remind.py /opt/finance-reminders/remind.py && sudo systemctl start finance-reminders.service && sudo journalctl -u finance-reminders -n 20 --no-pager'
```
