import { productIcon, renderProductIcon } from "./icons.js";

export const createProductCardBuilder = ({
  unitModeProducts,
  productState,
  createRowId,
  updateItemState,
  scheduleMasonryUpdate,
  renderSummary,
  scheduleAnchoredCardsUpdate,
  updateFavoriteIndicators,
  getFavoritePresets,
}) => {
  const buildProductCard = (product) => {
    const card = document.createElement("article");
    card.className = "product-card";
    card.dataset.productId = product.id;
    card.dataset.name = product.name.toLowerCase();
    card.dataset.search = `${product.name} ${product.variants.join(" ")}`.toLowerCase();
    if (product.category) {
      const categorySlug = product.category.toLowerCase().replace(/\s+/g, "-");
      card.classList.add(`category-${categorySlug}`);
    }

    const icon = document.createElement("div");
    icon.className = "product-card__icon";
    renderProductIcon(productIcon(product.name), icon);

    const titleRow = document.createElement("div");
    titleRow.className = "product-card__title-row";

    const title = document.createElement("h3");
    title.className = "product-card__title";
    title.textContent = product.name;

    const badges = document.createElement("div");
    badges.className = "product-card__badges";

    const favoriteStar = document.createElement("span");
    favoriteStar.className = "favorite-star";
    favoriteStar.dataset.favoriteScope = "primary";
    favoriteStar.textContent = "★";

    const favoriteIndex = document.createElement("span");
    favoriteIndex.className = "favorite-star__index";
    favoriteIndex.setAttribute("aria-hidden", "true");
    favoriteIndex.textContent = "";
    favoriteStar.appendChild(favoriteIndex);

    const buildComboStar = (rowId) => {
      const star = document.createElement("span");
      star.className = "favorite-star favorite-star--combo";
      star.dataset.favoriteScope = "combo";
      star.dataset.rowId = rowId;
      star.textContent = "★";

      const idx = document.createElement("span");
      idx.className = "favorite-star__index";
      idx.setAttribute("aria-hidden", "true");
      idx.textContent = "";
      star.appendChild(idx);

      return star;
    };

    badges.appendChild(icon);
    badges.appendChild(favoriteStar);

    titleRow.appendChild(title);
    titleRow.appendChild(badges);

    const rowsContainer = document.createElement("div");
    rowsContainer.className = "variant-rows";
    const comboWarning = document.createElement("p");
    comboWarning.className = "product-card__warning hidden";
    comboWarning.textContent = "La combinación elegida no existe en la planilla (Sheet).";

    const isZapalloProduct = product?.id === "zapallo";
    const isTomateProduct = product?.id === "tomate";

    const supportsVariantIcons = product && (product.id === "manzana" || product.id === "morron");

    const normalizeVariantLabel = (value) =>
      String(value || "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

    const iconSpecForVariant = (variantLabel) => {
      if (!supportsVariantIcons) {
        return productIcon(product.name);
      }
      const lowered = normalizeVariantLabel(variantLabel);

      if (product.id === "manzana") {
        if (lowered.includes("verde")) {
          return "🍏";
        }
        if (lowered.includes("roja") || lowered.includes("rojo")) {
          return "🍎";
        }
        return "🍎";
      }

      if (product.id === "morron") {
        if (lowered.includes("verde")) {
          return { kind: "emojiTint", emoji: "🫑", tone: "green" };
        }
        if (lowered.includes("roja") || lowered.includes("rojo")) {
          return { kind: "emojiTint", emoji: "🫑", tone: "red" };
        }
        if (lowered.includes("amarilla") || lowered.includes("amarillo")) {
          return { kind: "emojiTint", emoji: "🫑", tone: "yellow" };
        }
        return { kind: "emojiTint", emoji: "🫑", tone: "green" };
      }

      return productIcon(product.name);
    };

    const updateHeaderIconFromPrimaryVariant = () => {
      if (!supportsVariantIcons) {
        return;
      }
      const primaryRow = rowsContainer.querySelector(".variant-row");
      const primaryVariant = primaryRow?.querySelector(".variant-select")?.value || "";
      renderProductIcon(iconSpecForVariant(primaryVariant), icon);
    };

    const updateRowIcon = (row) => {
      if (!supportsVariantIcons || !row) {
        return;
      }
      const rowIcon = row.querySelector(".product-card__row-icon");
      if (!rowIcon) {
        return;
      }
      const variant = row.querySelector(".variant-select")?.value || "";
      renderProductIcon(iconSpecForVariant(variant), rowIcon);
    };

    const normalizeVariantKey = (value) => {
      const trimmed = String(value ?? "").trim();
      if (!trimmed) {
        return "";
      }
      const lowered = trimmed
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      return lowered === "normal" || lowered === "comun" ? "" : trimmed;
    };

    const normalizeLabelKey = (value) =>
      String(value || "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

    const getTomateUnitOptions = () => {
      const source = Array.isArray(product.units) ? product.units : [];
      if (!isTomateProduct) {
        return source;
      }
      const byKey = new Map();
      source.forEach((unit) => {
        const key = normalizeLabelKey(unit);
        if (key && !byKey.has(key)) {
          byKey.set(key, unit);
        }
      });
      if (!byKey.has("kg")) {
        byKey.set("kg", "Kg");
      }
      const ordered = [byKey.get("kg")].filter(Boolean);
      source.forEach((unit) => {
        const key = normalizeLabelKey(unit);
        if (key !== "kg" && unit && !ordered.includes(unit)) {
          ordered.push(unit);
        }
      });
      return ordered;
    };

    const getZapalloUnitOptions = () => {
      if (!isZapalloProduct) {
        return Array.isArray(product.units) ? product.units : [];
      }
      const source = Array.isArray(product.units) ? product.units : [];
      const byKey = new Map();
      source.forEach((unit) => {
        const key = normalizeLabelKey(unit);
        if (key && !byKey.has(key)) {
          byKey.set(key, unit);
        }
      });
      if (!byKey.has("kg")) {
        byKey.set("kg", "Kg");
      }
      if (!byKey.has("entero")) {
        byKey.set("entero", "Entero");
      }
      const orderedKeys = ["kg", "entero"];
      return orderedKeys.map((key) => byKey.get(key)).filter(Boolean);
    };

    const getZapalloVariantOptions = () => {
      const source = Array.isArray(product.variants) ? product.variants : [];
      const byKey = new Map();
      source.forEach((variant) => {
        const key = normalizeLabelKey(variant);
        if (key && !byKey.has(key)) {
          byKey.set(key, variant);
        }
      });
      if (!byKey.has("amarillo")) {
        byKey.set("amarillo", "Amarillo");
      }
      if (!byKey.has("negro")) {
        byKey.set("negro", "Negro");
      }
      return [byKey.get("amarillo"), byKey.get("negro")].filter(Boolean);
    };

    const hasValidCombo = (unit, variantLabel) => {
      if (!product?.comboSet || !(product.comboSet instanceof Set)) {
        return true;
      }
      const normalizedUnit = String(unit || "").trim();
      if (!normalizedUnit) {
        return true;
      }
      const normalizedVariant = normalizeVariantKey(variantLabel);
      return product.comboSet.has(`${normalizedUnit}__${normalizedVariant}`);
    };

    const updateComboWarningVisibility = () => {
      if (!comboWarning) {
        return;
      }
      const rows = Array.from(rowsContainer.querySelectorAll(".variant-row"));
      const hasInvalid = rows.some((row) => {
        const unitSelect = row.querySelector(".unit-select");
        const unitValue = row.querySelector(".unit-value");
        const variantSelect = row.querySelector(".variant-select");
        const selectedUnit = unitSelect ? unitSelect.value : unitValue?.textContent?.trim() || "";
        const selectedVariant = variantSelect ? variantSelect.value : "";
        const variantRequired =
          Boolean(product.variants.length) && !(variantSelect && variantSelect.disabled);
        const hasSelections = selectedUnit && (!variantRequired || selectedVariant);
        if (!hasSelections) {
          return false;
        }
        return !hasValidCombo(selectedUnit, selectedVariant);
      });
      comboWarning.classList.toggle("hidden", !hasInvalid);
    };

    const getAllowedUnitsForVariant = (variantLabel) => {
      if (isZapalloProduct) {
        return getZapalloUnitOptions();
      }
      if (isTomateProduct) {
        const tomatoUnits = getTomateUnitOptions();
        if (!product?.comboSet || !(product.comboSet instanceof Set)) {
          return tomatoUnits;
        }
        if (!String(variantLabel || "").trim()) {
          return tomatoUnits;
        }
        const variantKey = normalizeVariantKey(variantLabel);
        const units = tomatoUnits.filter((unit) => product.comboSet.has(`${unit}__${variantKey}`));
        return units.length ? units : tomatoUnits;
      }
      if (!product?.comboSet || !(product.comboSet instanceof Set)) {
        return product.units;
      }
      if (!String(variantLabel || "").trim()) {
        return product.units;
      }
      const variantKey = normalizeVariantKey(variantLabel);
      const units = (Array.isArray(product.units) ? product.units : []).filter((unit) =>
        product.comboSet.has(`${unit}__${variantKey}`)
      );
      return units.length ? units : product.units;
    };

    const getAllowedVariantLabelsForUnit = (unit) => {
      if (isZapalloProduct) {
        const selectedUnitKey = normalizeLabelKey(unit);
        if (!selectedUnitKey || selectedUnitKey === "kg") {
          return getZapalloVariantOptions();
        }
        if (selectedUnitKey === "entero") {
          return [];
        }
        return getZapalloVariantOptions();
      }
      if (!product?.comboIndex || !unit) {
        return product.variants;
      }
      const keys = Array.isArray(product.comboIndex[unit]) ? product.comboIndex[unit] : [];
      if (!keys.length) {
        return product.variants;
      }
      const labelByKey = product.variantLabelByKey || {};
      const labels = keys
        .map((key) => labelByKey[key] || (key === "" ? "Común" : key))
        .filter(Boolean);
      const ordered = product.variants.filter((label) => labels.includes(label));
      return ordered.length ? ordered : labels;
    };

    const rebuildSelect = (select, options, selected) => {
      if (!select) {
        return;
      }
      const placeholder = select.querySelector('option[value=""]');
      select.innerHTML = "";
      if (placeholder) {
        select.appendChild(placeholder);
      } else {
        const option = document.createElement("option");
        option.value = "";
        option.disabled = true;
        option.textContent = select.classList.contains("unit-select")
          ? "Seleccione una unidad"
          : "Seleccione una variante";
        select.appendChild(option);
      }
      (options || []).forEach((value) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        select.appendChild(option);
      });
      const hasSelected = selected && Array.from(select.options).some((o) => o.value === selected);
      if (hasSelected) {
        select.value = selected;
        return;
      }
      select.selectedIndex = 0;
    };

    const buildUnitSelect = (selected, allowedUnits = null) => {
      const unitSelect = document.createElement("select");
      unitSelect.className = "unit-select";
      unitSelect.innerHTML = '<option value="" disabled>Seleccione una unidad</option>';
      (allowedUnits || product.units).forEach((unit) => {
        const option = document.createElement("option");
        option.value = unit;
        option.textContent = unit;
        if (selected && selected === unit) {
          option.selected = true;
        }
        unitSelect.appendChild(option);
      });
      if (!selected) {
        unitSelect.selectedIndex = 0;
      }
      return unitSelect;
    };

    const buildVariantSelect = (selected, allowedVariants = null) => {
      if (!product.variants.length) {
        return null;
      }
      const variantSelect = document.createElement("select");
      variantSelect.className = "variant-select";
      variantSelect.innerHTML = '<option value="" disabled>Seleccione una variante</option>';
      const selectedValue = selected || "";
      (allowedVariants || product.variants).forEach((variant) => {
        const option = document.createElement("option");
        option.value = variant;
        option.textContent = variant;
        if (selectedValue && selectedValue === variant) {
          option.selected = true;
        }
        variantSelect.appendChild(option);
      });
      if (!selectedValue) {
        variantSelect.selectedIndex = 0;
      }
      return variantSelect;
    };

    const addRowButton = document.createElement("button");
    addRowButton.type = "button";
    addRowButton.className = "row-add";
    addRowButton.textContent = "Agregar variedad";
    addRowButton.addEventListener("click", () => addRow());

    const placeAddButton = () => {
      if (!product.variants.length) {
        return;
      }
      const rows = Array.from(rowsContainer.querySelectorAll(".variant-row"));
      const lastRow = rows[rows.length - 1];
      const actions = lastRow?.querySelector(".row-actions");
      if (actions && !actions.contains(addRowButton)) {
        actions.appendChild(addRowButton);
      }
    };

    const addRow = (preset = {}) => {
      const rowId = createRowId();
      const row = document.createElement("div");
      row.className = "variant-row";
      row.dataset.rowId = rowId;

      const isFirstVariantRow =
        product.variants.length && rowsContainer.querySelectorAll(".variant-row").length === 0;
      if (isFirstVariantRow) {
        card.dataset.primaryRowId = rowId;
      }

      const effectivePreset = { ...preset };
      const isSingleUnit = isZapalloProduct ? false : product.units.length === 1;
      const fixedUnit = product.units[0] || product.defaultUnit || "";
      const normalizedProductName = product.name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      if (!effectivePreset.variant && product.variants.length) {
        const selectedVariants = Array.from(rowsContainer.querySelectorAll(".variant-select"))
          .map((select) => select.value)
          .filter(Boolean);
        if (!selectedVariants.length) {
          // En la primera fila no fijar variante automáticamente para no filtrar
          // prematuramente las unidades disponibles (ej. Tomate Kg).
          // La combinación se valida cuando el usuario completa unidad/variante.
        } else {
        const assumedUnit = effectivePreset.unit || product.defaultUnit || product.units[0] || "";
        const allowedForUnit = getAllowedVariantLabelsForUnit(assumedUnit);
        const remaining = allowedForUnit.filter((variant) => !selectedVariants.includes(variant));
        if (remaining.length === 1) {
          effectivePreset.variant = remaining[0];
        }
        }
      }

      const unitField = document.createElement("div");
      unitField.className = "product-card__field";
      const allowedUnitsInitial =
        product.variants.length && effectivePreset.variant
          ? getAllowedUnitsForVariant(effectivePreset.variant)
          : null;
      const unitOptions = isZapalloProduct
        ? getZapalloUnitOptions()
        : isTomateProduct
          ? getTomateUnitOptions()
          : product.units;
      const initialUnitSelection =
        effectivePreset.unit || (isSingleUnit ? fixedUnit : "");
      const unitSelect = isSingleUnit
        ? null
        : buildUnitSelect(initialUnitSelection, allowedUnitsInitial || unitOptions);
      const allowUnitMode = unitModeProducts.has(normalizedProductName);
      const unitModeToggle = allowUnitMode ? document.createElement("input") : null;
      if (unitModeToggle) {
        unitModeToggle.type = "checkbox";
        unitModeToggle.className = "unit-mode-toggle";
      }
      const unitLabel = document.createElement("label");
      unitLabel.className = "unit-label";
      const unitLabelText = document.createElement("span");
      unitLabelText.textContent = "Unidad";
      const unitLabelRight = document.createElement("span");
      unitLabelRight.className = "unit-label__right";
      if (unitModeToggle) {
        unitLabelRight.appendChild(unitModeToggle);
      }

      const rowIcon = document.createElement("span");
      rowIcon.className = "product-card__row-icon";
      rowIcon.setAttribute("aria-hidden", "true");
      if (product.variants.length) {
        const isFirstVariantRow = rowsContainer.querySelectorAll(".variant-row").length === 0;
        if (!isFirstVariantRow) {
          const comboStar = buildComboStar(rowId);
          unitLabelRight.appendChild(comboStar);
          if (supportsVariantIcons) {
            unitLabelRight.appendChild(rowIcon);
          }
        }
      }
      unitLabel.appendChild(unitLabelText);
      unitLabel.appendChild(unitLabelRight);
      if (unitSelect) {
        unitField.appendChild(unitLabel);
        unitField.appendChild(unitSelect);
      } else {
        const unitValue = document.createElement("div");
        unitValue.className = "unit-value";
        unitValue.textContent = fixedUnit;
        if (unitModeToggle) {
          unitField.appendChild(unitLabel);
        }
        unitField.appendChild(unitValue);
      }

      let variantField = null;
      let variantSelect = null;
      if (product.variants.length) {
        variantField = document.createElement("div");
        variantField.className = "product-card__field";
        const variantLabel = document.createElement("label");
        variantLabel.textContent = "Variante";
        const initialUnit = unitSelect ? unitSelect.value : fixedUnit;
        const allowedVariantsInitial = initialUnit ? getAllowedVariantLabelsForUnit(initialUnit) : null;
        const initialVariantSelection = effectivePreset.variant || "";
        variantSelect = buildVariantSelect(initialVariantSelection, allowedVariantsInitial);
        variantField.appendChild(variantLabel);
        variantField.appendChild(variantSelect);
      }

      const getQuantityStepForUnit = (unit) => {
        const normalized = String(unit || "").trim().toLowerCase();
        if (normalized === "kg") {
          return "0.1";
        }
        if (normalized === "docena") {
          return "0.25";
        }
        if (normalized === "jaula" || normalized === "jaula grande") {
          return "0.25";
        }
        if (normalized === "bolsa") {
          return "0.25";
        }
        return "1";
      };

      const updateQuantityStep = () => {
        const isUnitMode = Boolean(unitModeToggle && unitModeToggle.checked);
        if (isUnitMode) {
          return;
        }
        const currentUnit = unitSelect ? unitSelect.value : fixedUnit;
        quantityInput.step = getQuantityStepForUnit(currentUnit);
      };

      const syncComboConstraints = (source) => {
        if (!product?.comboSet || !(product.comboSet instanceof Set)) {
          if (isZapalloProduct && unitSelect && variantSelect) {
            const unitOptions = getZapalloUnitOptions();
            const currentUnit = unitSelect.value;
            rebuildSelect(unitSelect, unitOptions, currentUnit);

            const unitKey = normalizeLabelKey(unitSelect.value);
            const disableVariant = unitKey === "entero";
            const variantOptions = getAllowedVariantLabelsForUnit(unitSelect.value);
            const desiredVariant = disableVariant ? "" : variantSelect.value;
            rebuildSelect(variantSelect, variantOptions, desiredVariant);
            variantSelect.disabled = disableVariant;
            if (disableVariant) {
              updateItemState(rowId, { variant: "" });
            }
          }
          updateComboWarningVisibility();
          return;
        }
        if (isZapalloProduct) {
          if (unitSelect && variantSelect) {
            const unitOptions = getZapalloUnitOptions();
            const currentUnit = unitSelect.value;
            rebuildSelect(unitSelect, unitOptions, currentUnit);

            const unitKey = normalizeLabelKey(unitSelect.value);
            const disableVariant = unitKey === "entero";
            const variantOptions = getAllowedVariantLabelsForUnit(unitSelect.value);
            const desiredVariant = disableVariant ? "" : variantSelect.value;
            rebuildSelect(variantSelect, variantOptions, desiredVariant);
            variantSelect.disabled = disableVariant;
            if (disableVariant) {
              updateItemState(rowId, { variant: "" });
            }
          }
          updateHeaderIconFromPrimaryVariant();
          updateRowIcon(row);
          updateQuantityStep();
          updateComboWarningVisibility();
          return;
        }
        const currentUnit = unitSelect ? unitSelect.value : fixedUnit;
        const currentVariant = variantSelect ? variantSelect.value : "";

        if (source === "variant" && unitSelect && variantSelect) {
          const preferredVariant = variantSelect.value || currentVariant;
          const allowedUnitsByVariant = getAllowedUnitsForVariant(preferredVariant);
          const desiredUnitByVariant = allowedUnitsByVariant.includes(unitSelect.value)
            ? unitSelect.value
            : allowedUnitsByVariant[0] || product.defaultUnit || "";
          rebuildSelect(unitSelect, allowedUnitsByVariant, desiredUnitByVariant);

          const allowedVariantsByUnit = getAllowedVariantLabelsForUnit(unitSelect.value || fixedUnit);
          const desiredVariantByUnit = allowedVariantsByUnit.includes(preferredVariant)
            ? preferredVariant
            : allowedVariantsByUnit[0] || "";
          rebuildSelect(variantSelect, allowedVariantsByUnit, desiredVariantByUnit);

          updateHeaderIconFromPrimaryVariant();
          updateRowIcon(row);
          updateQuantityStep();
          updateComboWarningVisibility();
          return;
        }

        if (variantSelect) {
          const allowedVariants = getAllowedVariantLabelsForUnit(currentUnit);
          const desiredVariant = allowedVariants.includes(currentVariant)
            ? currentVariant
            : allowedVariants[0] || "";
          rebuildSelect(variantSelect, allowedVariants, desiredVariant);
        }

        if (unitSelect) {
          const desiredVariant = variantSelect ? variantSelect.value : currentVariant;
          const allowedUnits = getAllowedUnitsForVariant(desiredVariant);
          const desiredUnit = allowedUnits.includes(unitSelect.value)
            ? unitSelect.value
            : allowedUnits[0] || product.defaultUnit || "";
          rebuildSelect(unitSelect, allowedUnits, desiredUnit);
        }

        if (source !== "init" && variantSelect) {
          const allowedVariants = getAllowedVariantLabelsForUnit(unitSelect ? unitSelect.value : fixedUnit);
          if (!allowedVariants.includes(variantSelect.value) && allowedVariants.length) {
            rebuildSelect(variantSelect, allowedVariants, allowedVariants[0]);
          }
        }

        updateHeaderIconFromPrimaryVariant();
        updateRowIcon(row);

        updateQuantityStep();
        updateComboWarningVisibility();
      };

      const quantityField = document.createElement("div");
      quantityField.className = "product-card__field";
      const quantityLabel = document.createElement("label");
      quantityLabel.textContent = "Cantidad";
      const quantityInput = document.createElement("input");
      quantityInput.className = "quantity-input";
      quantityInput.type = "number";
      quantityInput.min = "0";
      quantityInput.step = "1";
      quantityInput.placeholder = "0";
      quantityField.appendChild(quantityLabel);
      quantityField.appendChild(quantityInput);

      const normalizeDecimalSeparators = (input) => {
        const current = String(input?.value ?? "");
        if (!current.includes(",")) {
          return;
        }
        const start = input.selectionStart;
        const end = input.selectionEnd;
        input.value = current.replace(/,/g, ".");
        if (typeof start === "number" && typeof end === "number" && input.setSelectionRange) {
          input.setSelectionRange(start, end);
        }
      };

      if (unitSelect) {
        unitSelect.addEventListener("change", () => {
          syncComboConstraints("unit");
        });
      }
      if (variantSelect) {
        variantSelect.addEventListener("change", () => {
          syncComboConstraints("variant");
        });
      }

      syncComboConstraints("init");
      updateQuantityStep();

      const commentToggleWrap = document.createElement("div");
      commentToggleWrap.className = "comment-toggle";
      const commentToggle = document.createElement("input");
      commentToggle.type = "checkbox";
      commentToggle.className = "comment-toggle__input";
      const commentToggleLabel = document.createElement("span");
      commentToggleLabel.textContent = "Comentario";
      commentToggleWrap.appendChild(commentToggle);
      commentToggleWrap.appendChild(commentToggleLabel);

      const commentField = document.createElement("div");
      commentField.className = "product-card__field hidden";
      const commentLabel = document.createElement("label");
      commentLabel.textContent = "Comentario";
      const commentInput = document.createElement("input");
      commentInput.type = "text";
      commentInput.className = "comment-input";
      commentInput.placeholder = "Ej: bananas maduras";
      commentInput.disabled = true;
      commentField.appendChild(commentLabel);
      commentField.appendChild(commentInput);

      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.className = "row-remove";
      removeButton.textContent = "🗑️";
      removeButton.title = "Quitar";
      removeButton.style.display = "none";

      unitSelect?.addEventListener("change", (event) => {
        updateItemState(rowId, { unit: event.target.value });
        updateQuantityStep();
        updateFavoriteIndicators();
      });

      if (variantSelect) {
        variantSelect.addEventListener("change", (event) => {
          updateItemState(rowId, { variant: event.target.value });
          updateHeaderIconFromPrimaryVariant();
          updateRowIcon(row);
          updateFavoriteIndicators();
        });
      }

      const updateAddButtonVisibility = () => {
        if (!addRowButton) {
          return;
        }
        const anyQuantity = Array.from(productState.values()).some(
          (item) =>
            item.productId === product.id &&
            ((item.quantity && item.quantity > 0) || (item.unitMode && item.quantityText))
        );
        addRowButton.style.display = anyQuantity ? "inline-flex" : "none";
      };

      const updateRemoveVisibility = () => {
        const hasQuantity = Number(quantityInput.value) > 0;
        const hasUnitText = unitModeToggle && unitModeToggle.checked && Number(quantityInput.value) > 0;
        removeButton.style.display = hasQuantity || hasUnitText ? "inline-flex" : "none";
      };

      const getImportOrderFromRow = () => {
        const raw = row?.dataset?.importOrder;
        if (raw == null || String(raw).trim() === "") {
          return null;
        }
        const n = Number(raw);
        return Number.isFinite(n) ? n : null;
      };

      const setUnitMode = (isUnitMode) => {
        if (unitSelect) {
          unitSelect.disabled = isUnitMode;
        }
        if (isUnitMode) {
          quantityInput.type = "number";
          quantityInput.min = "0";
          quantityInput.step = "1";
          const current = Number(quantityInput.value);
          const next = Number.isFinite(current) && current > 0 ? current : 1;
          quantityInput.value = String(next);
          const importOrder = getImportOrderFromRow();
          updateItemState(rowId, {
            unitMode: true,
            quantity: next,
            quantityText: `${next} uni`,
            importOrder,
          });
        } else {
          quantityInput.type = "number";
          quantityInput.min = "0";
          updateQuantityStep();
          quantityInput.value = "";
          const importOrder = getImportOrderFromRow();
          updateItemState(rowId, { unitMode: false, quantityText: "", quantity: 0, importOrder });
        }
        updateAddButtonVisibility();
        updateRemoveVisibility();
      };

      unitModeToggle?.addEventListener("change", (event) => {
        setUnitMode(event.target.checked);
      });

      quantityInput.addEventListener("keydown", (event) => {
        if (event.key !== ",") {
          return;
        }
        event.preventDefault();
        const input = event.target;
        const current = String(input.value ?? "");
        const start = typeof input.selectionStart === "number" ? input.selectionStart : current.length;
        const end = typeof input.selectionEnd === "number" ? input.selectionEnd : current.length;
        const next = `${current.slice(0, start)}.${current.slice(end)}`;
        input.value = next;
        const caret = start + 1;
        if (input.setSelectionRange) {
          input.setSelectionRange(caret, caret);
        }
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });

      quantityInput.addEventListener("input", (event) => {
        normalizeDecimalSeparators(event.target);
        const raw = event.target.value;
        const numeric = Number(raw);
        const isUnitMode = Boolean(unitModeToggle && unitModeToggle.checked);
        const importOrder = getImportOrderFromRow();
        if (Number.isFinite(numeric)) {
          if (isUnitMode) {
            updateItemState(rowId, {
              unitMode: true,
              quantity: numeric,
              quantityText: numeric > 0 ? `${numeric} uni` : "",
              importOrder,
            });
          } else {
            updateItemState(rowId, { unitMode: false, quantity: numeric, quantityText: "", importOrder });
          }
        } else {
          updateItemState(rowId, { quantity: 0, quantityText: raw, importOrder });
        }
        updateAddButtonVisibility();
        updateRemoveVisibility();
        scheduleMasonryUpdate();
      });

      commentToggle.addEventListener("change", (event) => {
        const enabled = event.target.checked;
        commentInput.disabled = !enabled;
        commentField.classList.toggle("hidden", !enabled);
        if (!enabled) {
          commentInput.value = "";
          updateItemState(rowId, { comment: "" });
        }
      });

      commentInput.addEventListener("input", (event) => {
        updateItemState(rowId, { comment: event.target.value });
      });

      removeButton.addEventListener("click", () => {
        productState.delete(rowId);
        row.remove();
        renderSummary();
        scheduleAnchoredCardsUpdate({ immediate: true });
        updateFavoriteIndicators();
        updateComboWarningVisibility();
        placeAddButton();
        updateAddButtonVisibility();
        updateHeaderIconFromPrimaryVariant();
        scheduleMasonryUpdate();
      });

      row.appendChild(unitField);
      if (variantField) {
        row.appendChild(variantField);
      }
      row.appendChild(quantityField);
      row.appendChild(commentToggleWrap);
      row.appendChild(commentField);
      if (product.variants.length) {
        const actionsWrap = document.createElement("div");
        actionsWrap.className = "row-actions";
        actionsWrap.appendChild(removeButton);
        row.appendChild(actionsWrap);
      }

      rowsContainer.appendChild(row);

      updateItemState(rowId, {
        productId: product.id,
        productName: product.name,
        unit: unitSelect ? unitSelect.value : fixedUnit || "",
        variant: variantSelect ? variantSelect.value : "",
        hasVariants: Boolean(product.variants.length),
        quantity: 0,
        quantityText: "",
        unitMode: false,
        comment: "",
      });

      updateAddButtonVisibility();
      updateRemoveVisibility();
      placeAddButton();
      scheduleMasonryUpdate();
      updateHeaderIconFromPrimaryVariant();
      updateRowIcon(row);
      updateComboWarningVisibility();
      updateFavoriteIndicators();
    };

    card.__addRow = addRow;

    card.appendChild(titleRow);
    card.appendChild(rowsContainer);
    card.appendChild(comboWarning);
    if (product.variants.length) {
      addRowButton.style.display = "none";
    }

    const favoritePresets = getFavoritePresets(product.id);
    if (favoritePresets.length) {
      favoritePresets.forEach((preset) => addRow(preset));
    } else {
      addRow();
    }

    return card;
  };

  return { buildProductCard };
};
