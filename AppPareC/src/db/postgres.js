import { Pool } from "pg";
import { ensureAppSchema } from "./schema/index.js";
import { createDbModels } from "./models/index.js";
import { normalizeProductFromHeader } from "../catalog/sheetCatalog.js";
import { slugify } from "../utils/text.js";

let pool = null;
let initialized = false;
let models = null;

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

  await ensureAppSchema(p);

  if (!models) {
    models = createDbModels({ pool: p });
  }

  initialized = true;
};

const getModels = async () => {
  const p = getPool();
  if (!p) {
    return null;
  }
  await ensureSchema();
  return models;
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

const parseOrderTimestamp = (value) => {
  const text = String(value ?? "").trim();
  if (!text) {
    return null;
  }

  const localMatch = text.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/
  );
  if (localMatch) {
    const day = Number(localMatch[1]);
    const month = Number(localMatch[2]);
    const yearRaw = Number(localMatch[3]);
    const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
    const hour = Number(localMatch[4] || 0);
    const minute = Number(localMatch[5] || 0);
    const second = Number(localMatch[6] || 0);
    const parsed = new Date(year, month - 1, day, hour, minute, second);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const normalizeHeaders = (headers) => {
  if (!Array.isArray(headers)) {
    return [];
  }
  return headers.map((value) => String(value ?? "").trim());
};

const buildSparseCellsJson = (row) => {
  const out = {};
  if (!Array.isArray(row)) {
    return out;
  }
  for (let index = 2; index < row.length; index += 1) {
    const value = row[index];
    if (value == null) {
      continue;
    }
    if (typeof value === "string" && !value.trim()) {
      continue;
    }
    out[String(index)] = value;
  }
  return out;
};

const normalizeRowArray = (row) => (Array.isArray(row) ? [...row] : []);

const parseNumeric = (value) => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  const text = String(value ?? "").trim();
  if (!text) {
    return null;
  }
  const normalized = text.replace(/,/g, ".");
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) {
    return null;
  }
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
};

const parseCellValueDetails = (value) => {
  if (value == null) {
    return { quantity: null, quantityText: "", notes: "", rawValueText: "" };
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return { quantity: null, quantityText: "", notes: "", rawValueText: "" };
    }
    return {
      quantity: value > 0 ? value : null,
      quantityText: String(value),
      notes: "",
      rawValueText: String(value),
    };
  }

  const rawText = String(value).trim();
  if (!rawText) {
    return { quantity: null, quantityText: "", notes: "", rawValueText: "" };
  }

  const qtyWithComment = rawText.match(/^(-?\d+(?:[.,]\d+)?)\s*\.\s*(.+)$/);
  if (qtyWithComment) {
    const quantity = parseNumeric(qtyWithComment[1]);
    const notes = String(qtyWithComment[2] || "").trim();
    return {
      quantity: quantity != null && quantity > 0 ? quantity : null,
      quantityText: rawText,
      notes,
      rawValueText: rawText,
    };
  }

  const quantityOnly = parseNumeric(rawText);
  if (quantityOnly != null) {
    return {
      quantity: quantityOnly > 0 ? quantityOnly : null,
      quantityText: rawText,
      notes: "",
      rawValueText: rawText,
    };
  }

  return {
    quantity: null,
    quantityText: rawText,
    notes: "",
    rawValueText: rawText,
  };
};

