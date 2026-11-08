/// <reference path="../pb_data/types.d.ts" />
// Помощник (ИИ): счётчик вопросов за день на пользователя. Пишет только хук finance_assistant.pb.js;
// пользователь может прочитать свою строку (чтобы показать «осталось N из 30»).
const OWN = "owner = @request.auth.id";

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  app.save(new Collection({
    type: "base",
    name: "assistant_usage",
    listRule: OWN, viewRule: OWN, createRule: null, updateRule: null, deleteRule: null,
    fields: [
      { type: "relation", name: "owner", required: true, collectionId: users.id, cascadeDelete: true, maxSelect: 1 },
      { type: "text", name: "day", required: true, max: 10 },
      { type: "number", name: "count", onlyInt: true, min: 0 },
      { type: "number", name: "tokens_in", onlyInt: true, min: 0 },
      { type: "number", name: "tokens_out", onlyInt: true, min: 0 },
      { type: "autodate", name: "created", onCreate: true },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true }
    ],
    indexes: ["CREATE UNIQUE INDEX idx_assistant_usage_owner_day ON assistant_usage (owner, day)"]
  }));
}, (app) => {
  app.delete(app.findCollectionByNameOrId("assistant_usage"));
});
