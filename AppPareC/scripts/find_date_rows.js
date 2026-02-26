/*
  Read-only helper to locate rows by date text in column A.

  Usage:
    node scripts/find_date_rows.js 17/02/2026

  Prints matching row numbers and columns A..D.

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

const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

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
  const needle = normalize(process.argv.slice(2).join(" "));
  if (!needle) {
    console.error("Usage: node scripts/find_date_rows.js 17/02/2026");
    process.exitCode = 2;
    return;
  }

  const sheets = await getSheetsClient();
  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A2:D`,
    valueRenderOption: "FORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING",
  });

  const rows = Array.isArray(resp?.data?.values) ? resp.data.values : [];
  let found = 0;

  rows.forEach((row, idx) => {
    const rowNumber = 2 + idx;
    const a = normalize(row?.[0]);
    if (!a) {
      return;
    }
    if (!a.includes(needle)) {
      return;
    }
    found += 1;
    const preview = [0, 1, 2, 3].map((i) => normalize(row?.[i]));
    console.log(`${rowNumber}\t${preview.join("\t")}`);
  });

  if (!found) {
    console.log(`No rows found with column A containing: ${needle}`);
  }
};

main().catch((error) => {
  console.error(String(error?.message || error));
  process.exitCode = 1;
});
