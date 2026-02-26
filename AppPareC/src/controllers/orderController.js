export const createOrderController = ({
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
  getSheetHeaders,
  mapOrderItemsToSheetColumns,
  buildOrderObject,
  updateOutput,
  renderSummary,
  scheduleCoverageUpdate,
  renderProductGrid,
  filterCards,
  updateFavoriteIndicators,
  saveStatus,
  saveConfirmModal,
  saveConfirmMessage,
  saveConfirmOk,
  savePartialModal,
  savePartialMessage,
  savePartialYes,
  savePartialNo,
} = {}) => {
  const formatSheetDateTime = (date) => {
    const d = date instanceof Date ? date : new Date();
    const pad2 = (n) => String(n).padStart(2, "0");
    return `${d.getDate()}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${d.getHours()}:${pad2(
      d.getMinutes()
    )}:${pad2(d.getSeconds())}`;
  };

  const getSelectedClientLabelForSheet = () => {
    const selectedClient = (clients || []).find((client) => client.id === clientSelect?.value);
    if (!selectedClient) {
      return "";
    }
    return `${selectedClient.id}) ${selectedClient.name}`;
  };

  const setSaveStatus = (text, kind = "") => {
    if (!saveStatus) {
      return;
    }
    saveStatus.textContent = String(text || "").trim();
    saveStatus.classList.remove("save-status--success", "save-status--error");
    if (kind === "success") {
      saveStatus.classList.add("save-status--success");
    }
    if (kind === "error") {
      saveStatus.classList.add("save-status--error");
    }
  };

  const flashConfirmButtons = (text) => {
    if (typeof updateOutput === "function") {
      updateOutput();
    }
    const label = text || "Pedido listo";
    (confirmButtons || []).forEach((button) => {
      if (button) {
        button.textContent = label;
      }
    });
    setTimeout(() => {
      (confirmButtons || []).forEach((button) => {
        if (button) {
          button.textContent = "Confirmar pedido";
        }
      });
    }, 1400);
  };

  const parseRowNumberFromRange = (range) => {
    const text = String(range || "").trim();
    if (!text) {
      return null;
    }
    // Examples: "Pedidos!A3029:OJ3029" or "Pedidos!A3029"
    const match = text.match(/!\s*[A-Z]+(\d+)/i);
    if (!match) {
      return null;
    }
    const row = Number(match[1]);
    return Number.isFinite(row) ? row : null;
  };

  const showSaveConfirmationModal = ({ sheetRowNumber, updatedRange, skippedItems = [] }) => {
    if (!saveConfirmModal || !saveConfirmMessage) {
      return;
    }
    const row = Number.isFinite(Number(sheetRowNumber))
      ? Number(sheetRowNumber)
      : parseRowNumberFromRange(updatedRange);
    const baseText = row
      ? `Pedido guardado en la línea ${row}.`
      : `Pedido guardado${updatedRange ? ` (${String(updatedRange).trim()})` : "."}`;
    const skipped = Array.isArray(skippedItems) ? skippedItems.filter(Boolean) : [];
    if (skipped.length) {
      const sample = skipped.slice(0, 3).join(", ");
      const extra = skipped.length > 3 ? `, ${skipped.length - 3} más` : "";
      saveConfirmMessage.textContent =
        `${baseText} ` +
        `No se cargaron ${skipped.length} productos por no existir en el Sheet: ${sample}${extra}.`;
    } else {
      saveConfirmMessage.textContent = baseText;
    }
    saveConfirmModal.classList.remove("hidden");
  };

  const askToSaveRestOfOrder = (missingItems) => {
    const missing = Array.isArray(missingItems) ? missingItems : [];
    const names = missing
      .map((item) => String(item?.name || item?.productId || "").trim())
      .filter(Boolean);
    const unique = Array.from(new Set(names));

    const message =
      unique.length === 1
        ? `El producto ${unique[0]} no se pudo cargar por no existir en el Sheet.\n¿Desea cargar el resto del pedido de igual manera?`
        : `Algunos productos no se pudieron cargar por no existir en el Sheet (${unique.length}).\n` +
          `${unique.slice(0, 6).map((n) => `- ${n}`).join("\n")}` +
          `${unique.length > 6 ? `\n- ... (${unique.length - 6} más)` : ""}` +
          `\n\n¿Desea cargar el resto del pedido de igual manera?`;

    if (!savePartialModal || !savePartialMessage || !savePartialYes || !savePartialNo) {
      return Promise.resolve(window.confirm(message));
    }

    return new Promise((resolve) => {
      savePartialMessage.textContent = message;
      savePartialModal.classList.remove("hidden");

      const cleanup = () => {
        savePartialModal.classList.add("hidden");
        savePartialYes.onclick = null;
        savePartialNo.onclick = null;
      };

      savePartialYes.onclick = () => {
        cleanup();
        resolve(true);
      };
      savePartialNo.onclick = () => {
        cleanup();
        resolve(false);
      };
    });
  };

  const toSheetDecimal = (value) => {
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

  const appendOrderToSheet = async () => {
    if (!clientSelect?.value) {
      throw new Error("Seleccione un cliente antes de confirmar.");
    }

    const sheetHeaders = typeof getSheetHeaders === "function" ? getSheetHeaders() : [];
    if (!Array.isArray(sheetHeaders) || sheetHeaders.length < 3) {
      throw new Error("No hay encabezados del Sheet cargados todavía.");
    }

    const order = typeof buildOrderObject === "function" ? buildOrderObject() : null;
    const items = Array.isArray(order?.items) ? order.items : [];
    if (!items.length) {
      throw new Error("No hay productos cargados para confirmar.");
    }

    const initialMapping = mapOrderItemsToSheetColumns(items, sheetHeaders);
    const missing = Array.isArray(initialMapping?.missing) ? initialMapping.missing : [];
    let skippedItems = [];
    let effectiveItems = items;

    if (missing.length) {
      const proceed = await askToSaveRestOfOrder(missing);
      if (!proceed) {
        throw new Error("Guardado cancelado.");
      }
      const missingSet = new Set(missing);
      skippedItems = missing
        .map((item) => String(item?.name || item?.productId || "").trim())
        .filter(Boolean);
      effectiveItems = items.filter((item) => !missingSet.has(item));
      if (!effectiveItems.length) {
        throw new Error("No hay productos válidos para guardar.");
      }
    }

    const { mapped, missing: stillMissing } = mapOrderItemsToSheetColumns(effectiveItems, sheetHeaders);
    if (Array.isArray(stillMissing) && stillMissing.length) {
      const sample = stillMissing
        .slice(0, 3)
        .map((item) => item.name || item.productId || "(sin nombre)")
        .join(", ");
      throw new Error(
        `Hay productos que no se pueden mapear a columnas del Sheet (${stillMissing.length}). Ej: ${sample}`
      );
    }

    const row = Array(sheetHeaders.length).fill("");
    row[0] = formatSheetDateTime(new Date());
    row[1] = getSelectedClientLabelForSheet();

    sheetHeaders.forEach((header, index) => {
      const key = String(header ?? "").trim();
      if (!key) {
        return;
      }
      if (Object.prototype.hasOwnProperty.call(mapped, key)) {
        row[index] = toSheetDecimal(mapped[key]);
      }
    });

    if (!ordersApi || typeof ordersApi.appendOrderRow !== "function") {
      throw new Error("API no disponible para guardar el pedido.");
    }

    const data = await ordersApi.appendOrderRow({ row });
    return { ...(data || {}), skippedItems };
  };

  const clearCurrentOrder = () => {
    if (productState?.clear) {
      productState.clear();
    }
    if (cardByProductId?.clear) {
      cardByProductId.clear();
    }
    if (itemsContainer) {
      itemsContainer.innerHTML = "";
    }
    if (typeof setRowCounter === "function") {
      setRowCounter(0);
    }

    if (typeof renderSummary === "function") {
      renderSummary();
    }
    if (typeof scheduleCoverageUpdate === "function") {
      scheduleCoverageUpdate();
    }
    if (typeof renderProductGrid === "function") {
      renderProductGrid();
    }
    if (typeof filterCards === "function") {
      filterCards();
    }
    if (typeof updateFavoriteIndicators === "function") {
      updateFavoriteIndicators();
    }
    if (typeof updateOutput === "function") {
      updateOutput();
    }
  };

  const wireClearButtons = () => {
    (clearOrderButtons || []).forEach((button) => {
      if (!button) return;
      button.addEventListener("click", () => {
        clearCurrentOrder();
      });
    });
  };

  const wireConfirmButtons = () => {
    (confirmButtons || []).forEach((button) => {
      if (!button) return;
      button.addEventListener("click", async () => {
        try {
          (confirmButtons || []).forEach((b) => {
            if (b) b.disabled = true;
          });
          (clearOrderButtons || []).forEach((b) => {
            if (b) b.disabled = true;
          });

          flashConfirmButtons("Escribiendo...");
          setSaveStatus("Guardando pedido en el Sheet…");

          const result = await appendOrderToSheet();
          flashConfirmButtons("Guardado");

          const range = String(result?.updatedRange || "").trim();
          setSaveStatus(range ? `Pedido guardado (${range})` : "Pedido guardado.", "success");

          showSaveConfirmationModal({
            sheetRowNumber: result?.sheetRowNumber,
            updatedRange: range,
            skippedItems: result?.skippedItems,
          });
        } catch (error) {
          const message = String(error?.message || error || "").trim();
          console.error(error);
          flashConfirmButtons("Error");
          setSaveStatus(message || "No se pudo confirmar el pedido.", "error");
          alert(message || "No se pudo confirmar el pedido.");
        } finally {
          (confirmButtons || []).forEach((b) => {
            if (b) b.disabled = false;
          });

          const hasAnyItem = Array.from(productState?.values?.() || []).some(
            (item) => (item.quantity && item.quantity > 0) || (item.unitMode && item.quantityText)
          );

          (clearOrderButtons || []).forEach((b) => {
            if (!b) return;
            b.disabled = !clientSelect?.value || !hasAnyItem;
          });
        }
      });
    });
  };

  const wireSaveConfirmOk = () => {
    if (!saveConfirmOk) {
      return;
    }
    saveConfirmOk.addEventListener("click", () => {
      window.location.reload();
    });
  };

  const init = () => {
    // Keep for backward-compat: the controller owns the save confirmation modal.
    wireSaveConfirmOk();
    wireClearButtons();
    wireConfirmButtons();
  };

  return {
    init,
    clearCurrentOrder,
    appendOrderToSheet,
    setSaveStatus,
    flashConfirmButtons,
  };
};
