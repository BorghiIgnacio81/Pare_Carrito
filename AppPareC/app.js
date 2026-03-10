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
import { createControlOrdersTab } from "./src/ui/controlOrdersTab.js";
import { createFavoritesIndicators } from "./src/ui/favoritesIndicators.js";
import { createProductCardBuilder } from "./src/ui/productCard.js";
import {
  populateAliasProductSelect as populateAliasProductSelectUI,
  refreshAliasUnitAndVariantOptions as refreshAliasUnitAndVariantOptionsUI,
} from "./src/ui/aliasForm.js";
import { createOrdersApi } from "./src/services/ordersApi.js";
import { createClientsController } from "./src/controllers/clientsController.js";
import { createResponsiblesController } from "./src/controllers/responsiblesController.js";
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
let sheetColumnResolver = null;
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
const pedidoTitle = document.querySelector("#pedido-title");
const toggleGridViewButton = document.querySelector("#toggle-grid-view");
const clientSelect = document.querySelector("#client-select");
const orderSelect = document.querySelector("#order-select");
const orderDirection = document.querySelector("#order-direction");
const uncategorizedContent = document.querySelector("#uncategorized-content");
const summaryBox = document.querySelector(".page-header__summary");
const summaryClient = document.querySelector("#summary-client");
const saveStatus = document.querySelector("#save-status");
const editClientButton = document.querySelector("#edit-client");
const newClientButton = document.querySelector("#new-client");
const responsibleSelect = document.querySelector("#responsible-select");
const newResponsibleButton = document.querySelector("#new-responsible");
const editResponsibleButton = document.querySelector("#edit-responsible");
const assignResponsibleButton = document.querySelector("#assign-responsible");
const removeResponsibleButton = document.querySelector("#remove-responsible");
const responsibleAssignmentStatus = document.querySelector("#responsible-assignment-status");

const saveConfirmModal = document.querySelector("#save-confirm-modal");
const saveConfirmMessage = document.querySelector("#save-confirm-message");
const saveConfirmOk = document.querySelector("#save-confirm-ok");

const savePartialModal = document.querySelector("#save-partial-modal");
const savePartialMessage = document.querySelector("#save-partial-message");
const savePartialYes = document.querySelector("#save-partial-yes");
const savePartialNo = document.querySelector("#save-partial-no");
const controlOnlyCurrentModal = document.querySelector("#control-only-current-modal");
const controlOnlyCurrentMessage = document.querySelector("#control-only-current-message");
const controlOnlyCurrentConfirm = document.querySelector("#control-only-current-confirm");
const controlOnlyCurrentCancel = document.querySelector("#control-only-current-cancel");

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
const updateTareasPdfButton = document.querySelector("#update-tareas-pdf");
const updateImprimirPedidosButton = document.querySelector("#update-imprimir-pedidos");
const updateTareasPdfStatus = document.querySelector("#update-tareas-pdf-status");
const updateImprimirPedidosStatus = document.querySelector("#update-imprimir-pedidos-status");
const controlCommentsReportButton = document.querySelector("#control-comments-report");
const controlCommentsReportStatus = document.querySelector("#control-comments-report-status");
const controlUnitsReportButton = document.querySelector("#control-units-report");
const controlUnitsReportStatus = document.querySelector("#control-units-report-status");
const tabCreateOrdersButton = document.querySelector("#tab-create-orders");
const tabControlOrdersButton = document.querySelector("#tab-control-orders");
const tabRepartoOrdersButton = document.querySelector("#tab-reparto-orders");
const createOrdersPane = document.querySelector("#create-orders-pane");
const controlOrdersPane = document.querySelector("#control-orders-pane");
const repartoPane = document.querySelector("#reparto-pane");
const controlOrdersDateSelect = document.querySelector("#control-orders-date");
const controlOrdersOnlyCurrentButton = document.querySelector("#control-orders-only-current");
const refreshControlOrdersButton = document.querySelector("#refresh-control-orders");
const controlOrdersBody = document.querySelector("#control-orders-body");
const controlOrdersStatus = document.querySelector("#control-orders-status");
const controlUnitsReportWrap = document.querySelector("#control-units-report-wrap");
const controlCommentsReportWrap = document.querySelector("#control-comments-report-wrap");
const repartoProductsBody = document.querySelector("#reparto-products-body");
const repartoProductsStatus = document.querySelector("#reparto-products-status");
const clientControlsBlock = document.querySelector("#client-controls-block");
const pdfActionsBlock = document.querySelector("#pdf-actions-block");
const createSummaryPane = document.querySelector("#create-summary-pane");

const setSaveStatusMessage = (message, state = "") => {
  if (!saveStatus) {
    return;
  }
  saveStatus.textContent = String(message || "");
  saveStatus.classList.remove("save-status--success", "save-status--error");
  if (state === "success") {
    saveStatus.classList.add("save-status--success");
  } else if (state === "error") {
    saveStatus.classList.add("save-status--error");
  }
};

const setButtonStatusMessage = (node, message, state = "") => {
  if (!node) {
    return;
  }
  node.textContent = String(message || "");
  node.classList.remove("save-status--success", "save-status--error");
  if (state === "success") {
    node.classList.add("save-status--success");
  } else if (state === "error") {
    node.classList.add("save-status--error");
  }
};

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

