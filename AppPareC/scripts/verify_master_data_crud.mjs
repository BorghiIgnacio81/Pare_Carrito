import "dotenv/config";
import { ensureSchema, getModels, getPool } from "../src/db/postgres.js";

await ensureSchema();
const models = await getModels();
const pool = getPool();

if (!pool || !models) {
  console.log(JSON.stringify({ ok: false, reason: "DB_NOT_CONFIGURED" }, null, 2));
  process.exit(0);
}

const stamp = Date.now();
const client = await models.clients.create({
  externalId: `T${stamp}`,
  name: `Cliente Test ${stamp}`,
  code: 900,
  notes: "test",
});

const responsible = await models.responsibles.create({
  code: `test-${stamp}`,
  name: `Responsable Test ${stamp}`,
  notes: "test",
});

const assignment = await models.clientResponsibles.assign({
  clientId: client.id,
  responsibleId: responsible.id,
  roleLabel: "titular",
  isPrimary: true,
});

const clientAssignments = await models.clientResponsibles.listByClient({ clientId: client.id });
const responsibleAssignments = await models.clientResponsibles.listByResponsible({
  responsibleId: responsible.id,
});

const removed = await models.clientResponsibles.removeAssignment({
  clientId: client.id,
  responsibleId: responsible.id,
});

await models.clients.softDeleteById({ id: client.id });
await models.responsibles.softDeleteById({ id: responsible.id });

console.log(
  JSON.stringify(
    {
      ok: true,
      clientId: client.id,
      responsibleId: responsible.id,
      assignmentId: assignment?.id || null,
      byClientCount: clientAssignments.length,
      byResponsibleCount: responsibleAssignments.length,
      removed: Boolean(removed),
    },
    null,
    2
  )
);

await pool.end();
