import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { google } from "googleapis";
import { fileURLToPath } from "url";

dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const SPREADSHEET_ID = process.env.SPREADSHEET_ID || "";
const SHEET_NAME = process.env.SHEET_NAME || "Pedidos";
const TODOS_SHEET_NAME = process.env.TODOS_SHEET_NAME || "Todos";
const KEYFILE = process.env.GOOGLE_KEYFILE || process.env.GOOGLE_APPLICATION_CREDENTIALS || "";
const KEYJSON = process.env.GOOGLE_KEY_JSON || "";
const KEYBASE64 = process.env.GOOGLE_KEY_BASE64 || "";

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "1mb" }));
// Serve the static frontend from the same origin so browser storage (localStorage)
// persists reliably and the app can be opened at http://localhost:<PORT>/
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(__dirname));

const getSheetsClient = async () => {
  if (!SPREADSHEET_ID) {
    throw new Error("Missing SPREADSHEET_ID env var.");
  }

  let auth = null;
  if (KEYJSON || KEYBASE64) {
    let raw = KEYJSON;
    if (!raw && KEYBASE64) {
      raw = Buffer.from(String(KEYBASE64), "base64").toString("utf8");
    }

    let credentials = null;
    try {
      credentials = JSON.parse(String(raw || "").trim());
    } catch (error) {
      throw new Error(
        `Invalid GOOGLE_KEY_JSON/GOOGLE_KEY_BASE64 (must be a service-account JSON). ${String(
          error?.message || error
        )}`
      );
    }

    auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
  } else if (KEYFILE) {
    const resolved = path.isAbsolute(KEYFILE) ? KEYFILE : path.join(__dirname, KEYFILE);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Keyfile not found: ${resolved}`);
    }

    auth = new google.auth.GoogleAuth({
      keyFile: resolved,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
  } else {
    throw new Error(
      "Missing Google credentials. Set GOOGLE_KEY_JSON (preferred), or GOOGLE_KEY_BASE64, or GOOGLE_KEYFILE/GOOGLE_APPLICATION_CREDENTIALS."
    );
  }

  const client = await auth.getClient();
  return google.sheets({ version: "v4", auth: client });
};

const fetchSheetValues = async () => {
  const sheets = await getSheetsClient();
  const range = `${SHEET_NAME}!A1:ZZ`;
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range,
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING",
  });
  const values = response?.data?.values || [];
  if (!values.length) {
    return { values: [], warning: "No data returned (empty sheet or range)." };
  }

  const headerLen = (values[0] || []).length;
  const normalized = values.map((row) => {
    const out = Array.from(row || []);
    if (out.length < headerLen) {
      out.push(...Array(headerLen - out.length).fill(""));
    }
    return out.slice(0, headerLen);
  });

  return { values: normalized, warning: null };
};

const normalizeClientId = (value) => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  // Examples seen: "031", 31, "31) Charrua", "31 - Charrua"
  const match = raw.match(/\b(\d{1,3})\b/);
  if (!match) return "";
  const n = Number(match[1]);
  if (!Number.isFinite(n) || n <= 0) return "";
  return String(n).padStart(3, "0");
};

const fetchClientNumbersFromTodos = async () => {
  const sheets = await getSheetsClient();
  const ranges = [`${TODOS_SHEET_NAME}!C:C`, `${TODOS_SHEET_NAME}!E5:ZZ5`];
  const response = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: SPREADSHEET_ID,
    ranges,
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING",
  });

  const valueRanges = Array.isArray(response?.data?.valueRanges) ? response.data.valueRanges : [];
  const allCells = [];
  valueRanges.forEach((vr) => {
    const values = Array.isArray(vr?.values) ? vr.values : [];
    values.forEach((row) => {
      (Array.isArray(row) ? row : []).forEach((cell) => allCells.push(cell));
    });
  });

  const used = new Set();
  allCells.forEach((cell) => {
    const id = normalizeClientId(cell);
    if (id) used.add(id);
  });
  return Array.from(used).sort();
};

app.get("/api/client-numbers", async (req, res) => {
  try {
    const max = Math.min(999, Math.max(1, Number(req.query.max) || 200));
    const used = await fetchClientNumbersFromTodos();
    const usedSet = new Set(used);
    const available = [];
    for (let i = 1; i <= max; i += 1) {
      const id = String(i).padStart(3, "0");
      if (!usedSet.has(id)) {
        available.push(id);
      }
    }
    res.json({
      ok: true,
      sheetName: TODOS_SHEET_NAME,
      used,
      available,
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error?.message || error) });
  }
});

const fetchColumnADataRowCount = async () => {
  // Count rows with (potential) data in column A starting at row 2.
  // Google Forms response sheets use Timestamp in column A by default;
  // keeping app rows populated in column A prevents form inserts from
  // treating them as "outside" the response table.
  const sheets = await getSheetsClient();
  const range = `${SHEET_NAME}!A2:A`;
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range,
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING",
  });
  const values = Array.isArray(response?.data?.values) ? response.data.values : [];
  return values.length;
};

const toA1Column = (index) => {
  // 1 -> A, 26 -> Z, 27 -> AA
  let n = Number(index);
  if (!Number.isFinite(n) || n <= 0) {
    return "A";
  }
  let result = "";
  while (n > 0) {
    n -= 1;
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26);
  }
  return result;
};

const normalizeRowLength = (row, expectedLength) => {
  const normalized = Array.isArray(row) ? Array.from(row) : [];
  if (!expectedLength) {
    return normalized;
  }
  if (normalized.length > expectedLength) {
    return normalized.slice(0, expectedLength);
  }
  if (normalized.length < expectedLength) {
    normalized.push(...Array(expectedLength - normalized.length).fill(""));
  }
  return normalized;
};

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    port: PORT,
    sheetName: SHEET_NAME,
    spreadsheetIdSet: Boolean(SPREADSHEET_ID),
    keyfileSet: Boolean(KEYFILE),
    keyJsonSet: Boolean(KEYJSON || KEYBASE64),
  });
});

app.get("/api/headers", async (_req, res) => {
  try {
    const { values } = await fetchSheetValues();
    res.json({ headers: values[0] || [] });
  } catch (error) {
    res.status(500).json({ error: String(error?.message || error) });
  }
});

app.get("/api/orders", async (_req, res) => {
  try {
    const { values, warning } = await fetchSheetValues();
    res.json({ values, warning: warning || null });
  } catch (error) {
    res.status(500).json({ error: String(error?.message || error) });
  }
});

app.get("/api/debug/table", async (_req, res) => {
  try {
    const { values, warning } = await fetchSheetValues();
    const header = Array.isArray(values?.[0]) ? values[0] : [];
    const headerStrings = header.map((v) => String(v ?? ""));

    const firstNonEmptyHeaderIndex = headerStrings.findIndex((v) => v.trim() !== "");
    const nonEmptyHeaderCount = headerStrings.filter((v) => v.trim() !== "").length;

    let colACount = 0;
    try {
      colACount = await fetchColumnADataRowCount();
    } catch {
      colACount = 0;
    }

    res.json({
      ok: true,
      sheetName: SHEET_NAME,
      warning: warning || null,
      header: {
        length: headerStrings.length,
        nonEmptyCount: nonEmptyHeaderCount,
        firstNonEmptyIndex: firstNonEmptyHeaderIndex,
        firstCells: headerStrings.slice(0, 10),
      },
      columnA: {
        dataRowCountFromRow2: colACount,
        nextWriteRowNumber: 2 + colACount,
      },
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error?.message || error) });
  }
});

app.post("/api/append-order", async (req, res) => {
  try {
    const row = req?.body?.row;
    if (!Array.isArray(row) || !row.length) {
      res.status(400).json({ error: "Missing 'row' array in request body." });
      return;
    }

    const { values } = await fetchSheetValues();
    const headerLen = (values?.[0] || []).length;
    if (!headerLen) {
      res.status(500).json({ error: "Sheet header is empty; cannot write." });
      return;
    }
    const normalizedRow = normalizeRowLength(row, headerLen);
    const lastColumn = toA1Column(headerLen);

    // Write to an explicit row range to avoid Sheets API "table detection" shifting
    // the write start column when the header has blanks (A1/B1 empty).
    // Next available row is determined by the last non-empty cell in column A.
    let colACount = 0;
    try {
      colACount = await fetchColumnADataRowCount();
    } catch {
      colACount = 0;
    }
    const nextWriteRowNumber = 2 + colACount;
    const writeRange = `${SHEET_NAME}!A${nextWriteRowNumber}:${lastColumn}${nextWriteRowNumber}`;

    const sheets = await getSheetsClient();
    const response = await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: writeRange,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [normalizedRow],
      },
    });

    const updatedRange = response?.data?.updatedRange || writeRange;

    // Best-effort parallel persistence in Postgres (optional).
    // This should never block Sheets writes.
    let db = { ok: false, skipped: true, reason: "not attempted" };
    try {
      // `saveOrderRow` is imported dynamically during init and attached to app.locals
      const saveOrderRow = app.locals.saveOrderRow;
      if (typeof saveOrderRow === "function") {
        db = await saveOrderRow({ sheetName: SHEET_NAME, updatedRange, row: normalizedRow });
      } else {
        db = { ok: false, skipped: true, reason: "db module not initialized" };
      }
    } catch (error) {
      db = { ok: false, skipped: false, reason: String(error?.message || error) };
    }

    res.json({
      ok: true,
      updatedRange,
      sheetRowNumber: nextWriteRowNumber,
      writeRange,
      updates: response?.data || null,
      db,
    });
  } catch (error) {
    res.status(500).json({
      error: String(error?.message || error),
    });
  }
});

const init = async () => {
  try {
    // Import the DB module as ESM; this file remains CommonJS for now.
    // Import DB module statically now that this project is ESM
    // Prefer the js file which is already ESM
    const { saveOrderRow } = await import("./src/db/postgres.js");
    app.locals.saveOrderRow = saveOrderRow;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn("Warning: could not initialize DB module:", String(error?.message || error));
    app.locals.saveOrderRow = null;
  }

  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Sheet reader running on http://localhost:${PORT}`);
    // eslint-disable-next-line no-console
    console.log("App: /  (serves index.html)");
    console.log("Endpoints: /api/health  /api/headers  /api/orders  /api/append-order");
  });
};

init();
