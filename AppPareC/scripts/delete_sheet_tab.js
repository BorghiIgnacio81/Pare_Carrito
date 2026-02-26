/*
  Deletes a sheet tab by title in the configured spreadsheet.

  Usage (PowerShell):
    node scripts/delete_sheet_tab.js "Pedidos App"

  Requires env vars (already used by server.js):
    SPREADSHEET_ID
    GOOGLE_KEYFILE or GOOGLE_APPLICATION_CREDENTIALS
*/

const path = require("path");
const fs = require("fs");
const dotenv = require("dotenv");
const { google } = require("googleapis");

dotenv.config();

const SPREADSHEET_ID = process.env.SPREADSHEET_ID || "";
const KEYFILE = process.env.GOOGLE_KEYFILE || process.env.GOOGLE_APPLICATION_CREDENTIALS || "";

const titleToDelete = process.argv.slice(2).join(" ").trim();

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
  if (!titleToDelete) {
    console.error('Missing sheet title. Example: node scripts/delete_sheet_tab.js "Pedidos App"');
    process.exitCode = 2;
    return;
  }

  const sheets = await getSheetsClient();
  const meta = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
    fields: "sheets(properties(sheetId,title))",
  });

  const found = (meta?.data?.sheets || [])
    .map((s) => s?.properties)
    .find((p) => String(p?.title || "") === titleToDelete);

  if (!found?.sheetId) {
    console.log(`Sheet not found: ${titleToDelete}`);
    return;
  }

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SPREADSHEET_ID,
    requestBody: {
      requests: [{ deleteSheet: { sheetId: found.sheetId } }],
    },
  });

  console.log(`Deleted sheet: ${titleToDelete} (sheetId=${found.sheetId})`);
};

main().catch((error) => {
  console.error(String(error?.message || error));
  process.exitCode = 1;
});
