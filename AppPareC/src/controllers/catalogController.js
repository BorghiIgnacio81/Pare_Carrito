export const createCatalogController = ({
  itemsContainer,
  catalogSearch,
  pedidoTitle,
  toggleGridViewButton,
  orderSelect,
  orderDirection,
  uncategorizedContent,
  getProducts,
  productState,
  cardByProductId,
  buildProductCard,
  createRowId,
  updateItemState,
  isUnitModeForced,
  coerceUnitForProduct,
  coerceVariantForProduct,
  scheduleCoverageUpdate,
  scheduleMasonryUpdate,
  updateFavoriteIndicators,
  getFavoriteMeta,
  getFavoritePresets,
  unitModeProducts,
}) => {
  let currentView = "catalog";

  const applyViewUi = () => {
    if (pedidoTitle) {
      pedidoTitle.textContent = currentView === "grid" ? "Cargar Pedido" : "Productos del pedido";
    }
    if (toggleGridViewButton) {
      toggleGridViewButton.textContent =
        currentView === "grid" ? "Cambiar Vista Catalogo" : "Cambiar Vista Grilla";
    }
  };

  const toCategoryKey = (value) =>
    String(value || "Otros")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  const parseQtyToNumber = (value) => {
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

  const getStateEntriesForProduct = (productId) => {
    const rows = Array.from(productState.values()).filter(
      (item) => String(item?.productId || "") === String(productId || "")
    );
    if (!rows.length) {
      return [];
    }
    return rows.sort((a, b) => {
      const aGrid = String(a?.rowId || "").startsWith(`grid_${productId}`) ? 0 : 1;
      const bGrid = String(b?.rowId || "").startsWith(`grid_${productId}`) ? 0 : 1;
      if (aGrid !== bGrid) {
        return aGrid - bGrid;
      }
      return String(a?.rowId || "").localeCompare(String(b?.rowId || ""));
    });
  };

  const ensureBaseStateForProduct = (product, existing) => {
    const hasActiveData =
      (Number(existing?.quantity) || 0) > 0 ||
      Boolean(String(existing?.quantityText || "").trim()) ||
      Boolean(String(existing?.comment || "").trim());

    const favoritePresetRaw =
      typeof getFavoritePresets === "function"
        ? (getFavoritePresets(String(product?.id || ""), "") || [])[0]
        : null;
    const favoritePreset =
      favoritePresetRaw && typeof favoritePresetRaw === "object"
        ? {
            unit: String(favoritePresetRaw.unit || "").trim(),
            variant: String(favoritePresetRaw.variant || "").trim(),
          }
        : null;

    const existingUnit = String(existing?.unit || "").trim();
    const existingVariant = String(existing?.variant || "").trim();
    const unitTouched = Boolean(existing?.unitTouched);
    const variantTouched = Boolean(existing?.variantTouched);

    const preferredUnit =
      !hasActiveData && !unitTouched && favoritePreset?.unit
        ? favoritePreset.unit
        : existingUnit;
    const preferredVariant =
      !hasActiveData && !variantTouched && favoritePreset?.variant
        ? favoritePreset.variant
        : existingVariant;

    const fallbackRowId = `grid_${String(product?.id || "")}`;
    const rowId = String(existing?.rowId || "").trim() || fallbackRowId || createRowId?.();
    const unit =
      typeof coerceUnitForProduct === "function"
        ? coerceUnitForProduct(product, preferredUnit)
        : String(preferredUnit || product?.defaultUnit || product?.units?.[0] || "").trim();
    const variant =
      typeof coerceVariantForProduct === "function"
        ? coerceVariantForProduct(product, preferredVariant)
        : String(preferredVariant || product?.defaultVariant || product?.variants?.[0] || "").trim();

    return {
      rowId,
      productId: String(product?.id || ""),
      productName: String(product?.name || ""),
      unit,
      variant,
      hasVariants: Boolean(Array.isArray(product?.variants) && product.variants.length),
      quantity: Number(existing?.quantity) || 0,
      quantityText: String(existing?.quantityText || "").trim(),
      unitMode: Boolean(existing?.unitMode),
      comment: String(existing?.comment || "").trim(),
      unitTouched,
      variantTouched,
    };
  };

  const ensureCardInstances = (orderedEntries) => {
    if (!itemsContainer) {
      return;
    }
    const list = Array.isArray(orderedEntries) ? orderedEntries : [];
    list.forEach(({ product }) => {
      if (!product || cardByProductId.has(product.id)) {
        return;
      }
      const card = buildProductCard(product);
      cardByProductId.set(product.id, card);
    });
  };

  const renderClassicCatalog = (orderedEntries) => {
    itemsContainer.classList.remove("product-grid--categorical");
    itemsContainer.innerHTML = "";
    (Array.isArray(orderedEntries) ? orderedEntries : []).forEach(({ product }) => {
      const card = cardByProductId.get(product.id);
      if (card) {
        itemsContainer.appendChild(card);
      }
    });
  };

  const createGridColumn = (title, className = "") => {
    const column = document.createElement("section");
    column.className = `product-grid-view__column${className ? ` ${className}` : ""}`;

    const heading = document.createElement("h3");
    heading.className = "product-grid-view__column-title";
    heading.textContent = title;

    const body = document.createElement("div");
    body.className = "product-grid-view__column-body";

    column.appendChild(heading);
    column.appendChild(body);
    return { column, body };
  };

  const getCombinationCount = (product) => {
    if (product?.comboSet instanceof Set) {
      return product.comboSet.size;
    }
    const units = Array.isArray(product?.units) ? product.units.filter(Boolean) : [];
    const variants = Array.isArray(product?.variants) ? product.variants.filter(Boolean) : [];
    if (variants.length) {
      return Math.max(1, units.length) * variants.length;
    }
    return Math.max(1, units.length);
  };

  const buildCompactTable = ({
    products,
    tableClassName = "",
    includeUnitColumn = true,
    forceKgForPorotos = false,
  }) => {
    const table = document.createElement("table");
    table.className = `grid-table${tableClassName ? ` ${tableClassName}` : ""}`;

    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    const headers = includeUnitColumn
      ? ["Producto", "Unidad", "Variedad", "", "Cant", "Uni", "Com"]
      : ["Producto", "Variedad", "", "Cant", "Uni", "Com"];
    headers.forEach((label) => {
      const th = document.createElement("th");
      th.textContent = label;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    const renderProductRow = ({ product, state }) => {
      const forcedUnitMode = typeof isUnitModeForced === "function" ? isUnitModeForced(product.id) : false;
      const normalizedProductName = String(product?.name || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
      const allowUnitMode =
        unitModeProducts instanceof Set ? unitModeProducts.has(normalizedProductName) : false;
      const unitMode = forcedUnitMode ? true : allowUnitMode ? Boolean(state?.unitMode) : false;
      const rowId = String(state?.rowId || `grid_${String(product?.id || "")}`).trim();
      const effectiveLockedUnit =
        !includeUnitColumn && forceKgForPorotos && String(product?.id || "").toLowerCase() === "porotos"
          ? "Kg"
          : String(state?.unit || "").trim();

      const tr = document.createElement("tr");
      tr.className = "grid-table__row";
      tr.dataset.search = `${String(product?.name || "")} ${(product?.variants || []).join(" ")}`.toLowerCase();
      tr.dataset.category = toCategoryKey(product?.category);
      tr.dataset.rowId = rowId;

      const categorySlug = String(product?.category || "otros").toLowerCase().replace(/\s+/g, "-");
      tr.classList.add(`grid-table__row--${categorySlug}`);

      const commit = (updates = {}) => {
        const current = ensureBaseStateForProduct(product, productState.get(rowId) || state);
        const merged = { ...current, ...updates };
        if (!includeUnitColumn && effectiveLockedUnit) {
          merged.unit = effectiveLockedUnit;
        }
        if (merged.unitMode) {
          const qtyText = String(merged.quantityText || "").trim();
          merged.quantityText = qtyText;
          merged.quantity = parseQtyToNumber(qtyText);
        } else {
          const qtyNum = Number(merged.quantity);
          merged.quantity = Number.isFinite(qtyNum) && qtyNum > 0 ? qtyNum : 0;
          if (Object.prototype.hasOwnProperty.call(updates, "quantityText") && !updates.quantityText) {
            merged.quantityText = "";
          }
        }
        updateItemState?.(rowId, merged);
      };

      const tdProduct = document.createElement("td");
      tdProduct.className = "grid-table__product";
      const productText = document.createElement("span");
      productText.textContent = String(product?.name || "");
      tdProduct.appendChild(productText);

      const favoriteMeta = getFavoriteMeta(product.id);
      const favoriteCount = Number(favoriteMeta?.count) || 0;
      if (favoriteCount > 0) {
        const favoriteBadge = document.createElement("span");
        favoriteBadge.className = "grid-table__favorite";
        favoriteBadge.textContent = "★";
        favoriteBadge.title =
          favoriteCount > 1
            ? `Favorito del cliente (${favoriteCount})`
            : "Favorito del cliente";
        tdProduct.appendChild(favoriteBadge);
      }

      const tdUnit = document.createElement("td");
      const favoriteUnitSet = new Set(
        ((typeof getFavoritePresets === "function" ? getFavoritePresets(product.id, "") : []) || [])
          .map((preset) => String(preset?.unit || "").trim())
          .filter(Boolean)
      );
      const units = Array.isArray(product?.units) ? product.units.filter(Boolean) : [];
      const finalUnits = units.length ? units : [state.unit || "Unidad"];
      let selectedUnit = String(state?.unit || "").trim();
      if (!selectedUnit) {
        selectedUnit = String(finalUnits[0] || "Unidad").trim();
      }
      if (finalUnits.length <= 1) {
        const staticUnit = document.createElement("span");
        staticUnit.className = "grid-table__static-text";
        staticUnit.textContent = selectedUnit || "";
        tdUnit.appendChild(staticUnit);
      } else {
        const unitSelect = document.createElement("select");
        unitSelect.className = "grid-table__control";
        finalUnits.forEach((unitName) => {
          const option = document.createElement("option");
          option.value = unitName;
          option.textContent = favoriteUnitSet.has(unitName) ? `★ ${unitName}` : unitName;
          if (selectedUnit === unitName) {
            option.selected = true;
          }
          unitSelect.appendChild(option);
        });
        unitSelect.addEventListener("change", () => {
          commit({ unit: unitSelect.value, unitTouched: true });
        });
        tdUnit.appendChild(unitSelect);
      }

      const tdVariant = document.createElement("td");
      const variants = Array.isArray(product?.variants) ? product.variants.filter(Boolean) : [];
      const favoriteVariant =
        typeof getFavoritePresets === "function"
          ? String((getFavoritePresets(product.id, "")?.[0]?.variant || "")).trim()
          : "";
      if (!variants.length) {
        const staticVariant = document.createElement("span");
        staticVariant.className = "grid-table__static-text";
        staticVariant.textContent = "";
        tdVariant.appendChild(staticVariant);
      } else {
        const variantSelect = document.createElement("select");
        variantSelect.className = "grid-table__control";
        variants.forEach((variantName) => {
          const option = document.createElement("option");
          option.value = variantName;
          option.textContent =
            favoriteVariant && String(favoriteVariant) === String(variantName)
              ? `★ ${variantName}`
              : variantName;
          if (String(state?.variant || "") === variantName) {
            option.selected = true;
          }
          variantSelect.appendChild(option);
        });
        variantSelect.addEventListener("change", () => {
          commit({ variant: variantSelect.value, variantTouched: true });
        });
        tdVariant.appendChild(variantSelect);
      }

      const tdAddVariant = document.createElement("td");
      const canAddVariant = getCombinationCount(product) > 1;
      if (canAddVariant) {
        const addVariantButton = document.createElement("button");
        addVariantButton.type = "button";
        addVariantButton.className = "grid-table__add-variant";
        addVariantButton.textContent = "+";
        addVariantButton.title = "Agregar variedad";
        addVariantButton.setAttribute("aria-label", "Agregar variedad");
        addVariantButton.addEventListener("click", () => {
          const variants = Array.isArray(product?.variants) ? product.variants.filter(Boolean) : [];
          const existingRows = getStateEntriesForProduct(product.id);
          const used = new Set(existingRows.map((item) => String(item?.variant || "").trim()));
          const nextVariant =
            variants.find((variantName) => !used.has(String(variantName || "").trim())) ||
            variants[0] ||
            String(state?.variant || "").trim();

          const newRowId = createRowId?.() || `grid_${String(product?.id || "")}_${Date.now()}`;
          updateItemState?.(newRowId, {
            rowId: newRowId,
            productId: String(product?.id || ""),
            productName: String(product?.name || ""),
            unit: includeUnitColumn
              ? String((tdUnit.querySelector("select")?.value || state?.unit || "")).trim()
              : String(effectiveLockedUnit || state?.unit || "").trim(),
            variant: String(nextVariant || "").trim(),
            hasVariants: Boolean(Array.isArray(product?.variants) && product.variants.length),
            quantity: 0,
            quantityText: "",
            unitMode: false,
            comment: "",
          });
          renderProductGrid();
          filterCards();
        });
        tdAddVariant.appendChild(addVariantButton);
      }

      const tdQty = document.createElement("td");
      const qtyInput = document.createElement("input");
      qtyInput.type = "text";
      qtyInput.className = "grid-table__control grid-table__qty";
      qtyInput.maxLength = 4;
      qtyInput.value = unitMode ? String(state?.quantityText || "") : String(state?.quantity || "");
      qtyInput.addEventListener("input", () => {
        if (unitMode) {
          commit({ quantityText: qtyInput.value });
        } else {
          commit({ quantity: parseQtyToNumber(qtyInput.value) });
        }
      });
      tdQty.appendChild(qtyInput);

      const tdUnitMode = document.createElement("td");
      if (forcedUnitMode || !allowUnitMode) {
        tdUnitMode.textContent = "";
      } else {
        const unitModeCheckbox = document.createElement("input");
        unitModeCheckbox.type = "checkbox";
        unitModeCheckbox.checked = unitMode;
        unitModeCheckbox.addEventListener("change", () => {
          const rawQty = String(qtyInput.value || "").trim();
          const fallbackQty = rawQty || String(state?.quantity || "").trim();
          commit({
            unitMode: Boolean(unitModeCheckbox.checked),
            quantityText: unitModeCheckbox.checked ? fallbackQty : "",
            quantity: unitModeCheckbox.checked ? parseQtyToNumber(fallbackQty) : parseQtyToNumber(rawQty),
          });
        });
        tdUnitMode.appendChild(unitModeCheckbox);
      }

      const tdCommentEnabled = document.createElement("td");
      const commentEnabled = Boolean(state.comment);
      const commentCheckbox = document.createElement("input");
      commentCheckbox.type = "checkbox";
      commentCheckbox.checked = commentEnabled;
      commentCheckbox.className = "grid-table__comment-check";
      tdCommentEnabled.appendChild(commentCheckbox);
      const commentInput = document.createElement("input");
      commentInput.type = "text";
      commentInput.className = "grid-table__control grid-table__comment-input";
      commentInput.value = state.comment || "";
      commentInput.placeholder = "Comentario";
      commentInput.disabled = !commentEnabled;
      commentInput.classList.toggle("hidden", !commentEnabled);
      commentCheckbox.addEventListener("change", () => {
        const enabled = Boolean(commentCheckbox.checked);
        commentInput.disabled = !enabled;
        commentInput.classList.toggle("hidden", !enabled);
        if (!enabled) {
          commentInput.value = "";
          commit({ comment: "" });
        } else {
          commit({ comment: commentInput.value });
          commentInput.focus();
        }
      });
      commentInput.addEventListener("input", () => {
        commit({ comment: commentInput.value });
      });
      tdCommentEnabled.appendChild(commentInput);

      tr.appendChild(tdProduct);
      if (includeUnitColumn) {
        tr.appendChild(tdUnit);
      }
      tr.appendChild(tdVariant);
      tr.appendChild(tdAddVariant);
      tr.appendChild(tdQty);
      tr.appendChild(tdUnitMode);
      tr.appendChild(tdCommentEnabled);
      tbody.appendChild(tr);
    };

    (Array.isArray(products) ? products : []).forEach((product) => {
      const existingRows = getStateEntriesForProduct(product.id);
      if (!existingRows.length) {
        const base = ensureBaseStateForProduct(product, null);
        renderProductRow({ product, state: base });
        return;
      }
      existingRows.forEach((entry) => {
        const normalized = ensureBaseStateForProduct(product, entry);
        renderProductRow({ product, state: normalized });
      });
    });

    table.appendChild(tbody);
    return table;
  };

  const renderGroupedGrid = (orderedEntries) => {
    itemsContainer.classList.add("product-grid--categorical");
    itemsContainer.innerHTML = "";

    const root = document.createElement("div");
    root.className = "product-grid-view";

    const columnsRow = document.createElement("div");
    columnsRow.className = "product-grid-view__columns";

    const verduras = createGridColumn("Verduras");
    const frutas = createGridColumn("Frutas");
    const aromaticas = createGridColumn("Aromáticas / Frutos secos y granos");

    columnsRow.appendChild(verduras.column);
    columnsRow.appendChild(frutas.column);
    columnsRow.appendChild(aromaticas.column);

    const othersSection = document.createElement("section");
    othersSection.className = "product-grid-view__others";
    const othersTitle = document.createElement("h3");
    othersTitle.className = "product-grid-view__column-title";
    othersTitle.textContent = "Otros";
    const othersLanes = document.createElement("div");
    othersLanes.className = "product-grid-view__others-lanes";
    const laneA = document.createElement("div");
    laneA.className = "product-grid-view__column-body";
    const laneB = document.createElement("div");
    laneB.className = "product-grid-view__column-body";
    const laneC = document.createElement("div");
    laneC.className = "product-grid-view__column-body";
    othersLanes.appendChild(laneA);
    othersLanes.appendChild(laneB);
    othersLanes.appendChild(laneC);
    othersSection.appendChild(othersTitle);
    othersSection.appendChild(othersLanes);

    const verdurasProducts = [];
    const frutasProducts = [];
    const aromaticasProducts = [];
    const othersProducts = [];

    (Array.isArray(orderedEntries) ? orderedEntries : []).forEach(({ product }) => {
      const categoryKey = toCategoryKey(product?.category);
      if (categoryKey === "verduras") {
        verdurasProducts.push(product);
        return;
      }
      if (categoryKey === "frutas") {
        frutasProducts.push(product);
        return;
      }
      if (categoryKey === "aromaticas" || categoryKey === "frutos secos y granos") {
        aromaticasProducts.push(product);
        return;
      }
      othersProducts.push(product);
    });

    verduras.body.appendChild(buildCompactTable({ products: verdurasProducts, tableClassName: "grid-table--narrow-product" }));
    frutas.body.appendChild(buildCompactTable({ products: frutasProducts }));
    aromaticas.body.appendChild(
      buildCompactTable({
        products: aromaticasProducts,
        tableClassName: "grid-table--narrow-product grid-table--no-unit",
        includeUnitColumn: false,
        forceKgForPorotos: true,
      })
    );

    const lanes = [[], [], []];
    othersProducts.forEach((product, index) => {
      lanes[index % lanes.length].push(product);
    });
    laneA.appendChild(buildCompactTable({ products: lanes[0] }));
    laneB.appendChild(buildCompactTable({ products: lanes[1] }));
    laneC.appendChild(buildCompactTable({ products: lanes[2] }));

    root.appendChild(columnsRow);
    root.appendChild(othersSection);
    itemsContainer.appendChild(root);
  };

  const renderProductGrid = () => {
    const products = typeof getProducts === "function" ? getProducts() : [];

    const order = orderSelect?.value || "alpha";
    const isDesc = Boolean(orderDirection?.checked);
    const productsWithOrder = products.map((product) => {
      const rows = Array.from(productState.values()).filter(
        (item) =>
          item.productId === product.id &&
          ((item.quantity && item.quantity > 0) || (item.unitMode && item.quantityText))
      );
      const earliest = rows.length
        ? Math.min(...rows.map((item) => item.addedAt || Infinity))
        : Infinity;
      const favoriteMeta = getFavoriteMeta(product.id);
      const favoriteScore = favoriteMeta ? favoriteMeta.count + favoriteMeta.brightness : 0;
      return { product, earliest, hasActiveRows: rows.length > 0, favoriteScore };
    });

    if (order === "favorites") {
      productsWithOrder.sort((a, b) => {
        const aMeta = getFavoriteMeta(a.product.id);
        const bMeta = getFavoriteMeta(b.product.id);
        const aScore = aMeta ? aMeta.count + aMeta.brightness : 0;
        const bScore = bMeta ? bMeta.count + bMeta.brightness : 0;
        if (aScore !== bScore) {
          return bScore - aScore;
        }
        return a.product.name.localeCompare(b.product.name, "es");
      });
    } else if (order === "load") {
      productsWithOrder.sort((a, b) => {
        if (a.earliest === b.earliest) {
          return a.product.name.localeCompare(b.product.name, "es");
        }
        return a.earliest - b.earliest;
      });
    } else if (order === "category") {
      const categoryOrder = [
        "Verduras",
        "Frutas",
        "Aromaticas",
        "Frutos secos y granos",
        "Otros",
      ];
      productsWithOrder.sort((a, b) => {
        const aCat = categoryOrder.indexOf(a.product.category || "Otros");
        const bCat = categoryOrder.indexOf(b.product.category || "Otros");
        if (aCat !== bCat) {
          return aCat - bCat;
        }
        return a.product.name.localeCompare(b.product.name, "es");
      });
    } else {
      productsWithOrder.sort((a, b) => a.product.name.localeCompare(b.product.name, "es"));
    }

    if (isDesc) {
      productsWithOrder.reverse();
    }

    const pinned = productsWithOrder.filter((entry) => entry.hasActiveRows);
    const rest = productsWithOrder.filter((entry) => !entry.hasActiveRows);
    const ordered = pinned.concat(rest);

    ensureCardInstances(ordered);

    if (currentView === "grid") {
      renderGroupedGrid(ordered);
    } else {
      renderClassicCatalog(ordered);
    }

    scheduleCoverageUpdate();
    updateFavoriteIndicators();
    scheduleMasonryUpdate();
  };

  const renderUncategorized = () => {
    const products = typeof getProducts === "function" ? getProducts() : [];

    const uncategorized = products
      .filter((product) => !product.category)
      .map((product) => product.name)
      .sort((a, b) => a.localeCompare(b, "es"));

    if (!uncategorizedContent) {
      return;
    }

    if (!uncategorized.length) {
      uncategorizedContent.innerHTML = "<p>Todo categorizado.</p>";
      return;
    }

    const list = document.createElement("ul");
    uncategorized.forEach((name) => {
      const li = document.createElement("li");
      li.textContent = name;
      list.appendChild(li);
    });

    uncategorizedContent.innerHTML = "";
    uncategorizedContent.appendChild(list);
  };

  const filterCards = () => {
    if (!catalogSearch || !itemsContainer) {
      return;
    }
    const term = catalogSearch.value.trim().toLowerCase();
    itemsContainer.dataset.filtering = term ? "1" : "0";
    if (currentView === "grid") {
      const rows = itemsContainer.querySelectorAll(".grid-table__row");
      rows.forEach((row) => {
        const search = row.dataset.search || "";
        row.style.display = !term || search.includes(term) ? "" : "none";
      });
    } else {
      const cards = itemsContainer.querySelectorAll(".product-card");
      cards.forEach((card) => {
        const search = card.dataset.search || "";
        card.style.display = !term || search.includes(term) ? "grid" : "none";
      });
    }

    if (currentView === "grid") {
      const bodies = itemsContainer.querySelectorAll(".product-grid-view__column-body");
      bodies.forEach((body) => {
        const visibleRows = Array.from(body.querySelectorAll(".grid-table__row")).some(
          (row) => row.style.display !== "none"
        );
        const column = body.closest(".product-grid-view__column");
        if (column) {
          column.style.display = visibleRows ? "" : "none";
        }
      });
      const others = itemsContainer.querySelector(".product-grid-view__others");
      if (others) {
        const hasVisibleOthers = Array.from(others.querySelectorAll(".grid-table__row")).some(
          (row) => row.style.display !== "none"
        );
        others.style.display = hasVisibleOthers ? "" : "none";
      }
    }

    scheduleCoverageUpdate();
    scheduleMasonryUpdate();
  };

  const init = () => {
    applyViewUi();

    toggleGridViewButton?.addEventListener("click", () => {
      currentView = currentView === "grid" ? "catalog" : "grid";
      applyViewUi();
      renderProductGrid();
      filterCards();
    });

    catalogSearch?.addEventListener("input", filterCards);

    orderSelect?.addEventListener("change", () => {
      renderProductGrid();
      filterCards();
    });

    orderDirection?.addEventListener("change", () => {
      renderProductGrid();
      filterCards();
    });

    window.addEventListener("scroll", scheduleCoverageUpdate, { passive: true });
    window.addEventListener("resize", () => {
      scheduleCoverageUpdate();
      scheduleMasonryUpdate();
    });
  };

  return {
    init,
    renderProductGrid,
    renderUncategorized,
    filterCards,
  };
};
