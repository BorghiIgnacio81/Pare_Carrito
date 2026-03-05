import "dotenv/config";
import { getPool, ensureSchema } from "../src/db/postgres.js";

const pool = getPool();
if (!pool) {
  console.log(JSON.stringify({ ok: false, reason: "DB_NOT_CONFIGURED" }, null, 2));
  process.exit(0);
}

await ensureSchema();

const counts = await pool.query(`
  SELECT
    (SELECT COUNT(*)::int FROM products) AS products,
    (SELECT COUNT(*)::int FROM orders) AS orders,
    (SELECT COUNT(*)::int FROM order_items) AS order_items,
    (SELECT COUNT(*)::int FROM app_orders) AS app_orders;
`);

const sample = await pool.query(`
  SELECT
    id,
    sheet_id,
    sheet_row_number,
    client_id,
    order_timestamp,
    cells_json
  FROM app_orders
  ORDER BY id DESC
  LIMIT 5;
`);

console.log(
  JSON.stringify(
    {
      ok: true,
      counts: counts.rows[0],
      sample: sample.rows,
    },
    null,
    2
  )
);

await pool.end();