const resolveSheetRecord = async ({ db, sheetName, headers }) => {
  const cleanName = String(sheetName || "").trim();
  if (!cleanName) {
    return { sheetId: null, headers: [] };
  }
  const normalizedHeaders = normalizeHeaders(headers);
  const headersPayload = JSON.stringify(normalizedHeaders);
  const result = await db.query(
    `
      INSERT INTO app_sheets (name, headers_json, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
      , headers_json = CASE
          WHEN jsonb_typeof(EXCLUDED.headers_json) = 'array'
               AND jsonb_array_length(EXCLUDED.headers_json) > 0
            THEN EXCLUDED.headers_json
          ELSE app_sheets.headers_json
        END
      , updated_at = NOW()
      RETURNING id, headers_json;
    `,
    [cleanName, headersPayload]
  );
  const id = Number(result.rows?.[0]?.id);
  const savedHeaders = normalizeHeaders(result.rows?.[0]?.headers_json || []);
  return {
    sheetId: Number.isFinite(id) ? id : null,
    headers: savedHeaders,
  };
};

const normalizeClientExternalId = (value) => {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return "";
  }
  const match = raw.match(/\b(\d{1,6})\b/);
  if (!match) {
    return "";
  }
  const n = Number(match[1]);
  if (!Number.isFinite(n) || n <= 0) {
    return "";
  }
  return String(n).padStart(3, "0");
};

const parseClientText = (value) => {
  const text = String(value ?? "").trim();
  if (!text) {
    return { rawText: "", externalId: "", name: "" };
  }

  const byParen = text.match(/^\s*(\d{1,6})\)\s*(.+?)\s*$/);
  if (byParen) {
    return {
      rawText: text,
      externalId: normalizeClientExternalId(byParen[1]),
      name: String(byParen[2] || "").trim(),
    };
  }

  const byDash = text.match(/^\s*(\d{1,6})\s*[-–—]\s*(.+?)\s*$/);
  if (byDash) {
    return {
      rawText: text,
      externalId: normalizeClientExternalId(byDash[1]),
      name: String(byDash[2] || "").trim(),
    };
  }

  return {
    rawText: text,
    externalId: normalizeClientExternalId(text),
    name: text,
  };
};

const resolveClientIdFromText = async (parsedClient, db = null) => {
  const cleanExternalId = String(parsedClient?.externalId || "").trim();
  const cleanName = String(parsedClient?.name || "").trim();

  if (db && cleanExternalId && cleanName) {
    const result = await db.query(
      `
        INSERT INTO clients (external_id, name, code)
        VALUES ($1, $2, $3)
        ON CONFLICT (external_id)
        DO UPDATE SET
          name = EXCLUDED.name,
          code = COALESCE(clients.code, EXCLUDED.code),
          updated_at = NOW()
        RETURNING id;
      `,
      [cleanExternalId, cleanName, Number(cleanExternalId)]
    );
    const id = Number(result.rows?.[0]?.id);
    return Number.isFinite(id) ? id : null;
  }

  if (db && cleanExternalId) {
    const result = await db.query(
      `
        SELECT id
        FROM clients
        WHERE external_id = $1
        LIMIT 1;
      `,
      [cleanExternalId]
    );
    const id = Number(result.rows?.[0]?.id);
    return Number.isFinite(id) ? id : null;
  }

  if (!models?.clients) {
    return null;
  }

  if (cleanExternalId && cleanName && typeof models.clients.upsertByExternalId === "function") {
    const row = await models.clients.upsertByExternalId({
      externalId: cleanExternalId,
      name: cleanName,
      code: Number(cleanExternalId),
    });
    const id = Number(row?.id);
    return Number.isFinite(id) ? id : null;
  }

  if (cleanExternalId && typeof models.clients.list === "function") {
    const rows = await models.clients.list({ includeInactive: true });
    const match = (Array.isArray(rows) ? rows : []).find(
      (item) => String(item?.external_id || "").trim() === cleanExternalId
    );
    const id = Number(match?.id);
    return Number.isFinite(id) ? id : null;
  }

  return null;
};

