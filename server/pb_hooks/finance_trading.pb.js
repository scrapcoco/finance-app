/// <reference path="../pb_data/types.d.ts" />
// Торговый бот (только просмотр). Доступ — по коду: верный код добавляет пользователя в trading_members.
// Mac с ботом присылает сводку и события по ключу X-Trading-Key. В базе (trading_config, API закрыт)
// лежат только sha256 кода (code_hash) и ключа Mac (push_key_hash). Весь код — внутри обработчиков.

// Есть ли у текущего пользователя доступ к боту.
routerAdd("GET", "/api/finance/trading/access", (e) => {
  let ok = false;
  try { e.app.findFirstRecordByFilter("trading_members", "user = {:u}", { u: e.auth.id }); ok = true; } catch (_) {}
  return e.json(200, { access: ok });
}, $apis.requireAuth("users"));

// Открыть доступ по коду: тело { code }.
routerAdd("POST", "/api/finance/trading/code", (e) => {
  const code = String((e.requestInfo().body || {}).code || "").trim().toLowerCase();
  let hash = "";
  try { hash = e.app.findFirstRecordByFilter("trading_config", "key = 'code_hash'").getString("value"); } catch (_) {}
  if (!hash || !code || $security.sha256(code) !== hash) {
    sleep(1000); // против перебора
    throw new BadRequestError("Код не подошёл.");
  }
  try {
    e.app.findFirstRecordByFilter("trading_members", "user = {:u}", { u: e.auth.id });
  } catch (_) {
    const rec = new Record(e.app.findCollectionByNameOrId("trading_members"));
    rec.set("user", e.auth.id);
    e.app.save(rec);
  }
  return e.json(200, { access: true });
}, $apis.requireAuth("users"));

// Сводка и события от Mac: заголовок X-Trading-Key, тело { status: {...}, events: [{at, type, bot, text}] }.
routerAdd("POST", "/api/finance/trading/push", (e) => {
  const key = String(e.request.header.get("X-Trading-Key") || "").trim();
  let hash = "";
  try { hash = e.app.findFirstRecordByFilter("trading_config", "key = 'push_key_hash'").getString("value"); } catch (_) {}
  if (!hash || !/^tk_[A-Za-z0-9]{40}$/.test(key) || $security.sha256(key) !== hash) throw new UnauthorizedError("Ключ неверный.");

  const body = e.requestInfo().body || {};
  const ID = "tradingstatus00";
  let st;
  try { st = e.app.findRecordById("trading_status", ID); } catch (_) {
    st = new Record(e.app.findCollectionByNameOrId("trading_status"));
    st.set("id", ID);
  }
  st.set("data", body.status || {});
  e.app.save(st);

  let added = 0;
  const evCol = e.app.findCollectionByNameOrId("trading_events");
  for (const ev of (Array.isArray(body.events) ? body.events : []).slice(0, 50)) {
    const at = String(ev.at || ""), type = String(ev.type || "").slice(0, 40), text = String(ev.text || "").slice(0, 500);
    if (!at || !type) continue;
    const dupes = e.app.findRecordsByFilter("trading_events", "at = {:a} && type = {:t} && text = {:x}", "", 1, 0,
      { a: at.replace("T", " "), t: type, x: text });
    if (dupes.length) continue;
    const rec = new Record(evCol);
    rec.set("at", at); rec.set("type", type); rec.set("bot", String(ev.bot || "").slice(0, 40)); rec.set("text", text);
    e.app.save(rec);
    added++;
  }
  // храним последние 300 событий
  const old = e.app.findRecordsByFilter("trading_events", "id != ''", "-at", 200, 300);
  for (const r of old) e.app.delete(r);
  return e.json(200, { ok: true, added });
});
