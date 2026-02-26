/*
  Read-only helper: finds rows *below* the Google Forms response table.

  This diagnoses the "Forms pushes app rows down" behavior:
  if an app-written row doesn't have a value in column A (timestamp/date),
  Google Forms doesn't consider it part of the responses table and keeps
  inserting new rows above it.

  Usage:
    node scripts/find_rows_below_table.js 200

  Prints any non-empty rows in A..H for the scanned window.

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

const normalizeCell = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

const main = async () => {
  const windowSize = toInt(process.argv[2], 200);
  const sheets = await getSheetsClient();

  // Determine last row of the Forms table by counting column A values.
  const colAResp = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A2:A`,
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING",
  });
  const colAValues = Array.isArray(colAResp?.data?.values) ? colAResp.data.values : [];
  const lastTableRow = 1 + colAValues.length;

  const start = lastTableRow + 1;
  const end = lastTableRow + windowSize;
  const range = `${SHEET_NAME}!A${start}:H${end}`;

  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range,
    valueRenderOption: "FORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING",
  });

  const rows = Array.isArray(resp?.data?.values) ? resp.data.values : [];
  console.log(`Sheet=${SHEET_NAME} tableLastRow=${lastTableRow} scanning ${range}`);

  let found = 0;
  rows.forEach((row, i) => {
    const rowNumber = start + i;
    const cells = Array.from({ length: 8 }).map((_, idx) => (row && row[idx] != null ? row[idx] : ""));
    const normalized = cells.map(normalizeCell);
    const any = normalized.some(Boolean);
    if (!any) {
      return;
    }
    found += 1;
    // Mark which columns have values.
    const mask = normalized.map((v, idx) => (v ? String.fromCharCode(65 + idx) : ".")).join("");
    console.log(`${rowNumber}\tmask=${mask}\t${normalized.join("\t")}`);
  });

  if (!found) {
    console.log("No non-empty rows found below the table in the scanned window.");
  }
};

main().catch((error) => {
  console.error(String(error?.message || error));
  process.exitCode = 1;
});