const syncAliasesToServer = async () => {
  try {
    const payload = JSON.parse(exportAliasesDump().json || "{}");
    const data = payload?.data || {};
    if (Object.keys(data).length) {
      await ordersApi.saveAliases({ data });
    }
  } catch (error) {
    console.warn("No se pudieron guardar alias en el server:", error);
  }
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
  if (
    (pid === "limon" || pid === "naranja" || pid === "pomelo") &&
    (u === "Cajón" || u === "Bolsa")
  ) {
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
  const rawHasDozen = /\bdoc(ena)?s?\b/i.test(raw);
  const isUnitExplicit = Boolean(unitExplicit || parsedUnit);
  const isUnitExplicitFromText = Boolean(parsedUnit) || rawHasDozen;

  let nextUnit = String(unit || "").trim();
  let nextQuantity = Number.isFinite(quantity) ? quantity : 0;
  let didConvertToDocena = false;

  const convertToDocena = () => {
    if (didConvertToDocena) {
      return;
    }
    nextQuantity = nextQuantity / 12;
    nextQuantity = Math.round(nextQuantity * 1000) / 1000;
    nextUnit = "Docena";
    didConvertToDocena = true;
  };

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

  const isPalta = pid === "palta" || /\bpalta(s)?\b/.test(productName) || /\bpalta(s)?\b/.test(raw);
  if (isPalta) {
    const unitKey = String(nextUnit || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
    if (unitKey === "cajon") {
      // Regla de negocio: 1 cajon de palta = 18 kg.
      nextQuantity = nextQuantity * 18;
      nextQuantity = Math.round(nextQuantity * 1000) / 1000;
      nextUnit = "Kg";
      return { unit: nextUnit, quantity: nextQuantity };
    }
  }

  const isLimon = pid === "limon" || /\blim[oó]n(es)?\b/.test(productName) || /\blim[oó]n(es)?\b/.test(raw);
  const isNaranja = pid === "naranja" || /\bnaranja(s)?\b/.test(productName) || /\bnaranja(s)?\b/.test(raw);
  const isPomelo = pid === "pomelo" || /\bpomelo(s)?\b/.test(productName) || /\bpomelo(s)?\b/.test(raw);
  if (isLimon || isNaranja || isPomelo) {
    // Regla de negocio: en cítricos, Bolsa/Cajón/Caja => Jaula.
    nextUnit = normalizeCitrusUnit(pid, nextUnit);
  }
  const loweredUnit = () => String(nextUnit || "").trim().toLowerCase();
  const isUnidadUnit = () => {
    const current = loweredUnit();
    return current === "unidad" || current === "unidades";
  };
  if (!isUnitExplicit && (isLimon || isNaranja || isPomelo)) {
    // Regla de negocio: si el cliente escribe cantidad sin unidad, interpretamos "unidades"
    // y convertimos a docenas (12 uni = 1 docena).
    convertToDocena();
  }
  if ((isLimon || isNaranja || isPomelo) && isUnidadUnit()) {
    // Regla: si la unidad es "Unidad" en cítricos, convertir a Docena.
    convertToDocena();
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
    const unitWasExplicit = Boolean(isUnitExplicitFromText);
    // Si el cliente escribe "6 bananas" (sin unidad), y el default del producto es Docena,
    // interpretamos la cantidad como unidades y convertimos a docenas.
    const current = loweredUnit();
    const isDozenUnit = current === "docena" || current === "docenas";
    const isUnidadUnit = current === "unidad" || current === "unidades";

    // Caso explícito: "24 unid. bananas" => 2 docenas.
    if (isUnidadUnit) {
      convertToDocena();
    }
    if (!unitWasExplicit && isDozenUnit) {
      convertToDocena();
    }
  }

  const isSandia =
    pid === "sandia" ||
    pid === "sandía" ||
    /\bsand[ií]a(s)?\b/.test(productName) ||
    /\bsand[ií]a(s)?\b/.test(raw);
  if (isSandia && !isUnitExplicitFromText) {
    const mentionsHalf = /\bmedia\b|\bmedio\b|\bmitad\b/i.test(raw);
    if (mentionsHalf) {
      nextQuantity = 0.5;
      if (!nextUnit) {
        nextUnit = "Unidad";
      }
      return { unit: nextUnit, quantity: nextQuantity };
    }
  }

  const productHasDocena =
    (Array.isArray(product?.units) && product.units.includes("Docena")) ||
    String(product?.defaultUnit || "") === "Docena";
  const currentUnit = loweredUnit();
  const unitIsDocena = currentUnit === "docena" || currentUnit === "docenas";
  if (productHasDocena && !unitIsDocena) {
    if (isUnidadUnit() || !isUnitExplicit) {
      convertToDocena();
    }
  }

  const normalizeDocenaText = (value) =>
    String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const docenaPhrases = [
    "banana",
    "bananas",
    "pomelo",
    "mandarina",
    "naranja",
    "limon",
    "banana premium",
    "mandarina grande",
    "lima",
    "choclo blanco",
    "choclo amarillo",
  ];

  const normalizedProductName = normalizeDocenaText(productName);
  const normalizedRaw = normalizeDocenaText(raw);
  const isDocenaProduct = docenaPhrases.some((phrase) => {
    const key = slugify(phrase);
    if (pid === key) {
      return true;
    }
    return (
      (normalizedProductName && normalizedProductName.includes(phrase)) ||
      (normalizedRaw && normalizedRaw.includes(phrase))
    );
  });

  if (isDocenaProduct) {
    const unitIsDocena = ["docena", "docenas"].includes(loweredUnit());
    if (isUnidadUnit() || (!isUnitExplicitFromText && unitIsDocena) || !isUnitExplicitFromText) {
      convertToDocena();
    }
  }

  const unitIsDocenaFromPreferred =
    ["docena", "docenas"].includes(loweredUnit()) && !isUnitExplicitFromText;
  if (unitIsDocenaFromPreferred && (productHasDocena || isDocenaProduct || isBanana || isLimon || isNaranja || isPomelo)) {
    convertToDocena();
  }

  return { unit: nextUnit, quantity: nextQuantity };
};

const shouldTreatAtadoAsUnitForProduct = (productId, parsedLine) => {
  const pid = String(productId || "").trim().toLowerCase();
  const parsedUnit = String(parsedLine?.unit || "").trim();
  if (!pid || !parsedUnit) {
    // Regla de negocio: en calabaza, si el cliente no escribe unidad,
    // lo interpretamos como unidades (ej: "2 calabaza" => "2 uni").
    return pid === "calabaza" && !parsedUnit;
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

  const normalizeLookupKey = (value) =>
    normalizeSpaces(String(value || ""))
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  const normalizeTokenText = (value) =>
    normalizeSpaces(String(value || ""))
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const tokenizeText = (value) => normalizeTokenText(value).split(" ").filter(Boolean);

  const hasHydroponicHint = () => {
    const combined = `${parsedLine.raw || ""} ${parsedLine.name || ""} ${parsedLine.commentFromText || ""}`;
    return tokenizeText(combined).some((token) => token.startsWith("hidro"));
  };

  const coerceRuculaVariant = (product, variant) => {
    if (!product || product.id !== "rucula") {
      return variant;
    }
    const variants = Array.isArray(product.variants) ? product.variants.filter(Boolean) : [];
    if (!variants.length) {
      return variant;
    }
    const findVariant = (key) =>
      variants.find((value) => normalizeTokenText(value) === key) || "";
    const comunVariant = findVariant("comun");
    const hidroVariant = findVariant("hidroponica");
    if (hasHydroponicHint()) {
      return variant || hidroVariant || variant;
    }
    return comunVariant || variant;
  };

  const coerceLechugaVariant = (product, variant) => {
    if (!product || product.id !== "lechuga") {
      return variant;
    }
    const variants = Array.isArray(product.variants) ? product.variants.filter(Boolean) : [];
    if (!variants.length) {
      return variant;
    }

    const findVariant = (key) =>
      variants.find((value) => normalizeTokenText(value) === key) || "";

    const combined = `${parsedLine.raw || ""} ${parsedLine.name || ""} ${parsedLine.commentFromText || ""}`;
    const tokens = tokenizeText(combined);
    const hasMoradaHint = tokens.some((token) => token.startsWith("morad"));
    const hasHydroHint = tokens.some((token) => token.startsWith("hidro"));

    const moradaVariant = findVariant("morada") || findVariant("morado");
    const hidroVariant = findVariant("hidroponica");
    const comunVariant = findVariant("comun");

    if (hasMoradaHint && moradaVariant) {
      return moradaVariant;
    }
    if (hasHydroHint && hidroVariant) {
      return hidroVariant;
    }

    const normalizedIncoming = normalizeTokenText(variant);
    if (normalizedIncoming === "morado" && moradaVariant) {
      return moradaVariant;
    }

    // Evitar que una preferencia histórica (ej: Hidropónica) pise una línea que no la menciona.
    if (!hasHydroHint && normalizedIncoming === "hidroponica") {
      return comunVariant || "";
    }

    return variant;
  };

  const coercePaltaVariant = (product, variant) => {
    if (!product || product.id !== "palta") {
      return variant;
    }
    const variants = Array.isArray(product.variants) ? product.variants.filter(Boolean) : [];
    if (!variants.length) {
      return variant;
    }
    if (variant) {
      return variant;
    }
    const combined = `${parsedLine.raw || ""} ${parsedLine.name || ""} ${parsedLine.commentFromText || ""}`;
    const tokens = tokenizeText(combined);
    const findVariant = (key) =>
      variants.find((value) => normalizeTokenText(value) === key) || "";
    const maduraVariant = findVariant("madura");
    const verdeVariant = findVariant("verde");
    const hasVerde = tokens.some((token) => token.startsWith("verd"));
    const hasMadura = tokens.some((token) => token.startsWith("madur"));
    if (hasVerde && verdeVariant) {
      return verdeVariant;
    }
    if (hasMadura && maduraVariant) {
      return maduraVariant;
    }
    return maduraVariant || variant;
  };

  const coerceTomateVariant = (product, variant, unit) => {
    if (!product || product.id !== "tomate") {
      return variant;
    }
    if (variant) {
      return variant;
    }
    const variants = Array.isArray(product.variants) ? product.variants.filter(Boolean) : [];
    if (!variants.length) {
      return variant;
    }
    const findVariant = (key) =>
      variants.find((value) => normalizeTokenText(value) === key) || "";
    const peritaVariant = findVariant("perita");
    const normalVariant = findVariant("normal");
    const unitKey = String(unit || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
    if (unitKey === "kg") {
      return peritaVariant || variant;
    }
    if (unitKey === "cajon") {
      return normalVariant || variant;
    }
    return variant;
  };

  const coerceSpecialVariant = (product, variant, unit) => {
    const ruculaVariant = coerceRuculaVariant(product, variant);
    const lechugaVariant = coerceLechugaVariant(product, ruculaVariant);
    const paltaVariant = coercePaltaVariant(product, lechugaVariant);
    return coerceTomateVariant(product, paltaVariant, unit);
  };

  const getUiVariantLabel = (product, variant) => {
    if (!product) {
      return String(variant || "").trim();
    }
    const normalized = normalizeVariantForSheetMatch(variant);
    if (!normalized) {
      const label = product.variantLabelByKey?.[""];
      return String(label || "").trim();
    }
    return String(variant || "").trim();
  };

  const splitLookupTokens = (value) => normalizeLookupKey(value).split(" ").filter(Boolean);

  const getSourceTokens = () => splitLookupTokens(parsedLine.name || parsedLine.raw || "");

  const tokenMatchesKey = (token, key) => {
    if (!token || !key) {
      return false;
    }
    if (token === key) {
      return true;
    }
    if (token === `${key}s`) {
      return true;
    }
    if (token === `${key}es`) {
      return true;
    }
    return false;
  };

  const pickColorVariantFromTokens = (product, sourceTokens) => {
    if (!product || !Array.isArray(product.variants) || !product.variants.length) {
      return "";
    }
    const tokens = Array.isArray(sourceTokens) ? sourceTokens : [];
    if (!tokens.length) {
      return "";
    }
    const wantsRojo = tokens.includes("r") || tokens.some((token) => token.startsWith("roj"));
    const wantsVerde = tokens.includes("v") || tokens.some((token) => token.startsWith("verd"));
    if (!wantsRojo && !wantsVerde) {
      return "";
    }
    const normalizedVariants = product.variants
      .map((value) => ({ raw: value, key: normalizeTokenText(value) }))
      .filter((entry) => entry.key);
    const rojoMatch = wantsRojo
      ? normalizedVariants.find((entry) => entry.key.startsWith("roj"))
      : null;
    const verdeMatch = wantsVerde
      ? normalizedVariants.find((entry) => entry.key.startsWith("verd"))
      : null;
    if (rojoMatch && verdeMatch) {
      return "";
    }
    if (rojoMatch) {
      return rojoMatch.raw;
    }
    if (verdeMatch) {
      return verdeMatch.raw;
    }
    return "";
  };

  const pickUniqueBestMatch = (candidates) => {
    if (!candidates.length) {
      return null;
    }
    candidates.sort((a, b) => b.score - a.score);
    if (candidates.length > 1 && candidates[0].score === candidates[1].score) {
      return null;
    }
    return candidates[0].value;
  };

  const finalizeResolvedItem = (item) => {
    if (!item) {
      return null;
    }
    if (!sheetColumnResolver || typeof sheetColumnResolver.resolve !== "function") {
      return item;
    }
    const match = sheetColumnResolver.resolve(item);
    return match ? item : null;
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
    if (!variant && preferred?.variant && product.id !== "lechuga") {
      return { unit, variant: String(preferred.variant || "").trim(), unitExplicit };
    }
    return { unit, variant, unitExplicit };
  };

  const aliases = loadClientAliases(clientId, getClientLabelForAliases(clientId));
  const aliasKeyFromName = normalizeAliasKey(parsedLine.name);
  const aliasKeyFromRaw = normalizeAliasKey(parsedLine.raw);
  const aliasKeyFromNameNormalized = getAliasStorageKeyFromSource(parsedLine.name, { parseQuantityUnitAndName });
  const aliasKeyFromRawNormalized = getAliasStorageKeyFromSource(parsedLine.raw, { parseQuantityUnitAndName });
  const aliasKeyFromNameSingular = /s$/.test(aliasKeyFromName) ? aliasKeyFromName.replace(/s$/, "") : "";
  const aliasKeyFromRawSingular = /s$/.test(aliasKeyFromRaw) ? aliasKeyFromRaw.replace(/s$/, "") : "";
  const aliasKeyFromNameNormalizedSingular = /s$/.test(aliasKeyFromNameNormalized)
    ? aliasKeyFromNameNormalized.replace(/s$/, "")
    : "";
  const aliasKeyFromRawNormalizedSingular = /s$/.test(aliasKeyFromRawNormalized)
    ? aliasKeyFromRawNormalized.replace(/s$/, "")
    : "";
  const aliasLookupKeys = [
    aliasKeyFromName,
    aliasKeyFromNameSingular,
    aliasKeyFromNameNormalized,
    aliasKeyFromNameNormalizedSingular,
    aliasKeyFromRaw,
    aliasKeyFromRawSingular,
    aliasKeyFromRawNormalized,
    aliasKeyFromRawNormalizedSingular,
  ].filter(Boolean);
  const isCoreano = /\bcorean(ito|o)?\b/i.test(String(parsedLine.name || "")) || /\bcorean(ito|o)?\b/i.test(String(parsedLine.raw || ""));
  const aliasKey = aliasLookupKeys.find((key) => aliases[key]);
  const alias = aliasKey ? aliases[aliasKey] : null;
  const globalAliasKey = aliasLookupKeys.find((key) => globalAliases[key]);
  const globalAlias = globalAliasKey ? globalAliases[globalAliasKey] : null;

  // Regla de negocio: "coreano/coreanito" siempre es Zapallo Amarillo por Kg.
  // Esto evita que un alias viejo lo mande a "Zapallito Verde".
  const effectiveAlias = isCoreano
    ? { productId: "zapallo", variant: "Amarillo", unit: "Kg" }
    : alias || globalAlias;

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
        return finalizeResolvedItem({
          productId: resolvedAliasProductId,
          name: product.name,
          unit,
          quantity,
          quantityText: count ? `${count} uni` : parsedLine.quantityText,
          unitMode: true,
          variant: getUiVariantLabel(
            product,
            normalizeCitrusUnit(product.id, coerceSpecialVariant(product, preferred.variant || "", unit))
          ),
          comment: effectiveComment,
          importOrder: parsedLine.importOrder,
        });
      }

      quantity = Number(quantity || 0);
      if (effectiveAlias.unitMode) {
        return finalizeResolvedItem({
          productId: resolvedAliasProductId,
          name: product.name,
          unit,
          quantity,
          quantityText: parsedLine.quantityText,
          unitMode: true,
          variant: getUiVariantLabel(
            product,
            normalizeCitrusUnit(
              product.id,
              coerceSpecialVariant(
                product,
                effectiveAlias.variant || parsedLine.variant || variantFromAliasProductId || "",
                unit
              )
            )
          ),
          comment: effectiveComment,
          importOrder: parsedLine.importOrder,
        });
      }

      const resolvedVariant = normalizeCitrusUnit(
        product.id,
        coerceSpecialVariant(product, preferred.variant || "", unit)
      );
      const normalizedVariant = normalizeVariantForSheetMatch(resolvedVariant);
      const resolved = applyBusinessUnitAndQuantityRules({
        productId: product.id,
        product,
        unit,
        quantity,
        parsedLine,
        unitExplicit: preferred.unitExplicit,
      });
      return finalizeResolvedItem({
        productId: resolvedAliasProductId,
        name: product.name,
        unit: resolved.unit,
        quantity: resolved.quantity,
        unitMode: false,
        variant: normalizedVariant ? resolvedVariant : getUiVariantLabel(product, resolvedVariant),
        comment: effectiveComment,
        importOrder: parsedLine.importOrder,
      });
    }
  }

  const parsedName = parseQuantityUnitAndName(parsedLine.raw, unitSynonyms);
  if (parsedName) {
    const productAliasKey = normalizeAliasKey(parsedName.name);
    const productAliasKeyNormalized = getAliasStorageKeyFromSource(parsedName.name, { parseQuantityUnitAndName });
    const productAliasKeySingular = /s$/.test(productAliasKey) ? productAliasKey.replace(/s$/, "") : "";
    const productAliasKeyNormalizedSingular = /s$/.test(productAliasKeyNormalized)
      ? productAliasKeyNormalized.replace(/s$/, "")
      : "";
    const aliasFromParsed =
      aliases[productAliasKey] ||
      (productAliasKeySingular ? aliases[productAliasKeySingular] : null) ||
      (productAliasKeyNormalized ? aliases[productAliasKeyNormalized] : null) ||
      (productAliasKeyNormalizedSingular ? aliases[productAliasKeyNormalizedSingular] : null) ||
      globalAliases[productAliasKey] ||
      (productAliasKeySingular ? globalAliases[productAliasKeySingular] : null) ||
      (productAliasKeyNormalized ? globalAliases[productAliasKeyNormalized] : null) ||
      (productAliasKeyNormalizedSingular ? globalAliases[productAliasKeyNormalizedSingular] : null) ||
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
          return finalizeResolvedItem({
            productId: product.id,
            name: product.name,
            unit,
            quantity,
            quantityText: count ? `${count} uni` : parsedLine.quantityText,
            unitMode: true,
            variant: getUiVariantLabel(
              product,
              normalizeCitrusUnit(product.id, coerceSpecialVariant(product, preferred.variant || "", unit))
            ),
            comment: effectiveComment,
            importOrder: parsedLine.importOrder,
          });
        }

        const resolvedVariant = normalizeCitrusUnit(
          product.id,
          coerceSpecialVariant(product, preferred.variant || "", unit)
        );
        const normalizedVariant = normalizeVariantForSheetMatch(resolvedVariant);
        const resolved = applyBusinessUnitAndQuantityRules({
          productId: product.id,
          product,
          unit,
          quantity,
          parsedLine,
          unitExplicit: preferred.unitExplicit,
        });
        return finalizeResolvedItem({
          productId: product.id,
          name: product.name,
          unit: resolved.unit,
          quantity: resolved.quantity,
          unitMode: false,
          variant: normalizedVariant ? resolvedVariant : getUiVariantLabel(product, resolvedVariant),
          comment: effectiveComment,
          importOrder: parsedLine.importOrder,
        });
      }
    }
  }

  const aliasKeyFromSource = getAliasStorageKeyFromSource(parsedLine.raw, { parseQuantityUnitAndName });
  const aliasKeyFromSourceSingular = /s$/.test(aliasKeyFromSource)
    ? aliasKeyFromSource.replace(/s$/, "")
    : "";
  const aliasFromRaw =
    (aliasKeyFromSource ? aliases[aliasKeyFromSource] : null) ||
    (aliasKeyFromSourceSingular ? aliases[aliasKeyFromSourceSingular] : null) ||
    (aliasKeyFromSource ? globalAliases[aliasKeyFromSource] : null) ||
    (aliasKeyFromSourceSingular ? globalAliases[aliasKeyFromSourceSingular] : null) ||
    null;
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
        return finalizeResolvedItem({
          productId: product.id,
          name: product.name,
          unit,
          quantity,
          quantityText: count ? `${count} uni` : parsedLine.quantityText,
          unitMode: true,
          variant: getUiVariantLabel(
            product,
            normalizeCitrusUnit(product.id, coerceSpecialVariant(product, preferred.variant || "", unit))
          ),
          comment: effectiveComment,
          importOrder: parsedLine.importOrder,
        });
      }

      const resolvedVariant = normalizeCitrusUnit(
        product.id,
        coerceSpecialVariant(product, preferred.variant || "", unit)
      );
      const normalizedVariant = normalizeVariantForSheetMatch(resolvedVariant);
      const resolved = applyBusinessUnitAndQuantityRules({
        productId: product.id,
        product,
        unit,
        quantity,
        parsedLine,
        unitExplicit: preferred.unitExplicit,
      });
      return finalizeResolvedItem({
        productId: product.id,
        name: product.name,
        unit: resolved.unit,
        quantity: resolved.quantity,
        unitMode: false,
        variant: normalizedVariant ? resolvedVariant : getUiVariantLabel(product, resolvedVariant),
        comment: effectiveComment,
        importOrder: parsedLine.importOrder,
      });
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
      if (!variant) {
        const fallbackVariant = pickColorVariantFromTokens(product, getSourceTokens());
        if (fallbackVariant) {
          variant = fallbackVariant;
        }
      }
      let unitExplicit = Boolean(parsedLine.unit || normalizedDirect?.unit);

      if (!unitExplicit && clientId) {
        const preferred = getMostRecentComboForClient(product.id, clientId) || getPreferredPreset(product.id);
        if (preferred?.unit) {
          unit = String(preferred.unit || "").trim() || unit;
          unitExplicit = true;
        }
        if (!variant && preferred?.variant && product.id !== "lechuga") {
          variant = String(preferred.variant || "").trim();
        }
      }

      if (shouldForceUnitMode(product.id, unitModeProducts)) {
        unit = "Unidad";
      }

      if (shouldTreatAtadoAsUnitForProduct(product.id, parsedLine)) {
        const count = parseUniCount(String(parsedLine.raw || parsedLine.name || ""));
        return finalizeResolvedItem({
          productId: product.id,
          name: product.name,
          unit,
          quantity,
          quantityText: count ? `${count} uni` : parsedLine.quantityText,
          unitMode: true,
          variant: getUiVariantLabel(
            product,
            normalizeCitrusUnit(product.id, coerceSpecialVariant(product, variant, unit))
          ),
          comment: effectiveComment,
          importOrder: parsedLine.importOrder,
        });
      }

      const resolvedVariant = normalizeCitrusUnit(product.id, coerceSpecialVariant(product, variant, unit));
      const normalizedVariant = normalizeVariantForSheetMatch(resolvedVariant);
      const resolved = applyBusinessUnitAndQuantityRules({
        productId: product.id,
        product,
        unit,
        quantity,
        parsedLine,
        unitExplicit,
      });

      return finalizeResolvedItem({
        productId: product.id,
        name: product.name,
        unit: resolved.unit,
        quantity: resolved.quantity,
        unitMode: false,
        variant: normalizedVariant ? resolvedVariant : getUiVariantLabel(product, resolvedVariant),
        comment: effectiveComment,
        importOrder: parsedLine.importOrder,
      });
    }
  }

  const sourceTokens = getSourceTokens();
  if (sourceTokens.length) {
    const productMatches = [];
    productsById.forEach((product) => {
      const productTokens = splitLookupTokens(product.name || product.id || "");
      if (!productTokens.length) {
        return;
      }
      const matchesAll = productTokens.every((keyToken) =>
        sourceTokens.some((token) => tokenMatchesKey(token, keyToken))
      );
      if (matchesAll) {
        productMatches.push({
          value: product,
          score: productTokens.join("").length,
        });
      }
    });

    const matchedProduct = pickUniqueBestMatch(productMatches);
    if (matchedProduct) {
      const variantMatches = [];
      (matchedProduct.variants || []).forEach((variant) => {
        const variantTokens = splitLookupTokens(variant);
        if (!variantTokens.length) {
          return;
        }
        const matchesAll = variantTokens.every((keyToken) =>
          sourceTokens.some((token) => tokenMatchesKey(token, keyToken))
        );
        if (matchesAll) {
          variantMatches.push({ value: variant, score: variantTokens.join("").length });
        }
      });

      let matchedVariant = pickUniqueBestMatch(variantMatches) || "";
      if (!matchedVariant) {
        const fallbackVariant = pickColorVariantFromTokens(matchedProduct, sourceTokens);
        if (fallbackVariant) {
          matchedVariant = fallbackVariant;
        }
      }
      let unit = String(parsedLine.unit || matchedProduct.defaultUnit || "").trim();
      let quantity = Number(parsedLine.quantity || 0);
      let variant = String(matchedVariant || parsedLine.variant || "").trim();
      let unitExplicit = Boolean(parsedLine.unit);

      if (!unitExplicit && clientId) {
        const preferred = getMostRecentComboForClient(matchedProduct.id, clientId) ||
          getPreferredPreset(matchedProduct.id);
        if (preferred?.unit) {
          unit = String(preferred.unit || "").trim() || unit;
          unitExplicit = true;
        }
        if (!variant && preferred?.variant && matchedProduct.id !== "lechuga") {
          variant = String(preferred.variant || "").trim();
        }
      }

      if (shouldForceUnitMode(matchedProduct.id, unitModeProducts)) {
        unit = "Unidad";
      }

      if (shouldTreatAtadoAsUnitForProduct(matchedProduct.id, parsedLine)) {
        const count = parseUniCount(String(parsedLine.raw || parsedLine.name || ""));
        return finalizeResolvedItem({
          productId: matchedProduct.id,
          name: matchedProduct.name,
          unit,
          quantity,
          quantityText: count ? `${count} uni` : parsedLine.quantityText,
          unitMode: true,
          variant: getUiVariantLabel(
            matchedProduct,
            normalizeCitrusUnit(matchedProduct.id, coerceSpecialVariant(matchedProduct, variant, unit))
          ),
          comment: effectiveComment,
          importOrder: parsedLine.importOrder,
        });
      }

      const resolvedVariant = normalizeCitrusUnit(
        matchedProduct.id,
        coerceSpecialVariant(matchedProduct, variant, unit)
      );
      const normalizedVariant = normalizeVariantForSheetMatch(resolvedVariant);
      const resolved = applyBusinessUnitAndQuantityRules({
        productId: matchedProduct.id,
        product: matchedProduct,
        unit,
        quantity,
        parsedLine,
        unitExplicit,
      });

      return finalizeResolvedItem({
        productId: matchedProduct.id,
        name: matchedProduct.name,
        unit: resolved.unit,
        quantity: resolved.quantity,
        unitMode: false,
        variant: normalizedVariant ? resolvedVariant : getUiVariantLabel(matchedProduct, resolvedVariant),
        comment: effectiveComment,
        importOrder: parsedLine.importOrder,
      });
    }
  }

  return null;
};

