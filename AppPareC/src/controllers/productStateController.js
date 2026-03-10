export const createProductStateController = ({
  productState,
  renderSummary,
  renderProductGrid,
  anchorUpdateDelayMs = 6000,
} = {}) => {
  let addedAtSequence = 0;
  const nextAddedAt = () => {
    addedAtSequence += 1;
    return addedAtSequence;
  };

  let anchorUpdateScheduled = false;
  let anchorUpdateTimeoutId = null;

  const scheduleAnchoredCardsUpdate = ({ immediate = false } = {}) => {
    if (anchorUpdateTimeoutId) {
      window.clearTimeout(anchorUpdateTimeoutId);
      anchorUpdateTimeoutId = null;
    }

    const run = () => {
      if (anchorUpdateScheduled) {
        return;
      }
      anchorUpdateScheduled = true;
      window.requestAnimationFrame(() => {
        anchorUpdateScheduled = false;
        renderProductGrid?.();
      });
    };

    if (immediate) {
      run();
      return;
    }

    anchorUpdateTimeoutId = window.setTimeout(() => {
      anchorUpdateTimeoutId = null;
      run();
    }, anchorUpdateDelayMs);
  };

  const updateItemState = (rowId, updates) => {
    try {
      console.debug('[productState] updateItemState called', { rowId, updates });
    } catch (e) {}
    const current = productState.get(rowId) || {
      rowId,
      productId: "",
      productName: "",
      unit: "",
      variant: "",
      hasVariants: false,
      quantity: 0,
      quantityText: "",
      unitMode: false,
      comment: "",
      addedAt: null,
      importOrder: null,
    };
    const next = { ...current, ...updates };
    const normalizeQtyText = (value) => {
      if (!Number.isFinite(value) || value <= 0) {
        return "";
      }
      const rounded = Math.round(value * 1000) / 1000;
      return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
    };
    if (next.unitMode) {
      const rawText = String(next.quantityText || "").trim();
      const normalizedRaw = rawText.replace(",", ".");
      const rawAsNumber = Number(normalizedRaw);
      const qtyFromState = Number(next.quantity);
      const effectiveQty =
        Number.isFinite(rawAsNumber) && rawAsNumber > 0
          ? rawAsNumber
          : Number.isFinite(qtyFromState) && qtyFromState > 0
            ? qtyFromState
            : 0;
      if (effectiveQty > 0) {
        const hasUniToken = /\buni\b/i.test(rawText);
        const formatted = normalizeQtyText(effectiveQty);
        next.quantity = effectiveQty;
        next.quantityText = hasUniToken && rawText ? rawText : `${formatted} uni`;
      } else {
        next.quantity = 0;
        next.quantityText = "";
      }
    }
    if (Object.prototype.hasOwnProperty.call(updates, "quantity")) {
      if (updates.quantity > 0 && !current.addedAt) {
        next.addedAt = nextAddedAt();
      }
      if (updates.quantity <= 0) {
        next.addedAt = null;
      }
    }
    if (Object.prototype.hasOwnProperty.call(updates, "quantityText")) {
      if (updates.quantityText && !current.addedAt) {
        next.addedAt = nextAddedAt();
      }
      if (!updates.quantityText && !next.quantity) {
        next.addedAt = null;
      }
    }
    productState.set(rowId, next);
    try {
      console.debug('[productState] set', { rowId, next });
    } catch (e) {}
    renderSummary?.();

    try {
      console.debug('[productState] renderSummary invoked');
    } catch (e) {}

    if (
      Object.prototype.hasOwnProperty.call(updates, "quantity") ||
      Object.prototype.hasOwnProperty.call(updates, "quantityText")
    ) {
      scheduleAnchoredCardsUpdate();
    }
  };

  return {
    updateItemState,
    scheduleAnchoredCardsUpdate,
  };
};
