/*
  Scan a Google Sheet tab for keyword occurrences.

  Usage:
    node scripts/scan_sheet_tab_keywords.js --spreadsheet <ID> --tabs "Trafic,Kangoo" --range "A1:AZ300" --keywords "Flete 2,Suma Flete 2"

  Notes:
  - Uses the service account keyfile configured via .env (GOOGLE_KEYFILE).
  - Requires the sheet to be shared with the service account email.
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

function truncate(value, maxLen) {
  const s = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 1) + '…';
}

async function main() {
  const args = parseArgs(process.argv);

  const spreadsheetId = args.spreadsheet || process.env.SPREADSHEET_ID;
  if (!spreadsheetId) throw new Error('Missing --spreadsheet <ID> (or SPREADSHEET_ID in .env).');

  const tabs = String(args.tabs || '').split(',').map((t) => t.trim()).filter(Boolean);
  if (!tabs.length) throw new Error('Missing --tabs "Tab1,Tab2"');

  const rangeA1 = args.range || 'A1:AZ300';

  const keywords = String(args.keywords || '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
  if (!keywords.length) throw new Error('Missing --keywords "kw1,kw2"');

  const keyFile = path.join(process.cwd(), process.env.GOOGLE_KEYFILE || 'pare-carrito-486901-147a8be85a05.json');
  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const client = await auth.getClient();
  const api = google.sheets({ version: 'v4', auth: client });

  for (const tab of tabs) {
    const range = `${tab}!${rangeA1}`;
    const res = await api.spreadsheets.values.get({
      spreadsheetId,
      range,
      valueRenderOption: 'FORMATTED_VALUE',
      dateTimeRenderOption: 'FORMATTED_STRING',
    });

    const values = Array.isArray(res?.data?.values) ? res.data.values : [];

    const hits = [];
    for (let r = 0; r < values.length; r += 1) {
      const row = values[r] || [];
      for (let c = 0; c < row.length; c += 1) {
        const cell = String(row[c] ?? '');
        if (!cell.trim()) continue;
        const lower = cell.toLowerCase();
        for (const kw of keywords) {
          if (lower.includes(kw.toLowerCase())) {
            hits.push({
              keyword: kw,
              row: r + 1,
              col: c + 1,
              cell: truncate(cell, 80),
            });
          }
        }
      }
    }

    console.log(`\n=== ${tab} (${rangeA1}) ===`);
    if (!hits.length) {
      console.log('No hits.');
      continue;
    }

    // Deduplicate same keyword in same position.
    const seen = new Set();
    const uniq = [];
    for (const h of hits) {
      const k = `${h.keyword}|${h.row}|${h.col}`;
      if (seen.has(k)) continue;
      seen.add(k);
      uniq.push(h);
    }

    for (const h of uniq.slice(0, 80)) {
      console.log(`${h.keyword} @R${h.row}C${h.col} = "${h.cell}"`);
    }

    if (uniq.length > 80) {
      console.log(`…and ${uniq.length - 80} more hits.`);
    }
  }
}

main().catch((err) => {
  console.error('ERROR:', err?.message || String(err));
  process.exit(1);
});
