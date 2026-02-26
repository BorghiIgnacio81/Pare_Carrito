import { unitPatterns, unitSynonyms } from "../constants/units.js";

const normalizeSpaces = (value) =>
  String(value ?? "")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();

const normalizeOrderLine = (value) => {
  const raw = normalizeSpaces(value);
  if (!raw) {
    return "";
  }
  return raw
    .replace(/^[\-*•]+\s*/g, "")
    .replace(/^\d+\s*[\.|\)]\s*/g, "")
    .replace(/[;,]+$/g, "")
    .trim();
};

const detectUnit = (name) => {
  const match = unitPatterns.find((pattern) => pattern.regex.test(name));
  return match ? match.unit : "";
};

const parseFractionOrNumber = (value) => {
  const raw = String(value ?? "").trim().replace(/,/g, ".");
  if (!raw) {
    return null;
  }
  const fraction = raw.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (fraction) {
    const numerator = Number(fraction[1]);
    const denominator = Number(fraction[2]);
    if (Number.isFinite(numerator) && Number.isFinite(denominator) && denominator !== 0) {
      return numerator / denominator;
    }
  }
  const numeric = Number(raw);
  return Number.isFinite(numeric) ? numeric : null;
};

export const parseUniCount = (value) => {
  const raw = normalizeSpaces(value);
  if (!raw) {
    return null;
  }
  const match = raw.match(/(\d+\s*\/\s*\d+|\d+(?:[\.,]\d+)?)/);
  if (!match) {
    return null;
  }
  return parseFractionOrNumber(match[1]);
};

const extractTrailingComment = (value) => {
  const match = value.match(/\(([^)]+)\)\s*$/);
  if (!match) {
    return { text: value, comment: "" };
  }
  const comment = String(match[1] || "").trim();
  const cleaned = value.replace(/\(([^)]+)\)\s*$/, "").trim();
  return { text: cleaned, comment };
};

export const parseQuantityUnitAndName = (value, customUnitSynonyms = unitSynonyms) => {
  const raw = normalizeOrderLine(value);
  if (!raw) {
    return null;
  }

  const { text: withoutComment, comment } = extractTrailingComment(raw);
  let working = normalizeSpaces(withoutComment);
  if (!working) {
    return null;
  }

  const leadingMatch = working.match(
    /^((?:\d+\s*\/\s*\d+)|(?:\d+(?:[\.,]\d+)?))\s*(x\b)?\s*(.*)$/i
  );
  if (leadingMatch) {
    let quantity = parseFractionOrNumber(leadingMatch[1]);
    if (quantity == null) {
      return null;
    }

    working = String(leadingMatch[3] || "").trim();
    if (!working) {
      return null;
    }

    let unit = "";
    const unitSynonym = (customUnitSynonyms || []).find((pattern) => pattern.regex.test(working));
    if (unitSynonym) {
      unit = unitSynonym.unit;
      working = normalizeSpaces(working.replace(unitSynonym.regex, " "));
    }

    if (!unit) {
      unit = detectUnit(working);
      if (unit) {
        const pattern = unitPatterns.find((entry) => entry.unit === unit);
        if (pattern) {
          working = normalizeSpaces(working.replace(pattern.regex, " "));
        }
      }
    }

    if (unit === "Gr") {
      quantity /= 1000;
      unit = "Kg";
    }

    working = normalizeSpaces(working.replace(/^de\s+/i, " "));
    if (!working) {
      return null;
    }

    const unitMode = unit === "Unidad";
    return {
      quantity,
      unit,
      name: working,
      raw,
      quantityText: unitMode ? `${quantity} uni` : "",
      unitMode,
      commentFromText: comment,
    };
  }

  const trailingNormalized = normalizeSpaces(working.replace(/(\d)([a-zA-ZñÑ]+)/g, "$1 $2"));
  const trailingMatch = trailingNormalized.match(
    /^(.*?)(?:\s+)(\d+(?:[\.,]\d+)?|\d+\s*\/\s*\d+)\s*([a-zA-ZñÑ]+)?$/
  );
  if (!trailingMatch) {
    return null;
  }

  const namePart = normalizeSpaces(trailingMatch[1]);
  if (!namePart) {
    return null;
  }

  let quantity = parseFractionOrNumber(trailingMatch[2]);
  if (quantity == null) {
    return null;
  }

  let unit = "";
  const unitRaw = String(trailingMatch[3] || "").trim();
  if (unitRaw) {
    const unitText = normalizeSpaces(unitRaw);
    const unitSynonym = (customUnitSynonyms || []).find((pattern) => pattern.regex.test(unitText));
    if (unitSynonym) {
      unit = unitSynonym.unit;
    }
    if (!unit) {
      unit = detectUnit(unitText);
    }
  }

  if (unit === "Gr") {
    quantity /= 1000;
    unit = "Kg";
  }

  const unitMode = unit === "Unidad";
  return {
    quantity,
    unit,
    name: namePart,
    raw,
    quantityText: unitMode ? `${quantity} uni` : "",
    unitMode,
    commentFromText: comment,
  };
};

