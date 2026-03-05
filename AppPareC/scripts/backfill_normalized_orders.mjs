import "dotenv/config";
import { ensureSchema, getPool, migrateRawOrdersToNormalized } from "../src/db/postgres.js";

const limitArg = Number(process.argv[2] || 0);
const limit = Number.isFinite(limitArg) && limitArg > 0 ? Math.floor(limitArg) : 0;

const pool = getPool();
if (!pool) {
  console.log(JSON.stringify({ ok: false, skipped: true, reason: "DATABASE_URL not set" }, null, 2));
  process.exit(0);
}

await ensureSchema();

const result = await migrateRawOrdersToNormalized({ limit });

const counts = await pool.query(`
  SELECT
    (SELECT COUNT(*)::int FROM app_orders) AS app_orders,
    (SELECT COUNT(*)::int FROM orders WHERE source = 'sheet') AS sheet_orders,
    (SELECT COUNT(*)::int FROM order_items) AS order_items,
    (SELECT COUNT(*)::int FROM products) AS products;
`);

console.log(
  JSON.stringify(
    {
      ...result,
      counts: counts.rows?.[0] || null,
    },
    null,
    2
  )
);

await pool.end();
