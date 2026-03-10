const buildClientLabel = (row) => {
  const clientId = String(row?.clientId || "").trim();
  const clientName = String(row?.clientName || "").trim();
  if (clientId && clientName) {
    return `${clientId}) ${clientName}`;
  }
  return clientName || clientId || "Cliente s/n";
};

const formatItemLine = (item) => {
  const name = String(item?.productName || "").trim() || "Producto";
  const variant = String(item?.variant || "").trim();
  const qtyText = String(item?.quantityText || "").trim();
  const qtyNumber = Number(item?.quantity);
  const qty =
    qtyText ||
    (Number.isFinite(qtyNumber)
      ? (Number.isInteger(qtyNumber)
          ? String(qtyNumber)
          : String(Math.round(qtyNumber * 1000) / 1000).replace(".", ","))
      : "");
  const unit = String(item?.unit || "").trim();
  const notes = String(item?.notes || "").trim();

  const parts = [name];
  if (variant && variant !== "Común") {
    parts.push(variant);
  }
  if (qty) {
    parts.push(`${qty}${unit ? ` ${unit}` : ""}`);
  }
  if (notes) {
    parts.push(`.${notes}`);
  }
  return parts.join(" - ").trim();
};

const createPencilIconNode = () => {
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "14");
  svg.setAttribute("height", "14");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("icon-pencil");

  const shaft = document.createElementNS(svgNS, "path");
  shaft.setAttribute("d", "M6 7 L9 4 L19 14 L16 17 Z");
  shaft.setAttribute("fill", "none");
  shaft.setAttribute("stroke", "currentColor");
  shaft.setAttribute("stroke-width", "1.8");
  shaft.setAttribute("stroke-linejoin", "round");

  const tip = document.createElementNS(svgNS, "path");
  tip.setAttribute("d", "M16 17 L19 14 L21 19 Z");
  tip.setAttribute("fill", "none");
  tip.setAttribute("stroke", "currentColor");
  tip.setAttribute("stroke-width", "1.8");
  tip.setAttribute("stroke-linejoin", "round");

  const eraser = document.createElementNS(svgNS, "path");
  eraser.setAttribute("d", "M4.6 8.3 L7.4 5.5");
  eraser.setAttribute("fill", "none");
  eraser.setAttribute("stroke", "currentColor");
  eraser.setAttribute("stroke-width", "1.8");
  eraser.setAttribute("stroke-linecap", "round");

  const center = document.createElementNS(svgNS, "path");
  center.setAttribute("d", "M10 6 L17 13");
  center.setAttribute("fill", "none");
  center.setAttribute("stroke", "currentColor");
  center.setAttribute("stroke-width", "1.6");
  center.setAttribute("stroke-linecap", "round");

  svg.appendChild(shaft);
  svg.appendChild(tip);
  svg.appendChild(eraser);
  svg.appendChild(center);
  return svg;
};

const createTrashIconNode = () => {
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "14");
  svg.setAttribute("height", "14");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("icon-trash");

  const lid = document.createElementNS(svgNS, "path");
  lid.setAttribute("d", "M4 7 H20");
  lid.setAttribute("fill", "none");
  lid.setAttribute("stroke", "currentColor");
  lid.setAttribute("stroke-width", "1.8");
  lid.setAttribute("stroke-linecap", "round");

  const cap = document.createElementNS(svgNS, "path");
  cap.setAttribute("d", "M9 7 L9.7 5.6 C9.9 5.2 10.2 5 10.6 5 H13.4 C13.8 5 14.1 5.2 14.3 5.6 L15 7");
  cap.setAttribute("fill", "none");
  cap.setAttribute("stroke", "currentColor");
  cap.setAttribute("stroke-width", "1.8");
  cap.setAttribute("stroke-linecap", "round");
  cap.setAttribute("stroke-linejoin", "round");

  const bin = document.createElementNS(svgNS, "path");
  bin.setAttribute("d", "M7 7 L8 19 H16 L17 7");
  bin.setAttribute("fill", "none");
  bin.setAttribute("stroke", "currentColor");
  bin.setAttribute("stroke-width", "1.8");
  bin.setAttribute("stroke-linejoin", "round");

  const line1 = document.createElementNS(svgNS, "path");
  line1.setAttribute("d", "M10 10 V16");
  line1.setAttribute("fill", "none");
  line1.setAttribute("stroke", "currentColor");
  line1.setAttribute("stroke-width", "1.6");
  line1.setAttribute("stroke-linecap", "round");

  const line2 = document.createElementNS(svgNS, "path");
  line2.setAttribute("d", "M14 10 V16");
  line2.setAttribute("fill", "none");
  line2.setAttribute("stroke", "currentColor");
  line2.setAttribute("stroke-width", "1.6");
  line2.setAttribute("stroke-linecap", "round");

  svg.appendChild(lid);
  svg.appendChild(cap);
  svg.appendChild(bin);
  svg.appendChild(line1);
  svg.appendChild(line2);
  return svg;
};

