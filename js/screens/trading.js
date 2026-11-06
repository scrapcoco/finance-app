// Торговый бот (Freqtrade, понарошку): карточка во вкладке «Проекты» и экран #/trading.
// Пока бот работает на Mac: данные берём со сторожа desk_watch.py — http://127.0.0.1:8099/status.json
// (только чтение, без паролей). Открывается только на этом Mac; на сайте карточки нет.
import { esc } from '../core/util.js';
import { ICON } from '../core/icons.js';
import { $view } from '../ui.js';

const LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);
const SRC = 'http://127.0.0.1:8099/status.json';
const usd = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(Number(v) || 0).toFixed(2)} $`;
const cls = (v) => (v > 0 ? 'inc' : v < 0 ? 'exp' : '');
const when = (iso) => {
  if (!iso) return '';
  const d = new Date(iso.replace(' ', 'T') + (/[zZ+]/.test(iso.slice(10)) ? '' : 'Z'));
  return d.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};
const ago = (iso) => {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return min < 1 ? 'только что' : min < 60 ? `${min} мин назад` : `${Math.round(min / 60)} ч назад`;
};
const EV = { opened: 'Открыта сделка', closed: 'Закрыта сделка', near_breakout: 'Цена у уровня', volume_spike: 'Всплеск объёма', bot_down: 'Бот не отвечает' };

async function load() {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 4000);
  try {
    const r = await fetch(SRC, { cache: 'no-store', signal: ctl.signal });
    return r.ok ? await r.json() : null;
  } catch (e) {
    return null;
  } finally {
    clearTimeout(t);
  }
}

function signalText(m) {
  if (!m) return 'нет данных рынка';
  const dir = m.trend === 'up' ? 'вверх — ждём пробоя максимума 4 ч' : 'вниз — ждём пробоя минимума 4 ч';
  return `тренд ${dir}: до уровня ${m.to_signal_pct}%, объём x${m.volx} (нужно x${m.vol_need})`;
}

// Карточка сверху во вкладке «Проекты» (вызывается после отрисовки экрана)
export async function mountTradingCard(alive) {
  if (!LOCAL) return;
  const d = await load();
  if (!d || !d.bot || (alive && !alive())) return;
  const b = d.bot, o = b.open[0];
  const html = `<section class="sec tr-sec"><div class="list"><a class="row tr-card" href="#/trading">
      <i class="pj-dot" style="background:var(--inc)"></i>
      <div class="main"><div class="name">Торговый бот · ${esc(d.market?.coin || 'LINK')} <span class="tr-badge">понарошку</span></div>
        <div class="meta">${o ? `открыта ${esc(o.side)} по ${o.open_rate} · сейчас ${usd(o.profit)}` : 'сделок нет · ' + esc(signalText(d.market))}</div></div>
      <div class="pj-num"><div class="amt ${cls(b.profit)}">${usd(b.profit)}</div><div class="delta">${b.closed} сделок</div></div>
    </a></div></section>`;
  const head = $view.querySelector('.head');
  if (head && !$view.querySelector('.tr-sec')) head.insertAdjacentHTML('afterend', html);
}

export async function tradingScreen(route, alive) {
  const draw = (d) => {
    if (!d || !d.bot) {
      $view.innerHTML = `<div class="head tr-head"><a class="icon-btn" href="#/projects" aria-label="Назад">${ICON.left}</a><h1>Торговый бот</h1></div>
        <div class="list"><div class="empty">${LOCAL ? 'Сторож бота не отвечает. Он работает на Mac: проверь, что Mac не спит и запущен desk_watch.py.'
          : 'Бот пока виден только на Mac, где он работает.'}</div></div>`;
      return;
    }
    const b = d.bot, m = d.market;
    const evs = (d.events || []).filter((e) => e.bot === (m?.coin || 'LINK'));
    const winPct = b.closed ? Math.round((b.wins / b.closed) * 100) : null;
    $view.innerHTML = `
      <div class="head tr-head"><a class="icon-btn" href="#/projects" aria-label="Назад">${ICON.left}</a>
        <h1>Бот · ${esc(m?.coin || 'LINK')}</h1></div>
      <div class="tr-note">${b.dry_run ? 'Понарошку — деньги не настоящие' : '⚠️ РЕАЛЬНАЯ торговля'} · обновлено ${esc(ago(d.updated))}${b.state !== 'running' ? ` · бот: ${esc(b.state || '?')}` : ''}</div>
      <div class="stats ov-stats">
        <div class="stat"><div class="k">Баланс</div><div class="v">${b.balance.toFixed(2)} $</div></div>
        <div class="stat"><div class="k">Итог</div><div class="v ${cls(b.profit)}">${usd(b.profit)}</div></div>
        <div class="stat"><div class="k">Сделок</div><div class="v">${b.closed}</div>${winPct !== null ? `<div class="ov-sub">${winPct}% удачных</div>` : ''}</div>
      </div>
      <section class="sec"><div class="sec-head"><h2>Сейчас</h2></div><div class="list">
        ${b.open.length ? b.open.map((o) => `<div class="row"><div class="main"><div class="name">${esc(o.pair)} · ${esc(o.side)}</div>
            <div class="meta">вход ${o.open_rate} · сейчас ${o.rate ?? '—'} · с ${esc(when(o.opened))}</div></div>
            <div class="pj-num"><div class="amt ${cls(o.profit)}">${usd(o.profit)}</div><div class="delta">${o.profit_pct}%</div></div></div>`).join('')
          : `<div class="row"><div class="main"><div class="name">Открытых сделок нет</div><div class="meta">${esc(signalText(m))}</div></div></div>`}
        ${m ? `<div class="row"><div class="main"><div class="name">${esc(m.coin)} ${m.price}</div>
            <div class="meta">максимум 4 ч ${m.high4h} · минимум 4 ч ${m.low4h}</div></div></div>` : ''}
      </div></section>
      <section class="sec"><div class="sec-head"><h2>События</h2></div><div class="list">
        ${evs.length ? evs.slice(0, 15).map((e) => `<div class="row"><div class="main"><div class="name">${esc(EV[e.type] || e.type)}</div>
            <div class="meta">${esc(when(e.at))} · ${esc(e.text.replace('тренд down', 'тренд вниз').replace('тренд up', 'тренд вверх'))}</div></div></div>`).join('') : '<div class="empty">Пока тихо.</div>'}
      </div></section>
      <section class="sec"><div class="sec-head"><h2>Закрытые сделки</h2></div><div class="list">
        ${b.trades.length ? b.trades.map((t) => `<div class="row"><div class="main"><div class="name">${esc(t.pair)} · ${esc(t.side)}</div>
            <div class="meta">${esc(when(t.opened))} → ${esc(when(t.closed))}${t.reason ? ' · ' + esc(t.reason) : ''}</div></div>
            <div class="pj-num"><div class="amt ${cls(t.profit)}">${usd(t.profit)}</div></div></div>`).join('') : '<div class="empty">Закрытых сделок ещё нет.</div>'}
      </div></section>`;
  };
  draw(await load());
  // обновляем раз в 30 с, пока экран открыт
  const tick = async () => {
    if (!alive()) return;
    const d = await load();
    if (!alive()) return;
    draw(d);
    setTimeout(tick, 30000);
  };
  setTimeout(tick, 30000);
}
