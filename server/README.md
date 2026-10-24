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
| `pb_hooks/finance_ingest.pb.js` | `/opt/pocketbase/pb_hooks/` — ключ и приём расходов с iPhone |

Что **не** кладём в репозиторий (он публичный):
- `vapid_private.pem` — приватный ключ push-уведомлений, лежит только на сервере рядом с `remind.py`;
- остальные файлы из `pb_migrations/` — в правилах `users` записан код приглашения;
- email в `finance-reminders.service` — здесь заменён на `YOUR_EMAIL`.

`remind.py` читает базу PocketBase напрямую (`/opt/pocketbase/pb_data/data.db`) и работает от пользователя `pocketbase`.
Ручные команды: `remind.py test` — тестовое уведомление, `remind.py --force` — повторная рассылка.

## Выложить изменённый `remind.py` на сервер

```bash
scp server/remind.py oracle:/tmp/remind.py
ssh oracle 'sudo mv /tmp/remind.py /opt/finance-reminders/remind.py && sudo systemctl start finance-reminders.service && sudo journalctl -u finance-reminders -n 20 --no-pager'
```