export const createControlOrdersTab = ({
  ordersApi,
  tabCreateButton,
  tabControlButton,
  tabRepartoButton,
  createPane,
  controlPane,
  repartoPane,
  clientControlsBlock,
  pdfActionsBlock,
  createSummaryPane,
  onTabChanged,
  resolveUnitsForControlItem,
  listControlProductNames,
  onlyCurrentModal,
  onlyCurrentMessage,
  onlyCurrentConfirmButton,
  onlyCurrentCancelButton,
  dateSelect,
  onlyCurrentButton,
  refreshButton,
  tableBody,
  statusNode,
  responsibleSelect,
  repartoProductsBody,
  repartoProductsStatus,
}) => {
  const state = {
    activeTab: "create",
    loading: false,
    rows: [],
    openDetailKey: "",
    sortKey: "",
    sortDirection: "desc",
    responsibles: [],
    selectedDateKey: "",
    availableDateKeys: [],
    divCompProductMap: new Map(),
    divCompProductEntries: [],
  };

  const toIsoDateKey = (value) => {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    const year = String(date.getFullYear());
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const formatDateLabel = (value) => {
    const key = String(value || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) {
      return key;
    }
    const [year, month, day] = key.split("-");
    return `${day}/${month}/${year}`;
  };

  const getTodayDateKey = () => toIsoDateKey(new Date());

  const isValidDateKey = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim());

  const currentDateLabel = () => formatDateLabel(state.selectedDateKey || getTodayDateKey());

  const getUnitsForControlItem = ({ productName, variant, unit } = {}) => {
    const fromResolver =
      typeof resolveUnitsForControlItem === "function"
        ? resolveUnitsForControlItem({ productName, variant, unit })
        : [];
    const merged = Array.from(
      new Set([
        ...(Array.isArray(fromResolver) ? fromResolver : []),
        String(unit || "").trim(),
      ])
    ).filter(Boolean);
    return merged.length ? merged : ["Unidad"];
  };

  const getControlProductNames = () => {
    const names =
      typeof listControlProductNames === "function" ? listControlProductNames() : [];

    const fromCatalog = Array.isArray(names)
      ? names.map((item) => String(item || "").trim()).filter(Boolean)
      : [];

    const fromOrders = [];
    (Array.isArray(state.rows) ? state.rows : []).forEach((orderRow) => {
      const items = Array.isArray(orderRow?.items) ? orderRow.items : [];
      items.forEach((item) => {
        const productName = String(item?.productName || "").trim();
        if (productName) {
          fromOrders.push(productName);
        }
      });
    });

    return Array.from(new Set([...fromCatalog, ...fromOrders]));
  };

  const confirmOnlyCurrentAction = () => {
    const fallbackMessage =
      "Se marcará en hoja Todos: true para clientes con pedido de hoy y false para el resto. ¿Continuar?";
    if (
      !onlyCurrentModal ||
      !onlyCurrentConfirmButton ||
      !onlyCurrentCancelButton ||
      !(onlyCurrentModal instanceof HTMLElement)
    ) {
      return Promise.resolve(window.confirm(fallbackMessage));
    }

    if (onlyCurrentMessage) {
      onlyCurrentMessage.textContent =
        "Se marcará en hoja Todos: true para clientes con pedido de hoy y false para el resto.";
    }

    return new Promise((resolve) => {
      let settled = false;
      const finish = (accepted) => {
        if (settled) {
          return;
        }
        settled = true;
        onlyCurrentModal.classList.add("hidden");
        onlyCurrentConfirmButton.removeEventListener("click", onConfirm);
        onlyCurrentCancelButton.removeEventListener("click", onCancel);
        onlyCurrentModal.removeEventListener("click", onBackdrop);
        document.removeEventListener("keydown", onKeydown);
        resolve(Boolean(accepted));
      };

      const onConfirm = () => finish(true);
      const onCancel = () => finish(false);
      const onBackdrop = (event) => {
        if (event.target === onlyCurrentModal) {
          finish(false);
        }
      };
      const onKeydown = (event) => {
        if (event.key === "Escape") {
          finish(false);
        }
      };

      onlyCurrentConfirmButton.addEventListener("click", onConfirm);
      onlyCurrentCancelButton.addEventListener("click", onCancel);
      onlyCurrentModal.addEventListener("click", onBackdrop);
      document.addEventListener("keydown", onKeydown);
      onlyCurrentModal.classList.remove("hidden");
    });
  };

  const closeAllDetailPanels = () => {
    if (!tableBody) {
      return;
    }
    const wrappers = tableBody.querySelectorAll(".control-orders__detail");
    wrappers.forEach((wrapper) => {
      const panel = wrapper.querySelector(".control-orders__detail-panel");
      const toggle = wrapper.querySelector(".control-orders__toggle");
      if (panel) {
        panel.classList.add("hidden");
      }
      if (toggle) {
        toggle.textContent = "Expandir";
      }
    });
    state.openDetailKey = "";
  };

  const setStatus = (message, variant = "") => {
    if (!statusNode) {
      return;
    }
    statusNode.textContent = String(message || "");
    statusNode.classList.remove("save-status--success", "save-status--error");
    if (variant === "success") {
      statusNode.classList.add("save-status--success");
    }
    if (variant === "error") {
      statusNode.classList.add("save-status--error");
    }
  };

  const setRepartoStatus = (message, variant = "") => {
    if (!repartoProductsStatus) {
      return;
    }
    repartoProductsStatus.textContent = String(message || "");
    repartoProductsStatus.classList.remove("save-status--success", "save-status--error");
    if (variant === "success") {
      repartoProductsStatus.classList.add("save-status--success");
    }
    if (variant === "error") {
      repartoProductsStatus.classList.add("save-status--error");
    }
  };

  const normalizeText = (value) => String(value ?? "").trim().toLowerCase();

  const normalizeProductKey = (value) =>
    String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ");

  const normalizeLooseProductKey = (value) =>
    normalizeProductKey(value)
      .replace(/\b(jaula|docena|kg|kilo|kilos|cajon|caja|bandeja|bolsa|unidad|unid|hidroponica|grande|premium|p\/?\s*salsa|por\s+kg|por\s+kilo|por\s+kilos)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const tokenizeProduct = (value) =>
    normalizeLooseProductKey(value)
      .split(/[^a-z0-9]+/)
      .map((token) => token.trim())
      .filter(Boolean)
      .map((token) => {
        if (token.endsWith("es") && token.length > 4) {
          return token.slice(0, -2);
        }
        if (token.endsWith("s") && token.length > 3) {
          return token.slice(0, -1);
        }
        return token;
      })
      .filter((token) => !["de", "con", "sin", "por", "para", "p"].includes(token));

  const toDisplayClientId = (value) => {
    const text = String(value || "").trim();
    if (!text) {
      return "";
    }
    const numeric = Number(text);
    return Number.isFinite(numeric) ? String(numeric) : text;
  };

  const parseItemQty = (item) => {
    const numeric = Number(item?.quantity);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric;
    }
    const text = String(item?.quantityText || "").trim().replace(",", ".");
    if (!text) {
      return 0;
    }
    const fraction = text.match(/^(\d+)\s*\/\s*(\d+)$/);
    if (fraction) {
      const num = Number(fraction[1]);
      const den = Number(fraction[2]);
      if (Number.isFinite(num) && Number.isFinite(den) && den > 0) {
        return num / den;
      }
    }
    const parsed = Number(text);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  };

  const formatQtyValue = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) {
      return "0";
    }
    const rounded = Math.round(n * 1000) / 1000;
    return (Number.isInteger(rounded) ? String(rounded) : String(rounded)).replace(".", ",");
  };

  const findDivCompMappingForLabel = (label, preferredResponsibleName = "") => {
    const normalizedLabel = normalizeProductKey(label);
    const direct = state.divCompProductMap.get(normalizedLabel) || null;
    if (direct) {
      return direct;
    }

    const looseLabel = normalizeLooseProductKey(label);
    if (!looseLabel) {
      return null;
    }

    const candidates = state.divCompProductEntries.filter((entry) => {
      const loose = String(entry?.looseProduct || "").trim();
      if (!loose) {
        return false;
      }
      return loose === looseLabel || loose.startsWith(looseLabel) || looseLabel.startsWith(loose);
    });

    if (candidates.length === 1) {
      return candidates[0];
    }

    const byContains = candidates.filter((entry) => {
      const loose = String(entry?.looseProduct || "").trim();
      return loose.includes(looseLabel) || looseLabel.includes(loose);
    });

    if (byContains.length === 1) {
      return byContains[0];
    }

    const preferred = String(preferredResponsibleName || "").trim();
    if (preferred && candidates.length > 1) {
      const byResponsible = candidates.filter(
        (entry) => String(entry?.responsibleName || "").trim() === preferred
      );
      if (byResponsible.length === 1) {
        return byResponsible[0];
      }
    }

    const labelTokens = tokenizeProduct(label);
    if (!labelTokens.length) {
      return null;
    }

    let best = null;
    let bestScore = -1;
    let secondScore = -1;
    state.divCompProductEntries.forEach((entry) => {
      const entryTokens = Array.isArray(entry?.tokens) ? entry.tokens : tokenizeProduct(entry?.productName);
      if (!entryTokens.length) {
        return;
      }
      const intersection = labelTokens.filter((token) => entryTokens.includes(token)).length;
      const union = new Set([...labelTokens, ...entryTokens]).size;
      const score = union > 0 ? intersection / union : 0;
      if (score > bestScore) {
        secondScore = bestScore;
        bestScore = score;
        best = entry;
      } else if (score > secondScore) {
        secondScore = score;
      }
    });

    if (best && bestScore >= 0.66 && bestScore > secondScore) {
      if (!preferred) {
        return best;
      }
      if (String(best?.responsibleName || "").trim() === preferred) {
        return best;
      }
    }

    return null;
  };

  const buildItemProductLabel = (item) => {
    const productName = String(item?.productName || "").trim();
    const variant = String(item?.variant || "").trim();
    if (!productName) {
      return "Producto";
    }
    if (variant && variant.toLowerCase() !== "común") {
      return `${productName} ${variant}`.trim();
    }
    return productName;
  };

  const updateSortHeaderVisuals = () => {
    const table = tableBody?.closest("table");
    if (!table) {
      return;
    }
    const headers = table.querySelectorAll("thead th[data-sort-key]");
    headers.forEach((header) => {
      const key = String(header.getAttribute("data-sort-key") || "");
      const baseLabel = String(header.getAttribute("data-label") || header.textContent || "").trim();
      if (!header.getAttribute("data-label")) {
        header.setAttribute("data-label", baseLabel);
      }
      if (key && key === state.sortKey) {
        const arrow = state.sortDirection === "asc" ? " ↑" : " ↓";
        header.textContent = `${baseLabel}${arrow}`;
        return;
      }
      header.textContent = baseLabel;
    });
  };

  const compareRows = (left, right) => {
    const key = state.sortKey;
    if (!key) {
      return 0;
    }

    const direction = state.sortDirection === "asc" ? 1 : -1;

    if (key === "approved") {
      return (Number(Boolean(left?.approved)) - Number(Boolean(right?.approved))) * direction;
    }
    if (key === "items") {
      return ((Number(left?.itemsCount) || 0) - (Number(right?.itemsCount) || 0)) * direction;
    }
    if (key === "flete") {
      const l = normalizeText(left?.flete || "Flete 1");
      const r = normalizeText(right?.flete || "Flete 1");
      return l.localeCompare(r, "es") * direction;
    }
    if (key === "status") {
      const l = normalizeText(left?.mapped ? "mapeado" : "sin columna mapeada");
      const r = normalizeText(right?.mapped ? "mapeado" : "sin columna mapeada");
      return l.localeCompare(r, "es") * direction;
    }
    if (key === "detail") {
      const l = Array.isArray(left?.items) ? left.items.length : 0;
      const r = Array.isArray(right?.items) ? right.items.length : 0;
      return (l - r) * direction;
    }

    const l = normalizeText(buildClientLabel(left));
    const r = normalizeText(buildClientLabel(right));
    return l.localeCompare(r, "es") * direction;
  };

  const sortedRows = () => {
    const rows = Array.isArray(state.rows) ? [...state.rows] : [];
    if (!state.sortKey) {
      return rows;
    }
    return rows.sort(compareRows);
  };

  const setActiveTab = (tabName) => {
    const next = tabName === "control" || tabName === "reparto" ? tabName : "create";
    state.activeTab = next;

    const isCreate = next === "create";
    const isControl = next === "control";
    const isReparto = next === "reparto";

    createPane?.classList.toggle("hidden", !isCreate);
    controlPane?.classList.toggle("hidden", !isControl);
    repartoPane?.classList.toggle("hidden", !isReparto);

    clientControlsBlock?.classList.toggle("hidden", isControl);
    pdfActionsBlock?.classList.toggle("hidden", !isControl);
    createSummaryPane?.classList.toggle("hidden", !isCreate);

    tabCreateButton?.classList.toggle("tab-button--active", isCreate);
    tabControlButton?.classList.toggle("tab-button--active", isControl);
    tabRepartoButton?.classList.toggle("tab-button--active", isReparto);

    tabCreateButton?.setAttribute("aria-selected", String(isCreate));
    tabControlButton?.setAttribute("aria-selected", String(isControl));
    tabRepartoButton?.setAttribute("aria-selected", String(isReparto));

    if (isControl || isReparto) {
      refresh();
    } else {
      closeAllDetailPanels();
    }

    if (typeof onTabChanged === "function") {
      onTabChanged(next);
    }

    if (isReparto) {
      renderRepartoRows();
    }
  };

  const updateRowsForClient = ({ clientId, approved, flete, dispatchRaw }) => {
    const cid = String(clientId || "").trim();
    if (!cid) {
      return;
    }
    state.rows = state.rows.map((row) => {
      if (String(row?.clientId || "").trim() !== cid) {
        return row;
      }
      return {
        ...row,
        approved: Boolean(approved),
        flete: String(flete || "Flete 1"),
        dispatchRaw: String(dispatchRaw || ""),
      };
    });
  };

  const loadResponsibles = async () => {
    if (!ordersApi || typeof ordersApi.listDbResponsibles !== "function") {
      return;
    }
    try {
      const response = await ordersApi.listDbResponsibles({ includeInactive: false });
      state.responsibles = Array.isArray(response?.data) ? response.data : [];
    } catch {
      state.responsibles = [];
    }
  };

  const loadDivCompProductMap = async () => {
    if (!ordersApi || typeof ordersApi.listRepartoProductResponsibles !== "function") {
      state.divCompProductMap = new Map();
      return;
    }
    try {
      const response = await ordersApi.listRepartoProductResponsibles();
      const rows = Array.isArray(response?.data) ? response.data : [];
      const map = new Map();
      rows.forEach((row) => {
        const productName = String(row?.productName || "").trim();
        if (!productName) {
          return;
        }
        const record = {
          productName,
          responsibleName: String(row?.responsibleName || "").trim(),
          rowNumber: Number(row?.rowNumber) || null,
          looseProduct: normalizeLooseProductKey(productName),
          tokens: tokenizeProduct(productName),
        };
        map.set(normalizeProductKey(productName), record);
      });
      state.divCompProductMap = map;
      state.divCompProductEntries = Array.from(map.values());
    } catch {
      state.divCompProductMap = new Map();
      state.divCompProductEntries = [];
    }
  };

  const renderDateOptions = () => {
    if (!dateSelect) {
      return;
    }

    const todayKey = getTodayDateKey();
    const uniqueDates = Array.from(
      new Set(
        [todayKey, ...(Array.isArray(state.availableDateKeys) ? state.availableDateKeys : [])]
          .map((item) => String(item || "").trim())
          .filter((item) => isValidDateKey(item))
      )
    ).sort((a, b) => b.localeCompare(a));

    dateSelect.innerHTML = "";
    uniqueDates.forEach((dateKey) => {
      const option = document.createElement("option");
      option.value = dateKey;
      option.textContent = dateKey === todayKey ? `Hoy (${formatDateLabel(dateKey)})` : formatDateLabel(dateKey);
      dateSelect.appendChild(option);
    });

    if (!isValidDateKey(state.selectedDateKey)) {
      state.selectedDateKey = todayKey;
    }
    if (!uniqueDates.includes(state.selectedDateKey)) {
      state.selectedDateKey = uniqueDates[0] || todayKey;
    }
    dateSelect.value = state.selectedDateKey;
  };

  const loadAvailableDates = async () => {
    const todayKey = getTodayDateKey();
    if (!ordersApi || typeof ordersApi.listControlOrderDates !== "function") {
      state.availableDateKeys = [todayKey];
      state.selectedDateKey = todayKey;
      renderDateOptions();
      return;
    }
    try {
      const result = await ordersApi.listControlOrderDates({ limit: 90 });
      const dates = Array.isArray(result?.data) ? result.data : [];
      state.availableDateKeys = dates.filter((item) => isValidDateKey(item));
    } catch {
      state.availableDateKeys = [todayKey];
    }
    state.selectedDateKey = state.selectedDateKey || todayKey;
    renderDateOptions();
  };

  const buildRepartoProductRows = () => {
    const selectedResponsibleId = String(responsibleSelect?.value || "").trim();
    if (!selectedResponsibleId) {
      return [];
    }

    const selectedResponsible = state.responsibles.find(
      (item) => String(item?.id || "") === selectedResponsibleId
    );
    const selectedResponsibleName = String(selectedResponsible?.name || "").trim();
    if (!selectedResponsibleName) {
      return [];
    }

    const grouped = new Map();
    (Array.isArray(state.rows) ? state.rows : []).forEach((row) => {
      const externalClientId = String(row?.clientId || "").trim();
      const clientLabel = toDisplayClientId(externalClientId);

      const items = Array.isArray(row?.items) ? row.items : [];
      const orderedItems = [...items].sort(
        (a, b) => Number(a?.position || 0) - Number(b?.position || 0)
      );
      orderedItems.forEach((item) => {
        const label = buildItemProductLabel(item);
        const mapping =
          findDivCompMappingForLabel(label, selectedResponsibleName) ||
          findDivCompMappingForLabel(String(item?.productName || ""), selectedResponsibleName);
        const responsibleName = String(mapping?.responsibleName || "").trim();
        if (responsibleName !== selectedResponsibleName) {
          return;
        }

        if (!grouped.has(label)) {
          grouped.set(label, {
            productLabel: label,
            mappingProductName: String(mapping?.productName || label),
            responsibleName,
            byClient: new Map(),
            total: 0,
          });
        }

        const target = grouped.get(label);
        const qty = parseItemQty(item);
        target.total += qty;
        const prev = Number(target.byClient.get(clientLabel) || 0);
        target.byClient.set(clientLabel, prev + qty);
      });
    });

    const output = Array.from(grouped.values()).map((row) => {
      const clientParts = Array.from(row.byClient.entries())
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([clientId, qty]) => `${clientId}) ${formatQtyValue(qty)}`);
      return {
        key: normalizeProductKey(row.productLabel),
        productLabel: row.productLabel,
        mappingProductName: row.mappingProductName,
        detailText: `${clientParts.length ? ` / ${clientParts.join(" / ")} ` : ""}=`,
        totalText: formatQtyValue(row.total),
        responsibleName: row.responsibleName,
      };
    });

    return output.sort((a, b) => a.productLabel.localeCompare(b.productLabel, "es"));
  };

  const renderRepartoRows = () => {
    if (!repartoProductsBody) {
      return;
    }
    repartoProductsBody.innerHTML = "";

    const selectedResponsibleId = String(responsibleSelect?.value || "").trim();
    if (!selectedResponsibleId) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 4;
      td.textContent = "Seleccione un responsable para ver productos.";
      tr.appendChild(td);
      repartoProductsBody.appendChild(tr);
      setRepartoStatus("Seleccione un responsable para listar productos.");
      return;
    }

    const rows = buildRepartoProductRows();
    if (!rows.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 4;
      td.textContent = "No hay productos para este responsable hoy.";
      tr.appendChild(td);
      repartoProductsBody.appendChild(tr);
      setRepartoStatus("Sin productos para el responsable seleccionado.", "success");
      return;
    }

    rows.forEach((row) => {
      const tr = document.createElement("tr");

      const tdProduct = document.createElement("td");
      tdProduct.textContent = row.productLabel;

      const tdDetail = document.createElement("td");
      tdDetail.textContent = row.detailText;

      const tdResponsible = document.createElement("td");
      const responsibleSelectNode = document.createElement("select");
      responsibleSelectNode.className = "reparto-products__responsible-select";

      state.responsibles.forEach((item) => {
        const option = document.createElement("option");
        option.value = String(item?.id || "");
        option.textContent = String(item?.name || "Responsable");
        if (String(item?.name || "").trim() === String(row.responsibleName || "").trim()) {
          option.selected = true;
        }
        responsibleSelectNode.appendChild(option);
      });
      tdResponsible.appendChild(responsibleSelectNode);

      const tdTotal = document.createElement("td");
      tdTotal.textContent = row.totalText;

      responsibleSelectNode.addEventListener("change", async () => {
        const nextResponsibleId = String(responsibleSelectNode.value || "").trim();
        const nextResponsible = state.responsibles.find(
          (item) => String(item?.id || "") === nextResponsibleId
        );
        const nextResponsibleName = String(nextResponsible?.name || "").trim();
        const previousResponsibleName = String(row.responsibleName || "").trim();
        if (!nextResponsibleName || nextResponsibleName === previousResponsibleName) {
          return;
        }
        if (!ordersApi || typeof ordersApi.updateRepartoProductResponsible !== "function") {
          setRepartoStatus("API de responsables no disponible.", "error");
          return;
        }

        responsibleSelectNode.disabled = true;
        setRepartoStatus("Guardando responsable...", "");

        try {
          await ordersApi.updateRepartoProductResponsible({
            productName: row.mappingProductName,
            responsibleName: nextResponsibleName,
          });
          const updatedRecord = {
            productName: row.mappingProductName,
            responsibleName: nextResponsibleName,
            rowNumber: null,
            looseProduct: normalizeLooseProductKey(row.mappingProductName),
            tokens: tokenizeProduct(row.mappingProductName),
          };
          state.divCompProductMap.set(normalizeProductKey(row.mappingProductName), updatedRecord);
          state.divCompProductEntries = Array.from(state.divCompProductMap.values());

          setRepartoStatus("Responsable actualizado.", "success");
          renderRepartoRows();
        } catch (error) {
          const previousResponsible = state.responsibles.find(
            (item) => String(item?.name || "").trim() === previousResponsibleName
          );
          responsibleSelectNode.value = String(previousResponsible?.id || "");
          const detail = String(error?.message || "No se pudo actualizar responsable.").trim();
          setRepartoStatus(detail || "No se pudo actualizar responsable.", "error");
        } finally {
          responsibleSelectNode.disabled = false;
        }
      });

      tr.appendChild(tdProduct);
      tr.appendChild(tdDetail);
      tr.appendChild(tdResponsible);
      tr.appendChild(tdTotal);
      repartoProductsBody.appendChild(tr);
    });

    setRepartoStatus(`Productos listados: ${rows.length}.`, "success");
  };

  const persistRow = async ({
    row,
    approved,
    flete,
    rowStatusNode,
    checkboxNode,
    disableNodes = [],
    onSuccess,
    onError,
  }) => {
    if (!ordersApi || typeof ordersApi.updateTodayControlOrder !== "function") {
      return;
    }

    const previousApproved = Boolean(row?.approved);
    const previousFlete = String(row?.flete || "Flete 1");

    if (checkboxNode) {
      checkboxNode.disabled = true;
    }
    disableNodes.forEach((node) => {
      if (node) {
        node.disabled = true;
      }
    });
    if (rowStatusNode) {
      rowStatusNode.textContent = "Guardando...";
      rowStatusNode.classList.remove("save-status--success", "save-status--error");
    }

    try {
      const response = await ordersApi.updateTodayControlOrder({
        clientId: row?.clientId,
        approved,
        flete,
      });
      const payload = response?.data || {};
      updateRowsForClient({
        clientId: payload.clientId || row?.clientId,
        approved: payload.approved,
        flete: payload.flete,
        dispatchRaw: payload.dispatchRaw,
      });
      if (typeof onSuccess === "function") {
        onSuccess({
          approved: Boolean(payload?.approved),
          flete: String(payload?.flete || "Flete 1"),
        });
      }
      if (rowStatusNode) {
        rowStatusNode.textContent = "Guardado";
        rowStatusNode.classList.remove("save-status--error");
        rowStatusNode.classList.add("save-status--success");
      }
    } catch (error) {
      updateRowsForClient({
        clientId: row?.clientId,
        approved: previousApproved,
        flete: previousFlete,
        dispatchRaw: row?.dispatchRaw,
      });
      if (checkboxNode) {
        checkboxNode.checked = previousApproved;
      }
      if (typeof onError === "function") {
        onError({ approved: previousApproved, flete: previousFlete });
      }
      if (rowStatusNode) {
        rowStatusNode.textContent = String(error?.message || "No se pudo guardar.");
        rowStatusNode.classList.remove("save-status--success");
        rowStatusNode.classList.add("save-status--error");
      }
    } finally {
      if (checkboxNode) {
        checkboxNode.disabled = false;
      }
      disableNodes.forEach((node) => {
        if (node) {
          node.disabled = false;
        }
      });
    }
  };

  const renderRows = () => {
    if (!tableBody) {
      return;
    }

    tableBody.innerHTML = "";

    if (!state.rows.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 6;
      td.textContent = `No hay pedidos para ${currentDateLabel()}.`;
      tr.appendChild(td);
      tableBody.appendChild(tr);
      return;
    }

    sortedRows().forEach((row) => {
      const tr = document.createElement("tr");
      tr.className = "control-orders__row";

      const rowKey = String(row?.orderId || "") || `${String(row?.clientId || "")}-row`;

      const tdApproved = document.createElement("td");
      tdApproved.className = "control-orders__col-approved";
      const approved = document.createElement("input");
      approved.type = "checkbox";
      approved.checked = Boolean(row?.approved);
      approved.disabled = !row?.mapped;
      tdApproved.appendChild(approved);

      const tdClient = document.createElement("td");
      tdClient.className = "control-orders__col-client";
      tdClient.textContent = buildClientLabel(row);

      const tdItems = document.createElement("td");
      tdItems.className = "control-orders__col-items";
      const itemsCount = Number(row?.itemsCount) || 0;
      tdItems.textContent = String(itemsCount);

      const tdFlete = document.createElement("td");
      tdFlete.className = "control-orders__col-flete";
      const fleteWrap = document.createElement("div");
      fleteWrap.className = "control-orders__flete-options";

      const currentFlete = String(row?.flete || "Flete 1");
      const flete1Button = document.createElement("button");
      flete1Button.type = "button";
      flete1Button.className = "control-orders__flete-option";
      flete1Button.textContent = "1";
      flete1Button.disabled = !row?.mapped;
      flete1Button.setAttribute("aria-pressed", String(currentFlete === "Flete 1"));

      const flete2Button = document.createElement("button");
      flete2Button.type = "button";
      flete2Button.className = "control-orders__flete-option";
      flete2Button.textContent = "2";
      flete2Button.disabled = !row?.mapped;
      flete2Button.setAttribute("aria-pressed", String(currentFlete === "Flete 2"));

      const applyFleteCellColor = (value) => {
        tdFlete.classList.remove("control-orders__col-flete--1", "control-orders__col-flete--2");
        if (value === "Flete 2") {
          tdFlete.classList.add("control-orders__col-flete--2");
          return;
        }
        tdFlete.classList.add("control-orders__col-flete--1");
      };

      const setFleteButtonsVisual = (value) => {
        const isOne = value !== "Flete 2";
        flete1Button.setAttribute("aria-pressed", String(isOne));
        flete2Button.setAttribute("aria-pressed", String(!isOne));
        flete1Button.classList.toggle("is-active", isOne);
        flete2Button.classList.toggle("is-active", !isOne);
      };

      applyFleteCellColor(currentFlete);
      setFleteButtonsVisual(currentFlete);

      fleteWrap.appendChild(flete1Button);
      fleteWrap.appendChild(flete2Button);
      tdFlete.appendChild(fleteWrap);

      const tdStatus = document.createElement("td");
      tdStatus.className = "save-status control-orders__col-status";
      tdStatus.textContent = row?.mapped ? "" : "Sin columna mapeada";
      if (!row?.mapped) {
        tdStatus.classList.add("save-status--error");
      }

      const persistSelection = (selectedFlete) => {
        persistRow({
          row,
          approved: approved.checked,
          flete: selectedFlete,
          rowStatusNode: tdStatus,
          checkboxNode: approved,
          disableNodes: [flete1Button, flete2Button],
          onSuccess: ({ approved: nextApproved, flete: nextFlete }) => {
            approved.checked = Boolean(nextApproved);
            setFleteButtonsVisual(String(nextFlete || "Flete 1"));
            applyFleteCellColor(String(nextFlete || "Flete 1"));
          },
          onError: ({ approved: previousApproved, flete: previousFlete }) => {
            approved.checked = Boolean(previousApproved);
            const safePrevious = String(previousFlete || "Flete 1");
            setFleteButtonsVisual(safePrevious);
            applyFleteCellColor(safePrevious);
          },
        });
      };

      flete1Button.addEventListener("click", () => {
        if (flete1Button.disabled) {
          return;
        }
        setFleteButtonsVisual("Flete 1");
        applyFleteCellColor("Flete 1");
        persistSelection("Flete 1");
      });

      flete2Button.addEventListener("click", () => {
        if (flete2Button.disabled) {
          return;
        }
        setFleteButtonsVisual("Flete 2");
        applyFleteCellColor("Flete 2");
        persistSelection("Flete 2");
      });

      const tdDetail = document.createElement("td");
      tdDetail.className = "control-orders__col-detail";
      const items = Array.isArray(row?.items) ? row.items : [];
      const orderedItems = [...items].sort(
        (a, b) => Number(a?.position || 0) - Number(b?.position || 0)
      );
      const detailWrap = document.createElement("div");
      detailWrap.className = "control-orders__detail";

      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "button-secondary control-orders__toggle";
      toggle.textContent = "Expandir";

      const panel = document.createElement("div");
      panel.className = "control-orders__detail-panel hidden";

      const list = document.createElement("ol");
      list.className = "control-orders__items";

      if (!orderedItems.length) {
        const emptyLi = document.createElement("li");
        emptyLi.className = "control-orders__item-empty";
        emptyLi.textContent = "Sin productos cargados.";
        list.appendChild(emptyLi);
      }

      orderedItems.forEach((item) => {
        const li = document.createElement("li");
        li.className = "control-orders__item-row";

        const text = document.createElement("span");
        text.className = "control-orders__item-text";
        text.textContent = formatItemLine(item);

        const editButton = document.createElement("button");
        editButton.type = "button";
        editButton.className = "control-orders__item-action control-orders__item-action--edit";
        editButton.appendChild(createPencilIconNode());
        editButton.title = "Editar producto";
        editButton.setAttribute("aria-label", "Editar producto");

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "control-orders__item-action control-orders__item-action--delete";
        deleteButton.appendChild(createTrashIconNode());
        deleteButton.title = "Eliminar producto";
        deleteButton.setAttribute("aria-label", "Eliminar producto");

        const formLi = document.createElement("li");
        formLi.className = "control-orders__item-form-row hidden";

        const form = document.createElement("form");
        form.className = "control-orders__item-inline-form";

        const qtyInput = document.createElement("input");
        qtyInput.type = "text";
        qtyInput.className = "control-orders__item-inline-input";
        qtyInput.placeholder = "Cantidad";
        qtyInput.value = String(item?.quantityText || item?.quantity || "").trim();

        const unitInput = document.createElement("select");
        unitInput.className = "control-orders__item-inline-input";
        const unitOptions = getUnitsForControlItem({
          productName: item?.productName,
          variant: item?.variant,
          unit: item?.unit,
        });
        const showUnitSelect = unitOptions.length > 1;
        unitOptions.forEach((unitName) => {
          const option = document.createElement("option");
          option.value = unitName;
          option.textContent = unitName;
          if (String(item?.unit || "").trim() === unitName) {
            option.selected = true;
          }
          unitInput.appendChild(option);
        });

        const saveButton = document.createElement("button");
        saveButton.type = "submit";
        saveButton.className = "button-secondary control-orders__item-inline-btn";
        saveButton.textContent = "Guardar";

        const cancelButton = document.createElement("button");
        cancelButton.type = "button";
        cancelButton.className = "button-secondary control-orders__item-inline-btn";
        cancelButton.textContent = "Cancelar";

        const inlineStatus = document.createElement("span");
        inlineStatus.className = "save-status control-orders__item-inline-status";

        form.appendChild(qtyInput);
        if (showUnitSelect) {
          form.appendChild(unitInput);
        }
        form.appendChild(saveButton);
        form.appendChild(cancelButton);
        form.appendChild(inlineStatus);
        formLi.appendChild(form);

        editButton.addEventListener("click", () => {
          formLi.classList.toggle("hidden");
          if (!formLi.classList.contains("hidden")) {
            qtyInput.focus();
          }
        });

        cancelButton.addEventListener("click", () => {
          formLi.classList.add("hidden");
          inlineStatus.textContent = "";
          inlineStatus.classList.remove("save-status--success", "save-status--error");
        });

        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          if (!ordersApi || typeof ordersApi.updateControlOrderItem !== "function") {
            inlineStatus.textContent = "API no disponible.";
            inlineStatus.classList.add("save-status--error");
            return;
          }
          const orderId = Number(row?.orderId);
          const itemId = Number(item?.id);
          if (!Number.isFinite(orderId) || orderId <= 0 || !Number.isFinite(itemId) || itemId <= 0) {
            inlineStatus.textContent = "Ítem inválido.";
            inlineStatus.classList.add("save-status--error");
            return;
          }

          saveButton.disabled = true;
          cancelButton.disabled = true;
          inlineStatus.textContent = "Guardando...";
          inlineStatus.classList.remove("save-status--success", "save-status--error");

          try {
            await ordersApi.updateControlOrderItem({
              orderId,
              itemId,
              quantityText: String(qtyInput.value || "").trim(),
              unit: String(unitInput.value || item?.unit || "").trim(),
            });
            setStatus("Producto actualizado.", "success");
            await refresh();
          } catch (error) {
            inlineStatus.textContent = String(error?.message || "No se pudo editar producto.");
            inlineStatus.classList.add("save-status--error");
          } finally {
            saveButton.disabled = false;
            cancelButton.disabled = false;
          }
        });

        deleteButton.addEventListener("click", async () => {
          if (!ordersApi || typeof ordersApi.deleteControlOrderItem !== "function") {
            setStatus("API no disponible para eliminar producto.", "error");
            return;
          }
          const orderId = Number(row?.orderId);
          const itemId = Number(item?.id);
          if (!Number.isFinite(orderId) || orderId <= 0 || !Number.isFinite(itemId) || itemId <= 0) {
            setStatus("Ítem inválido para eliminar.", "error");
            return;
          }

          const ok = window.confirm("¿Eliminar este producto del pedido?");
          if (!ok) {
            return;
          }

          editButton.disabled = true;
          deleteButton.disabled = true;
          try {
            await ordersApi.deleteControlOrderItem({ orderId, itemId });
            setStatus("Producto eliminado.", "success");
            await refresh();
          } catch (error) {
            setStatus(String(error?.message || "No se pudo eliminar producto."), "error");
            editButton.disabled = false;
            deleteButton.disabled = false;
          }
        });

        const actionWrap = document.createElement("span");
        actionWrap.className = "control-orders__item-actions";
        actionWrap.appendChild(editButton);
        actionWrap.appendChild(deleteButton);

        li.appendChild(text);
        li.appendChild(actionWrap);
        list.appendChild(li);
        list.appendChild(formLi);
      });

      const addLi = document.createElement("li");
      addLi.className = "control-orders__item-add-row";
      const addButton = document.createElement("button");
      addButton.type = "button";
      addButton.className = "control-orders__item-action control-orders__item-action--add";
      addButton.textContent = "+";
      addButton.title = "Agregar producto";
      addButton.setAttribute("aria-label", "Agregar producto");
      addLi.appendChild(addButton);
      list.appendChild(addLi);

      const addFormLi = document.createElement("li");
      addFormLi.className = "control-orders__item-form-row hidden";

      const addForm = document.createElement("form");
      addForm.className = "control-orders__item-inline-form";

      const addNameInput = document.createElement("select");
      addNameInput.className = "control-orders__item-inline-input";

      const repopulateAddProductOptions = () => {
        const previous = String(addNameInput.value || "").trim();
        const names = Array.from(
          new Set([
            ...getControlProductNames(),
            ...orderedItems.map((item) => String(item?.productName || "").trim()).filter(Boolean),
          ])
        );

        addNameInput.innerHTML = "";

        const placeholderOption = document.createElement("option");
        placeholderOption.value = "";
        placeholderOption.textContent = "Producto";
        placeholderOption.disabled = true;
        placeholderOption.selected = true;
        addNameInput.appendChild(placeholderOption);

        names.forEach((name) => {
          const option = document.createElement("option");
          option.value = name;
          option.textContent = name;
          if (previous && previous === name) {
            option.selected = true;
            placeholderOption.selected = false;
          }
          addNameInput.appendChild(option);
        });
      };
      repopulateAddProductOptions();

      const addQtyInput = document.createElement("input");
      addQtyInput.type = "text";
      addQtyInput.className = "control-orders__item-inline-input";
      addQtyInput.placeholder = "Cantidad";

      const addUnitInput = document.createElement("select");
      addUnitInput.className = "control-orders__item-inline-input";

      const repopulateAddUnitOptions = () => {
        const unitOptions = getUnitsForControlItem({
          productName: addNameInput.value,
          variant: "",
          unit: "",
        });
        const previous = String(addUnitInput.value || "").trim();
        addUnitInput.innerHTML = "";
        unitOptions.forEach((unitName) => {
          const option = document.createElement("option");
          option.value = unitName;
          option.textContent = unitName;
          if (previous && previous === unitName) {
            option.selected = true;
          }
          addUnitInput.appendChild(option);
        });
      };
      repopulateAddUnitOptions();

      const addSaveButton = document.createElement("button");
      addSaveButton.type = "submit";
      addSaveButton.className = "button-secondary control-orders__item-inline-btn";
      addSaveButton.textContent = "Agregar";

      const addCancelButton = document.createElement("button");
      addCancelButton.type = "button";
      addCancelButton.className = "button-secondary control-orders__item-inline-btn";
      addCancelButton.textContent = "Cancelar";

      const addInlineStatus = document.createElement("span");
      addInlineStatus.className = "save-status control-orders__item-inline-status";

      addForm.appendChild(addNameInput);
      addForm.appendChild(addQtyInput);
      addForm.appendChild(addUnitInput);
      addForm.appendChild(addSaveButton);
      addForm.appendChild(addCancelButton);
      addForm.appendChild(addInlineStatus);
      addFormLi.appendChild(addForm);
      list.appendChild(addFormLi);

      addButton.addEventListener("click", () => {
        addFormLi.classList.toggle("hidden");
        if (!addFormLi.classList.contains("hidden")) {
          repopulateAddProductOptions();
          repopulateAddUnitOptions();
          addNameInput.focus();
        }
      });

      addNameInput.addEventListener("change", () => {
        repopulateAddUnitOptions();
      });

      addCancelButton.addEventListener("click", () => {
        addFormLi.classList.add("hidden");
        addInlineStatus.textContent = "";
        addInlineStatus.classList.remove("save-status--success", "save-status--error");
      });

      addForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!ordersApi || typeof ordersApi.addControlOrderItem !== "function") {
          addInlineStatus.textContent = "API no disponible.";
          addInlineStatus.classList.add("save-status--error");
          return;
        }
        const orderId = Number(row?.orderId);
        if (!Number.isFinite(orderId) || orderId <= 0) {
          addInlineStatus.textContent = "Pedido inválido.";
          addInlineStatus.classList.add("save-status--error");
          return;
        }

        addSaveButton.disabled = true;
        addCancelButton.disabled = true;
        addInlineStatus.textContent = "Agregando...";
        addInlineStatus.classList.remove("save-status--success", "save-status--error");

        try {
          await ordersApi.addControlOrderItem({
            orderId,
            productName: String(addNameInput.value || "").trim(),
            quantityText: String(addQtyInput.value || "").trim(),
            unit: String(addUnitInput.value || "").trim(),
          });
          setStatus("Producto agregado.", "success");
          await refresh();
        } catch (error) {
          addInlineStatus.textContent = String(error?.message || "No se pudo agregar producto.");
          addInlineStatus.classList.add("save-status--error");
        } finally {
          addSaveButton.disabled = false;
          addCancelButton.disabled = false;
        }
      });

      panel.appendChild(list);

      toggle.addEventListener("click", () => {
        const isOpeningCurrent = state.openDetailKey !== rowKey;
        closeAllDetailPanels();
        if (isOpeningCurrent) {
          panel.classList.remove("hidden");
          toggle.textContent = "Contraer";
          state.openDetailKey = rowKey;
        }
      });

      detailWrap.appendChild(toggle);
      detailWrap.appendChild(panel);
      tdDetail.appendChild(detailWrap);

      approved.addEventListener("change", () => {
        persistRow({
          row,
          approved: approved.checked,
          flete: flete2Button.classList.contains("is-active") ? "Flete 2" : "Flete 1",
          rowStatusNode: tdStatus,
          checkboxNode: approved,
          disableNodes: [flete1Button, flete2Button],
          onSuccess: ({ approved: nextApproved, flete: nextFlete }) => {
            approved.checked = Boolean(nextApproved);
            setFleteButtonsVisual(String(nextFlete || "Flete 1"));
            applyFleteCellColor(String(nextFlete || "Flete 1"));
          },
          onError: ({ approved: previousApproved, flete: previousFlete }) => {
            approved.checked = Boolean(previousApproved);
            const safePrevious = String(previousFlete || "Flete 1");
            setFleteButtonsVisual(safePrevious);
            applyFleteCellColor(safePrevious);
          },
        });
      });

      tr.appendChild(tdApproved);
      tr.appendChild(tdClient);
      tr.appendChild(tdItems);
      tr.appendChild(tdFlete);
      tr.appendChild(tdStatus);
      tr.appendChild(tdDetail);
      tableBody.appendChild(tr);
    });
  };

  const refresh = async () => {
    if (state.loading) {
      return;
    }
    if (
      !ordersApi ||
      (typeof ordersApi.listTodayControlOrders !== "function" &&
        typeof ordersApi.listControlOrdersByDate !== "function")
    ) {
      return;
    }

    state.loading = true;
    if (dateSelect) {
      dateSelect.disabled = true;
    }
    if (onlyCurrentButton) {
      onlyCurrentButton.disabled = true;
    }
    if (refreshButton) {
      refreshButton.disabled = true;
    }
    setStatus(`Cargando pedidos (${currentDateLabel()})...`);

    try {
      const selectedDateKey = isValidDateKey(state.selectedDateKey)
        ? state.selectedDateKey
        : getTodayDateKey();
      const useByDate =
        typeof ordersApi.listControlOrdersByDate === "function" &&
        selectedDateKey !== getTodayDateKey();
      const result = useByDate
        ? await ordersApi.listControlOrdersByDate({ date: selectedDateKey })
        : await ordersApi.listTodayControlOrders();

      const responseDateKey = String(result?.dateKey || "").trim();
      if (isValidDateKey(responseDateKey)) {
        state.selectedDateKey = responseDateKey;
      }

      state.rows = Array.isArray(result?.data) ? result.data : [];
      await loadDivCompProductMap();
      renderRows();
      updateSortHeaderVisuals();
      renderRepartoRows();
      renderDateOptions();
      setStatus(`Pedidos cargados (${currentDateLabel()}): ${state.rows.length}.`, "success");
    } catch (error) {
      state.rows = [];
      state.divCompProductMap = new Map();
      renderRows();
      updateSortHeaderVisuals();
      renderRepartoRows();
      renderDateOptions();
      setStatus(String(error?.message || "No se pudieron cargar pedidos."), "error");
    } finally {
      state.loading = false;
      if (dateSelect) {
        dateSelect.disabled = false;
      }
      if (onlyCurrentButton) {
        onlyCurrentButton.disabled = false;
      }
      if (refreshButton) {
        refreshButton.disabled = false;
      }
    }
  };

  const applyOnlyCurrent = async () => {
    if (!ordersApi || typeof ordersApi.setOnlyCurrentControlOrders !== "function") {
      setStatus("API de Solo Actuales no disponible.", "error");
      return;
    }

    const confirmed = await confirmOnlyCurrentAction();
    if (!confirmed) {
      return;
    }

    if (onlyCurrentButton) {
      onlyCurrentButton.disabled = true;
    }
    if (refreshButton) {
      refreshButton.disabled = true;
    }
    if (dateSelect) {
      dateSelect.disabled = true;
    }

    setStatus("Aplicando Solo Actuales en hoja Todos...");
    try {
      const response = await ordersApi.setOnlyCurrentControlOrders();
      const dateKey = String(response?.data?.date || "").trim() || getTodayDateKey();
      const activeCount = Number(response?.data?.activeClientsCount) || 0;
      await refresh();
      setStatus(`Solo Actuales aplicado (${formatDateLabel(dateKey)}): ${activeCount} clientes en true.`, "success");
    } catch (error) {
      setStatus(String(error?.message || "No se pudo aplicar Solo Actuales."), "error");
    } finally {
      if (!state.loading) {
        if (onlyCurrentButton) {
          onlyCurrentButton.disabled = false;
        }
        if (refreshButton) {
          refreshButton.disabled = false;
        }
        if (dateSelect) {
          dateSelect.disabled = false;
        }
      }
    }
  };

  const init = () => {
    tabCreateButton?.addEventListener("click", () => setActiveTab("create"));
    tabControlButton?.addEventListener("click", () => setActiveTab("control"));
    tabRepartoButton?.addEventListener("click", () => setActiveTab("reparto"));
    refreshButton?.addEventListener("click", () => refresh());
    onlyCurrentButton?.addEventListener("click", () => {
      applyOnlyCurrent();
    });

    const controlTable = tableBody?.closest("table");
    const sortableHeaders = controlTable
      ? controlTable.querySelectorAll("thead th[data-sort-key]")
      : [];
    sortableHeaders.forEach((header) => {
      const key = String(header.getAttribute("data-sort-key") || "").trim();
      if (!key) {
        return;
      }
      header.addEventListener("click", () => {
        if (state.sortKey === key) {
          state.sortDirection = state.sortDirection === "desc" ? "asc" : "desc";
        } else {
          state.sortKey = key;
          state.sortDirection = "desc";
        }
        renderRows();
        updateSortHeaderVisuals();
      });
    });

    responsibleSelect?.addEventListener("change", () => {
      renderRepartoRows();
    });

    dateSelect?.addEventListener("change", () => {
      const next = String(dateSelect.value || "").trim();
      if (!isValidDateKey(next)) {
        return;
      }
      state.selectedDateKey = next;
      refresh();
    });

    tableBody?.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (target.closest(".control-orders__detail")) {
        return;
      }
      closeAllDetailPanels();
    });

    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (target.closest("#control-orders-pane")) {
        return;
      }
      closeAllDetailPanels();
    });

    setActiveTab("create");
    loadResponsibles().then(() => {
      renderRepartoRows();
    });
    loadAvailableDates();
    updateSortHeaderVisuals();
  };

  return {
    init,
    refresh,
    setActiveTab,
  };
};
