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
      const warningKey = `${item.productId}__${item.unit || ""}__${item.variant || ""}`;
      const isWarn = warningKeys && warningKeys.has(warningKey);
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
      li.textContent = `${isWarn ? "⚠️ " : ""}${item.productName}${variantText} - ${quantityText}${unitText}`;
      if (isWarn) {
        li.classList.add("summary-warning");
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
