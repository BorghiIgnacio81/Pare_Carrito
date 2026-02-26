import { clients } from "./src/constants/clients.js";
import {
  unitModeProducts,
  unitSynonyms,
} from "./src/constants/units.js";
import {
  buildProductsFromHeaders,
  normalizeProductFromHeader,
  normalizeVariantForSheetMatch,
} from "./src/catalog/sheetCatalog.js";
import {
  buildSheetColumnResolverFromHeaders,
  mapOrderItemsToSheetColumnsUsingHeaders,
} from "./src/catalog/sheetMapping.js";
import {
  globalAliases,
  normalizeAliasKey,
  loadClientAliases,
  saveClientAliases,
  getAliasStorageKeyFromSource,
  recoverAllAliasesFromStorage,
  exportAliasesDump,
  importAliasesDump,
} from "./src/aliases/aliasStore.js";
import {
  shouldForceUnitMode,
  parseQuantityUnitAndName,
  parseUniCount,
  parseWhatsAppTextToItems,
} from "./src/import/whatsapp.js";
import { createSummaryController } from "./src/ui/summary.js";
import { createImportBoxController } from "./src/ui/importBox.js";
import { createImportApplier } from "./src/ui/importApply.js";
import { createLayoutController } from "./src/ui/layout.js";
import { createFavoritesIndicators } from "./src/ui/favoritesIndicators.js";
import { createProductCardBuilder } from "./src/ui/productCard.js";
import {
  populateAliasProductSelect as populateAliasProductSelectUI,
  refreshAliasUnitAndVariantOptions as refreshAliasUnitAndVariantOptionsUI,
} from "./src/ui/aliasForm.js";
import { createOrdersApi } from "./src/services/ordersApi.js";
import { createClientsController } from "./src/controllers/clientsController.js";
import { createOrderController } from "./src/controllers/orderController.js";
import { createAliasesController } from "./src/controllers/aliasesController.js";
import { createCatalogController } from "./src/controllers/catalogController.js";
import { createProductStateController } from "./src/controllers/productStateController.js";
import { productIcon, renderProductIcon } from "./src/ui/icons.js";
import { createFavoritesStore } from "./src/models/favoritesStore.js";
import { slugify, normalizeSpaces } from "./src/utils/text.js";

let rawProducts = [];
let sheetHeaders = [];
let products = [];
let productsById = new Map();
let favoritesStore = { getData: () => ({}) };
let getFavoritePresets = () => [];
let rowCounter = 0;

const getRowCounter = () => rowCounter;
const setRowCounter = (value) => {
  rowCounter = Number.isFinite(value) ? value : 0;
};
const createRowId = () => `r_${Date.now()}_${++rowCounter}`;

const ordersApi = createOrdersApi();


const itemsContainer = document.querySelector("#product-grid");
const confirmButton = document.querySelector("#confirm-order");
const confirmButtonSummary = document.querySelector("#confirm-order-summary");
const confirmButtons = [confirmButton, confirmButtonSummary].filter(Boolean);
const clearOrderButton = document.querySelector("#clear-order");
const clearOrderButtonSummary = document.querySelector("#clear-order-summary");
const clearOrderButtons = [clearOrderButton, clearOrderButtonSummary].filter(Boolean);
const summaryContent = document.querySelector("#summary-content");
const orderOutput = document.querySelector("#order-output");
const catalogSearch = document.querySelector("#catalog-search");
const clientSelect = document.querySelector("#client-select");
const orderSelect = document.querySelector("#order-select");
const orderDirection = document.querySelector("#order-direction");
const uncategorizedContent = document.querySelector("#uncategorized-content");
const summaryBox = document.querySelector(".page-header__summary");
const summaryClient = document.querySelector("#summary-client");
const saveStatus = document.querySelector("#save-status");
const editClientButton = document.querySelector("#edit-client");
const newClientButton = document.querySelector("#new-client");

const saveConfirmModal = document.querySelector("#save-confirm-modal");
const saveConfirmMessage = document.querySelector("#save-confirm-message");
const saveConfirmOk = document.querySelector("#save-confirm-ok");

const savePartialModal = document.querySelector("#save-partial-modal");
const savePartialMessage = document.querySelector("#save-partial-message");
const savePartialYes = document.querySelector("#save-partial-yes");
const savePartialNo = document.querySelector("#save-partial-no");

const loadingCurtain = document.querySelector("#loading-curtain");
const hideLoadingCurtain = () => {
  if (!loadingCurtain) {
    return;
  }
  loadingCurtain.classList.add("is-hidden");
  loadingCurtain.setAttribute("aria-busy", "false");
};

const pasteOrderToggle = document.querySelector("#paste-order-toggle");
const whatsappImportBox = document.querySelector("#whatsapp-import");
const pasteOrderText = document.querySelector("#paste-order-text");
const pasteOrderApply = document.querySelector("#paste-order-apply");
const pasteOrderClear = document.querySelector("#paste-order-clear");
const pasteOrderReport = document.querySelector("#paste-order-report");
const aliasSourceInput = document.querySelector("#alias-source");
const aliasProductSelect = document.querySelector("#alias-product");
const aliasUnitSelect = document.querySelector("#alias-unit");
const aliasVariantSelect = document.querySelector("#alias-variant");
const aliasUnitModeCheckbox = document.querySelector("#alias-unitmode");
const aliasCommentEnabledCheckbox = document.querySelector("#alias-comment-enabled");
const aliasCommentField = document.querySelector("#alias-comment-field");
const aliasCommentInput = document.querySelector("#alias-comment");
const aliasSaveButton = document.querySelector("#alias-save");
const aliasRecoveryInput = document.querySelector("#alias-recovery-input");
const aliasRecoveryImportButton = document.querySelector("#alias-recovery-import");
const aliasRecoveryExportButton = document.querySelector("#alias-recovery-export");
const aliasRecoveryStatus = document.querySelector("#alias-recovery-status");

