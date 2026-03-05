import "dotenv/config";
import { getPool, ensureSchema, saveOrderRow } from "../src/db/postgres.js";

const pool = getPool();
if (!pool) {
  console.log(JSON.stringify({ ok: false, skipped: true, reason: "DATABASE_URL not set" }, null, 2));
  process.exit(0);
}

await ensureSchema();

const marker = `test-normalized-client-${Date.now()}`;
const row = ["05/03/2026 10:00:00", "002) Estación Buenos Aires", marker];
const save = await saveOrderRow({
  sheetName: "Pedidos",
  updatedRange: "Pedidos!A9999:C9999",
  row,
});

const query = await pool.query(
  `
    SELECT
      ao.id,
      ao.sheet_id,
      s.name AS sheet_name,
      ao.sheet_row_number,
      ao.client_id,
      ao.order_timestamp,
      ao.cells_json,
      c.external_id,
      c.name
    FROM app_orders ao
    INNER JOIN app_sheets s ON s.id = ao.sheet_id
    LEFT JOIN clients c ON c.id = ao.client_id
    WHERE ao.cells_json->>\'2\' = $1
    ORDER BY ao.id DESC
    LIMIT 1;
  `,
  [marker]
);

console.log(
  JSON.stringify(
    {
      ok: true,
      save,
      row: query.rows[0] || null,
    },
    null,
    2
  )
);

await pool.end();
