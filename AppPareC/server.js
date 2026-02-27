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
const TASKS_SHEET_NAME = process.env.TAREAS_SHEET_NAME || "Div Comp";
const TASKS_DOC_ID =
  process.env.TAREAS_DOC_ID ||
  process.env.TASKS_DOC_ID ||
  "1o-nrvtiADfTDfFswAz6kX5tq6AL7Dc6r1G0lQefsxhQ";
const PRINT_SHEET_TRAFFIC = process.env.IMPRESION_TRAFFIC_SHEET || "Trafic";
const PRINT_SHEET_KANGOO = process.env.IMPRESION_KANGOO_SHEET || "Kangoo";
const PRINT_DOC_ID =
  process.env.IMPRESION_DOC_ID ||
  process.env.PRINT_DOC_ID ||
  "15g6rQu0ZXqtXLDsMtNhYMl5lOI4Dmx0qjSm5gOse_d0";
const KEYFILE = process.env.GOOGLE_KEYFILE || process.env.GOOGLE_APPLICATION_CREDENTIALS || "";
const KEYJSON = process.env.GOOGLE_KEY_JSON || "";
const KEYBASE64 = process.env.GOOGLE_KEY_BASE64 || "";

const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "2mb" }));
// Serve the static frontend from the same origin so browser storage (localStorage)
// persists reliably and the app can be opened at http://localhost:<PORT>/
const __dirname = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(__dirname));

const ALIASES_PATH = path.join(__dirname, "data", "aliases.json");

