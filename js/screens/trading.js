// Торговый бот (Freqtrade, понарошку): карточка во вкладке «Проекты», экран #/trading и блок «код доступа» в настройках.
// Данные шлёт Mac с ботом (desk_watch.py) на сервер: коллекции trading_status / trading_events.
// Видят только те, кто ввёл код доступа (trading_members; проверка — правила PocketBase и server/pb_hooks/finance_trading.pb.js).
import { esc } from '../core/util.js';
import { ICON } from '../core/icons.js';
import { pb } from '../core/pb.js';
import { state } from '../core/state.js';
import { $view, toast, errText } from '../ui.js';

const HALF = 0.005, GOAL = 0.05; // половина закрывается на +0,5% цены, остаток — до +5%

const n = (v, d = 2) => Number(v).toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d });
const px = (v) => n(v, v >= 100 ? 1 : 3);                          // цена монеты
const usd = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${n(Math.abs(Number(v) || 0))} $`;
const cls = (v) => (v > 0 ? 'inc' : v < 0 ? 'exp' : '');
const toDate = (iso) => new Date(String(iso).replace(' ', 'T') + (/[zZ+]/.test(String(iso).slice(10)) ? '' : 'Z'));
const hm = (d) => d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
const when = (iso) => (iso ? toDate(iso).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const ago = (iso) => {
  const min = Math.round((Date.now() - toDate(iso).getTime()) / 60000);
  return min < 1 ? 'только что' : min < 60 ? `${min} мин назад` : `${Math.round(min / 60)} ч назад`;
};
const dur = (iso) => {
  const min = Math.max(0, Math.round((Date.now() - toDate(iso).getTime()) / 60000));
  return min < 60 ? `${min} мин` : `${Math.floor(min / 60)} ч ${min % 60} мин`;
};
const sideWord = (s) => (s === 'шорт' ? 'на падение' : 'на рост');
const REASON = { roi: 'взял цель', stop_loss: 'по стопу', trailing_stop_loss: 'по стопу в плюсе', '12h_limit': 'по времени (12 ч)', force_exit: 'вручную' };

// Человеческие подписи событий сторожа: [точка, заголовок]
const EV = {
  opened: ['inc', 'Бот вошёл в сделку'], closed: ['', 'Бот закрыл сделку'],
  near_breakout: ['warn', 'Цена подошла к уровню'], volume_spike: ['warn', 'Торги резко оживились'],
  bot_down: ['exp', 'Бот перестал отвечать']
};

// Есть ли доступ (кэшируется до выхода из аккаунта)
export async function hasTradingAccess() {
  if (state.cache.tradingAccess == null) {
    state.cache.tradingAccess = await pb.send('/api/finance/trading/access', { method: 'GET' }).then((r) => !!r.access).catch(() => false);
  }
  return state.cache.tradingAccess;
}

async function load() {
  try {
    const [st, ev] = await Promise.all([
      pb.collection('trading_status').getOne('tradingstatus00'),
      pb.collection('trading_events').getList(1, 15, { sort: '-at' })
    ]);
    const d = st.data || {};
    d.updated = st.updated || d.updated;
    d.events = ev.items.map((e) => ({ at: e.at, type: e.type, bot: e.bot, text: e.text }));
    return d;
  } catch (e) {
    return null;
  }
}

// Одной фразой: что бот ждёт
function waitingText(m) {
  if (!m) return 'Нет данных рынка.';
  const level = m.trend === 'up' ? m.high4h : m.low4h;
  const dir = m.trend === 'up' ? 'растёт' : 'падает';
  const act = m.trend === 'up' ? `поднимется выше ${px(level)} $` : `опустится ниже ${px(level)} $`;
  return `${m.coin} ${dir}. Бот поставит ${m.trend === 'up' ? 'на рост' : 'на падение'}, когда цена ${act}
    (ещё ${n(m.to_signal_pct)}%) и торги станут в ${n(m.vol_need, 1)} раза оживлённее обычного.`;
}

// Карточка сверху во вкладке «Проекты» (вызывается после отрисовки экрана)
export async function mountTradingCard(alive) {
  if (!(await hasTradingAccess()) || (alive && !alive())) return;
  const d = await load();
  if (!d || !d.bot || (alive && !alive())) return;
  const b = d.bot, m = d.market, o = b.open[0];
  const line = o
    ? `В сделке ${sideWord(o.side)} · сейчас <b class="${cls(o.profit)}">${usd(o.profit)}</b>`
    : m ? `Ждёт сигнала · до уровня ${n(m.to_signal_pct)}%, торги x${n(m.volx)} из x${n(m.vol_need, 1)}` : 'Ждёт данных';
  const html = `<section class="sec tr-sec"><a class="tr-card" href="#/trading">
      <span class="tr-pulse ${o ? 'live' : ''}" aria-hidden="true"></span>
      <div class="tr-card-main"><div class="tr-card-title">Торговый бот · ${esc(m?.coin || 'LINK')} <span class="tr-badge">понарошку</span></div>
        <div class="tr-card-line">${line}</div></div>
      <div class="tr-card-num"><div class="${cls(b.profit)}">${usd(b.profit)}</div><small>${b.closed ? `${b.wins} из ${b.closed} в +` : 'нет сделок'}</small></div>
      <span class="tr-chev" aria-hidden="true">›</span>
    </a></section>`;
  const head = $view.querySelector('.head');
  if (head && !$view.querySelector('.tr-sec')) head.insertAdjacentHTML('afterend', html);
}

// Шкала «до сигнала»: минимум 4 ч — цена — максимум 4 ч; подсвечен край, который бот ждёт
function rangeBar(m) {
  const span = m.high4h - m.low4h || 1;
  const pos = Math.min(100, Math.max(0, ((m.price - m.low4h) / span) * 100));
  const volPct = Math.min(100, (m.volx / m.vol_need) * 100);
  return `<div class="tr-meter">
      <div class="tr-meter-k"><span>Цена</span><b>ещё ${n(m.to_signal_pct)}% до уровня</b></div>
      <div class="tr-range ${m.trend === 'up' ? 'wait-up' : 'wait-down'}" role="img"
        aria-label="Цена ${px(m.price)} между минимумом ${px(m.low4h)} и максимумом ${px(m.high4h)} за 4 часа">
        <i class="tr-range-dot" style="left:${pos.toFixed(1)}%"></i></div>
      <div class="tr-range-labels"><span>${px(m.low4h)}${m.trend === 'down' ? ' · пробой вниз' : ''}</span>
        <span>сейчас ${px(m.price)}</span><span>${m.trend === 'up' ? 'пробой вверх · ' : ''}${px(m.high4h)}</span></div>
    </div>
    <div class="tr-meter">
      <div class="tr-meter-k"><span>Оживление торгов</span><b>x${n(m.volx)} из x${n(m.vol_need, 1)}</b></div>
      <div class="tr-bar" role="img" aria-label="Объём ${n(volPct, 0)}% от нужного"><i style="width:${volPct.toFixed(1)}%"></i></div>
    </div>`;
}

// График цены за 4 часа (точка раз в 5 минут) с уровнями пробоя и подсказкой при наведении
function chart(m) {
  const pts = m.spark || [];
  if (pts.length < 2) return '';
  const W = 600, H = 150, P = 8;
  const lo = Math.min(m.low4h, ...pts.map((p) => p[1])), hi = Math.max(m.high4h, ...pts.map((p) => p[1]));
  const y = (v) => P + (1 - (v - lo) / (hi - lo || 1)) * (H - 2 * P);
  const x = (i) => (i / (pts.length - 1)) * W;
  const line = pts.map((p, i) => `${x(i).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' ');
  const lvl = (v, on) => `<line class="tr-lvl ${on ? 'on' : ''}" x1="0" x2="${W}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/>`;
  const tag = (v, label, on, below) => `<span class="tr-lvl-t ${on ? 'on' : ''} ${below ? 'below' : ''}" style="top:${((y(v) / H) * 100).toFixed(1)}%">${label} ${px(v)}</span>`;
  return `<div class="tr-chart" data-pts='${JSON.stringify(pts)}'>
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Цена ${esc(m.coin)} за 4 часа">
        ${lvl(m.high4h, m.trend === 'up')}${lvl(m.low4h, m.trend === 'down')}
        <polyline class="tr-line" points="${line}"/>
        <circle class="tr-now" cx="${x(pts.length - 1).toFixed(1)}" cy="${y(pts[pts.length - 1][1]).toFixed(1)}" r="4"/>
        <line class="tr-cross" x1="0" x2="0" y1="0" y2="${H}" hidden/><circle class="tr-hover" r="4" hidden/>
      </svg>
      <div class="tr-plot-tags">${tag(m.high4h, 'максимум 4 ч', m.trend === 'up', false)}${tag(m.low4h, 'минимум 4 ч', m.trend === 'down', false)}</div>
      <div class="tr-tip" hidden></div>
      <div class="tr-axis"><span>${hm(new Date(pts[0][0] * 1000))}</span><span>4 часа</span><span>сейчас</span></div>
    </div>`;
}

