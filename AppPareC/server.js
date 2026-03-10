import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { google } from "googleapis";
import { fileURLToPath } from "url";
import { createPdfReportsController } from "./src/controllers/pdfReportsController.js";
import { createMasterDataController } from "./src/controllers/masterDataController.js";
import { todosClientColumnEntries } from "./src/constants/todosClientColumns.js";
import { normalizeProductFromHeader } from "./src/catalog/sheetCatalog.js";
import { normalizeVariantForSheetMatch } from "./src/catalog/sheetCatalog.js";

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

const TAREAS_PDF_DIR = path.join(__dirname, "TareasPDF");
const IMPRIMIR_PEDIDOS_PDF_DIR = path.join(__dirname, "ImprimirPedidosPDF");

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

const dateTokenRegex = /\d{1,2}\s*[\/\.\-／⁄]\s*\d{1,2}\s*[\/\.\-／⁄]\s*\d{2,4}/g;

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

const normalizeDivCompProductKey = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");

const fetchDivCompProductResponsibles = async () => {
  const sheets = await getSheetsClient();
  const range = `'${TASKS_SHEET_NAME}'!A2:B`;
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range,
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING",
  });
  const values = Array.isArray(response?.data?.values) ? response.data.values : [];
  return values
    .map((row, index) => {
      const responsibleName = String(row?.[0] ?? "").trim();
      const productName = String(row?.[1] ?? "").trim();
      if (!productName) {
        return null;
      }
      return {
        rowNumber: index + 2,
        productName,
        responsibleName,
        normalizedProduct: normalizeDivCompProductKey(productName),
      };
    })
    .filter(Boolean);
};

const formatDbQuantityText = (item) => {
  const text = String(item?.quantityText || "").trim();
  if (text) {
    return text;
  }
  const quantity = Number(item?.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return "";
  }
  if (Number.isInteger(quantity)) {
    return String(quantity);
  }
  return String(Math.round(quantity * 1000) / 1000).replace(".", ",");
};

const buildTasksRangesFromDb = ({ orders = [], clientResponsibleByExternalId = new Map() } = {}) => {
  const safeOrders = Array.isArray(orders) ? orders : [];
  const sectionProducts = new Map();

  const toThreeDigits = (value) => {
    const numeric = String(value ?? "").match(/\d{1,3}/)?.[0] || "";
    if (!numeric) return "";
    return String(Number(numeric)).padStart(3, "0");
  };

  const toClientLabel = (value) => {
    const numeric = String(value ?? "").match(/\d{1,3}/)?.[0] || "";
    if (!numeric) return String(value ?? "").trim();
    return String(Number(numeric));
  };

  const formatQty = (value) => {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) {
      return "0";
    }
    return String(Math.round(num * 1000) / 1000).replace(".", ",");
  };

  const addToMap = (targetMap, productLabel, clientLabel, qty) => {
    if (!targetMap.has(productLabel)) {
      targetMap.set(productLabel, { total: 0, byClient: new Map() });
    }
    const entry = targetMap.get(productLabel);
    entry.total += qty;
    entry.byClient.set(clientLabel, Number(entry.byClient.get(clientLabel) || 0) + qty);
  };

  const toProductLine = (productLabel, entry) => {
    const clientParts = Array.from(entry.byClient.entries())
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([clientId, total]) => `${clientId}) ${formatQty(total)}`);
    return `${productLabel}${clientParts.length ? ` / ${clientParts.join(" / ")}` : ""} = ${formatQty(entry.total)}`;
  };

  const buildSectionRows = (sectionName, sourceMap) => {
    const map = sourceMap || new Map();
    const products = Array.from(map.entries());
    if (!products.length) {
      return [];
    }
    const rows = [[sectionName]];
    products.forEach(([productLabel, entry]) => {
      rows.push([toProductLine(productLabel, entry)]);
    });
    return rows;
  };

  const filterMapByProduct = (sourceMap, predicate) => {
    const out = new Map();
    const map = sourceMap || new Map();
    Array.from(map.entries()).forEach(([productLabel, entry]) => {
      if (predicate(productLabel)) {
        out.set(productLabel, entry);
      }
    });
    return out;
  };

  safeOrders.forEach((order) => {
    const rawClientId = String(order?.clientId || "").trim();
    const normalizedClientId = toThreeDigits(rawClientId);
    const clientLabel = toClientLabel(rawClientId || normalizedClientId);
    if (!clientLabel) {
      return;
    }

    const responsibleName =
      String(clientResponsibleByExternalId.get(normalizedClientId) || "Sin responsable").trim() ||
      "Sin responsable";

    if (!sectionProducts.has(responsibleName)) {
      sectionProducts.set(responsibleName, new Map());
    }
    const productMap = sectionProducts.get(responsibleName);

    (Array.isArray(order?.items) ? order.items : []).forEach((item) => {
      const productName = String(item?.productName || "").trim();
      if (!productName) {
        return;
      }
      const variant = String(item?.variant || "").trim();
      const productLabel = `${productName}${variant && variant !== "Común" ? ` ${variant}` : ""}`.trim();

      const qty = Number(item?.quantity);
      if (!Number.isFinite(qty) || qty <= 0) {
        return;
      }

      addToMap(productMap, productLabel, clientLabel, qty);
    });
  });

  const part1 = buildSectionRows("Lucas", sectionProducts.get("Lucas"));
  const part2 = buildSectionRows("Roberto", sectionProducts.get("Roberto"));

  const beatrizMap = filterMapByProduct(
    sectionProducts.get("Beatriz"),
    (productLabel) => /naranja\s*jaula|lim[oó]n\s*jaula/i.test(String(productLabel || ""))
  );
  const part3 = buildSectionRows("Beatriz", beatrizMap);

  const patoProductsMap = filterMapByProduct(
    sectionProducts.get("Pato"),
    (productLabel) => /palta|lima/i.test(String(productLabel || ""))
  );
  const patoByClient = new Map();
  Array.from(patoProductsMap.values()).forEach((entry) => {
    Array.from(entry.byClient.entries()).forEach(([clientId, qty]) => {
      patoByClient.set(clientId, Number(patoByClient.get(clientId) || 0) + Number(qty || 0));
    });
  });
  const part4 = patoByClient.size
    ? [
        ["Pato"],
        ...Array.from(patoByClient.entries())
          .sort((a, b) => Number(a[0]) - Number(b[0]))
          .map(([clientId, qty]) => [`${clientId}) ${formatQty(qty)} Kg`]),
      ]
    : [];

  return { part1, part2, part3, part4, sourceMode: "db" };
};

