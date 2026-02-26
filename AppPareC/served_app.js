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
  slugify,
  normalizeAliasKey,
  loadClientAliases,
  saveClientAliases,
  getAliasStorageKeyFromSource,
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

let rawProducts = [];
let sheetHeaders = [];

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

const normalizeSpaces = (value) => value.replace(/\s+/g, " ").trim();

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

const applyBusinessUnitAndQuantityRules = ({ productId, product, unit, quantity, parsedLine }) => {
  const pid = String(productId || "").trim().toLowerCase();
  const productName = String(product?.name || "").trim().toLowerCase();
  const raw = String(parsedLine?.raw || "").trim().toLowerCase();
  const parsedUnit = String(parsedLine?.unit || "").trim();

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
  if (!parsedUnit && (isLimon || isNaranja || isPomelo)) {
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
    const unitWasExplicit = Boolean(parsedUnit);
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

  const aliases = loadClientAliases(clientId);
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
