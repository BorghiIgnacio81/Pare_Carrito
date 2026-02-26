export const createCatalogController = ({
  itemsContainer,
  catalogSearch,
  orderSelect,
  orderDirection,
  uncategorizedContent,
  getProducts,
  productState,
  cardByProductId,
  buildProductCard,
  scheduleCoverageUpdate,
  scheduleMasonryUpdate,
  updateFavoriteIndicators,
  getFavoriteMeta,
}) => {
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

    if (cardByProductId.size === 0) {
      itemsContainer.innerHTML = "";
      ordered.forEach(({ product }) => {
        const card = buildProductCard(product);
        cardByProductId.set(product.id, card);
        itemsContainer.appendChild(card);
      });
      scheduleMasonryUpdate();
      return;
    }

    ordered.forEach(({ product }) => {
      const card = cardByProductId.get(product.id);
      if (card) {
        itemsContainer.appendChild(card);
      }
    });
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
    const cards = itemsContainer.querySelectorAll(".product-card");
    cards.forEach((card) => {
      const search = card.dataset.search || "";
      card.style.display = !term || search.includes(term) ? "grid" : "none";
    });
    scheduleCoverageUpdate();
    scheduleMasonryUpdate();
  };

  const init = () => {
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