function bindChart() {
  const box = $view.querySelector('.tr-chart');
  if (!box) return;
  const pts = JSON.parse(box.dataset.pts), svg = box.querySelector('svg'), tip = box.querySelector('.tr-tip');
  const cross = svg.querySelector('.tr-cross'), dot = svg.querySelector('.tr-hover'), now = svg.querySelector('.tr-now');
  const line = svg.querySelector('.tr-line').points;
  const move = (ev) => {
    const r = svg.getBoundingClientRect();
    const i = Math.round(Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)) * (pts.length - 1));
    const p = line.getItem(i);
    cross.setAttribute('x1', p.x); cross.setAttribute('x2', p.x); dot.setAttribute('cx', p.x); dot.setAttribute('cy', p.y);
    cross.hidden = dot.hidden = tip.hidden = false; now.style.opacity = '0';
    tip.innerHTML = `<b>${px(pts[i][1])} $</b><span>${hm(new Date(pts[i][0] * 1000))}</span>`;
    const left = (p.x / 600) * r.width;
    tip.style.left = `${Math.min(r.width - 70, Math.max(0, left - 35))}px`;
  };
  const out = () => { cross.hidden = dot.hidden = tip.hidden = true; now.style.opacity = ''; };
  box.addEventListener('pointermove', move);
  box.addEventListener('pointerdown', move);
  box.addEventListener('pointerleave', out);
}

