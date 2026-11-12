/// <reference path="../pb_data/types.d.ts" />
// Порядок дел вручную: tasks.sort — место дела в списке дня (1, 2, 3…), ставит приложение при перетаскивании
// на телефоне. Пусто/0 — дело стоит по времени, после расставленных вручную.
migrate((app) => {
  const tasks = app.findCollectionByNameOrId("tasks");
  tasks.fields.add(new NumberField({ name: "sort", min: 0, onlyInt: true }));
  app.save(tasks);
}, (app) => {
  const tasks = app.findCollectionByNameOrId("tasks");
  tasks.fields.removeByName("sort");
  app.save(tasks);
});