const fetchPrimaryResponsibleMapByClientExternalId = async () => {
  const models = app.locals.dbModels;
  if (!models?.responsibles || !models?.clientResponsibles) {
    return new Map();
  }

  const responsibles = await models.responsibles.list({ includeInactive: false });
  const map = new Map();

  for (const responsible of responsibles) {
    const assignments = await models.clientResponsibles.listByResponsible({
      responsibleId: responsible.id,
    });
    (Array.isArray(assignments) ? assignments : []).forEach((assignment) => {
      const externalId = String(assignment?.client_external_id || "").trim();
      if (!externalId) {
        return;
      }
      const normalizedExternalId = String(Number(externalId)).padStart(3, "0");
      const current = map.get(normalizedExternalId);
      const isPrimary = Boolean(assignment?.is_primary);
      if (!current || isPrimary) {
        map.set(normalizedExternalId, String(responsible?.name || "").trim() || "Sin responsable");
      }
    });
  }

  return map;
};

const fetchTasksRangesFromBackend = async () => {
  const getOrders = app.locals.getOrdersForDate;
  if (typeof getOrders !== "function") {
    throw new Error("DB no inicializada para generar tareas.pdf desde backend.");
  }

  const [orders, responsibleMap] = await Promise.all([
    getOrders({ date: new Date() }),
    fetchPrimaryResponsibleMapByClientExternalId(),
  ]);

  return buildTasksRangesFromDb({ orders, clientResponsibleByExternalId: responsibleMap });
};

const replaceDateInRows = (rows, dateText) => {
  return (rows || []).map((row) =>
    (row || []).map((cell) => String(cell ?? "").replace(dateTokenRegex, dateText))
  );
};

const dateForFilename = () => {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1);
  const dd = String(now.getDate());
  return `${dd}-${mm}-${yyyy}`;
};

const legacyDateForFilename = () => {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const savePdfBufferInProject = ({ buffer, folderPath, baseName }) => {
  const safeBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || "");
  fs.mkdirSync(folderPath, { recursive: true });
  const todayDate = dateForFilename();
  const legacyDate = legacyDateForFilename();
  const existing = fs.readdirSync(folderPath, { withFileTypes: true });
  existing.forEach((entry) => {
    if (!entry.isFile()) {
      return;
    }
    const name = String(entry.name || "");
    const lower = name.toLowerCase();
    if (!lower.endsWith(".pdf")) {
      return;
    }
    const isLegacyLatest = lower === `${baseName}.pdf`;
    const isTodayNamed =
      lower.startsWith(`${baseName}_`) &&
      (lower.includes(todayDate.toLowerCase()) || lower.includes(legacyDate.toLowerCase()));
    if (isLegacyLatest || isTodayNamed) {
      try {
        fs.unlinkSync(path.join(folderPath, name));
      } catch {
      }
    }
  });

  const dailyName = `${baseName}_${todayDate}.pdf`;
  const filePath = path.join(folderPath, dailyName);
  fs.writeFileSync(filePath, safeBuffer);
  return { filePath };
};

const extractDateTokensFromContent = (content) => {
  const tokens = new Set();
  const blocks = Array.isArray(content) ? content : [];
  blocks.forEach((block) => {
    const elements = Array.isArray(block?.paragraph?.elements) ? block.paragraph.elements : [];
    elements.forEach((element) => {
      const text = String(element?.textRun?.content || "");
      if (!text) {
        return;
      }
      const matches = text.match(dateTokenRegex) || [];
      matches.forEach((token) => {
        const cleaned = String(token || "").trim();
        if (cleaned) {
          tokens.add(cleaned);
        }
      });
    });
  });
  return Array.from(tokens);
};

const extractDateTokensFromDocHeaderFooter = (doc) => {
  const out = new Set();
  const headers = doc?.data?.headers || {};
  const footers = doc?.data?.footers || {};
  Object.values(headers).forEach((section) => {
    extractDateTokensFromContent(section?.content).forEach((token) => out.add(token));
  });
  Object.values(footers).forEach((section) => {
    extractDateTokensFromContent(section?.content).forEach((token) => out.add(token));
  });
  return Array.from(out);
};

const buildTasksDocumentPayload = ({ part1, part2, part3, part4 }) => {
  const today = formatDate(new Date());
  const safePart1 = replaceDateInRows(part1, today);
  const safePart2 = replaceDateInRows(part2, today);
  const safePart3 = replaceDateInRows(part3, today);
  const safePart4 = replaceDateInRows(part4, today);
  const blockSpecs = [
    { text: rowsToPlainText(safePart1), bold: false },
    { text: rowsToPlainText(safePart2), bold: false },
    { text: rowsToPlainText(safePart3), bold: true },
    { text: rowsToPlainText(safePart4), bold: true },
  ];

  const boldRanges = [];
  let robertoStartOffset = null;
  let text = "";
  let cursor = 0;

  const part1Text = String(blockSpecs[0]?.text || "");
  const part2Text = String(blockSpecs[1]?.text || "");
  const part3Text = String(blockSpecs[2]?.text || "");
  const part4Text = String(blockSpecs[3]?.text || "");

  if (part1Text) {
    text += part1Text;
    cursor += part1Text.length;
  }

  if (part2Text) {
    if (text) {
      text += "\n\n";
      cursor += 2;
    }
    robertoStartOffset = cursor;
    text += part2Text;
    cursor += part2Text.length;
  }

  if (part3Text) {
    const sep = "\n\n\n\n";
    text += sep;
    const part3Start = cursor + sep.length;
    cursor += sep.length;
    text += part3Text;
    cursor += part3Text.length;
    boldRanges.push({ start: part3Start, end: part3Start + part3Text.length });
  }

  if (part4Text) {
    const sep = "\n\n\n";
    text += sep;
    const part4Start = cursor + sep.length;
    cursor += sep.length;
    text += part4Text;
    cursor += part4Text.length;
    boldRanges.push({ start: part4Start, end: part4Start + part4Text.length });
  }

  text = text.replace(dateTokenRegex, today);

  const singleDateLineRegex = /^\s*\d{1,2}\s*[\/\.\-／⁄]\s*\d{1,2}\s*[\/\.\-／⁄]\s*\d{2,4}\s*$/;
  const lines = text.split("\n");
  const firstDateLineIndex = lines.findIndex((line) => singleDateLineRegex.test(String(line || "")));
  if (firstDateLineIndex >= 0) {
    lines[firstDateLineIndex] = today;
    text = lines.join("\n");
  }

  if (!String(text || "").length) {
    text = "\n";
  }

  return { text, boldRanges, robertoStartOffset };
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

const isTruthyTodosFlag = (value) => {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value === 1;
  }
  const text = String(value ?? "").trim().toLowerCase();
  return text === "true" || text === "1" || text === "si" || text === "sí";
};

