// Помощник (ИИ): окно с перепиской поверх экрана. Открывается искоркой на главной — от неё идёт голубая волна.
// Сервер (server/pb_hooks/finance_assistant.pb.js) только предлагает записи; добавляет их приложение после «Добавить всё».
import { esc, money, parseYmd, pbDate, today, MONTHS_SHORT, WEEKDAYS, dayOf } from '../core/util.js';
import { ICON } from '../core/icons.js';
import { pb, uid } from '../core/pb.js';
import { $sheetRoot, errText } from '../ui.js';
import { getCats, curBook } from '../core/data.js';
import { newTask } from '../core/tasks.js';
import { render } from '../router.js';

const CONSENT = 'asstConsent';
const hasConsent = () => { try { return localStorage.getItem(CONSENT) === '1'; } catch (e) { return false; } };
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const CHIPS = ['Что у меня сегодня?', 'Сколько потратил в этом месяце?', 'Спланируй завтра'];

// Переписка живёт, пока открыто приложение
const chat = { msgs: [], left: null, busy: false, changed: false };

function whenText(a) {
  if (!a.date) return 'когда-нибудь';
  const n = Math.round((parseYmd(a.date) - parseYmd(today())) / 86400000);
  const d = parseYmd(a.date);
  const day = n === 0 ? 'сегодня' : n === 1 ? 'завтра' : n === -1 ? 'вчера' : n > 1 && n < 7 ? WEEKDAYS[d.getDay()] : `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
  return day + (a.time ? ` в ${a.time}` : '');
}
function metaText(a) {
  const what = a.kind === 'task' ? 'Дело' : a.paid ? (a.kind === 'income' ? 'Доход' : 'Расход') : (a.kind === 'income' ? 'Будущий доход' : 'Будущий платёж');
  return [what + ', ' + whenText(a), a.category].filter(Boolean).join(' · ');
}

function actionRow(a, mi, ai, done) {
  const d = a.date ? parseYmd(a.date) : null;
  const box = d ? `<b>${d.getDate()}</b><span>${MONTHS_SHORT[d.getMonth()]}</span>` : '<b>…</b>';
  const amt = a.kind === 'task' ? '' : `<span class="amt ${a.kind === 'income' ? 'inc' : 'exp'}">${a.kind === 'income' ? '+' : '−'}${money(a.amount)}</span>`;
  return `<div class="asst-row rise" style="animation-delay:${ai * 120}ms">
    <div class="datebox">${box}</div>
    <div class="main"><div class="name">${esc(a.title)}</div><div class="meta">${esc(metaText(a))}</div></div>${amt}
    ${done ? '' : `<button type="button" class="asst-x" data-rm="${mi}:${ai}" aria-label="Убрать: ${esc(a.title)}">${ICON.close}</button>`}</div>`;
}

function msgHTML(m, mi, last) {
  if (m.role === 'user') return `<div class="bub me">${esc(m.text)}</div>`;
  const acts = m.actions || [];
  const typing = last && m.typing != null;
  const text = typing ? m.text.split(' ').slice(0, m.typing).join(' ') : m.text;
  return `<div class="asst-msg">
    <div class="asst-av">${ICON.spark}</div>
    <div class="bub ai"><span class="ai-text ${m.error ? 'asst-err' : ''}">${esc(text)}</span>
      ${!typing && acts.length ? `<div class="asst-acts">${acts.map((a, ai) => actionRow(a, mi, ai, m.added)).join('')}</div>
        ${m.added ? `<div class="asst-done rise">${ICON.check}${esc(m.added)}</div>`
          : `<div class="asst-btns rise"><button type="button" class="btn small" data-add="${mi}">${acts.length > 1 ? 'Добавить всё' : 'Добавить'}</button></div>`}` : ''}
    </div></div>`;
}

export function openAssistant(fromBtn) {
  const r = fromBtn?.getBoundingClientRect();
  $sheetRoot.innerHTML = `<div class="asst-backdrop">
    ${r && !reduce() ? `<div class="asst-wave" style="left:${r.left + r.width / 2}px;top:${r.top + r.height / 2}px"></div>` : ''}
    <section class="asst" role="dialog" aria-modal="true" aria-labelledby="asst-h"></section></div>`;
  const bd = $sheetRoot.firstElementChild;
  const box = bd.querySelector('.asst');
  bd.addEventListener('click', (e) => { if (e.target === bd) closeAssistant(); });
  if (fromBtn && !reduce()) { fromBtn.classList.remove('spark-pop'); void fromBtn.offsetWidth; fromBtn.classList.add('spark-pop'); }
  draw(box);
  // Телефон: окно по видимой части экрана — когда выезжает клавиатура, поле ввода остаётся над ней, а фон не прокручивается
  document.documentElement.classList.add('asst-open');
  const vv = window.visualViewport;
  if (vv) {
    const fit = () => {
      if (!bd.isConnected) { vv.removeEventListener('resize', fit); vv.removeEventListener('scroll', fit); document.documentElement.classList.remove('asst-open'); return; }
      bd.style.setProperty('--vvh', `${vv.height}px`);
      bd.style.setProperty('--vvt', `${vv.offsetTop}px`);
      const body = box.querySelector('#asst-body');
      if (body) body.scrollTop = body.scrollHeight;
    };
    vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit);
    fit();
  }
  // На телефоне клавиатуру сразу не открываем — она закрыла бы приветствие и подсказки
  if (!matchMedia('(pointer: coarse)').matches) setTimeout(() => box.querySelector('#asst-q')?.focus({ preventScroll: true }), 450);
}

function closeAssistant() {
  const box = $sheetRoot.querySelector('.asst');
  if (!box) return;
  const done = () => {
    if ($sheetRoot.querySelector('.asst')) $sheetRoot.innerHTML = '';
    document.documentElement.classList.remove('asst-open');
    if (chat.changed) { chat.changed = false; render(); }
  };
  if (reduce()) return done();
  box.classList.add('out');
  $sheetRoot.firstElementChild.classList.add('out');
  setTimeout(done, 220);
}

function draw(box, keepDraft = true) {
  const draft = keepDraft ? (box.querySelector('#asst-q')?.value ?? '') : '';
  const consent = hasConsent();
  const empty = !chat.msgs.length;
  const status = chat.busy ? 'Думает…' : chat.left != null ? `Осталось ${chat.left} из 30 на сегодня` : 'Дела и деньги';
  box.classList.toggle('think', chat.busy);
  box.innerHTML = `
    <div class="asst-head">
      <div class="asst-ic">${ICON.spark}</div>
      <div class="main"><h2 id="asst-h">Помощник</h2><div class="meta" aria-live="polite">${status}</div></div>
      <button type="button" class="icon-btn ghost" id="asst-close" aria-label="Закрыть">${ICON.close}</button>
    </div>
    <div class="asst-body" id="asst-body">
      ${empty ? `<div class="asst-hello rise">
          <div class="asst-av big">${ICON.spark}</div>
          <div class="hello-t">Привет! Что запишем<br>или что подсказать?</div>
          <div class="hello-s">${consent ? 'Пиши как удобно: «завтра в 10 врач», «потратил 25 на такси». Я разложу по делам и платежам, а добавишь ты сам.'
            : 'Чтобы ответить, помощник отправляет твой вопрос и краткую сводку дел и платежей в Claude (Anthropic). Без твоего «Добавить» он ничего не записывает.'}</div>
          ${consent ? '' : '<button type="button" class="btn small" id="asst-ok">Понятно, включить</button>'}
        </div>`
      : chat.msgs.map((m, i) => msgHTML(m, i, i === chat.msgs.length - 1)).join('')}
      ${chat.busy ? `<div class="asst-msg rise"><div class="asst-av">${ICON.spark}</div><div class="bub ai dots" aria-label="Помощник думает"><i></i><i></i><i></i></div></div>` : ''}
    </div>
    ${consent ? `<div class="asst-foot">
      ${empty ? `<div class="asst-chips">${CHIPS.map((c) => `<button type="button" class="chip" data-chip="${esc(c)}">${esc(c)}</button>`).join('')}</div>` : ''}
      <form class="asst-input" id="asst-form" autocomplete="off">
        <label for="asst-q" class="sr-only">Вопрос помощнику</label>
        <input id="asst-q" maxlength="800" placeholder="Спроси или попроси…" value="${esc(draft)}" ${chat.busy ? 'disabled' : ''}>
        <button type="submit" class="qa-btn" aria-label="Отправить" ${chat.busy ? 'disabled' : ''}>${ICON.up}</button>
      </form></div>` : ''}`;
  const body = box.querySelector('#asst-body');
  body.scrollTop = body.scrollHeight;
  box.querySelector('#asst-close').onclick = closeAssistant;
  box.querySelector('#asst-ok')?.addEventListener('click', () => { try { localStorage.setItem(CONSENT, '1'); } catch (e) { /* приватный режим */ } draw(box); box.querySelector('#asst-q')?.focus(); });
  box.querySelectorAll('[data-chip]').forEach((b) => b.onclick = () => ask(box, b.dataset.chip));
  const form = box.querySelector('#asst-form');
  if (form) form.onsubmit = (e) => { e.preventDefault(); ask(box, box.querySelector('#asst-q').value); };
  box.querySelectorAll('[data-rm]').forEach((b) => b.onclick = () => {
    const [mi, ai] = b.dataset.rm.split(':').map(Number);
    chat.msgs[mi].actions.splice(ai, 1);
    draw(box);
  });
  box.querySelectorAll('[data-add]').forEach((b) => b.onclick = () => addAll(box, Number(b.dataset.add), b));
}

async function ask(box, text) {
  text = String(text || '').trim();
  if (!text || chat.busy) return;
  chat.msgs.push({ role: 'user', text });
  chat.busy = true;
  draw(box, false);
  const n = new Date();
  let msg;
  try {
    const res = await pb.send('/api/finance/assistant', {
      method: 'POST',
      body: {
        messages: chat.msgs.filter((m) => !m.error).map((m) => ({ role: m.role, text: m.role === 'assistant' && m.actions?.length ? `${m.text} [предложено: ${m.actions.map((a) => a.title).join(', ')}${m.added ? '; добавлено' : ''}]` : m.text })),
        today: today(), now: `${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}`,
        book: curBook()
      }
    });
    chat.left = res.left;
    msg = { role: 'assistant', text: res.reply || 'Готово.', actions: res.actions || [] };
  } catch (e) {
    if (e?.response?.left === 0) chat.left = 0;
    msg = { role: 'assistant', text: e?.response?.message || errText(e), actions: [], error: true };
  }
  chat.busy = false;
  if (!$sheetRoot.contains(box)) { chat.msgs.push(msg); return; }
  // Ответ «печатается» по словам
  const words = msg.text.split(' ');
  if (reduce() || msg.error || words.length < 3) { chat.msgs.push(msg); draw(box, false); return; }
  msg.typing = 1;
  chat.msgs.push(msg);
  draw(box, false);
  // Пока печатается — меняем только текст ответа, чтобы не сбивать ввод в поле
  const step = () => {
    if (!$sheetRoot.contains(box)) { delete msg.typing; return; }
    msg.typing += 1;
    if (msg.typing >= words.length) { delete msg.typing; draw(box); return; }
    const el = box.querySelectorAll('.ai-text');
    if (el.length) el[el.length - 1].textContent = words.slice(0, msg.typing).join(' ');
    setTimeout(step, 55);
  };
  setTimeout(step, 55);
}

async function addAll(box, mi, btn) {
  const m = chat.msgs[mi];
  if (!m?.actions?.length) return;
  btn.disabled = true;
  try {
    const cats = await getCats();
    const book = curBook();
    let n = 0;
    for (const a of m.actions) {
      if (a.kind === 'task') {
        await newTask({ title: a.title, day: a.date ? pbDate(a.date) : '', time: a.date ? a.time : '', repeat: a.date ? a.repeat : 'none' });
      } else {
        const cat = cats.find((c) => c.kind === a.kind && c.name.toLowerCase() === (a.category || '').toLowerCase());
        const date = a.date || today();
        await pb.collection('transactions').create({
          kind: a.kind, amount: a.amount, date: pbDate(date), category: cat?.id || '', note: a.title,
          status: a.paid ? 'paid' : 'planned', repeat: a.paid ? 'none' : (['weekly', 'monthly'].includes(a.repeat) ? a.repeat : 'none'),
          repeat_day: dayOf(date), book, extra: {}, owner: uid()
        });
      }
      n++;
    }
    const word = n === 1 ? 'запись' : n < 5 ? 'записи' : 'записей';
    m.added = `Добавил ${n} ${word}`;
    chat.changed = true;
  } catch (e) {
    btn.disabled = false;
    chat.msgs.push({ role: 'assistant', text: `Не получилось добавить: ${errText(e)}`, actions: [], error: true });
  }
  draw(box);
}
