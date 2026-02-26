export const createImportApplier = ({
  getProductsById,
  getCardByProductId,
  coerceUnitForProduct,
  coerceVariantForProduct,
  parseUniCount,
} = {}) => {
  const ensureCardRowAndSetQuantity = (item) => {
    const productsById = getProductsById?.();
    const cardByProductId = getCardByProductId?.();

    const product = productsById?.get?.(item.productId);
    const card = cardByProductId?.get?.(item.productId);
    if (!product || !card) {
      return { ok: false, reason: "missing-card" };
    }

    const desiredUnit = coerceUnitForProduct(
      product,
      String(item.unit || product.defaultUnit || "").trim()
    );
    const desiredVariant = coerceVariantForProduct(product, item.variant);

    const findRow = () => {
      const currentRows = Array.from(card.querySelectorAll(".variant-row"));
      for (const row of currentRows) {
        const unitSelect = row.querySelector(".unit-select");
        const unitValue = row.querySelector(".unit-value");
        const currentUnit = unitSelect
          ? unitSelect.value
          : unitValue?.textContent?.trim() || "";
        const variantSelect = row.querySelector(".variant-select");
        const currentVariant = variantSelect ? variantSelect.value : "";

        const unitMatch = !desiredUnit || currentUnit === desiredUnit;
        const variantMatch = !product.variants.length || currentVariant === desiredVariant;
        if (unitMatch && variantMatch) {
          return row;
        }
      }
      return null;
    };

    let row = findRow();
    if (!row && typeof card.__addRow === "function") {
      if (product.variants.length && desiredVariant) {
        const hasVariant =
          Array.isArray(product.variants) && product.variants.includes(desiredVariant);
        if (!hasVariant) {
          return { ok: false, reason: "missing-variant" };
        }
      }
      card.__addRow({ unit: desiredUnit, variant: desiredVariant });
      row = findRow();
    }
    if (!row) {
      return { ok: false, reason: "missing-combo" };
    }

    if (Number.isFinite(Number(item.importOrder))) {
      row.dataset.importOrder = String(item.importOrder);
    }

    const unitSelect = row.querySelector(".unit-select");
    const variantSelect = row.querySelector(".variant-select");
    if (variantSelect && desiredVariant) {
      const hasOption = Array.from(variantSelect.options).some(
        (option) => option.value === desiredVariant
      );
      if (!hasOption) {
        return { ok: false, reason: "missing-variant-option" };
      }
      variantSelect.value = desiredVariant;
      variantSelect.dispatchEvent(new Event("change", { bubbles: true }));
    }

    // Seleccionar unidad después de variante para evitar filtros circulares.
    if (unitSelect && desiredUnit) {
      const hasOption = Array.from(unitSelect.options).some(
        (option) => option.value === desiredUnit
      );
      if (!hasOption) {
        return { ok: false, reason: "missing-unit-option" };
      }
      unitSelect.value = desiredUnit;
      unitSelect.dispatchEvent(new Event("change", { bubbles: true }));
    }

    const unitModeToggle = row.querySelector(".unit-mode-toggle");
    const quantityInput = row.querySelector(".quantity-input");
    if (!quantityInput) {
      return { ok: false, reason: "no-quantity" };
    }

    if (item.unitMode && unitModeToggle) {
      unitModeToggle.checked = true;
      unitModeToggle.dispatchEvent(new Event("change", { bubbles: true }));
      const qty = Number(item.quantity);
      quantityInput.value =
        Number.isFinite(qty) && qty > 0
          ? String(qty)
          : String(parseUniCount(String(item.quantityText ?? "")) ?? "");
      quantityInput.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      if (unitModeToggle) {
        unitModeToggle.checked = false;
        unitModeToggle.dispatchEvent(new Event("change", { bubbles: true }));
      }
      quantityInput.value = String(item.quantity ?? "");
      quantityInput.dispatchEvent(new Event("input", { bubbles: true }));
    }

    if (item.comment) {
      const commentToggle = row.querySelector(".comment-toggle__input");
      const commentField = row.querySelector(".comment-input");
      if (commentToggle && commentField) {
        commentToggle.checked = true;
        commentToggle.dispatchEvent(new Event("change", { bubbles: true }));
        commentField.value = String(item.comment);
        commentField.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }
    return { ok: true };
  };

  return {
    ensureCardRowAndSetQuantity,
  };
};
