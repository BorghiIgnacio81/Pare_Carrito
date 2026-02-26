/*
  Read-only inspection helper to understand how rows are being laid out in the "Pedidos" sheet.

  Prints the last N rows (A..H) to help diagnose Google Forms insertion behavior.

  Usage:
    node scripts/inspect_pedidos_tail.js 25

  Requires env vars:
    SPREADSHEET_ID
    GOOGLE_KEYFILE or GOOGLE_APPLICATION_CREDENTIALS
    (optional) SHEET_NAME (defaults to "Pedidos")
*/

const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");
const { google } = require("googleapis");

dotenv.config();

const SPREADSHEET_ID = process.env.SPREADSHEET_ID || "";
const SHEET_NAME = process.env.SHEET_NAME || "Pedidos";
const KEYFILE = process.env.GOOGLE_KEYFILE || process.env.GOOGLE_APPLICATION_CREDENTIALS || "";

const toInt = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
};

const getSheetsClient = async () => {
  if (!KEYFILE) {
    throw new Error(
      "Missing KEYFILE. Set GOOGLE_KEYFILE or GOOGLE_APPLICATION_CREDENTIALS to your service-account json."
    );
  }
  if (!SPREADSHEET_ID) {
    throw new Error("Missing SPREADSHEET_ID env var.");
  }
  const resolved = path.isAbsolute(KEYFILE) ? KEYFILE : path.join(__dirname, "..", KEYFILE);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Keyfile not found: ${resolved}`);
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: resolved,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const client = await auth.getClient();
  return google.sheets({ version: "v4", auth: client });
};

const main = async () => {
  const n = toInt(process.argv[2], 20);
  const sheets = await getSheetsClient();

  // Determine last used row by counting column A values.
  const colAResp = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A2:A`,
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING",
  });
  const colAValues = Array.isArray(colAResp?.data?.values) ? colAResp.data.values : [];
  const lastRow = 1 + colAValues.length; // + header row

  const start = Math.max(2, lastRow - n + 1);
  const range = `${SHEET_NAME}!A${start}:H${lastRow}`;

  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range,
    valueRenderOption: "FORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING",
  });

  const rows = Array.isArray(resp?.data?.values) ? resp.data.values : [];
  console.log(`Sheet=${SHEET_NAME} lastRow=${lastRow} showing ${rows.length} rows (${range})`);
  rows.forEach((row, i) => {
    const rowNumber = start + i;
    const cells = Array.from({ length: 8 }).map((_, idx) => (row && row[idx] != null ? String(row[idx]) : ""));
    const preview = cells
      .map((c) => c.replace(/\s+/g, " ").trim())
      .map((c) => (c.length > 24 ? `${c.slice(0, 24)}…` : c));
    console.log(`${rowNumber}\t${preview.join("\t")}`);
  });
};

main().catch((error) => {
  console.error(String(error?.message || error));
  process.exitCode = 1;
});