const dispatchRawToFleteOption = (value) => {
  const target = normalizeDispatchTarget(value);
  return target === "Kangoo" ? "Flete 2" : "Flete 1";
};

const fleteOptionToDispatchRaw = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "flete 2") {
    return "Kangoo 1";
  }
  return "Trafic 1";
};

const fetchTodosControlStateByClient = async () => {
  const sheets = await getSheetsClient();
  const ranges = todosClientColumnEntries.map(
    ({ column }) => `'${TODOS_SHEET_NAME}'!${column}1:${column}5`
  );

  const response = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: SPREADSHEET_ID,
    ranges,
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING",
  });

  const valueRanges = Array.isArray(response?.data?.valueRanges) ? response.data.valueRanges : [];
  const out = {};

  todosClientColumnEntries.forEach(({ column, clientId }, index) => {
    const values = Array.isArray(valueRanges[index]?.values) ? valueRanges[index].values : [];
    const approvedRaw = values?.[0]?.[0];
    const dispatchRaw = String(values?.[3]?.[0] ?? "").trim();
    const clientLabel = String(values?.[4]?.[0] ?? "").trim();
    const approved = isTruthyTodosFlag(approvedRaw);
    const flete = dispatchRawToFleteOption(dispatchRaw);

    out[clientId] = {
      clientId,
      column,
      approved,
      approvedRaw,
      dispatchRaw,
      dispatchTarget: normalizeDispatchTarget(dispatchRaw) || "Trafic",
      flete,
      clientLabel,
      mapped: true,
    };
  });

  return out;
};

const fetchActiveClientIdsFromTodos = async () => {
  const stateByClient = await fetchTodosControlStateByClient();
  return Object.values(stateByClient)
    .filter((entry) => Boolean(entry?.approved))
    .map((entry) => String(entry.clientId || "").trim())
    .filter(Boolean)
    .sort();
};

const normalizeDispatchTarget = (value) => {
  const text = String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  if (!text) {
    return "";
  }
  if (text.includes("kangoo")) {
    return "Kangoo";
  }
  if (text.includes("trafic") || text.includes("traffic")) {
    return "Trafic";
  }
  return "";
};

const fetchTodosDispatchByClient = async () => {
  const sheets = await getSheetsClient();
  const ranges = todosClientColumnEntries.map(
    ({ column }) => `'${TODOS_SHEET_NAME}'!${column}4:${column}5`
  );

  const response = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: SPREADSHEET_ID,
    ranges,
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING",
  });

  const valueRanges = Array.isArray(response?.data?.valueRanges) ? response.data.valueRanges : [];
  const out = {};

  todosClientColumnEntries.forEach(({ column, clientId }, index) => {
    const valueRange = valueRanges[index] || {};
    const values = Array.isArray(valueRange.values) ? valueRange.values : [];
    const dispatchRaw = String(values?.[0]?.[0] ?? "").trim();
    const clientLabel = String(values?.[1]?.[0] ?? "").trim();
    const dispatchTarget = normalizeDispatchTarget(dispatchRaw) || "Trafic";

    out[clientId] = {
      clientId,
      column,
      dispatchTarget,
      dispatchRaw,
      clientLabel,
    };
  });

  return out;
};

const pdfReportsController = createPdfReportsController({
  getDocsClient,
  getDriveClient,
  TASKS_DOC_ID,
  PRINT_DOC_ID,
  fetchDivCompRanges,
  fetchTasksRangesFromBackend,
  buildTasksDocumentPayload,
  extractDateTokensFromDocHeaderFooter,
  formatDate,
  findMarkerRange,
  getDocumentEndIndex,
  rowsToPlainText,
  sliceToFirstEmpty,
  sliceToThirdEmpty,
  fetchRangeRows,
  fetchSingleCell,
  PRINT_SHEET_TRAFFIC,
  PRINT_SHEET_KANGOO,
  savePdfBufferInProject,
  TAREAS_PDF_DIR,
  IMPRIMIR_PEDIDOS_PDF_DIR,
  fetchTodosDispatchByClient,
  fetchActiveClientIdsFromTodos,
  getOrdersForDate: async ({ date } = {}) => {
    const getter = app.locals.getOrdersForDate;
    if (typeof getter !== "function") {
      return [];
    }
    return getter({ date });
  },
});

const masterDataController = createMasterDataController({
  getDbModels: async () => app.locals.dbModels || null,
});

app.get("/api/tareas/pdf", pdfReportsController.handleTareasPdf);
app.get("/api/imprimir-pedidos/pdf", pdfReportsController.handleImprimirPedidosPdf);

