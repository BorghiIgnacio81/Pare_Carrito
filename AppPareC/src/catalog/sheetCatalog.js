import {
  unitsCatalog,
  singleUnitByName,
  fixedUnitsByName,
  unitPatterns,
} from "../constants/units.js";
import { categoryKeywords } from "../constants/categories.js";
import { slugify } from "../utils/text.js";

const normalizeSpaces = (value) => String(value || "").replace(/\s+/g, " ").trim();

const detectUnit = (name) => {
  const match = unitPatterns.find((pattern) => pattern.regex.test(name));
  return match ? match.unit : "";
};

const removeUnitTokens = (name) => {
  let result = String(name || "");
  unitPatterns.forEach((pattern) => {
    result = result.replace(pattern.regex, " ");
  });
  result = result.replace(/\bpor\b/gi, " ");
  return normalizeSpaces(result);
};

const variantPatterns = [
  { regex: /\b(1|2)\s*congelados?\b/i, getLabel: (match) => `${match[1]} Congelados` },
  { regex: /\bcongelados?\b/i, label: "Congelado" },
  { regex: /\bp\/\s*salsa\b|\bpara salsa\b/i, label: "p/Salsa" },
  { regex: /\bp\/\s*mermelada\b|\bmermelada\b/i, label: "p/Mermelada" },
  { regex: /\bcherry\b/i, label: "Cherry" },
  { regex: /\bperita\b/i, label: "Perita" },
  { regex: /\bredondo\b/i, label: "Redondo" },
  { regex: /\broja\b/i, label: "Roja" },
  { regex: /\brojo\b/i, label: "Rojo" },
  { regex: /\bverde\b/i, label: "Verde" },
  { regex: /\bblanca\b|\bblanco\b/i, label: "Blanco" },
  { regex: /\bnegra\b|\bnegro\b/i, label: "Negro" },
  { regex: /\bmorada\b|\bmorado\b/i, label: "Morado" },
  { regex: /\brosad[oa]\b/i, label: "Rosado" },
  { regex: /\brosa\b/i, label: "Rosa" },
  { regex: /\bamarilla\b|\bamarillo\b/i, label: "Amarillo" },
  { regex: /\bgrande\b/i, label: "Grande" },
  { regex: /\bchica\b|\bchico\b/i, label: "Chica" },
  { regex: /\bmediana\b/i, label: "Mediana" },
  { regex: /\bmadura\b/i, label: "Madura" },
  { regex: /\bcriolla\b/i, label: "Criolla" },
  { regex: /\bhidrop[oó]nica\b/i, label: "Hidropónica" },
  { regex: /\b(comun|común|normal)\b/i, label: "Común" },
  { regex: /\bcrespa\b/i, label: "Crespa" },
  { regex: /\bmantecosa\b/i, label: "Mantecosa" },
  { regex: /\brepollada\b/i, label: "Repollada" },
  { regex: /\bescarola\b/i, label: "Escarola" },
  { regex: /\bpremium\b/i, label: "Premium" },
  { regex: /\bdeliciosa\b/i, label: "Deliciosa" },
  { regex: /\bseco\b|\bseca\b/i, label: "Seco" },
  { regex: /\bdulce\b/i, label: "Dulce" },
  { regex: /\bpicante\b/i, label: "Picante" },
  { regex: /\bhuevo\b/i, label: "Huevo" },
  // 1/4 se maneja como unidad
];

const extractVariant = (name) => {
  let working = String(name || "");
  const variants = [];

  variantPatterns.forEach((pattern) => {
    const match = working.match(pattern.regex);
    if (!match) {
      return;
    }
    const label = pattern.getLabel ? pattern.getLabel(match) : pattern.label;
    if (label && !variants.includes(label)) {
      variants.push(label);
    }
    working = working.replace(pattern.regex, " ");
  });

  return {
    base: normalizeSpaces(working),
    variant: variants.length ? variants.join(" ") : "",
  };
};

