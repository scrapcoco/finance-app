/// <reference path="../pb_data/types.d.ts" />
// Скрытое поле users.ingest_key_hash — sha256 личного ключа для приёма расходов с iPhone.
migrate((app) => {
  const users = app.findCollectionByNameOrId("users");
  users.fields.add(new TextField({ name: "ingest_key_hash", hidden: true, max: 64 }));
  return app.save(users);
}, (app) => {
  const users = app.findCollectionByNameOrId("users");
  users.fields.removeByName("ingest_key_hash");
  return app.save(users);
});
