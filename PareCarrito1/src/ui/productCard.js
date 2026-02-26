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

    const getAllowedUnitsForVariant = (variantLabel) => {
      if (!product?.comboSet || !(product.comboSet instanceof Set)) {
        return product.units;
      }
      const variantKey = normalizeVariantKey(variantLabel);
      const units = (Array.isArray(product.units) ? product.units : []).filter((unit) =>
        product.comboSet.has(`${unit}__${variantKey}`)
      );
      return units.length ? units : product.units;
    };

    const getAllowedVariantLabelsForUnit = (unit) => {
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
      const isSingleUnit = product.units.length === 1;
      const fixedUnit = product.units[0] || product.defaultUnit || "";
      const normalizedProductName = product.name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      if (!effectivePreset.variant && product.variants.length) {
        const selectedVariants = Array.from(rowsContainer.querySelectorAll(".variant-select"))
          .map((select) => select.value)
          .filter(Boolean);
        const assumedUnit = effectivePreset.unit || product.defaultUnit || product.units[0] || "";
        const allowedForUnit = getAllowedVariantLabelsForUnit(assumedUnit);
        const remaining = allowedForUnit.filter((variant) => !selectedVariants.includes(variant));
        if (remaining.length === 1) {
          effectivePreset.variant = remaining[0];
        }
      }

      const unitField = document.createElement("div");
      unitField.className = "product-card__field";
      const allowedUnitsInitial =
        product.variants.length && effectivePreset.variant
          ? getAllowedUnitsForVariant(effectivePreset.variant)
          : null;
      const unitSelect = isSingleUnit
        ? null
        : buildUnitSelect(effectivePreset.unit || product.defaultUnit, allowedUnitsInitial);
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
        variantSelect = buildVariantSelect(
          effectivePreset.variant || product.defaultVariant || "",
          allowedVariantsInitial
        );
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
          return;
        }
        const currentUnit = unitSelect ? unitSelect.value : fixedUnit;
        const currentVariant = variantSelect ? variantSelect.value : "";