const normalizeBaseName = (name) => {
  const trimmed = normalizeSpaces(name);
  if (!trimmed) {
    return trimmed;
  }
  let normalized = trimmed;
  const lowered = normalized.toLowerCase();
  if (lowered.startsWith("de ")) {
    normalized = normalized.slice(3).trim();
  }
  if (lowered.startsWith("jaula de ")) {
    normalized = normalized.slice(8).trim();
  }
  if (lowered.startsWith("cajon de ")) {
    normalized = normalized.slice(8).trim();
  }
  const loweredNormalized = normalized.toLowerCase();
  if (lowered === "bananas") {
    return "Banana";
  }
  if (lowered.startsWith("bananas ")) {
    return `Banana${trimmed.slice(7)}`.trim();
  }
  if (lowered === "ajos") {
    return "Ajo";
  }
  if (lowered.startsWith("ajos ")) {
    return `Ajo${trimmed.slice(4)}`.trim();
  }
  if (loweredNormalized === "lechugas") {
    return "Lechuga";
  }
  if (loweredNormalized.startsWith("lechugas ")) {
    return `Lechuga${normalized.slice(8)}`.trim();
  }
  if (loweredNormalized === "mentas") {
    return "Menta";
  }
  if (loweredNormalized.startsWith("mentas ")) {
    return `Menta${normalized.slice(6)}`.trim();
  }
  if (loweredNormalized === "papas") {
    return "Papa";
  }
  if (loweredNormalized.startsWith("papas ")) {
    return `Papa${normalized.slice(5)}`.trim();
  }
  if (loweredNormalized === "calabazas") {
    return "Calabaza";
  }
  if (loweredNormalized.startsWith("calabazas ")) {
    return `Calabaza${normalized.slice(9)}`.trim();
  }
  if (loweredNormalized === "zukinis") {
    return "Zukini";
  }
  if (loweredNormalized.startsWith("zukinis ")) {
    return `Zukini${normalized.slice(7)}`.trim();
  }
  if (loweredNormalized === "higos") {
    return "Higo";
  }
  if (loweredNormalized.startsWith("higos ")) {
    return `Higo${normalized.slice(5)}`.trim();
  }
  if (loweredNormalized === "zanahorias") {
    return "Zanahoria";
  }
  if (loweredNormalized.startsWith("zanahorias ")) {
    return `Zanahoria${normalized.slice(10)}`.trim();
  }
  if (loweredNormalized === "mangos") {
    return "Mango";
  }
  if (loweredNormalized === "duraznos") {
    return "Durazno";
  }
  if (loweredNormalized === "pomelos") {
    return "Pomelo";
  }
  if (loweredNormalized === "limones") {
    return "Limón";
  }
  if (loweredNormalized.startsWith("limones ")) {
    return `Limón${normalized.slice(7)}`.trim();
  }
  if (loweredNormalized === "naranjas") {
    return "Naranja";
  }
  if (loweredNormalized.startsWith("naranjas ")) {
    return `Naranja${normalized.slice(8)}`.trim();
  }
  if (loweredNormalized === "peras") {
    return "Pera";
  }
  if (loweredNormalized.startsWith("peras ")) {
    return `Pera${normalized.slice(5)}`.trim();
  }
  if (loweredNormalized === "manzanas") {
    return "Manzana";
  }
  if (loweredNormalized.startsWith("manzanas ")) {
    return `Manzana${normalized.slice(8)}`.trim();
  }
  return normalized;
};

const resolveCategory = (baseName) => {
  const normalized = String(baseName || "").toLowerCase();
  const entries = Object.entries(categoryKeywords);
  for (const [category, keywords] of entries) {
    if (!keywords.length) {
      continue;
    }
    if (keywords.some((keyword) => normalized.includes(keyword))) {
      return category;
    }
  }
  return "Otros";
};

export const normalizeVariantForSheetMatch = (value) => {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) {
    return "";
  }
  const lowered = trimmed
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return lowered === "normal" || lowered === "comun" ? "" : trimmed;
};