const ensureProductForHeader = async ({ db, headerText, cache }) => {
  const normalizedHeader = String(headerText || "").trim();
  if (!normalizedHeader) {
    return null;
  }
  if (cache.has(normalizedHeader)) {
    return cache.get(normalizedHeader);
  }

  const parsed = normalizeProductFromHeader(normalizedHeader, { defaultUnitIfMissing: false });
  const slug = String(parsed?.key || "").trim() || slugify(normalizedHeader);
  if (!slug) {
    cache.set(normalizedHeader, null);
    return null;
  }

  const productName = String(parsed?.baseName || normalizedHeader).trim() || normalizedHeader;
  const defaultUnit = String(parsed?.unit || "").trim();
  const variant = String(parsed?.variant || "").trim();

  const productResult = await db.query(
    `
      INSERT INTO products (slug, name, default_unit, is_active)
      VALUES ($1, $2, NULLIF($3, ''), TRUE)
      ON CONFLICT (slug)
      DO UPDATE SET
        name = EXCLUDED.name,
        default_unit = COALESCE(NULLIF(EXCLUDED.default_unit, ''), products.default_unit),
        updated_at = NOW()
      RETURNING id;
    `,
    [slug, productName, defaultUnit]
  );

  const productId = Number(productResult.rows?.[0]?.id);
  const resolved = Number.isFinite(productId)
    ? {
        productId,
        slug,
        name: productName,
        unit: defaultUnit,
        variant,
      }
    : null;

  if (resolved) {
    await db.query(
      `
        INSERT INTO product_aliases (product_id, alias, normalized_alias)
        VALUES ($1, $2, $3)
        ON CONFLICT (product_id, alias) DO NOTHING;
      `,
      [resolved.productId, normalizedHeader, slugify(normalizedHeader)]
    );
  }

  cache.set(normalizedHeader, resolved);
  return resolved;
};

const findOrCreateOrder = async ({
  db,
  sheetName,
  updatedRange,
  rowNumber,
  clientId,
  parsedClient,
  orderTimestamp,
  row,
}) => {
  const source = "sheet";
  const existing = await db.query(
    `
      SELECT id
      FROM orders
      WHERE source = $1
        AND sheet_name = $2
        AND sheet_row_number = $3
      LIMIT 1;
    `,
    [source, sheetName, rowNumber]
  );

  const existingId = Number(existing.rows?.[0]?.id);
  if (Number.isFinite(existingId)) {
    await db.query(
      `
        UPDATE orders
        SET client_id = $2,
            order_date = $3,
            raw_client_text = $4,
            sheet_updated_range = $5,
            raw_row_json = $6::jsonb,
            updated_at = NOW()
        WHERE id = $1;
      `,
      [
        existingId,
        clientId,
        orderTimestamp,
        String(parsedClient?.rawText || "").trim() || null,
        String(updatedRange || "").trim() || null,
        JSON.stringify(normalizeRowArray(row)),
      ]
    );
    return existingId;
  }

  const inserted = await db.query(
    `
      INSERT INTO orders (
        client_id,
        source,
        status,
        order_date,
        sheet_name,
        sheet_updated_range,
        sheet_row_number,
        raw_client_text,
        raw_row_json
      )
      VALUES ($1, 'sheet', 'confirmed', $2, $3, $4, $5, $6, $7::jsonb)
      RETURNING id;
    `,
    [
      clientId,
      orderTimestamp,
      String(sheetName || "").trim(),
      String(updatedRange || "").trim() || null,
      rowNumber,
      String(parsedClient?.rawText || "").trim() || null,
      JSON.stringify(normalizeRowArray(row)),
    ]
  );

  const orderId = Number(inserted.rows?.[0]?.id);
  return Number.isFinite(orderId) ? orderId : null;
};