app.get("/api/db/clients", masterDataController.handleListClients);
app.post("/api/db/clients", masterDataController.handleCreateClient);
app.get("/api/db/clients/:clientId", masterDataController.handleGetClientById);
app.put("/api/db/clients/:clientId", masterDataController.handleUpdateClient);
app.put(
  "/api/db/clients/by-external/:externalId",
  masterDataController.handleUpsertClientByExternalId
);
app.delete("/api/db/clients/:clientId", masterDataController.handleDeleteClient);

app.get("/api/db/responsibles", masterDataController.handleListResponsibles);
app.post("/api/db/responsibles", masterDataController.handleCreateResponsible);
app.get("/api/db/responsibles/:responsibleId", masterDataController.handleGetResponsibleById);
app.put("/api/db/responsibles/:responsibleId", masterDataController.handleUpdateResponsible);
app.delete("/api/db/responsibles/:responsibleId", masterDataController.handleDeleteResponsible);

app.get(
  "/api/db/clients/:clientId/responsibles",
  masterDataController.handleListClientAssignments
);
app.post(
  "/api/db/clients/:clientId/responsibles",
  masterDataController.handleAssignResponsible
);
app.delete(
  "/api/db/clients/:clientId/responsibles/:responsibleId",
  masterDataController.handleDeleteAssignment
);
app.get(
  "/api/db/responsibles/:responsibleId/clients",
  masterDataController.handleListResponsibleAssignments
);

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

const normalizeKeyText = (value) => String(value || "").trim().toLowerCase();

const toQuotedSheetRange = ({ sheetName, startCell, endCell }) => {
  const safeSheetName = String(sheetName || "").replace(/'/g, "''");
  const from = String(startCell || "A1").trim() || "A1";
  const to = String(endCell || from).trim() || from;
  return `'${safeSheetName}'!${from}:${to}`;
};

const buildCellValueForSheetItem = ({ quantityText, notes }) => {
  const qty = String(quantityText || "").trim();
  const notesText = String(notes || "").trim();
  let out = qty;
  if (notesText) {
    out = out ? `${out}. ${notesText}` : notesText;
  }
  return out.trim();
};

const findSheetHeaderColumnByName = async ({ sheetName, productName, unit = "", variant = "" }) => {
  const normalizedProduct = normalizeKeyText(productName);
  const normalizedUnit = normalizeKeyText(unit);
  if (!normalizedProduct) {
    return null;
  }

  const sheets = await getSheetsClient();
  const range = toQuotedSheetRange({ sheetName, startCell: "1", endCell: "1" });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range,
    valueRenderOption: "UNFORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING",
  });
  const headers = Array.isArray(response?.data?.values?.[0]) ? response.data.values[0] : [];
  const targetProduct = normalizeProductFromHeader(productName, { defaultUnitIfMissing: false });
  const targetBase = normalizeKeyText(targetProduct?.baseName || productName);
  const requestedVariant = String(variant || "").trim();
  const targetVariant = normalizeKeyText(
    normalizeVariantForSheetMatch(requestedVariant || targetProduct?.variant || "")
  );

  // Prefer exact product + unit + variant match.
  if (targetBase && normalizedUnit && targetVariant) {
    for (let i = 0; i < headers.length; i += 1) {
      const headerText = String(headers[i] || "").trim();
      if (!headerText) {
        continue;
      }
      const parsedHeader = normalizeProductFromHeader(headerText, { defaultUnitIfMissing: false });
      const headerBase = normalizeKeyText(parsedHeader?.baseName || headerText);
      const headerUnit = normalizeKeyText(parsedHeader?.unit || "");
      const headerVariant = normalizeKeyText(normalizeVariantForSheetMatch(parsedHeader?.variant || ""));
      if (headerBase === targetBase && headerUnit === normalizedUnit && headerVariant === targetVariant) {
        return {
          sourceColumnIndex: i,
          sourceHeaderText: headerText,
        };
      }
    }
  }

  // Then product + unit (without variant strictness).
  if (targetBase && normalizedUnit) {
    for (let i = 0; i < headers.length; i += 1) {
      const headerText = String(headers[i] || "").trim();
      if (!headerText) {
        continue;
      }
      const parsedHeader = normalizeProductFromHeader(headerText, { defaultUnitIfMissing: false });
      const headerBase = normalizeKeyText(parsedHeader?.baseName || headerText);
      const headerUnit = normalizeKeyText(parsedHeader?.unit || "");
      if (headerBase === targetBase && headerUnit === normalizedUnit) {
        return {
          sourceColumnIndex: i,
          sourceHeaderText: headerText,
        };
      }
    }
  }

  // Fallback to base product match only.
  if (targetBase) {
    for (let i = 0; i < headers.length; i += 1) {
      const headerText = String(headers[i] || "").trim();
      if (!headerText) {
        continue;
      }
      const parsedHeader = normalizeProductFromHeader(headerText, { defaultUnitIfMissing: false });
      const headerBase = normalizeKeyText(parsedHeader?.baseName || headerText);
      if (headerBase === targetBase) {
        return {
          sourceColumnIndex: i,
          sourceHeaderText: headerText,
        };
      }
    }
  }

  // Last fallback to exact text match.
  for (let i = 0; i < headers.length; i += 1) {
    const headerText = String(headers[i] || "").trim();
    if (normalizeKeyText(headerText) === normalizedProduct) {
      return {
        sourceColumnIndex: i,
        sourceHeaderText: headerText || String(productName || "").trim(),
      };
    }
  }

  return null;
};