export const normalizeProductFromHeader = (raw, options = {}) => {
  const cleaned = normalizeSpaces(raw || "");
  const defaultUnitIfMissing = options?.defaultUnitIfMissing !== false;

  let unit = detectUnit(cleaned);
  const withoutUnit = removeUnitTokens(cleaned);
  const { base, variant } = extractVariant(withoutUnit);
  let baseName = normalizeBaseName(base || withoutUnit || cleaned);
  let extraVariant = "";

  // Regla de negocio: en el Sheet existe "Albahaca unidad" pero en la UI Albahaca
  // se maneja siempre por Atado. Interpretamos "unidad" como la variedad Común.
  if (/^albahaca\b/i.test(baseName) && unit === "Unidad" && /\bunidad\b/i.test(cleaned)) {
    unit = "";
    extraVariant = extraVariant ? `${extraVariant} Común` : "Común";
  }

  if (/^quesillo\b/i.test(baseName)) {
    baseName = "Queso";
    extraVariant = "Quesillo";
  } else if (/^queso\s+criollo\b/i.test(baseName)) {
    baseName = "Queso";
    extraVariant = "Criollo";
  } else if (/^queso\s+de\s+cabra\b/i.test(baseName)) {
    baseName = "Queso";
    extraVariant = "De Cabra";
  }

  if (/^miel\s+de\s+abeja\b/i.test(baseName)) {
    baseName = "Miel";
    extraVariant = "Abeja";
  } else if (/^miel\s+de\s+ca[nñ]a\b/i.test(baseName)) {
    baseName = "Miel";
    extraVariant = "Caña";
  }

  if (/^papa\s+oca\b/i.test(baseName)) {
    baseName = "Papa";
    extraVariant = "Oca";
  }

  // En pedidos suele venir "Cherry" para tomate cherry.
  if (/^cherry\b/i.test(baseName)) {
    baseName = "Tomate";
    extraVariant = extraVariant ? `${extraVariant} Cherry` : "Cherry";
  }

  if (/^papines\b/i.test(baseName)) {
    baseName = "Papa";
    extraVariant = "Papines";
  }

  if (/^porotos?\s+de\s+soja\b/i.test(baseName)) {
    baseName = "Porotos";
    extraVariant = "Soja";
  }

  if (/^poroto\s+pallares\b/i.test(baseName)) {
    baseName = "Porotos";
    extraVariant = "Pallares";
  }

  if (/^(girgolas|champi(?:ñ|gn)ones|hongos\s+de\s+pino)\b/i.test(baseName)) {
    const match = baseName.match(/^(girgolas|champi(?:ñ|gn)ones|hongos\s+de\s+pino)\b/i);
    baseName = "Hongos";
    extraVariant = match ? match[1].replace(/^hongos\s+de\s+/i, "").trim() : "";
    if (extraVariant) {
      extraVariant = extraVariant
        .split(" ")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
    }
  }

  if (/^nuez\s+moscada\b/i.test(baseName)) {
    baseName = "Nuez moscada";
    if (/\bpepas\b/i.test(cleaned)) {
      extraVariant = extraVariant ? `${extraVariant} Pepas` : "Pepas";
    }
  }

  if (/^zanahoria(s)?\s+grande(s)?\b/i.test(baseName)) {
    baseName = "Zanahoria";
    extraVariant = extraVariant ? `${extraVariant} Grande` : "Grande";
  }

  if (/^zapallo\s+entero\b/i.test(baseName)) {
    baseName = "Zapallo";
    unit = unit || "Entero";
  }

  // "Coreano/Coreanito" se interpreta como zapallo amarillo.
  if (/^corean(ito|o)?\b/i.test(baseName)) {
    baseName = "Zapallo";
    extraVariant = extraVariant ? `${extraVariant} Amarillo` : "Amarillo";
  }

  // Cabutia/Cabutía(s) => Zapallo Negro.
  if (/^cabut[ií]a(s)?\b/i.test(baseName)) {
    baseName = "Zapallo";
    extraVariant = extraVariant ? `${extraVariant} Negro` : "Negro";
  }

  if (!unit && defaultUnitIfMissing) {
    const loweredName = baseName
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

    // Regla de negocio: en el Sheet hay headers como "Morron Amarillo" sin unidad.
    // Si inferimos "Unidad", el sistema de combos restringe a esa sola unidad y
    // desaparecen Kg/Jaula y variantes. Para Morrón, si falta unidad, asumimos Kg.
    if (loweredName === "morron") {
      unit = "Kg";
    } else if (loweredName === "tomate") {
      unit = "Kg";
    } else if (loweredName.includes("lechuga")) {
      unit = "Unidad";
    } else {
    const forcedUnit = singleUnitByName.get(loweredName);
    const fixedUnits = fixedUnitsByName.get(loweredName);

      if (forcedUnit) {
        unit = forcedUnit;
      } else if (fixedUnits && fixedUnits.length === 1) {
        unit = fixedUnits[0];
      } else {
        unit = "Unidad";
      }
    }
  }

  let mergedVariant = variant;
  if (extraVariant) {
    mergedVariant = mergedVariant ? `${mergedVariant} ${extraVariant}` : extraVariant;
  }

  if (
    /^palta\b/i.test(baseName) &&
    /\bmadura\b/i.test(mergedVariant) &&
    /\bpor\s+kilo\b/i.test(cleaned)
  ) {
    unit = unit || "Kg";
    mergedVariant = mergedVariant ? `${mergedVariant} (por Kilo)` : "(por Kilo)";
  }

  if (/^lechuga\b/i.test(baseName) && mergedVariant) {
    mergedVariant = mergedVariant.replace(/\bMorado\b/g, "Morada");
  }
  if (/^cebolla\b/i.test(baseName)) {
    if (mergedVariant === "Morado") {
      mergedVariant = "Morada";
    }
    if (mergedVariant === "Blanco") {
      mergedVariant = "Blanca";
    }
    if (!mergedVariant) {
      mergedVariant = "Blanca";
    }
  }

  const key = slugify(baseName || cleaned);
  return { key, baseName, unit, variant: mergedVariant };
};