const initApp = async () => {
  try {
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
    await syncAliasesToServer();
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
  sheetColumnResolver = buildSheetColumnResolverFromHeaders(sheetHeaders, productsById);

  const productState = new Map();
  const cardByProductId = new Map();

  favoritesStore = createFavoritesStore({ clientSelect, getProductsById: () => productsById });
  favoritesStore.loadFromSheet(values);
  getFavoritePresets = (productId, clientId = null) => {
    try {
      return favoritesStore.getFavoritePresets(productId, clientId);
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
    getUnitsForProductId: (productId, fallbackUnit = "") => {
      const product = productsById.get(String(productId || "").trim());
      const units = Array.isArray(product?.units) ? product.units.filter(Boolean) : [];
      if (units.length) {
        return units;
      }
      const fallback = String(fallbackUnit || "").trim();
      return fallback ? [fallback] : ["Unidad"];
    },
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
    pedidoTitle,
    toggleGridViewButton,
    orderSelect,
    orderDirection,
    uncategorizedContent,
    getProducts: () => products,
    productState,
    cardByProductId,
    buildProductCard: productCardBuilder.buildProductCard,
    createRowId,
    updateItemState,
    isUnitModeForced: (productId) => shouldForceUnitMode(productId, unitModeProducts),
    coerceUnitForProduct,
    coerceVariantForProduct,
    scheduleCoverageUpdate: layoutController.scheduleCoverageUpdate,
    scheduleMasonryUpdate: layoutController.scheduleMasonryUpdate,
    updateFavoriteIndicators,
    getFavoriteMeta: (productId) => favoritesStore.getFavoriteMeta(productId),
    getFavoritePresets: (productId, clientId = null) => getFavoritePresets(productId, clientId),
    unitModeProducts,
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

  const responsiblesController = createResponsiblesController({
    responsibleSelect,
    newResponsibleButton,
    editResponsibleButton,
    assignResponsibleButton,
    removeResponsibleButton,
    assignmentStatus: responsibleAssignmentStatus,
    clientSelect,
    ordersApi,
  });

  const controlOrdersTabController = createControlOrdersTab({
    ordersApi,
    tabCreateButton: tabCreateOrdersButton,
    tabControlButton: tabControlOrdersButton,
    tabRepartoButton: tabRepartoOrdersButton,
    createPane: createOrdersPane,
    controlPane: controlOrdersPane,
    repartoPane,
    clientControlsBlock,
    pdfActionsBlock,
    createSummaryPane,
    onTabChanged: (tabName) => {
      if (tabName !== "create") {
        return;
      }
      requestAnimationFrame(() => {
        layoutController.scheduleCoverageUpdate();
        layoutController.scheduleMasonryUpdate();
        requestAnimationFrame(() => {
          layoutController.scheduleCoverageUpdate();
          layoutController.scheduleMasonryUpdate();
        });
      });
    },
    resolveUnitsForControlItem: ({ productName, variant, unit } = {}) => {
      const parsed = normalizeProductFromHeader(String(productName || ""), {
        defaultUnitIfMissing: false,
      });
      const directKey = String(parsed?.key || "").trim();
      const product = directKey ? productsById.get(directKey) : null;
      const units = Array.isArray(product?.units) ? product.units.filter(Boolean) : [];
      if (units.length) {
        return units;
      }
      const fallback = String(unit || "").trim();
      return fallback ? [fallback] : ["Unidad"];
    },
    listControlProductNames: () =>
      Array.from(productsById.values())
        .map((item) => String(item?.name || "").trim())
        .filter(Boolean),
    onlyCurrentModal: controlOnlyCurrentModal,
    onlyCurrentMessage: controlOnlyCurrentMessage,
    onlyCurrentConfirmButton: controlOnlyCurrentConfirm,
    onlyCurrentCancelButton: controlOnlyCurrentCancel,
    dateSelect: controlOrdersDateSelect,
    onlyCurrentButton: controlOrdersOnlyCurrentButton,
    refreshButton: refreshControlOrdersButton,
    tableBody: controlOrdersBody,
    statusNode: controlOrdersStatus,
    commentsReportButton: controlCommentsReportButton,
    commentsReportStatus: controlCommentsReportStatus,
    unitsReportButton: controlUnitsReportButton,
    unitsReportStatus: controlUnitsReportStatus,
    commentsReportWrap: controlCommentsReportWrap,
    unitsReportWrap: controlUnitsReportWrap,
    responsibleSelect,
    repartoProductsBody,
    repartoProductsStatus,
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

  updateTareasPdfButton?.addEventListener("click", async () => {
    if (!updateTareasPdfButton || updateTareasPdfButton.disabled) {
      return;
    }
    updateTareasPdfButton.disabled = true;
    setButtonStatusMessage(updateTareasPdfStatus, "Generando tareas.pdf...");
    try {
      const response = await fetch("/api/tareas/pdf?saveInProject=1");
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Error al generar tareas.pdf");
      }
      const data = await response.json();
      const savedPath = String(data?.savedAt?.filePath || "");
      setButtonStatusMessage(
        updateTareasPdfStatus,
        savedPath
          ? `tareas.pdf guardado en: ${savedPath}`
          : "tareas.pdf actualizado.",
        "success"
      );
    } catch (error) {
      console.error(error);
      setButtonStatusMessage(updateTareasPdfStatus, "No se pudo generar tareas.pdf.", "error");
    } finally {
      updateTareasPdfButton.disabled = false;
    }
  });

  updateImprimirPedidosButton?.addEventListener("click", async () => {
    if (!updateImprimirPedidosButton || updateImprimirPedidosButton.disabled) {
      return;
    }
    updateImprimirPedidosButton.disabled = true;
    setButtonStatusMessage(updateImprimirPedidosStatus, "Generando imprimir pedidos...");
    try {
      const response = await fetch("/api/imprimir-pedidos/pdf?saveInProject=1");
      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || "Error al generar imprimir pedidos");
      }
      const data = await response.json();
      const savedPath = String(data?.savedAt?.filePath || "");
      setButtonStatusMessage(
        updateImprimirPedidosStatus,
        savedPath
          ? `imprimir pedidos guardado en: ${savedPath}`
          : "imprimir pedidos actualizado.",
        "success"
      );
    } catch (error) {
      console.error(error);
      setButtonStatusMessage(
        updateImprimirPedidosStatus,
        "No se pudo generar imprimir pedidos.",
        "error"
      );
    } finally {
      updateImprimirPedidosButton.disabled = false;
    }
  });

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
    try {
      catalogController.renderProductGrid();
      catalogController.filterCards();
    } catch (error) {
      console.warn("catalog refresh on client change failed:", error);
    }
    responsiblesController.refreshForClient(String(clientSelect?.value || "")).catch((error) => {
      console.warn("responsiblesController refreshForClient failed:", error);
    });
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
    importBoxController.processPasteText?.();
    refreshImportUiForClient();
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
    try {
      await responsiblesController.init();
    } catch (err) {
      console.warn("responsiblesController init failed:", err);
    }
    try {
      controlOrdersTabController.init();
    } catch (err) {
      console.warn("controlOrdersTabController init failed:", err);
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
  } catch (error) {
    console.error("initApp failed:", error);
    hideLoadingCurtain();
  }
};

initApp();
