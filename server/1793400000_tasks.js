/// <reference path="../pb_data/types.d.ts" />
// Дела (планировщик на каждый день, не обязательно про деньги).
// - day: на какой день (пусто = «Когда-нибудь»); time: «10:00» или пусто
// - repeat: none | daily | weekdays | weekly | monthly — у сделанного повторяющегося дела клиент создаёт следующее
// - remind: none | at | 15 | 30 | 60 (минут до) — для будущих напоминаний, пока не используется
// Видит и меняет только владелец.
const OWN = "owner = @request.auth.id";
const CREATE = "@request.auth.id != '' && @request.body.owner = @request.auth.id";
const UPDATE = "owner = @request.auth.id && (@request.body.owner:isset = false || @request.body.owner = @request.auth.id)";

migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  app.save(new Collection({
    type: "base",
    name: "tasks",
    listRule: OWN, viewRule: OWN, createRule: CREATE, updateRule: UPDATE, deleteRule: OWN,
    fields: [
      { type: "text", name: "title", required: true, max: 200 },
      { type: "date", name: "day" },
      { type: "text", name: "time", max: 5, pattern: "^([01][0-9]|2[0-3]):[0-5][0-9]$" },
      { type: "text", name: "note", max: 1000 },
      { type: "bool", name: "done" },
      { type: "date", name: "done_at" },
      { type: "select", name: "repeat", values: ["none", "daily", "weekdays", "weekly", "monthly"], maxSelect: 1 },
      { type: "select", name: "remind", values: ["none", "at", "15", "30", "60"], maxSelect: 1 },
      { type: "relation", name: "owner", required: true, collectionId: users.id, cascadeDelete: true, maxSelect: 1 },
      { type: "autodate", name: "created", onCreate: true },
      { type: "autodate", name: "updated", onCreate: true, onUpdate: true }
    ],
    indexes: ["CREATE INDEX idx_tasks_owner_day ON tasks (owner, day)"]
  }));
}, (app) => {
  app.delete(app.findCollectionByNameOrId("tasks"));
});
