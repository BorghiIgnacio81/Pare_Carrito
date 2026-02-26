import { Pool } from "pg";

let pool = null;
let initialized = false;

const getPool = () => {
  if (pool) {
    return pool;
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    return null;
  }

  pool = new Pool({
    connectionString,
    ssl: process.env.PGSSLMODE === "require" ? { rejectUnauthorized: false } : undefined,
  });

  return pool;
};

const ensureSchema = async () => {
  if (initialized) {
    return;
  }
  const p = getPool();
  if (!p) {
    return;
  }

  await p.query(`
    CREATE TABLE IF NOT EXISTS app_orders (
      id BIGSERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      sheet_name TEXT NOT NULL,
      sheet_updated_range TEXT,
      sheet_row_number INTEGER,
      order_date_text TEXT,
      client_text TEXT,
      row_json JSONB NOT NULL
    );
  `);

  initialized = true;
};

const parseRowNumberFromUpdatedRange = (updatedRange) => {
  const text = String(updatedRange || "");
  // Example: "Pedidos!A3029:OJ3029" or "Pedidos!A3029"
  const match = text.match(/!(?:[A-Z]+)(\d+)(?::[A-Z]+\d+)?$/i);
  if (!match) {
    return null;
  }
  const row = Number(match[1]);
  return Number.isFinite(row) ? row : null;
};

const saveOrderRow = async ({ sheetName, updatedRange, row }) => {
  const p = getPool();
  if (!p) {
    return { ok: false, skipped: true, reason: "DATABASE_URL not set" };
  }

  await ensureSchema();

  const rowNumber = parseRowNumberFromUpdatedRange(updatedRange);
  const orderDateText = Array.isArray(row) ? (row[0] != null ? String(row[0]) : null) : null;
  const clientText = Array.isArray(row) ? (row[1] != null ? String(row[1]) : null) : null;

  await p.query(
    `
      INSERT INTO app_orders (
        sheet_name,
        sheet_updated_range,
        sheet_row_number,
        order_date_text,
        client_text,
        row_json
      ) VALUES ($1, $2, $3, $4, $5, $6);
    `,
    [
      String(sheetName || ""),
      updatedRange ? String(updatedRange) : null,
      rowNumber,
      orderDateText,
      clientText,
      JSON.stringify(row || []),
    ]
  );

  return { ok: true, skipped: false };
};

export { getPool, ensureSchema, saveOrderRow };
