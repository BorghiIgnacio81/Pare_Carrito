export const createSummaryController = ({
  clients,
  clientSelect,
  summaryBox,
  summaryClient,
  summaryContent,
  confirmButton,
  confirmButtons,
  clearOrderButtons,
  productState,
  updateOutput,
  scheduleCoverageUpdate,
  getUnitsForProductId,
}) => {
  let lastRequestedCount = null;
  let warningKeys = new Set();

  const formatQuantityForUi = (value) => {
    if (value == null) {
      return "";
    }
    if (typeof value === "number") {
      const rounded = Math.round(value * 1000) / 1000;
      const text = String(rounded);
      if (!text.includes(".")) {
        return text;
      }
      const withComma = text.replace(".", ",");
      // strip trailing zeros: 1,500 -> 1,5
      return withComma.replace(/,0+$/, "").replace(/(,\d*?)0+$/, "$1");
    }
    const raw = String(value);
    return raw.replace(".", ",");
  };

  const getConfirmButtons = () => {
    const list = Array.isArray(confirmButtons) ? confirmButtons.filter(Boolean) : [];
    if (list.length) {
      return list;
    }
    return confirmButton ? [confirmButton] : [];
  };

  const getClearButtons = () => {
    return Array.isArray(clearOrderButtons) ? clearOrderButtons.filter(Boolean) : [];
  };

  const setRequestedCount = (count) => {
    lastRequestedCount = typeof count === "number" ? count : null;
  };

  const resetRequestedCount = () => {
    lastRequestedCount = null;
  };

  const setWarnings = (warnings) => {
    const next = new Set();
    (Array.isArray(warnings) ? warnings : []).forEach((w) => {
      const key = String(w?.key || "").trim();
      if (key) {
        next.add(key);
      }
    });
    warningKeys = next;
  };

  const resetWarnings = () => {
    warningKeys = new Set();
  };

  const parseQuantityInput = (value) => {
    const text = String(value || "").trim().replace(",", ".");
    if (!text) {
      return 0;
    }
    const fraction = text.match(/^(\d+)\s*\/\s*(\d+)$/);
    if (fraction) {
      const numerator = Number(fraction[1]);
      const denominator = Number(fraction[2]);
      if (Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0) {
        return numerator / denominator;
      }
    }
    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const normalizeKeyText = (value) => String(value ?? "").trim().toLowerCase();

  const resolveProductStateEntry = (state, item) => {
    if (!state || typeof state.get !== "function" || !item) {
      return null;
    }

    if (state.has(item.productId)) {
      return { key: item.productId, value: state.get(item.productId) };
    }

    const productIdText = String(item.productId ?? "").trim();
    if (productIdText) {
      if (state.has(productIdText)) {
        return { key: productIdText, value: state.get(productIdText) };
      }
      for (const [key, value] of state.entries()) {
        if (String(key ?? "").trim() === productIdText) {
          return { key, value };
        }
      }
    }

    const targetName = normalizeKeyText(item.productName);
    if (targetName) {
      for (const [key, value] of state.entries()) {
        if (normalizeKeyText(value?.productName) === targetName) {
          return { key, value };
        }
      }
    }

    return null;
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

  const renderSummary = () => {
    if (summaryBox) {
      summaryBox.classList.toggle("is-hidden", !clientSelect.value);
    }
    if (summaryClient) {
      const selectedClient = (clients || []).find((client) => client.id === clientSelect.value);
      summaryClient.textContent = selectedClient ? `${selectedClient.id} - ${selectedClient.name}` : "";
    }

    const items = Array.from(productState.values())
      .filter((item) => (item.quantity && item.quantity > 0) || (item.unitMode && item.quantityText))
      .sort((a, b) => {
        const aImp = Number(a.importOrder);
        const bImp = Number(b.importOrder);
        const aHasImp = Number.isFinite(aImp);
        const bHasImp = Number.isFinite(bImp);
        if (aHasImp && bHasImp && aImp !== bImp) {
          return aImp - bImp;
        }
        if (aHasImp && !bHasImp) {
          return -1;
        }
        if (!aHasImp && bHasImp) {
          return 1;
        }
        const aTime = a.addedAt || 0;
        const bTime = b.addedAt || 0;
        if (aTime === bTime) {
          return a.productName.localeCompare(b.productName, "es");
        }
        return aTime - bTime;
      });

    if (items.length === 0) {
      summaryContent.innerHTML = "<p>No hay productos cargados.</p>";
      getConfirmButtons().forEach((button) => {
        button.disabled = true;
      });
      getClearButtons().forEach((button) => {
        button.disabled = true;
      });
      updateOutput();
      return;
    }

    const list = document.createElement("ul");
    list.className = "summary-list";

    let isValid = Boolean(clientSelect.value);

    items.forEach((item) => {
      const li = document.createElement("li");
      li.className = "summary-list__item";

      const row = document.createElement("div");
      row.className = "summary-list__row";

      const text = document.createElement("span");
      text.className = "summary-list__text";

      const warningKey = `${item.productId}__${item.unit || ""}__${item.variant || ""}`;
      const isWarn = warningKeys && warningKeys.has(warningKey);
      const repeatCount = Number(item.importCount || 0);
      const repeatText = repeatCount > 1 ? ` (${repeatCount})` : "";
      const quantityText = item.unitMode
        ? item.quantityText || "(sin cantidad)"
        : item.quantity
        ? formatQuantityForUi(item.quantity)
        : "(sin cantidad)";
      const variantText = item.variant && item.variant !== "Común" ? ` - ${item.variant}` : "";
      const unitText = item.unitMode
        ? ""
        : item.unit
        ? item.unit === "Kg"
          ? "Kg"
          : ` ${item.unit}`
        : " (sin unidad)";
      text.textContent = `${isWarn ? "⚠️ " : ""}${item.productName}${variantText}${repeatText} - ${quantityText}${unitText}`;

      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "control-orders__item-action control-orders__item-action--edit summary-list__edit";
      editButton.title = "Editar producto";
      editButton.setAttribute("aria-label", "Editar producto");
      editButton.appendChild(createPencilIconNode());

      row.appendChild(text);
      row.appendChild(editButton);
      li.appendChild(row);

      const form = document.createElement("form");
      form.className = "control-orders__item-inline-form summary-list__edit-form hidden";

      const qtyInput = document.createElement("input");
      qtyInput.type = "text";
      qtyInput.className = "control-orders__item-inline-input summary-list__qty-input";
      qtyInput.placeholder = "Cantidad";
      qtyInput.maxLength = 4;
      qtyInput.value = item.unitMode
        ? String(item.quantityText || "").trim()
        : formatQuantityForUi(item.quantity || 0);

      const unitSelect = document.createElement("select");
      unitSelect.className = "control-orders__item-inline-input";
      const resolvedUnits =
        typeof getUnitsForProductId === "function"
          ? getUnitsForProductId(item.productId, item.unit)
          : [String(item.unit || "").trim() || "Unidad"];
      const units = Array.from(new Set((Array.isArray(resolvedUnits) ? resolvedUnits : []).filter(Boolean)));
      const finalUnits = units.length
        ? units
        : [String(item.unit || "").trim() || "Unidad"];
      const showUnitSelect = !item.unitMode && finalUnits.length > 1;
      finalUnits.forEach((unitName) => {
        const option = document.createElement("option");
        option.value = unitName;
        option.textContent = unitName;
        if (String(item.unit || "").trim() === unitName) {
          option.selected = true;
        }
        unitSelect.appendChild(option);
      });
      unitSelect.disabled = Boolean(item.unitMode);

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
        form.appendChild(unitSelect);
      }
      form.appendChild(saveButton);
      form.appendChild(cancelButton);
      form.appendChild(inlineStatus);
      li.appendChild(form);

      editButton.addEventListener("click", () => {
        form.classList.toggle("hidden");
        if (!form.classList.contains("hidden")) {
          qtyInput.focus();
        }
      });

      cancelButton.addEventListener("click", () => {
        form.classList.add("hidden");
        inlineStatus.textContent = "";
        inlineStatus.classList.remove("save-status--success", "save-status--error");
      });

      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const entry = resolveProductStateEntry(productState, item);
        if (!entry?.value) {
          inlineStatus.textContent = "Producto no disponible.";
          inlineStatus.classList.add("save-status--error");
          return;
        }

        const next = { ...entry.value };
        if (next.unitMode) {
          next.quantityText = String(qtyInput.value || "").trim();
          next.quantity = parseQuantityInput(next.quantityText);
        } else {
          const parsedQty = parseQuantityInput(qtyInput.value);
          next.quantity = parsedQty > 0 ? parsedQty : 0;
          next.unit = showUnitSelect
            ? String(unitSelect.value || next.unit || "").trim()
            : String(next.unit || "").trim();
        }

        productState.set(entry.key, next);
        inlineStatus.textContent = "Guardado";
        inlineStatus.classList.remove("save-status--error");
        inlineStatus.classList.add("save-status--success");
        renderSummary();
      });

      if (isWarn) {
        text.classList.add("summary-warning");
      }
      list.appendChild(li);

      if (
        !item.unit ||
        (!item.unitMode && (!item.quantity || item.quantity <= 0)) ||
        (item.unitMode && !item.quantityText) ||
        (item.hasVariants && !item.variant)
      ) {
        isValid = false;
      }
    });

    if (typeof lastRequestedCount === "number" && lastRequestedCount > 0) {
      const totalLi = document.createElement("li");
      totalLi.textContent = `Total productos (cliente): ${lastRequestedCount}`;
      list.appendChild(totalLi);
    }

    summaryContent.innerHTML = "";
    summaryContent.appendChild(list);
    getConfirmButtons().forEach((button) => {
      button.disabled = !isValid;
    });
    getClearButtons().forEach((button) => {
      button.disabled = !clientSelect.value;
    });
    updateOutput();
    scheduleCoverageUpdate();
  };

  return {
    renderSummary,
    setRequestedCount,
    resetRequestedCount,
    setWarnings,
    resetWarnings,
  };
};
