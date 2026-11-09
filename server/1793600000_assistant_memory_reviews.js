/// <reference path="../pb_data/types.d.ts" />
// Помощник:
//  assistant_memory — что пользователь попросил запомнить («зарплата 10-го», «кофе — это Еда»).
//    Создаёт приложение после «Добавить» в окне помощника; видно и удаляется в Настройках. Читает хук помощника.
//  assistant_reviews — короткий разбор недели на главной (одна строка на неделю). Пишет только хук finance_review.pb.js.
const OWN = "owner = @request.auth.id";

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  app.save(new Collection({
    type: "base",
    name: "assistant_memory",
    listRule: OWN, viewRule: OWN,
    createRule: "@request.auth.id != '' && @request.body.owner = @request.auth.id",
    updateRule: OWN + " && (@request.body.owner:isset = false || @request.body.owner = @request.auth.id)",
    deleteRule: OWN,
    fields: [
      { type: "relation", name: "owner", required: true, collectionId: users.id, cascadeDelete: true, maxSelect: 1 },
      { type: "text", name: "text", required: true, max: 300 },
      { type: "autodate", name: "created", onCreate: true },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true }
    ],
    indexes: ["CREATE INDEX idx_assistant_memory_owner ON assistant_memory (owner)"]
  }));
  app.save(new Collection({
    type: "base",
    name: "assistant_reviews",
    listRule: OWN, viewRule: OWN, createRule: null, updateRule: null, deleteRule: null,
    fields: [
      { type: "relation", name: "owner", required: true, collectionId: users.id, cascadeDelete: true, maxSelect: 1 },
      { type: "text", name: "week", required: true, max: 10 },
      { type: "text", name: "text", max: 1000 },
      { type: "number", name: "tokens_in", onlyInt: true, min: 0 },
      { type: "number", name: "tokens_out", onlyInt: true, min: 0 },
      { type: "autodate", name: "created", onCreate: true }
    ],
    indexes: ["CREATE UNIQUE INDEX idx_assistant_reviews_owner_week ON assistant_reviews (owner, week)"]
  }));
}, (app) => {
  app.delete(app.findCollectionByNameOrId("assistant_reviews"));
  app.delete(app.findCollectionByNameOrId("assistant_memory"));
});
