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
