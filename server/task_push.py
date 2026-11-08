#!/usr/bin/env python3
"""Push-напоминания о делах (коллекция tasks).

Раз в минуту (systemd-таймер finance-task-push.timer) ищет не сделанные дела со временем,
у которых настало время напоминания: remind = at (во время дела) или 15/30/60 минут до.
Шлёт те, чьё время попало в промежуток с прошлого запуска до сейчас (не больше 15 минут назад,
чтобы после остановки сервера не прилетела пачка старых). Время прошлого запуска — в tasks_last.txt.
"""
import datetime
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import remind  # noqa: E402  (connect, subscriptions, send, log, TZ)

STATE = os.path.join(remind.DIR, 'tasks_last.txt')
CATCH_UP = datetime.timedelta(minutes=15)
OFFSET = {'at': 0, '15': 15, '30': 30, '60': 60}


def is_true(v):
    return str(v).strip().lower() in ('1', 'true')


def body(t, minutes):
    note = (t['note'] or '').split('\n')[0].strip()
    if minutes == 0:
        text = f'Пора, {t["time"]}.'
    elif minutes == 60:
        text = f'Через час, в {t["time"]}.'
    else:
        text = f'Через {minutes} минут, в {t["time"]}.'
    return f'{text} {note}' if note else text


def main():
    now = datetime.datetime.now(remind.TZ).replace(second=59, microsecond=0)
    last = None
    if os.path.exists(STATE):
        try:
            last = datetime.datetime.fromisoformat(open(STATE).read().strip())
        except ValueError:
            last = None
    if last is None or last > now:
        last = now - datetime.timedelta(minutes=1)
    start = max(last, now - CATCH_UP)

    today = now.date()
    days = [today.isoformat(), (today + datetime.timedelta(days=1)).isoformat()]
    con = remind.connect()
    rows = con.execute(
        "SELECT id, owner, title, note, time, remind, done, substr(day, 1, 10) AS d FROM tasks "
        "WHERE substr(day, 1, 10) IN (?, ?) AND time != '' AND remind IN ('at', '15', '30', '60')", days).fetchall()

    due = []
    for t in rows:
        if is_true(t['done']):
            continue
        try:
            hh, mm = map(int, t['time'].split(':'))
            at = datetime.datetime.combine(datetime.date.fromisoformat(t['d']), datetime.time(hh, mm), remind.TZ)
        except ValueError:
            continue
        minutes = OFFSET[t['remind']]
        fire = at - datetime.timedelta(minutes=minutes)
        if start < fire <= now:
            due.append((t, minutes))

    sent = 0
    if due:
        subs = remind.subscriptions(con)
        for t, minutes in due:
            payload = {'title': t['title'], 'body': body(t, minutes), 'url': './#/tasks', 'tag': f'task-{t["id"]}'}
            for sub in subs.get(t['owner'], []):
                if not sub.get('gone') and remind.send(con, sub, payload):
                    sent += 1
        remind.log(f'дела: напоминаний {len(due)}, доставлено {sent}')

    with open(STATE, 'w') as f:
        f.write(now.isoformat())


if __name__ == '__main__':
    main()
