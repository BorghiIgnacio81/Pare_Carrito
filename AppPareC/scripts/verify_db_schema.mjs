import "dotenv/config";
import { ensureSchema, getModels, getPool } from "../src/db/postgres.js";

await ensureSchema();
const models = await getModels();
const pool = getPool();

if (!pool) {
  console.log("DATABASE_URL not set");
  process.exit(0);
}

const expectedTables = [
  "app_orders",
  "clients",
  "responsibles",
  "client_responsibles",
  "products",
  "product_aliases",
  "orders",
  "order_items",
];

const tableResult = await pool.query(
  "select tablename from pg_tables where schemaname=$1 and tablename = any($2) order by tablename",
  ["public", expectedTables]
);

const responsibleSeedResult = await pool.query(
  "select code, name from responsibles where code = any($1) order by code",
  [["lucas", "miriam", "roberto", "beatriz", "pato"]]
);

console.log(
  JSON.stringify(
    {
      ok: true,
      tables: tableResult.rows.map((row) => row.tablename),
      models: Object.keys(models || {}),
      responsiblesSeed: responsibleSeedResult.rows,
    },
    null,
    2
  )
);

await pool.end();