const getClientLabelForAliases = (clientId) => {
  const client = (clients || []).find((c) => String(c.id) === String(clientId));
  if (!client) {
    return String(clientId || "");
  }
  const code = Number.isFinite(Number(client.code)) ? client.code : "";
  return `${client.id} - ${client.name}${code ? ` (${code})` : ""}`;
};

let importRunCounter = 0;
let importLechugaDecision = {
  runId: 0,
  byClientId: new Map(),
};

const startNewImportRun = () => {
  importRunCounter += 1;
  importLechugaDecision = {
    runId: importRunCounter,
    byClientId: new Map(),
  };
};

const formatDateForPrompt = (value) => {
  const date = value instanceof Date ? value : value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return "";
  }
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());
  return `${day}/${month}/${year}`;
};


const coerceVariantForProduct = (product, variant) => {
  if (!product) {
    return "";
  }
  const raw = String(variant ?? "").trim();
  if (!product.variants?.length) {
    return "";
  }
  if (!raw) {
    return product.defaultVariant || product.variants[0] || "";
  }

  const normalizeKey = (value) =>
    String(value || "")
      .toLowerCase()
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  // Mantener "Común" como etiqueta de UI (aunque para Sheet se normalice a variante vacía).
  const rawKey = normalizeKey(raw);
  if (rawKey === "normal" || rawKey === "comun") {
    const comun = product.variants.find((v) => normalizeKey(v) === "comun");
    if (comun) {
      return comun;
    }
    return product.defaultVariant || product.variants[0] || "";
  }

  const exact = product.variants.find((v) => normalizeKey(v) === rawKey);
  if (exact) {
    return exact;
  }
  return raw;
};

const coerceUnitForProduct = (product, unit) => {
  if (!product) {
    return String(unit || "").trim();
  }
  const desired = String(unit || "").trim();
  const units = Array.isArray(product.units) ? product.units.filter(Boolean) : [];
  if (!units.length) {
    return desired;
  }
  if (!desired) {
    return String(product.defaultUnit || units[0] || "").trim();
  }
  const exact = units.find((u) => u === desired);
  if (exact) {
    return exact;
  }
  const insensitive = units.find((u) => String(u).toLowerCase() === desired.toLowerCase());
  if (insensitive) {
    return insensitive;
  }
  return String(product.defaultUnit || units[0] || "").trim();
};

const normalizeCitrusUnit = (productId, unit) => {
  const pid = String(productId || "").trim().toLowerCase();
  const u = String(unit || "").trim();
  if (!pid || !u) {
    return u;
  }
  if ((pid === "limon" || pid === "naranja" || pid === "pomelo") && (u === "Cajón" || u === "Caja")) {
    return "Jaula";
  }
  return u;
};