export const shouldForceUnitMode = (productId, parsedLine) => {
  if (!productId || !parsedLine) {
    return false;
  }
  if (String(parsedLine.unit || "").trim()) {
    return false;
  }
  const name = String(parsedLine.name || "").toLowerCase();
  if (productId === "jengibre" && /\bra[ií]z(?:ces)?\b/i.test(name)) {
    return true;
  }
  return false;
};

export const aggregateItems = (items, normalizeVariantForSheetMatch) => {
  const map = new Map();
  (Array.isArray(items) ? items : []).forEach((item) => {
    const productId = String(item.productId || "").trim();
    if (!productId) {
      return;
    }
    const unit = String(item.unit || "").trim();
    const variant = typeof normalizeVariantForSheetMatch === "function"
      ? normalizeVariantForSheetMatch(item.variant)
      : String(item.variant || "");
    const key = `${productId}__${unit}__${variant}`;
    const current = map.get(key);
    if (!current) {
      map.set(key, { ...item });
      return;
    }

    const aOrder = Number(current.importOrder);
    const bOrder = Number(item.importOrder);
    const aFinite = Number.isFinite(aOrder);
    const bFinite = Number.isFinite(bOrder);
    if (aFinite && bFinite) {
      current.importOrder = Math.min(aOrder, bOrder);
    } else if (!aFinite && bFinite) {
      current.importOrder = bOrder;
    }

    if (item.unitMode || current.unitMode) {
      const a = parseUniCount(current.quantityText);
      const b = parseUniCount(item.quantityText);
      if (a != null && b != null) {
        const sum = a + b;
        current.unitMode = true;
        current.quantityText = `${sum} uni`;
        current.quantity = 0;
      } else {
        map.set(key, { ...current, ...item });
      }
      return;
    }

    current.quantity = (Number(current.quantity) || 0) + (Number(item.quantity) || 0);
    map.set(key, current);
  });
  return Array.from(map.values());
};

export const parseWhatsAppTextToItems = (text, clientId, resolveParsedLineToItem, normalizeVariantForSheetMatch) => {
  const lines = String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const parsedLines = [];
  const resolved = [];
  const unresolved = [];
  const ignored = [];

  lines.forEach((line, lineIndex) => {
    const parsed = parseQuantityUnitAndName(line);
    if (parsed) {
      parsedLines.push(parsed);
      const item = typeof resolveParsedLineToItem === "function" ? resolveParsedLineToItem(parsed, clientId) : null;
      if (!item) {
        unresolved.push(parsed);
      } else {
        item.importOrder = lineIndex;
        resolved.push(item);
      }
      return;
    }

    const cleaned = normalizeOrderLine(line);
    if (!cleaned) {
      ignored.push(line);
      return;
    }

    const loweredCleaned = cleaned
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    if (/\bjengibre\b/i.test(loweredCleaned) && /\b(poquito|un\s+poco|poco)\b/i.test(loweredCleaned)) {
      const specialParsed = {
        quantity: 0.1,
        unit: "Kg",
        name: "jengibre",
        raw: cleaned,
        commentFromText: "",
      };
      parsedLines.push(specialParsed);
      const specialItem = typeof resolveParsedLineToItem === "function" ? resolveParsedLineToItem(specialParsed, clientId) : null;
      if (!specialItem) {
        unresolved.push(specialParsed);
      } else {
        specialItem.importOrder = lineIndex;
        resolved.push(specialItem);
      }
      return;
    }

    if (/[0-9]/.test(cleaned)) {
      unresolved.push({
        quantity: 0,
        unit: "",
        name: cleaned,
        raw: cleaned,
        commentFromText: "",
      });
      return;
    }

    const implicitParsed = {
      quantity: 1,
      unit: "",
      name: cleaned,
      raw: cleaned,
      commentFromText: "",
    };

    const implicitItem =
      typeof resolveParsedLineToItem === "function" ? resolveParsedLineToItem(implicitParsed, clientId) : null;
    if (!implicitItem) {
      ignored.push(line);
      return;
    }

    parsedLines.push(implicitParsed);
    implicitItem.importOrder = lineIndex;
    resolved.push(implicitItem);
  });

  const aggregated = aggregateItems(resolved, normalizeVariantForSheetMatch);
  const warnings = [];

  aggregated.forEach((item) => {
    const productId = String(item.productId || "").trim().toLowerCase();
    if (productId !== "lechuga") {
      return;
    }
    const unit = String(item.unit || "").trim();
    const variant = String(item.variant || "").trim();

    let count = null;
    if (item.unitMode) {
      count = parseUniCount(item.quantityText);
    } else if (unit === "Unidad") {
      const numeric = Number(item.quantity);
      count = Number.isFinite(numeric) ? numeric : null;
    }
    if (count == null) {
      return;
    }
    if (count > 10) {
      warnings.push({
        key: `${item.productId}__${unit}__${variant}`,
        kind: "lechuga-too-many",
        message: `Cantidad alta de lechuga${variant ? ` (${variant})` : ""}: ${count}. ¿Será una jaula?`,
      });
    }
  });

  return {
    resolved: aggregated,
    unresolved,
    ignored,
    warnings,
    requestedCount: parsedLines.length,
  };
};
