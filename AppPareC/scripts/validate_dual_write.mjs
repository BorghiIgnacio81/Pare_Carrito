import "dotenv/config";
import { getPool, ensureSchema, saveOrderRow } from "../src/db/postgres.js";

const pool = getPool();
if (!pool) {
  console.log(JSON.stringify({ ok: false, skipped: true, reason: "DATABASE_URL not set" }, null, 2));
  process.exit(0);
}

await ensureSchema();

const suffix = Math.floor(Date.now() % 100000);
const rowNumber = 12000 + suffix;
const result = await saveOrderRow({
  sheetName: "Pedidos",
  updatedRange: `Pedidos!A${rowNumber}:D${rowNumber}`,
  row: ["05/03/2026 10:30:00", "099) Cliente Prueba Migracion", "2,5", "1 .maduras"],
  headers: ["Fecha", "Cliente", "Tomate Kg", "Banana Docena"],
});

const counts = await pool.query(`
  SELECT
    (SELECT COUNT(*)::int FROM app_orders) AS app_orders,
    (SELECT COUNT(*)::int FROM orders WHERE source = 'sheet') AS sheet_orders,
    (SELECT COUNT(*)::int FROM order_items) AS order_items,
    (SELECT COUNT(*)::int FROM products) AS products;
`);

const sample = await pool.query(`
  SELECT
    o.id AS order_id,
    o.sheet_name,
    o.sheet_row_number,
    o.client_id,
    oi.product_name_text,
    oi.quantity,
    oi.quantity_text,
    oi.unit,
    oi.variant,
    oi.notes,
    oi.source_column_index
  FROM orders o
  JOIN order_items oi ON oi.order_id = o.id
  WHERE o.sheet_name = 'Pedidos'
    AND o.sheet_row_number = $1
  ORDER BY oi.position ASC;
`, [rowNumber]);

console.log(JSON.stringify({ ok: true, result, counts: counts.rows[0], sample: sample.rows }, null, 2));

await pool.end();
