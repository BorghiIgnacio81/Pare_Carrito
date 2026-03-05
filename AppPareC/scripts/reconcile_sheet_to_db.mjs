import "dotenv/config";
import { saveOrderRow, ensureSchema, getPool } from "../src/db/postgres.js";

const API_BASE = process.env.APP_API_BASE || "http://localhost:3000";
const SHEET_NAME = process.env.SHEET_NAME || "Pedidos";
const LIMIT = Number(process.argv[2] || 0);

const fetchJson = async (url) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.json();
};

const normalizeRowLength = (row, length) => {
  const out = Array.isArray(row) ? [...row] : [];
  if (out.length < length) {
    out.push(...Array(length - out.length).fill(""));
  }
  return out.slice(0, length);
};

const main = async () => {
  const pool = getPool();
  if (!pool) {
    console.log(JSON.stringify({ ok: false, skipped: true, reason: "DATABASE_URL not set" }, null, 2));
    process.exit(0);
  }

  await ensureSchema();

  const ordersPayload = await fetchJson(`${API_BASE}/api/orders`);
  const values = Array.isArray(ordersPayload?.values) ? ordersPayload.values : [];
  const headers = Array.isArray(values[0]) ? values[0] : [];
  const headerLen = headers.length;

  if (!headerLen || values.length <= 1) {
    console.log(JSON.stringify({ ok: true, totalRows: 0, migrated: 0, failed: 0, skipped: 0 }, null, 2));
    await pool.end();
    return;
  }

  const rows = values.slice(1);
  const sourceRows = LIMIT > 0 ? rows.slice(-LIMIT) : rows;

  let migrated = 0;
  let failed = 0;
  let skipped = 0;
  const errors = [];

  for (let i = 0; i < sourceRows.length; i += 1) {
    const row = normalizeRowLength(sourceRows[i], headerLen);
    const sheetRowNumber = 2 + (rows.length - sourceRows.length) + i;
    const updatedRange = `${SHEET_NAME}!A${sheetRowNumber}`;

    const result = await saveOrderRow({
      sheetName: SHEET_NAME,
      updatedRange,
      row,
      headers,
    });

    if (result?.ok) {
      migrated += 1;
      continue;
    }
    if (result?.skipped) {
      skipped += 1;
      continue;
    }

    failed += 1;
    errors.push({ row: sheetRowNumber, reason: String(result?.reason || "error") });
  }

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
        ok: failed === 0,
        totalRows: sourceRows.length,
        migrated,
        failed,
        skipped,
        errors,
        counts: counts.rows?.[0] || null,
      },
      null,
      2
    )
  );

  await pool.end();
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
