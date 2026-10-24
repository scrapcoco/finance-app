// Расходы с iPhone: личный ключ для Быстрой команды (обработчик — server/pb_hooks/finance_ingest.pb.js)
import { esc } from '../core/util.js';
import { CFG, pb } from '../core/pb.js';
import { $view, toast, errText } from '../ui.js';

const ENDPOINT = `${CFG.PB_URL}/api/finance/expense`;
const MONO = 'color:var(--ink);font-family:ui-monospace,monospace;font-size:13px;word-break:break-all;user-select:all;-webkit-user-select:all';
const keyApi = (method) => pb.send('/api/finance/key', { method });

async function copy(text, what) {
  try { await navigator.clipboard.writeText(text); toast(`${what} скопирован`); }
  catch { toast('Не удалось скопировать — выдели и скопируй вручную'); }
}

function draw(holder, st) {
  const fresh = st.key ? `
    <div class="field-label">Ключ — показывается один раз</div>
    <div class="list"><div class="empty" style="${MONO}">${esc(st.key)}</div></div>
    <button class="btn" id="ing-copy-key">Скопировать ключ</button>` : '';
  const text = st.active
    ? 'Ключ действует. Оплаты Apple Pay записываются в расходы через Быструю команду на iPhone.'
    : 'Оплаты Apple Pay могут сами записываться в расходы. Создай ключ и вставь его в Быструю команду на iPhone.';
  holder.innerHTML = `<section class="sec">
    <div class="sec-head"><h2>Расходы с iPhone</h2>${st.active ? '<span class="badge" style="color:var(--inc)">Включено</span>' : ''}</div>
    <div class="list"><div class="empty" style="color:var(--soft)">${text}</div></div>
    ${fresh}
    <div class="field-label">Адрес для Быстрой команды</div>
    <div class="list"><div class="empty" style="${MONO}">${esc(ENDPOINT)}</div></div>
    <button class="btn secondary" id="ing-copy-url">Скопировать адрес</button>
    <button class="btn ${st.active ? 'secondary' : ''}" id="ing-new">${st.active ? 'Создать новый ключ' : 'Создать ключ'}</button>
    ${st.active ? '<button class="btn danger" id="ing-off">Отключить ключ</button>' : ''}
  </section>`;
  holder.querySelector('#ing-copy-url').onclick = () => copy(ENDPOINT, 'Адрес');
  const ck = holder.querySelector('#ing-copy-key');
  if (ck) ck.onclick = () => copy(st.key, 'Ключ');
  const nb = holder.querySelector('#ing-new');
  nb.onclick = async () => {
    if (st.active && !confirm('Старый ключ перестанет работать, его нужно будет заменить в Быстрой команде. Продолжить?')) return;
    nb.disabled = true;
    try { const r = await keyApi('POST'); draw(holder, { active: true, key: r.key }); toast('Ключ создан'); }
    catch (e) { toast(errText(e)); nb.disabled = false; }
  };
  const off = holder.querySelector('#ing-off');
  if (off) off.onclick = async () => {
    if (!confirm('Отключить ключ? Быстрая команда перестанет записывать расходы.')) return;
    off.disabled = true;
    try { await keyApi('DELETE'); draw(holder, { active: false }); toast('Ключ отключён'); }
    catch (e) { toast(errText(e)); off.disabled = false; }
  };
}

// Вставляет блок под блоком напоминаний (или под заголовком экрана «Настройки»)
export async function mountIngestBlock() {
  const head = $view.querySelector('.head');
  if (!head || $view.querySelector('#ingest-block')) return;
  const holder = document.createElement('div');
  holder.id = 'ingest-block';
  holder.style.display = 'contents';
  const st = await keyApi('GET').catch(() => null);
  if (!st || !head.isConnected) return;
  ($view.querySelector('#push-block') || head).after(holder);
  draw(holder, st);
}