const toIsoDateText = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseIsoDateInput = (value) => {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return null;
  }
  const parsed = new Date(`${text}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
};

const parseSheetOrderDate = (value) => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    // Google Sheets serial date (days since 1899-12-30)
    const epochMs = Date.UTC(1899, 11, 30);
    const parsed = new Date(epochMs + value * 24 * 60 * 60 * 1000);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

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

const syncControlDateRowsFromSheetToDb = async ({ date, clientIds = [] }) => {
  const saveOrderRow = app.locals.saveOrderRow;
  if (typeof saveOrderRow !== "function") {
    return;
  }

  const targetDateKey = toIsoDateText(date);
  if (!targetDateKey) {
    return;
  }

  const targetClients = new Set(
    (Array.isArray(clientIds) ? clientIds : [])
      .map((value) => normalizeClientId(value))
      .filter(Boolean)
  );

  const { values } = await fetchSheetValues();
  const headers = Array.isArray(values?.[0]) ? values[0] : [];
  const rows = Array.isArray(values) ? values.slice(1) : [];

  for (let index = 0; index < rows.length; index += 1) {
    const row = Array.isArray(rows[index]) ? rows[index] : [];
    const rowDate = parseSheetOrderDate(row?.[0]);
    const rowDateKey = toIsoDateText(rowDate);
    const rowClientId = normalizeClientId(row?.[1]);
    const matchesDate = Boolean(rowDateKey && rowDateKey === targetDateKey);
    const matchesTargetClient = Boolean(rowClientId && targetClients.has(rowClientId));
    if (!matchesDate && !matchesTargetClient) {
      continue;
    }

    const rowNumber = index + 2;
    const updatedRange = `${SHEET_NAME}!A${rowNumber}`;
    await saveOrderRow({
      sheetName: SHEET_NAME,
      updatedRange,
      row,
      headers,
    });
  }
};

const buildControlOrdersForDate = async ({ date }) => {
  const getOrders = app.locals.getOrdersForDate;
  if (typeof getOrders !== "function") {
    throw new Error("DB no inicializada para listar pedidos del día.");
  }

  const existingOrders = await getOrders({ date });
  const existingClientIds = (Array.isArray(existingOrders) ? existingOrders : [])
    .map((order) => String(order?.clientId || "").trim())
    .filter(Boolean);

  try {
    await syncControlDateRowsFromSheetToDb({ date, clientIds: existingClientIds });
  } catch (error) {
    console.warn("[control-orders] No se pudo sincronizar Sheet->DB:", String(error?.message || error));
  }

  const [orders, controlByClient] = await Promise.all([
    getOrders({ date }),
    fetchTodosControlStateByClient(),
  ]);

  const data = (Array.isArray(orders) ? orders : []).map((order) => {
    const clientId = String(order?.clientId || "").trim();
    const control = controlByClient?.[clientId] || null;
    const items = Array.isArray(order?.items) ? order.items : [];
    return {
      orderId: Number(order?.id) || null,
      orderDate: order?.orderDate || null,
      clientId,
      clientName: String(order?.clientName || "").trim() || `Cliente ${clientId || "s/n"}`,
      itemsCount: items.length,
      items: items.map((item) => ({
        id: Number(item?.id) || null,
        productName: String(item?.productName || "").trim(),
        quantity: Number.isFinite(Number(item?.quantity)) ? Number(item.quantity) : null,
        quantityText: String(item?.quantityText || "").trim(),
        unit: String(item?.unit || "").trim(),
        variant: String(item?.variant || "").trim(),
        notes: String(item?.notes || "").trim(),
        position: Number(item?.position) || 0,
      })),
      approved: Boolean(control?.approved),
      flete: String(control?.flete || "Flete 1"),
      dispatchRaw: String(control?.dispatchRaw || ""),
      mapped: Boolean(control?.mapped),
      column: String(control?.column || ""),
    };
  });

  return {
    date: date.toISOString(),
    dateKey: toIsoDateText(date),
    data,
  };
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

app.get("/api/control-orders/today", async (_req, res) => {
  try {
    const payload = await buildControlOrdersForDate({ date: new Date() });
    res.json({ ok: true, date: payload.date, dateKey: payload.dateKey, data: payload.data });
  } catch (error) {
    const message = String(error?.message || error);
    const status = /DB no inicializada/i.test(message) ? 503 : 500;
    res.status(status).json({ ok: false, error: message });
  }
});

app.get("/api/control-orders/date/:date", async (req, res) => {
  try {
    const date = parseIsoDateInput(req?.params?.date);
    if (!date) {
      res.status(400).json({ ok: false, error: "Fecha inválida. Formato esperado: YYYY-MM-DD." });
      return;
    }
    const payload = await buildControlOrdersForDate({ date });
    res.json({ ok: true, date: payload.date, dateKey: payload.dateKey, data: payload.data });
  } catch (error) {
    const message = String(error?.message || error);
    const status = /DB no inicializada/i.test(message) ? 503 : 500;
    res.status(status).json({ ok: false, error: message });
  }
});

app.get("/api/control-orders/dates", async (req, res) => {
  try {
    const listDates = app.locals.listOrderDates;
    if (typeof listDates !== "function") {
      res.status(503).json({ ok: false, error: "DB no inicializada para listar fechas." });
      return;
    }
    const limit = Math.min(365, Math.max(1, Number(req?.query?.limit) || 60));
    const dates = await listDates({ limit });
    res.json({ ok: true, data: Array.isArray(dates) ? dates : [] });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error?.message || error) });
  }
});

app.put("/api/control-orders/order/:orderId/item/:itemId", async (req, res) => {
  try {
    const getDbPool = app.locals.getDbPool;
    if (typeof getDbPool !== "function") {
      res.status(503).json({ ok: false, error: "DB no inicializada para editar ítems." });
      return;
    }

    const pool = getDbPool();
    if (!pool) {
      res.status(503).json({ ok: false, error: "DB no disponible para editar ítems." });
      return;
    }

    const orderId = Number(req?.params?.orderId);
    const itemId = Number(req?.params?.itemId);
    if (!Number.isFinite(orderId) || orderId <= 0 || !Number.isFinite(itemId) || itemId <= 0) {
      res.status(400).json({ ok: false, error: "orderId/itemId inválidos." });
      return;
    }

    const quantityText = String(req?.body?.quantityText ?? "").trim();
    const parsedQuantity = Number(String(quantityText || "").replace(",", "."));
    const quantity = Number.isFinite(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : null;
    const unit = String(req?.body?.unit ?? "").trim();
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const currentResult = await client.query(
        `
          SELECT
            oi.id,
            oi.order_id,
            oi.product_name_text,
            oi.variant,
            oi.position,
            oi.notes,
            oi.source_column_index,
            oi.source_header_text,
            o.sheet_name,
            o.sheet_row_number
          FROM order_items oi
          INNER JOIN orders o ON o.id = oi.order_id
          WHERE oi.id = $1
            AND oi.order_id = $2
          LIMIT 1;
        `,
        [itemId, orderId]
      );

      const current = currentResult.rows?.[0] || null;
      if (!current) {
        await client.query("ROLLBACK");
        res.status(404).json({ ok: false, error: "Ítem no encontrado para el pedido indicado." });
        return;
      }

      const sourceColumnIndex = Number(current.source_column_index);
      const sheetRowNumber = Number(current.sheet_row_number);
      const sheetName = String(current.sheet_name || "").trim();
      if (!sheetName || !Number.isFinite(sheetRowNumber) || sheetRowNumber <= 0) {
        await client.query("ROLLBACK");
        res.status(409).json({ ok: false, error: "El pedido no tiene metadata de hoja para sincronizar." });
        return;
      }
      if (!Number.isFinite(sourceColumnIndex) || sourceColumnIndex < 0) {
        await client.query("ROLLBACK");
        res.status(409).json({ ok: false, error: "El ítem no tiene columna de hoja asociada para sincronizar." });
        return;
      }

      const headerMatch = await findSheetHeaderColumnByName({
        sheetName,
        productName: current.product_name_text,
        unit,
        variant: current.variant,
      });
      const targetColumnIndex = Number(
        Number.isFinite(Number(headerMatch?.sourceColumnIndex))
          ? Number(headerMatch?.sourceColumnIndex)
          : sourceColumnIndex
      );
      const targetHeaderText = String(
        headerMatch?.sourceHeaderText || current.source_header_text || current.product_name_text || ""
      ).trim();

      if (!Number.isFinite(targetColumnIndex) || targetColumnIndex < 0) {
        await client.query("ROLLBACK");
        res.status(409).json({
          ok: false,
          error: "No se encontró una columna válida en la hoja para el producto/unidad seleccionados.",
        });
        return;
      }

      if (targetColumnIndex !== sourceColumnIndex) {
        const conflict = await client.query(
          `
            SELECT id
            FROM order_items
            WHERE order_id = $1
              AND source_column_index = $2
              AND id <> $3
            LIMIT 1;
          `,
          [orderId, targetColumnIndex, itemId]
        );
        if (conflict.rows?.[0]) {
          await client.query("ROLLBACK");
          res.status(409).json({
            ok: false,
            error:
              "Ya existe otro ítem en esa columna de hoja para este pedido. Editá ese ítem o dejá la misma unidad.",
          });
          return;
        }
      }

      const sheetValue = buildCellValueForSheetItem({
        quantityText,
        notes: current.notes,
      });

      const sourceColumnA1 = toA1Column(sourceColumnIndex + 1);
      const targetColumnA1 = toA1Column(targetColumnIndex + 1);
      const sourceCellA1 = `${sourceColumnA1}${sheetRowNumber}`;
      const targetCellA1 = `${targetColumnA1}${sheetRowNumber}`;
      const sourceRange = toQuotedSheetRange({ sheetName, startCell: sourceCellA1, endCell: sourceCellA1 });
      const targetRange = toQuotedSheetRange({ sheetName, startCell: targetCellA1, endCell: targetCellA1 });

      const result = await client.query(
        `
          UPDATE order_items
          SET quantity = $1,
              quantity_text = $2,
              unit = $3,
              raw_value_text = $4,
              source_column_index = $5,
              source_header_text = $6
          WHERE id = $7
            AND order_id = $8
          RETURNING id, order_id, quantity, quantity_text, unit, product_name_text, position, source_column_index;
        `,
        [
          quantity,
          quantityText,
          unit,
          sheetValue,
          targetColumnIndex,
          targetHeaderText || null,
          itemId,
          orderId,
        ]
      );

      const row = result.rows?.[0] || null;
      if (!row) {
        await client.query("ROLLBACK");
        res.status(404).json({ ok: false, error: "Ítem no encontrado para el pedido indicado." });
        return;
      }

      const sheets = await getSheetsClient();
      if (targetColumnIndex === sourceColumnIndex) {
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range: targetRange,
          valueInputOption: "USER_ENTERED",
          requestBody: {
            values: [[sheetValue]],
          },
        });
      } else {
        await sheets.spreadsheets.values.batchUpdate({
          spreadsheetId: SPREADSHEET_ID,
          requestBody: {
            valueInputOption: "USER_ENTERED",
            data: [
              {
                range: sourceRange,
                values: [[""]],
              },
              {
                range: targetRange,
                values: [[sheetValue]],
              },
            ],
          },
        });
      }

      await client.query("COMMIT");
      res.json({ ok: true, data: row });
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {}
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error?.message || error) });
  }
});

app.delete("/api/control-orders/order/:orderId/item/:itemId", async (req, res) => {
  try {
    const getDbPool = app.locals.getDbPool;
    if (typeof getDbPool !== "function") {
      res.status(503).json({ ok: false, error: "DB no inicializada para eliminar ítems." });
      return;
    }

    const pool = getDbPool();
    if (!pool) {
      res.status(503).json({ ok: false, error: "DB no disponible para eliminar ítems." });
      return;
    }

    const orderId = Number(req?.params?.orderId);
    const itemId = Number(req?.params?.itemId);
    if (!Number.isFinite(orderId) || orderId <= 0 || !Number.isFinite(itemId) || itemId <= 0) {
      res.status(400).json({ ok: false, error: "orderId/itemId inválidos." });
      return;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const currentResult = await client.query(
        `
          SELECT
            oi.id,
            oi.order_id,
            oi.product_name_text,
            oi.source_column_index,
            o.sheet_name,
            o.sheet_row_number
          FROM order_items oi
          INNER JOIN orders o ON o.id = oi.order_id
          WHERE oi.id = $1
            AND oi.order_id = $2
          LIMIT 1;
        `,
        [itemId, orderId]
      );

      const current = currentResult.rows?.[0] || null;
      if (!current) {
        await client.query("ROLLBACK");
        res.status(404).json({ ok: false, error: "Ítem no encontrado para el pedido indicado." });
        return;
      }

      const deleteResult = await client.query(
        `
          DELETE FROM order_items
          WHERE id = $1
            AND order_id = $2
          RETURNING id, order_id, product_name_text;
        `,
        [itemId, orderId]
      );

      const deletedRow = deleteResult.rows?.[0] || null;
      if (!deletedRow) {
        await client.query("ROLLBACK");
        res.status(404).json({ ok: false, error: "Ítem no encontrado para el pedido indicado." });
        return;
      }

      const sourceColumnIndex = Number(current.source_column_index);
      const sheetRowNumber = Number(current.sheet_row_number);
      const sheetName = String(current.sheet_name || "").trim();
      const canSyncSheet =
        Number.isFinite(sourceColumnIndex) &&
        sourceColumnIndex >= 0 &&
        Number.isFinite(sheetRowNumber) &&
        sheetRowNumber > 0 &&
        Boolean(sheetName);

      if (canSyncSheet) {
        const columnA1 = toA1Column(sourceColumnIndex + 1);
        const cellA1 = `${columnA1}${sheetRowNumber}`;
        const range = toQuotedSheetRange({ sheetName, startCell: cellA1, endCell: cellA1 });

        const sheets = await getSheetsClient();
        await sheets.spreadsheets.values.update({
          spreadsheetId: SPREADSHEET_ID,
          range,
          valueInputOption: "USER_ENTERED",
          requestBody: {
            values: [[""]],
          },
        });
      }

      await client.query("COMMIT");
      res.json({ ok: true, data: deletedRow });
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {}
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error?.message || error) });
  }
});

app.post("/api/control-orders/order/:orderId/items", async (req, res) => {
  try {
    const getDbPool = app.locals.getDbPool;
    if (typeof getDbPool !== "function") {
      res.status(503).json({ ok: false, error: "DB no inicializada para crear ítems." });
      return;
    }

    const pool = getDbPool();
    if (!pool) {
      res.status(503).json({ ok: false, error: "DB no disponible para crear ítems." });
      return;
    }

    const orderId = Number(req?.params?.orderId);
    if (!Number.isFinite(orderId) || orderId <= 0) {
      res.status(400).json({ ok: false, error: "orderId inválido." });
      return;
    }

    const productName = String(req?.body?.productName || "").trim();
    if (!productName) {
      res.status(400).json({ ok: false, error: "productName es obligatorio." });
      return;
    }

    const quantityText = String(req?.body?.quantityText ?? "").trim();
    const parsedQuantity = Number(String(quantityText || "").replace(",", "."));
    const quantity = Number.isFinite(parsedQuantity) && parsedQuantity > 0 ? parsedQuantity : null;
    const unit = String(req?.body?.unit ?? "").trim();
    const variant = String(req?.body?.variant ?? "").trim();
    const notes = String(req?.body?.notes ?? "").trim();

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const orderResult = await client.query(
        `
          SELECT id, sheet_name, sheet_row_number
          FROM orders
          WHERE id = $1
          LIMIT 1;
        `,
        [orderId]
      );
      const orderRow = orderResult.rows?.[0] || null;
      if (!orderRow) {
        await client.query("ROLLBACK");
        res.status(404).json({ ok: false, error: "Pedido no encontrado." });
        return;
      }

      const sheetName = String(orderRow.sheet_name || "").trim();
      const sheetRowNumber = Number(orderRow.sheet_row_number);
      if (!sheetName || !Number.isFinite(sheetRowNumber) || sheetRowNumber <= 0) {
        await client.query("ROLLBACK");
        res.status(409).json({ ok: false, error: "El pedido no tiene metadata de hoja para sincronizar." });
        return;
      }

      let sourceColumnIndex = null;
      let sourceHeaderText = productName;

      const mappedInOrder = await client.query(
        `
          SELECT source_column_index, source_header_text
          FROM order_items
          WHERE order_id = $1
            AND source_column_index IS NOT NULL
            AND (
              LOWER(TRIM(source_header_text)) = LOWER(TRIM($2))
              OR LOWER(TRIM(product_name_text)) = LOWER(TRIM($2))
            )
          ORDER BY id DESC
          LIMIT 1;
        `,
        [orderId, productName]
      );
      const mapped = mappedInOrder.rows?.[0] || null;
      if (mapped) {
        sourceColumnIndex = Number(mapped.source_column_index);
        sourceHeaderText = String(mapped.source_header_text || productName).trim() || productName;
      } else {
        const headerMatch = await findSheetHeaderColumnByName({
          sheetName,
          productName,
          unit,
          variant,
        });
        if (headerMatch) {
          sourceColumnIndex = Number(headerMatch.sourceColumnIndex);
          sourceHeaderText = String(headerMatch.sourceHeaderText || productName).trim() || productName;
        }
      }

      if (!Number.isFinite(sourceColumnIndex) || sourceColumnIndex < 0) {
        await client.query("ROLLBACK");
        res.status(409).json({
          ok: false,
          error: "No se encontró una columna en la hoja para ese producto. No se aplicó ningún cambio.",
        });
        return;
      }

      const existingInColumn = await client.query(
        `
          SELECT id
          FROM order_items
          WHERE order_id = $1
            AND source_column_index = $2
          LIMIT 1;
        `,
        [orderId, sourceColumnIndex]
      );
      if (existingInColumn.rows?.[0]) {
        await client.query("ROLLBACK");
        res.status(409).json({
          ok: false,
          error: "Ya existe un ítem en esa columna de la hoja para este pedido. Editá ese ítem en lugar de agregar otro.",
        });
        return;
      }

      const nextPositionResult = await client.query(
        `SELECT COALESCE(MAX(position), 0) + 1 AS next_position FROM order_items WHERE order_id = $1;`,
        [orderId]
      );
      const nextPosition = Number(nextPositionResult.rows?.[0]?.next_position) || 1;

      const sheetValue = buildCellValueForSheetItem({ quantityText, notes });
      const columnA1 = toA1Column(sourceColumnIndex + 1);
      const cellA1 = `${columnA1}${sheetRowNumber}`;
      const range = toQuotedSheetRange({ sheetName, startCell: cellA1, endCell: cellA1 });

      const insertResult = await client.query(
        `
          INSERT INTO order_items (
            order_id,
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
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          RETURNING id, order_id, product_name_text, quantity, quantity_text, unit, variant, notes, position, source_column_index;
        `,
        [
          orderId,
          productName,
          quantity,
          quantityText,
          unit,
          variant,
          notes,
          sheetValue,
          sourceColumnIndex,
          sourceHeaderText,
          nextPosition,
        ]
      );

      const sheets = await getSheetsClient();
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [[sheetValue]],
        },
      });

      await client.query("COMMIT");
      res.json({ ok: true, data: insertResult.rows?.[0] || null });
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {}
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error?.message || error) });
  }
});

app.put("/api/control-orders/client/:clientId", async (req, res) => {
  try {
    const clientId = normalizeClientId(req?.params?.clientId);
    if (!clientId) {
      res.status(400).json({ ok: false, error: "clientId inválido." });
      return;
    }

    const mapped = todosClientColumnEntries.find((entry) => entry.clientId === clientId) || null;
    if (!mapped?.column) {
      res.status(404).json({ ok: false, error: `Cliente ${clientId} no tiene columna mapeada en Todos.` });
      return;
    }

    const approved = isTruthyTodosFlag(req?.body?.approved);
    const flete = String(req?.body?.flete || "Flete 1").trim();
    const dispatchRaw = fleteOptionToDispatchRaw(flete);

    const sheets = await getSheetsClient();
    const column = mapped.column;
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        valueInputOption: "USER_ENTERED",
        data: [
          {
            range: `'${TODOS_SHEET_NAME}'!${column}1:${column}1`,
            values: [[approved]],
          },
          {
            range: `'${TODOS_SHEET_NAME}'!${column}4:${column}4`,
            values: [[dispatchRaw]],
          },
        ],
      },
    });

    res.json({
      ok: true,
      data: {
        clientId,
        column,
        approved,
        flete: dispatchRawToFleteOption(dispatchRaw),
        dispatchRaw,
      },
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error?.message || error) });
  }
});

app.post("/api/control-orders/only-current", async (_req, res) => {
  try {
    const getOrders = app.locals.getOrdersForDate;
    if (typeof getOrders !== "function") {
      res.status(503).json({ ok: false, error: "DB no inicializada para calcular clientes actuales." });
      return;
    }

    const today = new Date();
    const todayKey = toIsoDateText(today);
    const orders = await getOrders({ date: today });
    const activeClientIds = new Set(
      (Array.isArray(orders) ? orders : [])
        .map((order) => normalizeClientId(order?.clientId))
        .filter(Boolean)
    );

    const sheets = await getSheetsClient();
    const data = todosClientColumnEntries.map(({ column, clientId }) => ({
      range: `'${TODOS_SHEET_NAME}'!${column}1:${column}1`,
      values: [[activeClientIds.has(clientId)]],
    }));

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        valueInputOption: "USER_ENTERED",
        data,
      },
    });

    res.json({
      ok: true,
      data: {
        date: todayKey,
        activeClientsCount: activeClientIds.size,
        updatedColumns: data.length,
      },
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error?.message || error) });
  }
});

app.get("/api/reparto/product-responsibles", async (_req, res) => {
  try {
    const data = await fetchDivCompProductResponsibles();
    res.json({ ok: true, data });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error?.message || error) });
  }
});

app.put("/api/reparto/product-responsible", async (req, res) => {
  try {
    const productName = String(req?.body?.productName || "").trim();
    const responsibleName = String(req?.body?.responsibleName || "").trim();
    if (!productName || !responsibleName) {
      res.status(400).json({ ok: false, error: "productName y responsibleName son requeridos." });
      return;
    }

    const items = await fetchDivCompProductResponsibles();
    const target = items.find(
      (item) => normalizeDivCompProductKey(item.productName) === normalizeDivCompProductKey(productName)
    );
    if (!target?.rowNumber) {
      res.status(404).json({ ok: false, error: "Producto no encontrado en Div Comp (columna A)." });
      return;
    }

    const sheets = await getSheetsClient();
    const range = `'${TASKS_SHEET_NAME}'!A${target.rowNumber}:A${target.rowNumber}`;
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[responsibleName]],
      },
    });

    res.json({
      ok: true,
      data: {
        rowNumber: target.rowNumber,
        productName: target.productName,
        responsibleName,
      },
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error?.message || error) });
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
        db = await saveOrderRow({
          sheetName: SHEET_NAME,
          updatedRange,
          row: normalizedRow,
          headers: values?.[0] || [],
        });
      } else {
        db = { ok: false, skipped: true, reason: "db module not initialized" };
      }
    } catch (error) {
      db = { ok: false, skipped: false, reason: String(error?.message || error) };
    }

    const verification = {
      sheet: {
        ok: true,
        updatedRange,
        rowNumber: nextWriteRowNumber,
      },
      db: {
        ok: Boolean(db?.ok),
        skipped: Boolean(db?.skipped),
        reason: db?.ok ? "" : String(db?.reason || "db persistence failed"),
        normalized: db?.normalized || null,
      },
    };

    res.json({
      ok: true,
      updatedRange,
      sheetRowNumber: nextWriteRowNumber,
      writeRange,
      updates: response?.data || null,
      db,
      verification,
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
    const { ensureSchema, getModels, getPool, saveOrderRow, getOrdersForDate, listOrderDates } = await import(
      "./src/db/postgres.js"
    );
    await ensureSchema();
    app.locals.getDbPool = getPool;
    app.locals.saveOrderRow = saveOrderRow;
    app.locals.getOrdersForDate = getOrdersForDate;
    app.locals.listOrderDates = listOrderDates;
    app.locals.dbModels = await getModels();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn("Warning: could not initialize DB module:", String(error?.message || error));
    app.locals.getDbPool = null;
    app.locals.saveOrderRow = null;
    app.locals.getOrdersForDate = null;
    app.locals.listOrderDates = null;
    app.locals.dbModels = null;
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
