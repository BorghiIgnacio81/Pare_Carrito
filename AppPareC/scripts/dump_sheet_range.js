/*
  Dump a rectangular range from a Google Sheet.

  Usage:
    node scripts/dump_sheet_range.js --tab "Todos" --range "A1:AD8"

  Reads SPREADSHEET_ID and GOOGLE_KEYFILE from .env.
*/

const path = require('path');
const { google } = require('googleapis');

require('dotenv').config();

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const value = argv[i + 1];
    args[key] = value;
    i += 1;
  }
  return args;
}

function padRight(s, len) {
  const str = String(s ?? '');
  if (str.length >= len) return str;
  return str + ' '.repeat(len - str.length);
}

async function main() {
  const args = parseArgs(process.argv);
  const spreadsheetId = process.env.SPREADSHEET_ID;
  if (!spreadsheetId) throw new Error('Missing SPREADSHEET_ID in .env');

  const tab = args.tab;
  const rangeA1 = args.range;
  if (!tab || !rangeA1) throw new Error('Usage: --tab "Todos" --range "A1:AD8"');

  const keyFile = path.join(process.cwd(), process.env.GOOGLE_KEYFILE);
  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const client = await auth.getClient();
  const api = google.sheets({ version: 'v4', auth: client });

  const range = `${tab}!${rangeA1}`;
  const res = await api.spreadsheets.values.get({
    spreadsheetId,
    range,
    valueRenderOption: 'FORMATTED_VALUE',
    dateTimeRenderOption: 'FORMATTED_STRING',
  });

  const values = Array.isArray(res?.data?.values) ? res.data.values : [];
  const colCount = Math.max(0, ...values.map((r) => (r || []).length));

  // Compute column labels A, B, C...
  const colLabels = [];
  for (let i = 1; i <= colCount; i += 1) {
    let n = i;
    let label = '';
    while (n > 0) {
      n -= 1;
      label = String.fromCharCode(65 + (n % 26)) + label;
      n = Math.floor(n / 26);
    }
    colLabels.push(label);
  }

  const width = 18;
  console.log(`Range: ${range}`);
  console.log('     ' + colLabels.map((c) => padRight(c, width)).join(''));

  for (let r = 0; r < values.length; r += 1) {
    const row = values[r] || [];
    const out = [];
    for (let c = 0; c < colCount; c += 1) {
      out.push(padRight(String(row[c] ?? ''), width));
    }
    const rn = String(r + 1).padStart(3, ' ');
    console.log(`${rn}: ` + out.join(''));
  }
}

main().catch((err) => {
  console.error('ERROR:', err?.message || String(err));
  process.exit(1);
});