const readAliasesFile = () => {
  if (!fs.existsSync(ALIASES_PATH)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(ALIASES_PATH, "utf8");
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
};

const writeAliasesFile = (data) => {
  const payload = data && typeof data === "object" ? data : {};
  fs.mkdirSync(path.dirname(ALIASES_PATH), { recursive: true });
  fs.writeFileSync(ALIASES_PATH, JSON.stringify(payload, null, 2), "utf8");
};

const getGoogleAuthClient = async (scopes) => {
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
      scopes,
    });
  } else if (KEYFILE) {
    const resolved = path.isAbsolute(KEYFILE) ? KEYFILE : path.join(__dirname, KEYFILE);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Keyfile not found: ${resolved}`);
    }

    auth = new google.auth.GoogleAuth({
      keyFile: resolved,
      scopes,
    });
  } else {
    throw new Error(
      "Missing Google credentials. Set GOOGLE_KEY_JSON (preferred), or GOOGLE_KEY_BASE64, or GOOGLE_KEYFILE/GOOGLE_APPLICATION_CREDENTIALS."
    );
  }

  return auth.getClient();
};

const getSheetsClient = async () => {
  const client = await getGoogleAuthClient(["https://www.googleapis.com/auth/spreadsheets"]);
  return google.sheets({ version: "v4", auth: client });
};

const getDocsClient = async () => {
  const client = await getGoogleAuthClient([
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/drive",
  ]);
  return google.docs({ version: "v1", auth: client });
};

const getDriveClient = async () => {
  const client = await getGoogleAuthClient([
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/drive",
  ]);
  return google.drive({ version: "v3", auth: client });
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

const formatDate = (date) => {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());
  return `${day}/${month}/${year}`;
};

const isEmptyRow = (row) =>
  !row || row.every((cell) => !String(cell ?? "").trim());

const sliceToFirstEmpty = (rows) => {
  const result = [];
  const data = Array.isArray(rows) ? rows : [];
  for (const row of data) {
    if (isEmptyRow(row)) {
      break;
    }
    result.push(row);
  }
  return result;
};

const sliceToSecondEmpty = (rows) => {
  const result = [];
  const data = Array.isArray(rows) ? rows : [];
  let emptyCount = 0;
  for (const row of data) {
    if (isEmptyRow(row)) {
      emptyCount += 1;
      if (emptyCount >= 2) {
        break;
      }
      continue;
    }
    result.push(row);
  }
  return result;
};

const sliceToThirdEmpty = (rows) => {
  const result = [];
  const data = Array.isArray(rows) ? rows : [];
  let emptyCount = 0;
  for (const row of data) {
    if (isEmptyRow(row)) {
      emptyCount += 1;
      if (emptyCount >= 3) {
        break;
      }
      continue;
    }
    result.push(row);
  }
  return result;
};

const rowsToPlainText = (rows) =>
  (rows || [])
    .map((row) => (row || []).map((cell) => String(cell ?? "")).join("\t").trimEnd())
    .filter((line) => line.trim())
    .join("\n");

const fetchRangeRows = async (sheetName, range) => {
  const sheets = await getSheetsClient();
  const fullRange = `'${sheetName}'!${range}`;
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: fullRange,
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING",
  });
  const values = Array.isArray(response?.data?.values) ? response.data.values : [];
  return values.map((row) => Array.isArray(row) ? row : [row ?? ""]);
};

const fetchSingleCell = async (sheetName, cell) => {
  const sheets = await getSheetsClient();
  const range = `'${sheetName}'!${cell}`;
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range,
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING",
  });
  return response?.data?.values?.[0]?.[0] ?? "";
};

const buildDocTextSegments = (doc) => {
  const content = Array.isArray(doc?.data?.body?.content) ? doc.data.body.content : [];
  const segments = [];
  let offset = 0;
  for (const block of content) {
    const elements = block?.paragraph?.elements || [];
    for (const element of elements) {
      const text = element?.textRun?.content || "";
      if (!text) {
        continue;
      }
      const startIndex = Number(element.startIndex || 0);
      const normalized = text.replace(/\u00a0/g, " ");
      segments.push({ text, normalized, startIndex, offset });
      offset += text.length;
    }
  }
  return { segments, fullText: segments.map((s) => s.normalized).join("") };
};

const mapOffsetToDocIndex = (segments, offset) => {
  for (const segment of segments) {
    const length = segment.text.length;
    if (offset <= segment.offset + length) {
      const local = Math.max(0, offset - segment.offset);
      return segment.startIndex + local;
    }
  }
  return null;
};

const findMarkerRangeByRegex = (doc, regex) => {
  const { segments, fullText } = buildDocTextSegments(doc);
  if (!fullText) {
    return null;
  }
  const match = regex.exec(fullText);
  if (!match) {
    return null;
  }
  const startOffset = match.index;
  const endOffset = match.index + match[0].length;
  const startIndex = mapOffsetToDocIndex(segments, startOffset);
  const endIndex = mapOffsetToDocIndex(segments, endOffset);
  if (startIndex == null || endIndex == null) {
    return null;
  }
  return { startIndex, endIndex };
};

const findMarkerRange = (doc, regexes) => {
  const list = Array.isArray(regexes) ? regexes : [regexes];
  for (const regex of list) {
    regex.lastIndex = 0;
    const match = findMarkerRangeByRegex(doc, regex);
    if (match) {
      return match;
    }
  }
  return null;
};

const getDocumentEndIndex = (doc) => {
  const content = Array.isArray(doc?.data?.body?.content) ? doc.data.body.content : [];
  const last = content.length ? content[content.length - 1] : null;
  const endIndex = last?.endIndex ? Number(last.endIndex) : 1;
  return Math.max(1, endIndex - 1);
};

const fetchDivCompRanges = async () => {
  const sheets = await getSheetsClient();
  const ranges = [
    `'${TASKS_SHEET_NAME}'!J2:L`,
    `'${TASKS_SHEET_NAME}'!N2:P`,
    `'${TASKS_SHEET_NAME}'!Q2:S3`,
    `'${TASKS_SHEET_NAME}'!T15:U`,
  ];
  const response = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: SPREADSHEET_ID,
    ranges,
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING",
  });
  const valueRanges = Array.isArray(response?.data?.valueRanges) ? response.data.valueRanges : [];
  const part1 = sliceToFirstEmpty(valueRanges[0]?.values || []);
  const part2 = sliceToFirstEmpty(valueRanges[1]?.values || []);
  const part3 = valueRanges[2]?.values || [];
  const part4 = sliceToSecondEmpty(valueRanges[3]?.values || []);
  return { part1, part2, part3, part4 };
};

const replaceDateInRows = (rows, dateText) => {
  const dateRegex = /\b\d{2}\/\d{2}\/\d{4}\b/g;
  return (rows || []).map((row) =>
    (row || []).map((cell) => String(cell ?? "").replace(dateRegex, dateText))
  );
};

const buildTasksDocumentPayload = ({ part1, part2, part3, part4 }) => {
  const today = formatDate(new Date());
  const safePart1 = replaceDateInRows(part1, today);
  const safePart2 = replaceDateInRows(part2, today);
  const safePart3 = replaceDateInRows(part3, today);
  const safePart4 = replaceDateInRows(part4, today);
  const parts = [
    rowsToPlainText(safePart1),
    rowsToPlainText(safePart2),
    rowsToPlainText(safePart3),
    rowsToPlainText(safePart4),
  ];

  const separators = "\n\n";
  const text = parts.join(separators).trim();

  const lengths = parts.map((part) => part.length);
  const offsets = [];
  let cursor = 0;
  lengths.forEach((len, index) => {
    offsets.push({ start: cursor, end: cursor + len });
    cursor += len;
    if (index < lengths.length - 1) {
      cursor += separators.length;
    }
  });

  const boldRanges = [];
  const part3Range = offsets[2];
  const part4Range = offsets[3];
  if (part3Range && part3Range.end > part3Range.start) {
    boldRanges.push(part3Range);
  }
  if (part4Range && part4Range.end > part4Range.start) {
    boldRanges.push(part4Range);
  }

  return { text, boldRanges };
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

app.get("/api/tareas/pdf", async (req, res) => {
  try {
    if (!TASKS_DOC_ID) {
      res.status(500).send("Missing TAREAS_DOC_ID/TASKS_DOC_ID.");
      return;
    }

    const ranges = await fetchDivCompRanges();
    const payload = buildTasksDocumentPayload(ranges);

    const docs = await getDocsClient();
    const doc = await docs.documents.get({ documentId: TASKS_DOC_ID });
    const content = Array.isArray(doc?.data?.body?.content) ? doc.data.body.content : [];
    const last = content.length ? content[content.length - 1] : null;
    const endIndex = last?.endIndex ? Number(last.endIndex) : 1;

    const requests = [];
    if (endIndex > 1) {
      requests.push({
        deleteContentRange: {
          range: { startIndex: 1, endIndex: endIndex - 1 },
        },
      });
    }
    requests.push({
      insertText: {
        location: { index: 1 },
        text: payload.text,
      },
    });

    if (payload.text) {
      requests.push({
        updateTextStyle: {
          range: {
            startIndex: 1,
            endIndex: 1 + payload.text.length,
          },
          textStyle: { bold: false },
          fields: "bold",
        },
      });
    }

    payload.boldRanges.forEach((range) => {
      requests.push({
        updateTextStyle: {
          range: {
            startIndex: 1 + range.start,
            endIndex: 1 + range.end,
          },
          textStyle: { bold: true },
          fields: "bold",
        },
      });
    });

    await docs.documents.batchUpdate({
      documentId: TASKS_DOC_ID,
      requestBody: { requests },
    });

    const drive = await getDriveClient();
    const pdf = await drive.files.export(
      { fileId: TASKS_DOC_ID, mimeType: "application/pdf" },
      { responseType: "arraybuffer" }
    );

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=\"tareas.pdf\"");
    res.status(200).send(Buffer.from(pdf.data));
  } catch (error) {
    console.error("/api/tareas/pdf failed:", error);
    res.status(500).send(String(error?.message || error));
  }
});

app.get("/api/imprimir-pedidos/pdf", async (_req, res) => {
  try {
    if (!PRINT_DOC_ID) {
      res.status(500).send("Missing IMPRESION_DOC_ID/PRINT_DOC_ID.");
      return;
    }

    const [traficA, traficGH, kangooA, kangooGH, kangooA4] = await Promise.all([
      fetchRangeRows(PRINT_SHEET_TRAFFIC, "A4:A2000"),
      fetchRangeRows(PRINT_SHEET_TRAFFIC, "G6:H2000"),
      fetchRangeRows(PRINT_SHEET_KANGOO, "A4:A2000"),
      fetchRangeRows(PRINT_SHEET_KANGOO, "G6:H2000"),
      fetchSingleCell(PRINT_SHEET_KANGOO, "A4"),
    ]);

    const flete1Rows = sliceToThirdEmpty([...traficA, [], [], []]);
    const suma1Rows = sliceToFirstEmpty([...traficGH, []]);
    const flete2Rows = sliceToThirdEmpty([...kangooA, [], [], []]);
    const suma2Rows = sliceToFirstEmpty([...kangooGH, []]);

    const flete1Text = rowsToPlainText(flete1Rows);
    const suma1Text = rowsToPlainText(suma1Rows);
    const flete2Text = rowsToPlainText(flete2Rows);
    const suma2Text = rowsToPlainText(suma2Rows);
    const hasFlete2 = String(kangooA4 ?? "").trim() !== "#N/A";

    const docs = await getDocsClient();
    let doc = await docs.documents.get({ documentId: PRINT_DOC_ID });

    const insertSectionBetween = (requestList, fromMarker, toMarker, text, addBlankAfter = false) => {
      const startIndex = fromMarker.endIndex;
      const endIndex = toMarker.startIndex;
      if (endIndex > startIndex) {
        requestList.push({
          deleteContentRange: {
            range: { startIndex, endIndex },
          },
        });
      }
      const tail = addBlankAfter ? "\n\n" : "\n";
      const payload = text ? `\n${text}${tail}` : `\n${tail}`;
      requestList.push({
        insertText: {
          location: { index: startIndex },
          text: payload,
        },
      });
    };

    const flete1Marker = findMarkerRange(doc, [
      /(^|\n)\s*FLETE\s*1\b/i,
      /(^|\n)\s*FLETE\s*I\b/i,
      /FLETE\s*1\b/i,
    ]);
    const suma1Marker = findMarkerRange(doc, [
      /(^|\n)\s*SUMA\s+FLETE\s*1\b/i,
      /(^|\n)\s*SUMA\s+FLETE\s*I\b/i,
      /SUMA\s+FLETE\s*1\b/i,
    ]);
    if (!flete1Marker || !suma1Marker) {
      throw new Error("No se encontraron marcadores de FLETE 1 en el Doc.");
    }

    const flete2Marker = findMarkerRange(doc, [
      /(^|\n)\s*FLETE\s*2\b/i,
      /(^|\n)\s*FLETE\s*II\b/i,
      /FLETE\s*2\b/i,
    ]);
    const suma2Marker = findMarkerRange(doc, [
      /(^|\n)\s*SUMA\s+FLETE\s*2\b/i,
      /(^|\n)\s*SUMA\s+FLETE\s*II\b/i,
      /SUMA\s+FLETE\s*2\b/i,
    ]);
    const docEndIndex = getDocumentEndIndex(doc);

    const requests1 = [];
    insertSectionBetween(requests1, flete1Marker, suma1Marker, flete1Text, true);

    if (flete2Marker) {
      insertSectionBetween(requests1, suma1Marker, flete2Marker, suma1Text, false);
    } else {
      if (docEndIndex > suma1Marker.endIndex) {
        requests1.push({
          deleteContentRange: {
            range: { startIndex: suma1Marker.endIndex, endIndex: docEndIndex },
          },
        });
      }
      const payload = suma1Text ? `\n${suma1Text}\n` : "\n";
      requests1.push({
        insertText: {
          location: { index: suma1Marker.endIndex },
          text: payload,
        },
      });
    }

    if (requests1.length) {
      await docs.documents.batchUpdate({
        documentId: PRINT_DOC_ID,
        requestBody: { requests: requests1 },
      });
    }

    doc = await docs.documents.get({ documentId: PRINT_DOC_ID });

    if (!hasFlete2) {
      const updatedFlete2 = findMarkerRange(doc, [
        /(^|\n)\s*FLETE\s*2\b/i,
        /(^|\n)\s*FLETE\s*II\b/i,
        /FLETE\s*2\b/i,
      ]);
      const updatedEnd = getDocumentEndIndex(doc);
      if (updatedFlete2 && updatedEnd > updatedFlete2.startIndex) {
        await docs.documents.batchUpdate({
          documentId: PRINT_DOC_ID,
          requestBody: {
            requests: [
              {
                deleteContentRange: {
                  range: { startIndex: updatedFlete2.startIndex, endIndex: updatedEnd },
                },
              },
            ],
          },
        });
      }
    } else {
      const updatedFlete2 = findMarkerRange(doc, [
        /(^|\n)\s*FLETE\s*2\b/i,
        /(^|\n)\s*FLETE\s*II\b/i,
        /FLETE\s*2\b/i,
      ]);
      const updatedSuma2 = findMarkerRange(doc, [
        /(^|\n)\s*SUMA\s+FLETE\s*2\b/i,
        /(^|\n)\s*SUMA\s+FLETE\s*II\b/i,
        /SUMA\s+FLETE\s*2\b/i,
      ]);
      if (!updatedFlete2 || !updatedSuma2) {
        throw new Error("No se encontraron marcadores de FLETE 2 en el Doc.");
      }

      await docs.documents.batchUpdate({
        documentId: PRINT_DOC_ID,
        requestBody: {
          requests: [
            {
              insertPageBreak: {
                location: { index: updatedFlete2.startIndex },
              },
            },
          ],
        },
      });

      doc = await docs.documents.get({ documentId: PRINT_DOC_ID });
      const finalFlete2 = findMarkerRange(doc, [
        /(^|\n)\s*FLETE\s*2\b/i,
        /(^|\n)\s*FLETE\s*II\b/i,
        /FLETE\s*2\b/i,
      ]);
      const finalSuma2 = findMarkerRange(doc, [
        /(^|\n)\s*SUMA\s+FLETE\s*2\b/i,
        /(^|\n)\s*SUMA\s+FLETE\s*II\b/i,
        /SUMA\s+FLETE\s*2\b/i,
      ]);
      if (!finalFlete2 || !finalSuma2) {
        throw new Error("No se encontraron marcadores de FLETE 2 en el Doc.");
      }

      const requests2 = [];
      insertSectionBetween(requests2, finalFlete2, finalSuma2, flete2Text, true);

      const endAfterSuma2 = getDocumentEndIndex(doc);
      if (endAfterSuma2 > finalSuma2.endIndex) {
        requests2.push({
          deleteContentRange: {
            range: { startIndex: finalSuma2.endIndex, endIndex: endAfterSuma2 },
          },
        });
      }
      const suma2Payload = suma2Text ? `\n${suma2Text}\n` : "\n";
      requests2.push({
        insertText: {
          location: { index: finalSuma2.endIndex },
          text: suma2Payload,
        },
      });

      if (requests2.length) {
        await docs.documents.batchUpdate({
          documentId: PRINT_DOC_ID,
          requestBody: { requests: requests2 },
        });
      }
    }

    const drive = await getDriveClient();
    const pdf = await drive.files.export(
      { fileId: PRINT_DOC_ID, mimeType: "application/pdf" },
      { responseType: "arraybuffer" }
    );

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=\"imprimir-pedidos.pdf\"");
    res.status(200).send(Buffer.from(pdf.data));
  } catch (error) {
    console.error("/api/imprimir-pedidos/pdf failed:", error);
    res.status(500).send(String(error?.message || error));
  }
});

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

app.get("/api/aliases", (_req, res) => {
  const data = readAliasesFile();
  res.json({ ok: true, data });
});

app.post("/api/aliases", (req, res) => {
  try {
    const data = req?.body?.data;
    if (!data || typeof data !== "object") {
      res.status(400).json({ ok: false, error: "Payload invalido." });
      return;
    }
    writeAliasesFile(data);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error?.message || error) });
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
