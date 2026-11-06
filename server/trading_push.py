#!/usr/bin/env python3
"""Push-уведомления торгового бота для тех, кто открыл доступ кодом (trading_members).

Раз в минуту (systemd-таймер finance-trading-push.timer) берёт новые события trading_events
(сделка открыта/закрыта, бот не отвечает) и шлёт их на устройства участников.
Помнит последнее отправленное событие в trading_last.txt. При первом запуске старые события не шлёт.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import remind  # noqa: E402  (connect, subscriptions, send, log)

STATE = os.path.join(remind.DIR, 'trading_last.txt')
TYPES = ('opened', 'closed', 'bot_down')
TITLE = {'opened': 'Бот вошёл в сделку', 'closed': 'Бот закрыл сделку', 'bot_down': 'Бот не отвечает'}


def main():
    con = remind.connect()
    last = open(STATE).read().strip() if os.path.exists(STATE) else ''
    if not last:
        row = con.execute('SELECT MAX(created) FROM trading_events').fetchone()
        open(STATE, 'w').write(row[0] or '0')
        remind.log('торговый бот: первый запуск, старые события пропущены')
        return
    rows = con.execute('SELECT type, bot, text, created FROM trading_events WHERE created > ? AND type IN (?,?,?) '
                       'ORDER BY created', (last, *TYPES)).fetchall()
    if not rows:
        return
    members = {r[0] for r in con.execute('SELECT user FROM trading_members')}
    subs = remind.subscriptions(con)
    sent = 0
    for r in rows:
        payload = {'title': f"{TITLE.get(r['type'], 'Торговый бот')} · {r['bot']}", 'body': r['text'],
                   'url': './#/trading', 'tag': f"trading-{r['created']}"}
        for uid in members:
            for sub in subs.get(uid, []):
                if not sub.get('gone') and remind.send(con, sub, payload):
                    sent += 1
        last = r['created']
    open(STATE, 'w').write(last)
    remind.log(f'торговый бот: событий {len(rows)}, доставлено {sent}')


if __name__ == '__main__':
    main()