const rebuildOrderItems = async ({ db, orderId, row, headers }) => {
  if (!orderId) {
    return { itemsCount: 0 };
  }

  await db.query(`DELETE FROM order_items WHERE order_id = $1;`, [orderId]);

  const cells = buildSparseCellsJson(row);
  const entries = Object.entries(cells)
    .map(([key, value]) => ({ index: Number(key), value }))
    .filter((entry) => Number.isFinite(entry.index) && entry.index >= 2)
    .sort((a, b) => a.index - b.index);

  const productCache = new Map();
  let position = 0;
  for (const entry of entries) {
    const columnIndex = entry.index;
    const rawValue = entry.value;
    const fallbackHeader = `Columna ${columnIndex + 1}`;
    const headerText = String(headers?.[columnIndex] ?? "").trim() || fallbackHeader;
    const productMeta = await ensureProductForHeader({
      db,
      headerText,
      cache: productCache,
    });
    const cellData = parseCellValueDetails(rawValue);

    position += 1;
    await db.query(
      `
        INSERT INTO order_items (
          order_id,
          product_id,
          product_name_text,
          quantity,
          quantity_text,
          unit,
          variant,
          notes,
          raw_value_text,
          source_column_index,
          source_header_text,
          position
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12);
      `,
      [
        orderId,
        productMeta?.productId ?? null,
        String(productMeta?.name || headerText || "").trim() || null,
        cellData.quantity,
        cellData.quantityText || null,
        String(productMeta?.unit || "").trim() || null,
        String(productMeta?.variant || "").trim() || null,
        cellData.notes || null,
        cellData.rawValueText || null,
        columnIndex,
        headerText || null,
        position,
      ]
    );
  }

  return { itemsCount: position };
};

const persistNormalizedOrder = async ({
  db,
  sheetName,
  updatedRange,
  row,
  headers,
  rowNumber,
  clientId,
  parsedClient,
  orderTimestamp,
}) => {
  const orderId = await findOrCreateOrder({
    db,
    sheetName,
    updatedRange,
    rowNumber,
    clientId,
    parsedClient,
    orderTimestamp,
    row,
  });
  const items = await rebuildOrderItems({ db, orderId, row, headers });
  return { orderId, itemsCount: items.itemsCount };
};

const buildRowFromAppOrder = ({ headers, orderTimestamp, cellsJson }) => {
  const out = [];
  const safeHeaders = normalizeHeaders(headers);
  const maxFromHeaders = safeHeaders.length ? safeHeaders.length - 1 : 1;
  const cellIndexes = Object.keys(cellsJson || {})
    .map((key) => Number(key))
    .filter((value) => Number.isFinite(value));
  const maxFromCells = cellIndexes.length ? Math.max(...cellIndexes) : 1;
  const length = Math.max(maxFromHeaders, maxFromCells, 1) + 1;

  for (let i = 0; i < length; i += 1) {
    out.push("");
  }

  if (orderTimestamp instanceof Date && !Number.isNaN(orderTimestamp.getTime())) {
    out[0] = orderTimestamp.toISOString();
  }

  Object.entries(cellsJson || {}).forEach(([key, value]) => {
    const index = Number(key);
    if (!Number.isFinite(index) || index < 2) {
      return;
    }
    out[index] = value;
  });

  return out;
};

