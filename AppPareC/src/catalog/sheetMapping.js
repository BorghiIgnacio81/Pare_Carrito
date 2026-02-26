import { slugify } from "../utils/text.js";
import {
  normalizeProductFromHeader,
  normalizeVariantForSheetMatch,
} from "./sheetCatalog.js";

export const buildSheetColumnResolverFromHeaders = (headers, productsById) => {
  const bySkuKey = new Map();
  const byProductId = new Map();

  const resolveUnitFallbacks = (productId, unit) => {
    const pid = String(productId || "").trim().toLowerCase();
    const u = String(unit || "").trim();
    if (!pid || !u) {
      return [];
    }
    // Compatibilidad histórica: Remolacha se carga en una columna "Kg" del Sheet,
    // pero en UI se vende por Atado. Permitimos mapear Atado -> Kg.
    if (pid === "remolacha" && u === "Atado") {
      return ["Kg"];
    }
    return [];
  };

  const normalizedHeaders = Array.isArray(headers) ? headers : [];
  normalizedHeaders.forEach((header, index) => {
    const trimmed = String(header ?? "").trim();
    if (!trimmed) {
      return;
    }
    // Para mapear columnas del Sheet, no inferimos unidad por defecto cuando el header
    // no la especifica (ej: "Remolacha"). Si la unidad no está en el texto, queda vacía.
    const parsed = normalizeProductFromHeader(trimmed, { defaultUnitIfMissing: false });
    if (!parsed?.key || !productsById || !productsById.get(parsed.key)) {
      return;
    }
    const record = {
      header: trimmed,
      index,
      productId: parsed.key,
      unit: parsed.unit || "",
      variant: normalizeVariantForSheetMatch(parsed.variant),
      baseName: parsed.baseName || "",
    };

    const skuKey = `${record.productId}__${record.unit}__${record.variant}`;
    if (!bySkuKey.has(skuKey)) {
      bySkuKey.set(skuKey, record);
    }
    if (!byProductId.has(record.productId)) {
      byProductId.set(record.productId, []);
    }
    byProductId.get(record.productId).push(record);
  });

  const resolve = (item) => {
    if (!item) {
      return null;
    }
    const productId =
      String(item.productId || "").trim() ||
      (item.name ? slugify(String(item.name)) : "");
    if (!productId) {
      return null;
    }
    const unit = String(item.unit ?? "").trim();
    const variant = normalizeVariantForSheetMatch(item.variant);

    const directKey = `${productId}__${unit}__${variant}`;
    const direct = bySkuKey.get(directKey);
    if (direct) {
      return direct;
    }

    // Si el header no especifica unidad (unit=""), permitimos mapear cualquier unidad
    // a esa columna (pero solo si la columna existe).
    if (unit) {
      const unitlessKey = `${productId}____${variant}`;
      const unitless = bySkuKey.get(unitlessKey);
      if (unitless) {
        return unitless;
      }
      if (variant) {
        const unitlessNormal = bySkuKey.get(`${productId}____`);
        if (unitlessNormal) {
          return unitlessNormal;
        }
      }
    }

    const unitFallbacks = resolveUnitFallbacks(productId, unit);
    for (const fallbackUnit of unitFallbacks) {
      const fallbackKey = `${productId}__${fallbackUnit}__${variant}`;
      const fallback = bySkuKey.get(fallbackKey);
      if (fallback) {
        return fallback;
      }
      if (variant) {
        const fallbackNormal = bySkuKey.get(`${productId}__${fallbackUnit}__`);
        if (fallbackNormal) {
          return fallbackNormal;
        }
      }
    }

    const candidates = byProductId.get(productId) || [];
    if (!candidates.length) {
      return null;
    }

    const withSameUnit = unit ? candidates.filter((entry) => entry.unit === unit) : candidates;
    if (withSameUnit.length === 1) {
      return withSameUnit[0];
    }

    if (unit && variant) {
      const unitOnlyNormal = bySkuKey.get(`${productId}__${unit}__`);
      if (unitOnlyNormal) {
        return unitOnlyNormal;
      }
    }

    if (unit && !variant) {
      const normal = withSameUnit.find((entry) => !entry.variant);
      if (normal) {
        return normal;
      }
    }

    return null;
  };

  return {
    bySkuKey,
    byProductId,
    resolve,
  };
};

export const mapOrderItemsToSheetColumnsUsingHeaders = (items, headers, productsById) => {
  const resolver = buildSheetColumnResolverFromHeaders(headers, productsById);
  const mapped = {};
  const missing = [];

  const normalizeSpaces = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

  const formatSheetDecimal = (value) => {
    if (value == null) {
      return "";
    }
    if (typeof value === "number") {
      if (Number.isInteger(value)) {
        return String(value);
      }
      const rounded = Math.round(value * 1000) / 1000;
      const asText = String(rounded);
      return asText.includes(".") ? asText.replace(".", ",") : asText;
    }
    const text = String(value);
    if (/^-?\d+\.\d+$/.test(text)) {
      return text.replace(".", ",");
    }
    return text;
  };

  const appendComment = (baseText, commentRaw) => {
    const base = normalizeSpaces(baseText);
    const cleanedComment = normalizeSpaces(String(commentRaw || "").replace(/^[\s.]+/g, ""));
    if (!cleanedComment) {
      return base;
    }
    // Formato pedido: "2 .medianamente maduras"
    return base ? `${base} .${cleanedComment}` : `.${cleanedComment}`;
  };

  (Array.isArray(items) ? items : []).forEach((item) => {
    const match = resolver.resolve(item);
    if (!match) {
      missing.push(item);
      return;
    }
    const comment = String(item?.comment || "").trim();
    if (item.unitMode) {
      const qty = Number(item.quantity);
      const fromText = String(item.quantityText || "").trim();
      const base = fromText || (Number.isFinite(qty) && qty > 0 ? `${qty} uni` : "");
      mapped[match.header] = comment ? appendComment(base, comment) : base;
      return;
    }

    if (comment) {
      const qtyText = formatSheetDecimal(Number(item.quantity) || 0);
      mapped[match.header] = appendComment(qtyText, comment);
      return;
    }

    mapped[match.header] = item.quantity;
  });
  return { mapped, missing, resolver };
};