// Открытая сделка: шкала от стопа до цели, отмечены вход, «половина» и текущая цена
function tradeCard(o) {
  const sh = o.side === 'шорт', dirK = sh ? -1 : 1;
  const half = o.open_rate * (1 + dirK * HALF), goal = o.open_rate * (1 + dirK * GOAL);
  const stop = o.stop || o.open_rate * (1 - dirK * 0.015);
  const a = Math.min(stop, goal), z = Math.max(stop, goal), at = (v) => Math.min(100, Math.max(0, ((v - a) / (z - a || 1)) * 100));
  const mark = (v, label, c = '') => `<i class="tr-tick ${c}" style="left:${at(v).toFixed(1)}%"><span>${label}</span></i>`;
  return `<div class="tr-trade">
      <div class="tr-trade-top"><div><div class="tr-trade-title">${esc(o.pair)} · ${sideWord(o.side)}</div>
        <div class="meta">вход ${px(o.open_rate)} · сейчас ${o.rate ? px(o.rate) : '—'} · идёт ${dur(o.opened)}</div></div>
        <div class="tr-trade-num ${cls(o.profit)}">${usd(o.profit)}<small>${o.profit_pct > 0 ? '+' : ''}${n(o.profit_pct)}%</small></div></div>
      <div class="tr-track ${sh ? 'short' : ''}">
        ${mark(stop, 'стоп', 'exp')}${mark(o.open_rate, 'вход', 'up')}${mark(half, o.partial_done ? 'половина ✓' : 'половина', 'inc')}${mark(goal, 'цель', 'inc')}
        ${o.rate ? `<i class="tr-cur" style="left:${at(o.rate).toFixed(1)}%"></i>` : ''}</div>
      <div class="tr-trade-note">${o.partial_done ? 'Половину уже забрали с прибылью — остаток не может уйти в минус.'
        : `Половина закроется на ${px(half)} (+0,5%). Если цена уйдёт к ${px(stop)} — закроется по стопу.`} Не дольше 12 часов.</div>
    </div>`;
}

