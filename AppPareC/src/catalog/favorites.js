import {
  normalizeProductFromHeader,
  normalizeVariantForSheetMatch,
} from "./sheetCatalog.js";

const parseDateString = (value) => {
  if (!value) {
    return null;
  }
  const raw = String(value).trim();
  if (!raw) {
    return null;
  }

  const [datePart, timePart] = raw.split(" ");
  const [day, month, year] = String(datePart || "")
    .split("/")
    .map((item) => Number(item));
  if (!day || !month || !year) {
    return null;
  }

  let hours = 0;
  let minutes = 0;
  let seconds = 0;
  if (timePart) {
    const [hh, mm, ss] = String(timePart)
      .split(":")
      .map((item) => Number(item));
    hours = Number.isFinite(hh) ? hh : 0;
    minutes = Number.isFinite(mm) ? mm : 0;
    seconds = Number.isFinite(ss) ? ss : 0;
  }

  const date = new Date(year, month - 1, day, hours, minutes, seconds);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
};

const normalizeSheetCellValue = (value) => {
  const trimmed = String(value ?? "").trim();
  if (/^-?\d+,\d+$/.test(trimmed)) {
    return trimmed.replace(",", ".");
  }
  return trimmed;
};

const normalizeSheetRowLength = (row, expectedLength) => {
  const normalized = (Array.isArray(row) ? row : []).map(normalizeSheetCellValue);
  if (!expectedLength) {
    return normalized;
  }
  if (normalized.length > expectedLength) {
    return normalized.slice(0, expectedLength);
  }
  if (normalized.length < expectedLength) {
    return [...normalized, ...Array(expectedLength - normalized.length).fill("")];
  }
  return normalized;
};

const toOrderTimestamp = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return null;
  }
  return date.getTime();
};

export const buildFavoritesFromSheetValues = (values, { productsById, getClientIdFromLabel }) => {
  if (!Array.isArray(values) || !values.length) {
    return {};
  }
  const header = Array.isArray(values[0]) ? values[0] : [];
  const expectedLength = header.length;
  const productHeaders = header.slice(2).map((value) => String(value ?? "").trim());

  const headerMapping = productHeaders.map((name) => {
    const parsed = normalizeProductFromHeader(name);
    return productsById && productsById.get(parsed.key) ? parsed.key : null;
  });

  const nextFavorites = {};
  const orderTimestampsByClient = new Map();
  values.slice(1).forEach((row) => {
    const normalizedRow = normalizeSheetRowLength(row, expectedLength);
    const date = parseDateString(normalizedRow[0]);
    const clientLabel = normalizedRow[1] || "";
    const clientId = getClientIdFromLabel ? getClientIdFromLabel(clientLabel) : "";
    if (!date || !clientId) {
      return;
    }

    const timestamp = toOrderTimestamp(date);
    if (Number.isFinite(timestamp)) {
      if (!orderTimestampsByClient.has(clientId)) {
        orderTimestampsByClient.set(clientId, new Set());
      }
      orderTimestampsByClient.get(clientId).add(timestamp);
    }

    if (!nextFavorites[clientId]) {
      nextFavorites[clientId] = {};
    }
    for (let i = 2; i < normalizedRow.length; i += 1) {
      const value = normalizedRow[i];
      if (!value) {
        continue;
      }
      const numeric = Number(String(value).replace(",", "."));
      if (!Number.isFinite(numeric) || numeric <= 0) {
        continue;
      }
      const productId = headerMapping[i - 2];
      if (!productId) {
        continue;
      }
      const product = productsById ? productsById.get(productId) : null;
      const parsedHeader = normalizeProductFromHeader(productHeaders[i - 2] || "");
      const unit = parsedHeader.unit || product?.defaultUnit || "";
      const variant = parsedHeader.variant || "";
      const comboKey = `${unit}__${variant}`;

      const current = nextFavorites[clientId][productId] || {
        count: 0,
        lastDate: null,
        lastTimestamp: null,
        lastOrderIndex: null,
        combos: {},
      };
      current.count += numeric;
      if (!current.lastDate || new Date(current.lastDate) < date) {
        current.lastDate = date.toISOString();
        current.lastTimestamp = timestamp;
      }
      if (!current.combos[comboKey]) {
        current.combos[comboKey] = {
          count: 0,
          lastDate: null,
          lastTimestamp: null,
          lastOrderIndex: null,
          unit,
          variant,
        };
      }
      current.combos[comboKey].count += numeric;
      if (!current.combos[comboKey].lastDate || new Date(current.combos[comboKey].lastDate) < date) {
        current.combos[comboKey].lastDate = date.toISOString();
        current.combos[comboKey].lastTimestamp = timestamp;
      }
      nextFavorites[clientId][productId] = current;
    }
  });

  // Calcular índice de recencia por pedido: 1 = último pedido, 2 = anterior, etc.
  Object.entries(nextFavorites).forEach(([clientId, byProduct]) => {
    const timestamps = Array.from(orderTimestampsByClient.get(clientId) || []);
    timestamps.sort((a, b) => b - a);
    if (!timestamps.length || !byProduct || typeof byProduct !== "object") {
      return;
    }
    Object.values(byProduct).forEach((record) => {
      if (!record || typeof record !== "object") {
        return;
      }
      const idx = Number.isFinite(record.lastTimestamp)
        ? timestamps.indexOf(record.lastTimestamp)
        : -1;
      record.lastOrderIndex = idx >= 0 ? idx + 1 : null;
      if (record.combos && typeof record.combos === "object") {
        Object.values(record.combos).forEach((combo) => {
          const cidx = Number.isFinite(combo?.lastTimestamp)
            ? timestamps.indexOf(combo.lastTimestamp)
            : -1;
          if (combo && typeof combo === "object") {
            combo.lastOrderIndex = cidx >= 0 ? cidx + 1 : null;
          }
        });
      }
    });
  });

  return nextFavorites;
};

const favoritesVersion = "sheet-v2";

export const loadFavoritesFromSheet = (sheetValues = [], { productsById, getClientIdFromLabel, storage = window?.localStorage }) => {
  let saved = {};
  let storedVersion = "";
  try {
    storedVersion = storage?.getItem("favoritesVersion") || "";
    const raw = storage?.getItem("favoritesData");
    if (raw && storedVersion === favoritesVersion) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        saved = parsed;
      }
    }
  } catch {
    // ignore
  }

  const seeded = buildFavoritesFromSheetValues(sheetValues, { productsById, getClientIdFromLabel });
  const merged = { ...seeded };
  if (storedVersion === favoritesVersion) {
    Object.entries(saved).forEach(([clientId, items]) => {
      if (items && typeof items === "object") {
        merged[clientId] = { ...(seeded[clientId] || {}), ...items };
      }
    });
  }

  if (Object.keys(merged).length) {
    try {
      storage?.setItem("favoritesData", JSON.stringify(merged));
      storage?.setItem("favoritesVersion", favoritesVersion);
    } catch {
      // ignore
    }
  }
  return merged;
};

export const saveFavoritesToStorage = (data, storage = window?.localStorage) => {
  try {
    storage?.setItem("favoritesData", JSON.stringify(data));
  } catch {
    // ignore
  }
};

export { normalizeVariantForSheetMatch };