const applyBusinessUnitAndQuantityRules = ({
  productId,
  product,
  unit,
  quantity,
  parsedLine,
  unitExplicit = false,
}) => {
  const pid = String(productId || "").trim().toLowerCase();
  const productName = String(product?.name || "").trim().toLowerCase();
  const raw = String(parsedLine?.raw || "").trim().toLowerCase();
  const parsedUnit = String(parsedLine?.unit || "").trim();
  const isUnitExplicit = Boolean(unitExplicit || parsedUnit);

  let nextUnit = String(unit || "").trim();
  let nextQuantity = Number.isFinite(quantity) ? quantity : 0;

  const isManzana = pid === "manzana" || /\bmanzana(s)?\b/.test(productName) || /\bmanzana(s)?\b/.test(raw);
  const mentionsMaple = /\bmaple(s)?\b/.test(raw);
  if (isManzana && mentionsMaple) {
    // Regla de negocio: para Manzana, "maple" se interpreta como Bandeja.
    // (No aplica a Huevos, que usa Maple real.)
    nextUnit = "Bandeja";
    return { unit: nextUnit, quantity: nextQuantity };
  }

  const isRemolacha = pid === "remolacha" || /\bremolacha\b/.test(productName) || /\bremolacha\b/.test(raw);
  if (isRemolacha) {
    // Regla de negocio: Remolacha se vende por Atado (no por Kg).
    nextUnit = "Atado";
    return { unit: nextUnit, quantity: nextQuantity };
  }

  const isLimon = pid === "limon" || /\blim[oó]n(es)?\b/.test(productName) || /\blim[oó]n(es)?\b/.test(raw);
  const isNaranja = pid === "naranja" || /\bnaranja(s)?\b/.test(productName) || /\bnaranja(s)?\b/.test(raw);
  const isPomelo = pid === "pomelo" || /\bpomelo(s)?\b/.test(productName) || /\bpomelo(s)?\b/.test(raw);
  if (!isUnitExplicit && (isLimon || isNaranja || isPomelo)) {
    // Regla de negocio: si el cliente escribe cantidad sin unidad, interpretamos "unidades"
    // y convertimos a docenas (12 uni = 1 docena).
    nextQuantity = nextQuantity / 12;
    nextQuantity = Math.round(nextQuantity * 1000) / 1000;
    nextUnit = "Docena";
  }

  const isEggs = pid === "huevos" || pid === "huevo" || /\bhuevo(s)?\b/.test(productName);
  if (isEggs) {
    // Regla: SOLO para Huevos. 1 caja = 6 maples.
    // Aplica si el cliente lo escribió, o si la unidad quedó en "Caja" por alias/preset/UI.
    const mentionsCaja = nextUnit === "Caja" || parsedUnit === "Caja" || /\bcaja\b/.test(raw);
    if (mentionsCaja) {
      nextUnit = "Maple";
      nextQuantity = nextQuantity * 6;

      // Maple tiene que ser entero. Redondeamos solo si es prácticamente entero.
      const rounded = Math.round(nextQuantity);
      if (Math.abs(nextQuantity - rounded) < 1e-9) {
        nextQuantity = rounded;
      } else {
        nextQuantity = Math.round(nextQuantity * 1000) / 1000;
      }
    }
  }

  const isBanana =
    pid === "banana" ||
    pid === "bananas" ||
    pid === "platano" ||
    /\bbanana(s)?\b/.test(productName) ||
    /\bpl[aá]tano(s)?\b/.test(productName) ||
    /\bbanana(s)?\b/.test(raw) ||
    /\bpl[aá]tano(s)?\b/.test(raw);
  if (isBanana) {
    const unitWasExplicit = Boolean(isUnitExplicit);
    // Si el cliente escribe "6 bananas" (sin unidad), y el default del producto es Docena,
    // interpretamos la cantidad como unidades y convertimos a docenas.
    const loweredUnit = String(nextUnit || "").trim().toLowerCase();
    const isDozenUnit = loweredUnit === "docena" || loweredUnit === "docenas";
    const isUnidadUnit = loweredUnit === "unidad" || loweredUnit === "unidades";

    // Caso explícito: "24 unid. bananas" => 2 docenas.
    if (isUnidadUnit) {
      nextQuantity = nextQuantity / 12;
      nextQuantity = Math.round(nextQuantity * 1000) / 1000;
      nextUnit = "Docena";
    }
    if (!unitWasExplicit && isDozenUnit) {
      nextQuantity = nextQuantity / 12;
      nextQuantity = Math.round(nextQuantity * 1000) / 1000;
      nextUnit = "Docena";
    }
  }

  return { unit: nextUnit, quantity: nextQuantity };
};

const shouldTreatAtadoAsUnitForProduct = (productId, parsedLine) => {
  const pid = String(productId || "").trim().toLowerCase();
  const parsedUnit = String(parsedLine?.unit || "").trim();
  if (!pid || !parsedUnit) {
    return false;
  }
  // Regla de negocio: en lechugas, "atado" se interpreta como unidad.
  return pid === "lechuga" && parsedUnit === "Atado";
};