export const buildProductsFromHeaders = (rawProducts = []) => {
  const grouped = new Map();

  (Array.isArray(rawProducts) ? rawProducts : []).forEach((raw, index) => {
    const cleaned = normalizeSpaces(raw);
    const parsed = normalizeProductFromHeader(cleaned);
    const unit = parsed.unit || "";
    const mergedVariant = parsed.variant || "";
    const baseName = parsed.baseName || cleaned;
    const key = parsed.key || slugify(cleaned) || `producto-${index + 1}`;

    if (!grouped.has(key)) {
      grouped.set(key, {
        id: key,
        name: baseName,
        units: new Set(),
        variants: new Set(),
        combos: new Set(),
        variantsByUnit: new Map(),
        category: resolveCategory(baseName),
      });
    }

    const entry = grouped.get(key);
    if (unit) {
      entry.units.add(unit);
    }
    if (mergedVariant) {
      entry.variants.add(mergedVariant);
    }

    const variantKey = normalizeVariantForSheetMatch(mergedVariant);
    entry.combos.add(`${unit || ""}__${variantKey}`);
    if (!entry.variantsByUnit.has(unit)) {
      entry.variantsByUnit.set(unit, new Set());
    }
    entry.variantsByUnit.get(unit).add(variantKey);
  });

  return Array.from(grouped.values())
    .map((entry, index) => {
      let units = entry.units.size ? Array.from(entry.units) : unitsCatalog;
      const loweredName = entry.name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      const forcedUnit = singleUnitByName.get(loweredName);
      if (forcedUnit) {
        units = [forcedUnit];
      }
      const fixedUnits = fixedUnitsByName.get(loweredName);
      if (fixedUnits) {
        units = fixedUnits;
      }
      if (loweredName.includes("lechuga")) {
        units = ["Jaula", "1/4", "Unidad"];
      }
      if (loweredName === "ajo") {
        units = ["Cabeza", "Ristra"];
      }
      if (loweredName.includes("cebolla") && !units.includes("Kg")) {
        units = ["Kg", ...units];
      }
      if (loweredName.includes("aji") || loweredName.includes("ají")) {
        units = ["Kg"];
      }
      if (loweredName === "anana" || loweredName === "ananá") {
        units = ["Unidad"];
      }
      if (loweredName.includes("manzana") && !units.includes("Kg")) {
        units = ["Kg", ...units];
      }

      // Regla de UX: Tomate se trabaja principalmente por Kg.
      // Si la variante default cae en una que no usa Kg (ej: Cherry), el selector
      // de unidad se filtra y Kg "desaparece" hasta que el usuario cambie variante.
      // Preferimos Kg primero para que Kg/Perita aparezcan sin destrabar la UI.
      if (loweredName === "tomate" && units.includes("Kg")) {
        units = ["Kg", ...units.filter((u) => u !== "Kg")];
      }

      // Regla de UX: Morrón siempre por Kg o Jaula; "Unidad" se maneja con el checkbox.
      // Además, Kg debe estar disponible para todas las variantes.
      if (loweredName === "morron") {
        if (!units.includes("Kg")) {
          units = ["Kg", ...units];
        }
        units = units.filter((u) => u !== "Unidad");
      }
      if (loweredName === "miel") {
        units = ["Pote"];
      }
      if (entry.name.toLowerCase() === "queso") {
        if (!units.includes("Kg")) {
          units = ["Kg", ...units];
        }
      }
      let variants = Array.from(entry.variants);
      if (loweredName.includes("cebolla")) {
        const moradoIndex = variants.indexOf("Morado");
        if (moradoIndex !== -1) {
          variants[moradoIndex] = "Morada";
        }
        if (!variants.includes("Blanca")) {
          variants.unshift("Blanca");
        }
      }

      const hasNormalCombo = Array.from(entry.combos || []).some((combo) => combo.endsWith("__"));
      const hasNonNormalVariantCombo = Array.from(entry.combos || []).some((combo) => {
        const parts = String(combo || "").split("__");
        return Boolean(parts[1]);
      });
      if (hasNormalCombo && hasNonNormalVariantCombo && !variants.includes("Común")) {
        variants.unshift("Común");
      }

      const variantLabelByKey = {};
      variants.forEach((label) => {
        const normalizedLabel = String(label)
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
        const key = normalizedLabel === "normal" || normalizedLabel === "comun" ? "" : label;
        if (!Object.prototype.hasOwnProperty.call(variantLabelByKey, key)) {
          variantLabelByKey[key] = label;
        }
      });

      const comboIndex = {};
      if (entry.variantsByUnit) {
        entry.variantsByUnit.forEach((set, unit) => {
          comboIndex[unit] = Array.from(set);
        });
      }
      let defaultVariant = variants.includes("Blanca")
        ? "Blanca"
        : variants.includes("Común")
        ? "Común"
        : variants[0] || "";

      if (loweredName === "tomate") {
        // Regla de negocio (operación): si el cliente escribe "tomate" sin variedad,
        // se interpreta como Perita. Cherry queda solo si se menciona explícitamente.
        if (variants.includes("Perita")) {
          defaultVariant = "Perita";
        } else if (variants.includes("Redondo")) {
          defaultVariant = "Redondo";
        } else if (variants.includes("Común")) {
          defaultVariant = "Común";
        } else if (units.includes("Kg")) {
          const keys = Array.isArray(comboIndex["Kg"]) ? comboIndex["Kg"] : [];
          const firstLabel = keys
            .map((key) => variantLabelByKey[key] || (key === "" ? "Común" : key))
            .find(Boolean);
          if (firstLabel) {
            defaultVariant = firstLabel;
          }
        }
      }

      return {
        id: entry.id || `producto-${index + 1}`,
        name: entry.name,
        category: entry.category,
        units,
        variants,
        defaultUnit:
          loweredName === "tomate" && units.includes("Kg")
            ? "Kg"
            : entry.name.toLowerCase() === "queso"
            ? "Kg"
            : units[0] || "",
        defaultVariant,
        comboIndex,
        comboSet: entry.combos || new Set(),
        variantLabelByKey,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
};
