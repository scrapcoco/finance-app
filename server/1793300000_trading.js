/// <reference path="../pb_data/types.d.ts" />
// Торговый бот (только просмотр): доступ по коду.
//  trading_members — кто открыл доступ (создаёт только хук по верному коду; сам пользователь видит лишь свою строку);
//  trading_status  — одна запись со сводкой бота (пишет только хук с ключом Mac);
//  trading_events  — события бота (то же);
//  trading_config  — отпечатки кода и ключа Mac (API закрыт полностью, значения кладутся отдельно на сервере).
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  const MEMBER = "@collection.trading_members.user ?= @request.auth.id";

  const members = new Collection({
    type: "base", name: "trading_members",
    listRule: "user = @request.auth.id", viewRule: "user = @request.auth.id",
    createRule: null, updateRule: null, deleteRule: null,
    fields: [
      { type: "relation", name: "user", required: true, collectionId: users.id, maxSelect: 1, cascadeDelete: true },
      { type: "autodate", name: "created", onCreate: true }
    ],
    indexes: ["CREATE UNIQUE INDEX idx_trading_members_user ON trading_members (user)"]
  });
  app.save(members);

  app.save(new Collection({
    type: "base", name: "trading_status",
    listRule: MEMBER, viewRule: MEMBER, createRule: null, updateRule: null, deleteRule: null,
    fields: [
      { type: "json", name: "data", maxSize: 200000 },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true }
    ]
  }));

  app.save(new Collection({
    type: "base", name: "trading_events",
    listRule: MEMBER, viewRule: MEMBER, createRule: null, updateRule: null, deleteRule: null,
    fields: [
      { type: "text", name: "type", max: 40 },
      { type: "text", name: "bot", max: 40 },
      { type: "text", name: "text", max: 500 },
      { type: "date", name: "at" },
      { type: "autodate", name: "created", onCreate: true }
    ],
    indexes: ["CREATE INDEX idx_trading_events_at ON trading_events (at)"]
  }));

  app.save(new Collection({
    type: "base", name: "trading_config",
    listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
    fields: [
      { type: "text", name: "key", required: true, max: 60 },
      { type: "text", name: "value", hidden: true, max: 200 }
    ],
    indexes: ["CREATE UNIQUE INDEX idx_trading_config_key ON trading_config (key)"]
  }));
}, (app) => {
  for (const name of ["trading_config", "trading_events", "trading_status", "trading_members"]) {
    try { app.delete(app.findCollectionByNameOrId(name)); } catch (_) { /* уже нет */ }
  }
});