const resolveParsedLineToItem = (parsedLine, clientId) => {
  if (!parsedLine) {
    return null;
  }

  const parsedComment = String(parsedLine.commentFromText || "").trim();

  const mergeComments = (a, b) => {
    const left = String(a || "").trim();
    const right = String(b || "").trim();
    if (!left) return right;
    if (!right) return left;
    const normalizeKey = (value) =>
      String(value || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();
    const lk = normalizeKey(left);
    const rk = normalizeKey(right);
    if (lk === rk) return left;
    if (lk.includes(rk)) return left;
    if (rk.includes(lk)) return right;
    return `${left} ${right}`.trim();
  };

  const getMostRecentComboForClient = (productId, effectiveClientId) => {
    const record = favoritesStore.getData()?.[effectiveClientId]?.[productId];
    if (!record?.combos) {
      return null;
    }
    const combos = Object.values(record.combos).filter(Boolean);
    if (!combos.length) {
      return null;
    }
    combos.sort((a, b) => {
      const at = a.lastDate ? new Date(a.lastDate).getTime() : 0;
      const bt = b.lastDate ? new Date(b.lastDate).getTime() : 0;
      return bt - at;
    });
    const chosen = combos[0] || null;
    if (!chosen) {
      return null;
    }
    return {
      unit: String(chosen.unit || "").trim(),
      variant: String(chosen.variant || "").trim(),
      lastDate: chosen.lastDate ? new Date(chosen.lastDate) : null,
    };
  };

  const getPreferredPreset = (productId) => {
    if (!productId || !clientId) {
      return null;
    }
    const presets = getFavoritePresets(productId, clientId);
    return Array.isArray(presets) && presets.length ? presets[0] : null;
  };

  const applyPreferredUnitAndVariant = ({ product, unit, variant, unitExplicit }) => {
    if (!product || unitExplicit) {
      return { unit, variant, unitExplicit };
    }
    const preferred =
      (clientId ? getMostRecentComboForClient(product.id, clientId) : null) ||
      getPreferredPreset(product.id);
    if (preferred?.unit) {
      return {
        unit: String(preferred.unit || "").trim() || unit,
        variant: variant || String(preferred.variant || "").trim(),
        unitExplicit: true,
      };
    }
    if (!variant && preferred?.variant) {
      return { unit, variant: String(preferred.variant || "").trim(), unitExplicit };
    }
    return { unit, variant, unitExplicit };
  };

  const aliases = loadClientAliases(clientId, getClientLabelForAliases(clientId));
  const aliasKeyFromName = normalizeAliasKey(parsedLine.name);
  const aliasKeyFromRaw = normalizeAliasKey(parsedLine.raw);
  const aliasKeyFromNameSingular = /s$/.test(aliasKeyFromName) ? aliasKeyFromName.replace(/s$/, "") : "";
  const aliasKeyFromRawSingular = /s$/.test(aliasKeyFromRaw) ? aliasKeyFromRaw.replace(/s$/, "") : "";
  const isCoreano = /\bcorean(ito|o)?\b/i.test(String(parsedLine.name || "")) || /\bcorean(ito|o)?\b/i.test(String(parsedLine.raw || ""));
  const alias =
    aliases[aliasKeyFromName] ||
    (aliasKeyFromNameSingular ? aliases[aliasKeyFromNameSingular] : null) ||
    aliases[aliasKeyFromRaw] ||
    (aliasKeyFromRawSingular ? aliases[aliasKeyFromRawSingular] : null) ||
    globalAliases[aliasKeyFromName] ||
    (aliasKeyFromNameSingular ? globalAliases[aliasKeyFromNameSingular] : null) ||
    globalAliases[aliasKeyFromRaw] ||
    (aliasKeyFromRawSingular ? globalAliases[aliasKeyFromRawSingular] : null) ||
    null;

  // Regla de negocio: "coreano/coreanito" siempre es Zapallo Amarillo por Kg.
  // Esto evita que un alias viejo lo mande a "Zapallito Verde".
  const effectiveAlias = isCoreano
    ? { productId: "zapallo", variant: "Amarillo", unit: "Kg" }
    : alias;

  const aliasComment = String(effectiveAlias?.comment || "").trim();
  const effectiveComment = mergeComments(parsedComment, aliasComment);

  if (effectiveAlias?.productId) {
    let resolvedAliasProductId = effectiveAlias.productId;
    let product = productsById.get(resolvedAliasProductId) || null;
    let variantFromAliasProductId = "";

    // Backward-compat: si un alias viejo apuntaba a un producto que ya no existe
    // porque ahora se agrupa como variante (ej: "champignones" -> "hongos"),
    // intentamos normalizar el productId como si fuera un encabezado del Sheet.
    if (!product) {
      const normalizedAlias = normalizeProductFromHeader(String(alias.productId || ""), {
        defaultUnitIfMissing: false,
      });
      if (normalizedAlias?.key && productsById.get(normalizedAlias.key)) {
        resolvedAliasProductId = normalizedAlias.key;
        product = productsById.get(resolvedAliasProductId) || null;
        if (normalizedAlias.variant) {
          variantFromAliasProductId = normalizedAlias.variant;
        }
      }
    }

    if (product) {
      let unit = effectiveAlias.unit || parsedLine.unit || product.defaultUnit || "";
      let quantity = Number(parsedLine.quantity || 0);
      const preferred = applyPreferredUnitAndVariant({
        product,
        unit,
        variant: effectiveAlias.variant || parsedLine.variant || variantFromAliasProductId || "",
        unitExplicit: Boolean(parsedLine.unit || effectiveAlias.unit),
      });
      unit = preferred.unit;

      if (shouldForceUnitMode(product.id, unitModeProducts)) {
        unit = "Unidad";
      }

      if (effectiveAlias.unitMode || shouldTreatAtadoAsUnitForProduct(product.id, parsedLine)) {
        const count = parseUniCount(String(parsedLine.raw || parsedLine.name || ""));
        return {
          productId: resolvedAliasProductId,
          name: product.name,
          unit,
          quantity,
          quantityText: count ? `${count} uni` : parsedLine.quantityText,
          unitMode: true,
          variant: normalizeCitrusUnit(product.id, preferred.variant || ""),
          comment: effectiveComment,
          importOrder: parsedLine.importOrder,
        };
      }

      quantity = Number(quantity || 0);
      if (effectiveAlias.unitMode) {
        return {
          productId: resolvedAliasProductId,
          name: product.name,
          unit,
          quantity,
          quantityText: parsedLine.quantityText,
          unitMode: true,
          variant: normalizeCitrusUnit(product.id, effectiveAlias.variant || parsedLine.variant || variantFromAliasProductId || ""),
          comment: effectiveComment,
          importOrder: parsedLine.importOrder,
        };
      }

      const resolvedVariant = normalizeCitrusUnit(product.id, preferred.variant || "");
      const normalizedVariant = normalizeVariantForSheetMatch(resolvedVariant);
      const resolved = applyBusinessUnitAndQuantityRules({
        productId: product.id,
        product,
        unit,
        quantity,
        parsedLine,
        unitExplicit: preferred.unitExplicit,
      });
      return {
        productId: resolvedAliasProductId,
        name: product.name,
        unit: resolved.unit,
        quantity: resolved.quantity,
        unitMode: false,
        variant: normalizedVariant ? resolvedVariant : "",
        comment: effectiveComment,
        importOrder: parsedLine.importOrder,
      };
    }
  }

  const parsedName = parseQuantityUnitAndName(parsedLine.raw, unitSynonyms);
  if (parsedName) {
    const productAliasKey = normalizeAliasKey(parsedName.name);
    const productAliasKeySingular = /s$/.test(productAliasKey) ? productAliasKey.replace(/s$/, "") : "";
    const aliasFromParsed =
      aliases[productAliasKey] ||
      (productAliasKeySingular ? aliases[productAliasKeySingular] : null) ||
      globalAliases[productAliasKey] ||
      (productAliasKeySingular ? globalAliases[productAliasKeySingular] : null) ||
      null;

    if (aliasFromParsed?.productId) {
      const product = productsById.get(aliasFromParsed.productId) || null;
      if (product) {
        let unit = aliasFromParsed.unit || parsedName.unit || product.defaultUnit || "";
        let quantity = Number(parsedName.quantity || 0);
        const preferred = applyPreferredUnitAndVariant({
          product,
          unit,
          variant: aliasFromParsed.variant || parsedName.variant || "",
          unitExplicit: Boolean(parsedName.unit || aliasFromParsed.unit),
        });
        unit = preferred.unit;

        if (shouldForceUnitMode(product.id, unitModeProducts)) {
          unit = "Unidad";
        }

        if (aliasFromParsed.unitMode || shouldTreatAtadoAsUnitForProduct(product.id, parsedLine)) {
          const count = parseUniCount(String(parsedLine.raw || parsedLine.name || ""));
          return {
            productId: product.id,
            name: product.name,
            unit,
            quantity,
            quantityText: count ? `${count} uni` : parsedLine.quantityText,
            unitMode: true,
            variant: normalizeCitrusUnit(product.id, preferred.variant || ""),
            comment: effectiveComment,
            importOrder: parsedLine.importOrder,
          };
        }

        const resolvedVariant = normalizeCitrusUnit(product.id, preferred.variant || "");
        const normalizedVariant = normalizeVariantForSheetMatch(resolvedVariant);
        const resolved = applyBusinessUnitAndQuantityRules({
          productId: product.id,
          product,
          unit,
          quantity,
          parsedLine,
          unitExplicit: preferred.unitExplicit,
        });
        return {
          productId: product.id,
          name: product.name,
          unit: resolved.unit,
          quantity: resolved.quantity,
          unitMode: false,
          variant: normalizedVariant ? resolvedVariant : "",
          comment: effectiveComment,
          importOrder: parsedLine.importOrder,
        };
      }
    }
  }

  const aliasKeyFromSource = normalizeAliasKey(parsedLine.raw);
  const aliasFromRaw = aliases[aliasKeyFromSource] || globalAliases[aliasKeyFromSource] || null;
  if (aliasFromRaw?.productId) {
    const product = productsById.get(aliasFromRaw.productId) || null;
    if (product) {
      let unit = aliasFromRaw.unit || parsedLine.unit || product.defaultUnit || "";
      let quantity = Number(parsedLine.quantity || 0);
      const preferred = applyPreferredUnitAndVariant({
        product,
        unit,
        variant: aliasFromRaw.variant || parsedLine.variant || "",
        unitExplicit: Boolean(parsedLine.unit || aliasFromRaw.unit),
      });
      unit = preferred.unit;

      if (shouldForceUnitMode(product.id, unitModeProducts)) {
        unit = "Unidad";
      }

      if (aliasFromRaw.unitMode || shouldTreatAtadoAsUnitForProduct(product.id, parsedLine)) {
        const count = parseUniCount(String(parsedLine.raw || parsedLine.name || ""));
        return {
          productId: product.id,
          name: product.name,
          unit,
          quantity,
          quantityText: count ? `${count} uni` : parsedLine.quantityText,
          unitMode: true,
          variant: normalizeCitrusUnit(product.id, preferred.variant || ""),
          comment: effectiveComment,
          importOrder: parsedLine.importOrder,
        };
      }

      const resolvedVariant = normalizeCitrusUnit(product.id, preferred.variant || "");
      const normalizedVariant = normalizeVariantForSheetMatch(resolvedVariant);
      const resolved = applyBusinessUnitAndQuantityRules({
        productId: product.id,
        product,
        unit,
        quantity,
        parsedLine,
        unitExplicit: preferred.unitExplicit,
      });
      return {
        productId: product.id,
        name: product.name,
        unit: resolved.unit,
        quantity: resolved.quantity,
        unitMode: false,
        variant: normalizedVariant ? resolvedVariant : "",
        comment: effectiveComment,
        importOrder: parsedLine.importOrder,
      };
    }
  }

  const normalizedDirect = normalizeProductFromHeader(
    `${parsedLine.name || ""} ${parsedLine.unit || ""}`.trim(),
    { defaultUnitIfMissing: false }
  );
  let directProductId = normalizedDirect?.key ? String(normalizedDirect.key).trim() : "";
  if (!directProductId) {
    const guess = slugify(String(parsedLine.name || ""));
    if (guess && productsById.get(guess)) {
      directProductId = guess;
    }
  }

  if (directProductId) {
    const product = productsById.get(directProductId) || null;
    if (product) {
      let unit = String(parsedLine.unit || normalizedDirect?.unit || product.defaultUnit || "").trim();
      let quantity = Number(parsedLine.quantity || 0);
      let variant = String(normalizedDirect?.variant || parsedLine.variant || "").trim();
      let unitExplicit = Boolean(parsedLine.unit || normalizedDirect?.unit);

      if (!unitExplicit && clientId) {
        const preferred = getMostRecentComboForClient(product.id, clientId) || getPreferredPreset(product.id);
        if (preferred?.unit) {
          unit = String(preferred.unit || "").trim() || unit;
          unitExplicit = true;
        }
        if (!variant && preferred?.variant) {
          variant = String(preferred.variant || "").trim();
        }
      }

      if (shouldForceUnitMode(product.id, unitModeProducts)) {
        unit = "Unidad";
      }

      if (shouldTreatAtadoAsUnitForProduct(product.id, parsedLine)) {
        const count = parseUniCount(String(parsedLine.raw || parsedLine.name || ""));
        return {
          productId: product.id,
          name: product.name,
          unit,
          quantity,
          quantityText: count ? `${count} uni` : parsedLine.quantityText,
          unitMode: true,
          variant: normalizeCitrusUnit(product.id, variant),
          comment: effectiveComment,
          importOrder: parsedLine.importOrder,
        };
      }

      const resolvedVariant = normalizeCitrusUnit(product.id, variant);
      const normalizedVariant = normalizeVariantForSheetMatch(resolvedVariant);
      const resolved = applyBusinessUnitAndQuantityRules({
        productId: product.id,
        product,
        unit,
        quantity,
        parsedLine,
        unitExplicit,
      });

      return {
        productId: product.id,
        name: product.name,
        unit: resolved.unit,
        quantity: resolved.quantity,
        unitMode: false,
        variant: normalizedVariant ? resolvedVariant : "",
        comment: effectiveComment,
        importOrder: parsedLine.importOrder,
      };
    }
  }

  return null;
};

const initApp = async () => {
  recoverAllAliasesFromStorage();
  try {
    const serverAliases = await ordersApi.loadAliases();
    const payload = {
      version: "aliases-v1",
      exportedAt: new Date().toISOString(),
      data: serverAliases?.data || {},
    };
    importAliasesDump(JSON.stringify(payload));
  } catch (error) {
    console.warn("No se pudieron cargar alias desde el server:", error);
  }
  // Load sheet values (headers + rows)
  const data = await ordersApi.loadOrdersSheetValues();
  const values = Array.isArray(data.values) ? data.values : [];
  sheetHeaders = values[0] || [];
  rawProducts = values[0] || [];

  // Build products from headers (skip date/client columns and empty headers)
  const productHeaders = (Array.isArray(rawProducts) ? rawProducts.slice(2) : [])
    .filter((header) => String(header ?? "").trim());
  products = buildProductsFromHeaders(productHeaders);
  productsById = new Map((products || []).map((p) => [String(p.id), p]));

  const productState = new Map();
  const cardByProductId = new Map();

  favoritesStore = createFavoritesStore({ clientSelect, getProductsById: () => productsById });
  favoritesStore.loadFromSheet(values);
  getFavoritePresets = (productId, clientId = null) => {
    try {
      return favoritesStore.getPresets(productId, clientId);
    } catch (e) {
      return [];
    }
  };

  const summaryController = createSummaryController({
    clients,
    clientSelect,
    summaryBox,
    summaryClient,
    summaryContent,
    confirmButtons,
    clearOrderButtons,
    productState,
    updateOutput: () => {},
    scheduleCoverageUpdate: () => {},
  });

  const { renderSummary } = summaryController;

  const layoutController = createLayoutController({
    itemsContainer,
    summaryController,
    renderSummary,
  });

  const { updateFavoriteIndicators } = createFavoritesIndicators({
    itemsContainer,
    clientSelect,
    productState,
    getFavoriteMeta: (productId) => favoritesStore.getFavoriteMeta(productId),
    getFavoriteComboMeta: (productId, unit, variant) =>
      favoritesStore.getFavoriteComboMeta(productId, unit, variant),
  });

  const productStateController = createProductStateController({
    productState,
    renderSummary,
    renderProductGrid: () => catalogController.renderProductGrid(),
    anchorUpdateDelayMs: 6000,
  });

  const { updateItemState, scheduleAnchoredCardsUpdate } = productStateController;

  const buildOrderObject = () => ({
    items: Array.from(productState.values())
      .filter((item) => (item.quantity && item.quantity > 0) || (item.unitMode && item.quantityText))
      .map((item) => ({
        productId: item.productId,
        name: item.productName,
        unit: item.unit,
        quantity: item.quantity,
        quantityText: item.quantityText,
        unitMode: item.unitMode,
        variant: item.variant,
        comment: item.comment,
      })),
  });

  const productCardBuilder = createProductCardBuilder({
    unitModeProducts,
    productState,
    createRowId,
    updateItemState,
    scheduleMasonryUpdate: layoutController.scheduleMasonryUpdate,
    renderSummary,
    scheduleAnchoredCardsUpdate,
    updateFavoriteIndicators,
    getFavoritePresets,
  });

  const catalogController = createCatalogController({
    itemsContainer,
    catalogSearch,
    orderSelect,
    orderDirection,
    uncategorizedContent,
    getProducts: () => products,
    productState,
    cardByProductId,
    buildProductCard: productCardBuilder.buildProductCard,
    scheduleCoverageUpdate: layoutController.scheduleCoverageUpdate,
    scheduleMasonryUpdate: layoutController.scheduleMasonryUpdate,
    updateFavoriteIndicators,
    getFavoriteMeta: (productId) => favoritesStore.getFavoriteMeta(productId),
  });

  const orderController = createOrderController({
    ordersApi,
    clients,
    clientSelect,
    confirmButtons,
    clearOrderButtons,
    productState,
    cardByProductId,
    itemsContainer,
    getRowCounter,
    setRowCounter,
    getSheetHeaders: () => sheetHeaders,
    mapOrderItemsToSheetColumns: (items) =>
      mapOrderItemsToSheetColumnsUsingHeaders(items, sheetHeaders, productsById),
    buildOrderObject,
    updateOutput: () => {},
    renderSummary,
    scheduleCoverageUpdate: layoutController.scheduleCoverageUpdate,
    renderProductGrid: () => catalogController.renderProductGrid(),
    filterCards: () => catalogController.filterCards(),
    updateFavoriteIndicators,
    orderOutput,
    saveStatus,
    saveConfirmModal,
    saveConfirmMessage,
    saveConfirmOk,
    savePartialModal,
    savePartialMessage,
    savePartialYes,
    savePartialNo,
  });

  const clientsController = createClientsController({
    clients,
    clientSelect,
    editClientButton,
    newClientButton,
    ordersApi,
    onClientUpdated: (client) => {
      renderSummary();
      layoutController.scheduleCoverageUpdate();
      layoutController.scheduleMasonryUpdate();
    },
  });

  const aliasesController = createAliasesController({
    clientSelect,
    aliasSourceInput,
    aliasProductSelect,
    aliasUnitSelect,
    aliasVariantSelect,
    getProductsById: () => productsById,
    getFavoritesData: () => favoritesStore.getData(),
    parseQuantityUnitAndName,
    normalizeProductFromHeader,
    slugify,
    normalizeSpaces,
  });

  const importApplier = createImportApplier({
    getProductsById: () => productsById,
    getCardByProductId: () => cardByProductId,
    coerceUnitForProduct,
    coerceVariantForProduct,
    parseUniCount,
  });

  populateAliasProductSelectUI(aliasProductSelect, products);

  const importBoxController = createImportBoxController({
    clientSelect,
    pasteOrderToggle,
    whatsappImportBox,
    pasteOrderText,
    pasteOrderApply,
    pasteOrderClear,
    pasteOrderReport,
    aliasSourceInput,
    aliasProductSelect,
    aliasUnitSelect,
    aliasVariantSelect,
    aliasUnitModeCheckbox,
    aliasCommentEnabledCheckbox,
    aliasCommentField,
    aliasCommentInput,
    aliasSaveButton,
    refreshAliasUnitAndVariantOptions: () =>
      refreshAliasUnitAndVariantOptionsUI({
        aliasProductSelect,
        aliasUnitSelect,
        aliasVariantSelect,
        productsById,
      }),
    summaryController,
    parseWhatsAppTextToItems: (text, clientId, resolveItem) => {
      startNewImportRun();
      return parseWhatsAppTextToItems(text, clientId, resolveItem);
    },
    resolveParsedLineToItem,
    normalizeVariantForSheetMatch,
    parseQuantityUnitAndName,
    ensureCardRowAndSetQuantity: importApplier.ensureCardRowAndSetQuantity,
    onBeforeParse: ({ clientId }) => {
      importLechugaDecision.byClientId.set(clientId, {
        decided: false,
        value: "",
        runId: importRunCounter,
      });
    },
  });

  const syncAliasSaveUiFromState = () => {
    if (!aliasSaveButton) {
      return;
    }
    const disabled = aliasSaveButton.disabled;
    if (!disabled) {
      aliasSaveButton.classList.remove("button-disabled");
      return;
    }
    aliasSaveButton.classList.add("button-disabled");
  };

  aliasSaveButton?.addEventListener("click", () => {
    syncAliasSaveUiFromState();
    setTimeout(syncAliasSaveUiFromState, 0);
  });

  aliasSourceInput?.addEventListener("input", () => {
    syncAliasSaveUiFromState();
  });

  aliasSaveButton?.addEventListener("click", () => {
    syncAliasSaveUiFromState();
    setTimeout(syncAliasSaveUiFromState, 0);
  });

  const refreshImportUiForClient = () => {
    summaryController.renderSummary();
    layoutController.scheduleCoverageUpdate();
    layoutController.scheduleMasonryUpdate();
  };

  const syncPasteToggleVisibility = () => {
    if (!pasteOrderToggle) {
      return;
    }
    const hasClient = Boolean(clientSelect?.value);
    pasteOrderToggle.classList.toggle("hidden", !hasClient);
    pasteOrderToggle.disabled = !hasClient;
    if (!hasClient) {
      whatsappImportBox?.classList.add("hidden");
    }
  };

  clientSelect?.addEventListener("change", () => {
    refreshImportUiForClient();
    syncPasteToggleVisibility();
    try {
      importBoxController.updateImportUiState();
    } catch (err) {
      console.warn("importBoxController updateImportUiState failed:", err);
    }
  });

  const normalizeAliasUnit = (productId, unit) => {
    const product = productsById.get(productId);
    if (!product || !unit) {
      return unit;
    }
    if (product.id === "huevos" || product.id === "huevo") {
      return unit === "Caja" ? "Maple" : unit;
    }
    return unit;
  };

  aliasSaveButton?.addEventListener("click", () => {
    if (!aliasSaveButton || aliasSaveButton.disabled) {
      return;
    }
    const clientId = clientSelect.value;
    const source = aliasSourceInput.value.trim();
    const productId = aliasProductSelect.value;
    const unit = normalizeAliasUnit(productId, aliasUnitSelect.value);
    const variant = aliasVariantSelect.value || "";
    const unitMode = Boolean(aliasUnitModeCheckbox?.checked);
    const comment = aliasCommentEnabledCheckbox?.checked ? aliasCommentInput?.value || "" : "";

    if (!clientId || !source || !productId) {
      return;
    }

    const key = getAliasStorageKeyFromSource(source, { parseQuantityUnitAndName });
    const aliases = loadClientAliases(clientId, getClientLabelForAliases(clientId));
    aliases[key] = { productId, unit, variant, unitMode, comment };
    saveClientAliases(clientId, aliases);

    try {
      const payload = JSON.parse(exportAliasesDump().json || "{}");
      ordersApi.saveAliases({ data: payload.data || {} });
    } catch (error) {
      console.warn("No se pudieron guardar alias en el server:", error);
    }

    refreshAliasUnitAndVariantOptionsUI({
      aliasProductSelect,
      aliasUnitSelect,
      aliasVariantSelect,
      productsById,
    });
    importBoxController.updateImportUiState();
    refreshImportUiForClient();
  });

  const setAliasRecoveryStatus = (text, isError = false) => {
    if (!aliasRecoveryStatus) {
      return;
    }
    aliasRecoveryStatus.textContent = String(text || "").trim();
    aliasRecoveryStatus.classList.toggle("is-error", Boolean(isError));
  };

  aliasRecoveryExportButton?.addEventListener("click", () => {
    const result = exportAliasesDump();
    if (aliasRecoveryInput) {
      aliasRecoveryInput.value = result.json || "";
    }
    if (!result.count) {
      setAliasRecoveryStatus("No se encontraron alias para exportar.");
      return;
    }
    setAliasRecoveryStatus(`Exportados ${result.count} alias (${result.clients.length} clientes).`);
  });

  aliasRecoveryImportButton?.addEventListener("click", () => {
    const payload = aliasRecoveryInput?.value || "";
    const result = importAliasesDump(payload, { clientId: clientSelect?.value });
    if (result.error === "empty") {
      setAliasRecoveryStatus("Pegue un JSON de alias para importar.", true);
      return;
    }
    if (result.error === "invalid") {
      setAliasRecoveryStatus("JSON invalido. Verifique el contenido.", true);
      return;
    }
    recoverAllAliasesFromStorage();
    refreshImportUiForClient();
    try {
      const payload = JSON.parse(exportAliasesDump().json || "{}");
      ordersApi.saveAliases({ data: payload.data || {} });
    } catch (error) {
      console.warn("No se pudieron guardar alias en el server:", error);
    }
    setAliasRecoveryStatus(`Importados ${result.imported} alias (${result.clients.length} clientes).`);
  });

  const aliasPreview = document.querySelector("#alias-preview");
  const aliasPreviewText = document.querySelector("#alias-preview-text");

  const showAliasPreview = (alias) => {
    if (!aliasPreview || !aliasPreviewText) {
      return;
    }
    if (!alias) {
      aliasPreview.classList.add("hidden");
      aliasPreviewText.textContent = "";
      return;
    }
    const product = productsById.get(alias.productId);
    if (!product) {
      aliasPreview.classList.add("hidden");
      aliasPreviewText.textContent = "";
      return;
    }
    const labelParts = [product.name];
    if (alias.variant) {
      labelParts.push(alias.variant);
    }
    if (alias.unit) {
      labelParts.push(alias.unit);
    }
    aliasPreviewText.textContent = labelParts.join(" · ");
    aliasPreview.classList.remove("hidden");
  };

  aliasSourceInput?.addEventListener("input", () => {
    const clientId = clientSelect.value;
    if (!clientId) {
      showAliasPreview(null);
      return;
    }
    const aliases = loadClientAliases(clientId, getClientLabelForAliases(clientId));
    const aliasKey = normalizeAliasKey(aliasSourceInput.value.trim());
    const alias = aliases[aliasKey] || globalAliases[aliasKey];
    showAliasPreview(alias || null);
  });

  const syncClientSelectTag = () => {
    if (!clientSelect) {
      return;
    }
    const clientTag = document.querySelector("#client-tag");
    if (!clientTag) {
      return;
    }
    const selected = clients.find((c) => String(c.id) === String(clientSelect.value));
    clientTag.textContent = selected ? selected.tag || "" : "";
  };

  clientSelect?.addEventListener("change", () => {
    syncClientSelectTag();
  });

  const renderHeadersDebug = (headers) => {
    const debug = document.querySelector("#debug-table");
    if (!debug) return;
    debug.innerHTML = "";
    const table = document.createElement("table");
    const head = document.createElement("tr");
    headers.forEach((h) => {
      const th = document.createElement("th");
      th.textContent = String(h ?? "");
      head.appendChild(th);
    });
    table.appendChild(head);
    debug.appendChild(table);
  };

  const init = async () => {
    try {
      await clientsController.init();
    } catch (err) {
      console.warn("clientsController init failed:", err);
    }
    try {
      catalogController.init();
      await catalogController.renderProductGrid();
      await catalogController.renderUncategorized();
    } catch (err) {
      console.warn("catalogController init failed:", err);
    }
    try {
      orderController.init();
    } catch (err) {
      console.warn("orderController init failed:", err);
    }
    try {
      aliasesController.init();
    } catch (err) {
      console.warn("aliasesController init failed:", err);
    }
    try {
      importBoxController.init();
    } catch (err) {
      console.warn("importBoxController init failed:", err);
    }
    syncPasteToggleVisibility();
    try {
      importBoxController.updateImportUiState();
    } catch (err) {
      console.warn("importBoxController updateImportUiState failed:", err);
    }
    syncAliasSaveUiFromState();
    syncClientSelectTag();
    renderSummary();
    hideLoadingCurtain();
  };

  init();

  window.__APP = { products, productsById, sheetHeaders, rawProducts, productState };
};

initApp();