export async function tradingScreen(route, alive) {
  const allowed = await hasTradingAccess();
  if (!alive()) return;
  const draw = (d) => {
    if (!d || !d.bot) {
      $view.innerHTML = `<div class="head tr-head"><a class="icon-btn" href="#/projects" aria-label="Назад">${ICON.left}</a><h1>Торговый бот</h1></div>
        <div class="list"><div class="empty">${allowed ? 'Нет свежих данных от бота. Он работает на Mac — проверь, что Mac не спит и запущен сторож (desk_watch.py).'
          : 'Доступ к боту — по коду. Введи его в «Настройках» → «Торговый бот».'}</div></div>`;
      return;
    }
    const b = d.bot, m = d.market, coin = m?.coin || 'LINK';
    const evs = (d.events || []).filter((e) => e.bot === coin).slice(0, 12);
    const live = b.open.length > 0;
    $view.innerHTML = `
      <div class="head tr-head"><a class="icon-btn" href="#/projects" aria-label="Назад">${ICON.left}</a><h1>Бот · ${esc(coin)}</h1></div>

      <div class="tr-hero ${live ? 'live' : ''}">
        <div class="tr-hero-state"><span class="tr-pulse ${live ? 'live' : ''}" aria-hidden="true"></span>
          ${live ? 'В сделке' : 'Ждёт сигнала'}<span class="tr-hero-sub">${b.dry_run ? 'понарошку' : '⚠️ реальные деньги'} · обновлено ${esc(ago(d.updated))}</span></div>
        ${live ? b.open.map(tradeCard).join('') : `<p class="tr-hero-text">${esc(waitingText(m))}</p>${m ? rangeBar(m) : ''}`}
      </div>

      <div class="stats ov-stats tr-stats">
        <div class="stat"><div class="k">Заработал</div><div class="v ${cls(b.profit)}">${usd(b.profit)}</div><div class="ov-sub">с начала теста</div></div>
        <div class="stat"><div class="k">Сделок</div><div class="v">${b.closed}</div><div class="ov-sub">${b.closed ? `${b.wins} в плюс · ${b.losses} в минус` : 'пока ни одной'}</div></div>
        <div class="stat"><div class="k">Тестовый счёт</div><div class="v">${n(b.balance)} $</div><div class="ov-sub">деньги не настоящие</div></div>
      </div>

      ${m ? `<section class="sec"><div class="sec-head"><h2>${esc(coin)} за 4 часа</h2></div>${chart(m)}</section>` : ''}

      <section class="sec"><div class="sec-head"><h2>Что происходило</h2></div>
        ${evs.length ? `<ol class="tr-feed">${evs.map((e) => { const [c, t] = EV[e.type] || ['', e.type];
          return `<li><i class="tr-feed-dot ${c}"></i><div><div class="tr-feed-t">${t}<time>${esc(when(e.at))}</time></div>
            <div class="meta">${esc(e.text.replace('тренд down', 'тренд вниз').replace('тренд up', 'тренд вверх'))}</div></div></li>`; }).join('')}</ol>`
          : '<div class="list"><div class="empty">Пока тихо — сторож проверяет рынок каждые 5 минут.</div></div>'}
      </section>

      <section class="sec"><div class="sec-head"><h2>Закрытые сделки</h2></div><div class="list">
        ${b.trades.length ? b.trades.map((t) => `<div class="row"><div class="main"><div class="name">${esc(t.pair)} · ${sideWord(t.side)}</div>
            <div class="meta">${esc(when(t.opened))} → ${esc(when(t.closed))}${t.reason ? ' · ' + esc(REASON[t.reason] || t.reason) : ''}</div></div>
            <div class="pj-num"><div class="amt ${cls(t.profit)}">${usd(t.profit)}</div></div></div>`).join('')
          : '<div class="empty">Закрытых сделок ещё нет — первая появится здесь.</div>'}
      </div></section>

      <details class="tr-how"><summary>Как работает бот</summary>
        <ol>
          <li><b>Ждёт пробоя.</b> Следит за ${esc(coin)} каждую минуту. Сигнал — цена вышла за максимум или минимум последних 4 часов, и торги оживились минимум в 1,5 раза.</li>
          <li><b>Входит по тренду.</b> Если цена выше своей средней за 50 часов — ставит на рост, ниже — на падение. Сумма 50 $, плечо x2.</li>
          <li><b>Забирает половину рано.</b> На +0,5% закрывает половину. Остаток держит без риска уйти в минус — до +5% или 12 часов.</li>
          <li><b>Ограничивает убыток.</b> Стоп около 1,5% цены. Потерял 6 $ за сутки — пауза до завтра.</li>
        </ol></details>`;
    bindChart();
  };
  draw(allowed ? await load() : null);
  if (!allowed) return;
  const tick = async () => { // обновляем раз в 30 с, пока экран открыт
    if (!alive()) return;
    const d = await load();
    if (!alive()) return;
    draw(d);
    setTimeout(tick, 30000);
  };
  setTimeout(tick, 30000);
}