const migrateRawOrdersToNormalized = async ({ limit = 0 } = {}) => {
  const p = getPool();
  if (!p) {
    return { ok: false, skipped: true, reason: "DATABASE_URL not set" };
  }

  await ensureSchema();

  const clauses = [];
  const params = [];
  if (Number(limit) > 0) {
    params.push(Number(limit));
    clauses.push(`LIMIT $${params.length}`);
  }

  const queryText = `
    SELECT
      ao.id,
      ao.sheet_id,
      ao.sheet_row_number,
      ao.client_id,
      ao.order_timestamp,
      ao.cells_json,
      s.name AS sheet_name,
      s.headers_json
    FROM app_orders ao
    JOIN app_sheets s ON s.id = ao.sheet_id
    ORDER BY ao.id ASC
    ${clauses.join(" ")};
  `;

  const rowsResult = await p.query(queryText, params);
  const rows = Array.isArray(rowsResult?.rows) ? rowsResult.rows : [];
  let migrated = 0;
  let failed = 0;
  const errors = [];

  for (const rowRecord of rows) {
    const client = await p.connect();
    try {
      await client.query("BEGIN");

      const headers = normalizeHeaders(rowRecord.headers_json || []);
      const row = buildRowFromAppOrder({
        headers,
        orderTimestamp: rowRecord.order_timestamp ? new Date(rowRecord.order_timestamp) : null,
        cellsJson: rowRecord.cells_json || {},
      });

      const normalized = await persistNormalizedOrder({
        db: client,
        sheetName: rowRecord.sheet_name,
        updatedRange: `${rowRecord.sheet_name}!A${Number(rowRecord.sheet_row_number)}`,
        row,
        headers,
        rowNumber: Number(rowRecord.sheet_row_number),
        clientId: Number(rowRecord.client_id) || null,
        parsedClient: { rawText: "", externalId: "", name: "" },
        orderTimestamp: rowRecord.order_timestamp ? new Date(rowRecord.order_timestamp) : null,
      });

      await client.query("COMMIT");
      if (normalized?.orderId) {
        migrated += 1;
      }
    } catch (error) {
      await client.query("ROLLBACK");
      failed += 1;
      errors.push({
        appOrderId: Number(rowRecord.id) || null,
        reason: String(error?.message || error),
      });
    } finally {
      client.release();
    }
  }

  return {
    ok: true,
    total: rows.length,
    migrated,
    failed,
    errors,
  };
};

const saveOrderRow = async ({ sheetName, updatedRange, row, headers = [] }) => {
  const p = getPool();
  if (!p) {
    return { ok: false, skipped: true, reason: "DATABASE_URL not set" };
  }

  await ensureSchema();

  const rowNumber = parseRowNumberFromUpdatedRange(updatedRange);
  const orderDateText = Array.isArray(row) ? (row[0] != null ? String(row[0]) : null) : null;
  const clientText = Array.isArray(row) ? (row[1] != null ? String(row[1]) : null) : null;
  const parsedClient = parseClientText(clientText);
  const orderTimestamp = parseOrderTimestamp(orderDateText);
  const cellsJson = buildSparseCellsJson(row);

  const client = await p.connect();
  try {
    await client.query("BEGIN");

    const clientId = await resolveClientIdFromText(parsedClient, client);
    const sheetRecord = await resolveSheetRecord({ db: client, sheetName, headers });
    const sheetId = sheetRecord.sheetId;
    const normalizedHeaders = sheetRecord.headers;

    if (!sheetId || !rowNumber) {
      await client.query("ROLLBACK");
      return { ok: false, skipped: true, reason: "Invalid sheetId or rowNumber" };
    }

    await client.query(
      `
        INSERT INTO app_orders (
          sheet_id,
          sheet_row_number,
          client_id,
          order_timestamp,
          cells_json
        ) VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (sheet_id, sheet_row_number)
        DO UPDATE SET
          client_id = EXCLUDED.client_id,
          order_timestamp = EXCLUDED.order_timestamp,
          cells_json = EXCLUDED.cells_json;
      `,
      [
        sheetId,
        rowNumber,
        clientId,
        orderTimestamp,
        JSON.stringify(cellsJson),
      ]
    );

    const normalized = await persistNormalizedOrder({
      db: client,
      sheetName,
      updatedRange,
      row,
      headers: normalizedHeaders,
      rowNumber,
      clientId,
      parsedClient,
      orderTimestamp,
    });

    await client.query("COMMIT");

    return {
      ok: true,
      skipped: false,
      normalized: {
        orderId: normalized.orderId,
        itemsCount: normalized.itemsCount,
      },
    };
  } catch (error) {
    await client.query("ROLLBACK");
    return { ok: false, skipped: false, reason: String(error?.message || error) };
  } finally {
    client.release();
  }
};

export { getPool, ensureSchema, saveOrderRow, getModels, migrateRawOrdersToNormalized };
