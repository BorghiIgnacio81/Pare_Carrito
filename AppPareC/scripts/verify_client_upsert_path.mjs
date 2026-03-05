import "dotenv/config";
import { ensureSchema, getModels, getPool } from "../src/db/postgres.js";

await ensureSchema();
const models = await getModels();
const pool = getPool();

if (!pool || !models) {
  console.log(JSON.stringify({ ok: false, reason: "DB_NOT_CONFIGURED" }, null, 2));
  process.exit(0);
}

const ext = `U${Date.now()}`.slice(-3).padStart(3, "0");
const first = await models.clients.upsertByExternalId({ externalId: ext, name: `Cliente ${ext}`, code: 123 });
const second = await models.clients.upsertByExternalId({ externalId: ext, name: `Cliente ${ext} Edit`, code: 456 });

console.log(JSON.stringify({ ok: true, ext, firstId: first?.id || null, secondId: second?.id || null, sameRow: String(first?.id) === String(second?.id), finalName: second?.name || null }, null, 2));

await models.clients.softDeleteById({ id: second.id });
await pool.end();
