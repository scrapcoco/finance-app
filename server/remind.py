#!/usr/bin/env python3
"""Push-напоминания о платежах для приложения «Финансы».

Запуск:
  remind.py gen-keys   создать ключи VAPID (один раз) и показать публичный ключ
  remind.py test       отправить тестовое уведомление на все подключённые устройства
  remind.py            ежедневная рассылка (запускается таймером systemd)
  remind.py --force    рассылка, даже если сегодня она уже была
"""
import datetime
import json
import os
import sqlite3
import sys
from zoneinfo import ZoneInfo

DIR = os.path.dirname(os.path.abspath(__file__))
DB = os.environ.get('PB_DB', '/opt/pocketbase/pb_data/data.db')
KEY_FILE = os.path.join(DIR, 'vapid_private.pem')
STATE_FILE = os.path.join(DIR, 'last_run.txt')
TZ = ZoneInfo('Europe/Warsaw')
CONTACT = os.environ.get('VAPID_CONTACT', 'mailto:admin@hardpointcyber.club')
CURRENCY = 'zł'
DAYS_BEFORE = [3, 2, 1, 0]   # за сколько дней напоминать (0 = в день оплаты)
OVERDUE_DAYS = [1]           # через сколько дней после срока напомнить о неоплаченном

MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля',
              'августа', 'сентября', 'октября', 'ноября', 'декабря']


def log(*a):
    print(datetime.datetime.now(TZ).strftime('%Y-%m-%d %H:%M:%S'), *a, flush=True)


def money(v):
    s = f'{v:,.2f}'.replace(',', ' ').replace('.', ',')
    if s.endswith(',00'):
        s = s[:-3]
    return f'{s} {CURRENCY}'


def gen_keys():
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    import base64
    if os.path.exists(KEY_FILE):
        key = serialization.load_pem_private_key(open(KEY_FILE, 'rb').read(), password=None)
        print('Ключ уже существует, показываю его публичную часть.')
    else:
        key = ec.generate_private_key(ec.SECP256R1())
        pem = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                                serialization.NoEncryption())
        fd = os.open(KEY_FILE, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'wb') as f:
            f.write(pem)
        print('Ключи созданы.')
    raw = key.public_key().public_bytes(serialization.Encoding.X962,
                                        serialization.PublicFormat.UncompressedPoint)
    print('\nПУБЛИЧНЫЙ КЛЮЧ (его можно отправить в чат):\n')
    print(base64.urlsafe_b64encode(raw).decode().rstrip('='))


def connect():
    con = sqlite3.connect(DB, timeout=30)
    con.row_factory = sqlite3.Row
    return con


def subscriptions(con):
    subs = {}
    for r in con.execute('SELECT id, owner, endpoint, p256dh, auth FROM push_subscriptions'):
        subs.setdefault(r['owner'], []).append(dict(r))
    return subs


def send(con, sub, payload):
    from pywebpush import webpush, WebPushException
    try:
        webpush(
            subscription_info={'endpoint': sub['endpoint'], 'keys': {'p256dh': sub['p256dh'], 'auth': sub['auth']}},
            data=json.dumps(payload, ensure_ascii=False),
            vapid_private_key=KEY_FILE,
            vapid_claims={'sub': CONTACT},
            ttl=86400,
            headers={'Urgency': 'high'},
        )
        return True
    except WebPushException as e:
        code = getattr(e.response, 'status_code', None)
        if code in (404, 410):
            con.execute('DELETE FROM push_subscriptions WHERE id = ?', (sub['id'],))
            con.commit()
            sub['gone'] = True
            log('подписка устарела и удалена:', sub['id'])
        else:
            log('ошибка отправки:', code, str(e)[:200])
        return False


def message(row, offset, today):
    title_name = row['note'] or row['cat'] or 'Платёж'
    title = f'{title_name} — {money(row["amount"])}'
    d = datetime.date.fromisoformat(row['day'])
    when = f'{d.day} {MONTHS_GEN[d.month - 1]}'
    if offset == 0:
        body = 'Сегодня день оплаты.'
    elif offset == 1:
        body = f'Оплата завтра, {when}.'
    elif offset > 1:
        body = f'Оплата через {offset} дня, {when}.' if offset < 5 else f'Оплата через {offset} дней, {when}.'
    else:
        body = f'Срок был {when}. Если уже оплатил — отметь в приложении.'
    return {'title': title, 'body': body, 'url': './#/calendar', 'tag': f'{row["id"]}-{offset}'}


def run_daily(force=False):
    today = datetime.datetime.now(TZ).date()
    if not force and os.path.exists(STATE_FILE) and open(STATE_FILE).read().strip() == today.isoformat():
        log('сегодня рассылка уже была, пропускаю')
        return
    offsets = {(today + datetime.timedelta(days=n)).isoformat(): n for n in DAYS_BEFORE}
    offsets.update({(today - datetime.timedelta(days=n)).isoformat(): -n for n in OVERDUE_DAYS})
    con = connect()
    subs = subscriptions(con)
    q = ('SELECT t.id, t.owner, t.amount, t.note, substr(t.date, 1, 10) AS day, c.name AS cat '
         'FROM transactions t LEFT JOIN categories c ON c.id = t.category '
         "WHERE t.status = 'planned' AND t.kind = 'expense' AND substr(t.date, 1, 10) IN (%s) "
         'ORDER BY t.date' % ','.join('?' * len(offsets)))
    sent = total = 0
    for row in con.execute(q, list(offsets)).fetchall():
        payload = message(row, offsets[row['day']], today)
        for sub in subs.get(row['owner'], []):
            if sub.get('gone'):
                continue
            total += 1
            sent += send(con, sub, payload)
    with open(STATE_FILE, 'w') as f:
        f.write(today.isoformat())
    log(f'готово: отправлено {sent} из {total}')


def run_test():
    con = connect()
    n = 0
    for owner_subs in subscriptions(con).values():
        for sub in owner_subs:
            n += send(con, sub, {'title': 'Финансы', 'body': 'Тестовое уведомление: напоминания работают 👍',
                                 'url': './#/calendar', 'tag': 'test'})
    log(f'тест: доставлено на {n} устройств(а)')


if __name__ == '__main__':
    arg = sys.argv[1] if len(sys.argv) > 1 else ''
    if arg == 'gen-keys':
        gen_keys()
    elif arg == 'test':
        run_test()
    else:
        run_daily(force=arg == '--force')