// «Настройки» → «Торговый бот»: ввод кода доступа
export async function mountTradingCodeBlock() {
  const head = $view.querySelector('.head');
  if (!head || $view.querySelector('#trading-block')) return;
  const holder = document.createElement('div');
  holder.id = 'trading-block';
  holder.style.display = 'contents';
  const ok = await hasTradingAccess();
  if (!head.isConnected) return;
  ($view.querySelector('#ingest-block') || $view.querySelector('#push-block') || head).after(holder);
  let open = false;
  const draw = (access) => {
    const row = `<div class="list"><button type="button" class="row fold-row" id="trb-toggle" aria-expanded="${open}">
        <div class="main"><div class="name">Торговый бот</div><div class="meta">${access ? 'Доступ открыт — карточка во вкладке «Проекты»' : 'Доступ по коду'}</div></div>
        ${access ? '<span class="badge" style="color:var(--inc)">Открыт</span>' : ''}<span class="fold-chev">${ICON.down}</span></button></div>`;
    if (!open) {
      holder.innerHTML = `<section class="sec">${row}</section>`;
      holder.querySelector('#trb-toggle').onclick = () => { open = true; draw(access); };
      return;
    }
    holder.innerHTML = `<section class="sec">${row}
      ${access ? `<div class="list"><div class="empty" style="color:var(--soft)">Доступ открыт. О сделках бота будут приходить уведомления, если они включены выше.</div></div>
          <a class="btn secondary" href="#/trading">Открыть бота</a>`
        : `<div class="list"><div class="empty" style="color:var(--soft)">Бот виден только тем, у кого есть код. Код даёт владелец.</div></div>
          <div class="form-list"><div class="frow"><label for="trb-code">Код</label><input id="trb-code" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="60"></div></div>
          <button class="btn" id="trb-go">Открыть доступ</button>`}
    </section>`;
    holder.querySelector('#trb-toggle').onclick = () => { open = false; draw(access); };
    const go = holder.querySelector('#trb-go');
    if (go) go.onclick = async () => {
      const code = holder.querySelector('#trb-code').value.trim();
      if (!code) return toast('Введи код');
      go.disabled = true;
      try {
        await pb.send('/api/finance/trading/code', { method: 'POST', body: { code } });
        state.cache.tradingAccess = true;
        toast('Доступ открыт');
        draw(true);
      } catch (e) { toast(errText(e)); go.disabled = false; }
    };
  };
  draw(ok);
}
