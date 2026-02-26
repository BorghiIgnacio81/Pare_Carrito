export const createFavoritesIndicators = ({
  itemsContainer,
  clientSelect,
  productState,
  getFavoriteMeta,
  getFavoriteComboMeta,
}) => {
  const updateFavoriteIndicators = () => {
    const cards = itemsContainer.querySelectorAll(".product-card");
    cards.forEach((card) => {
      const productId = card.dataset.productId;

      const stars = Array.from(card.querySelectorAll(".favorite-star"));
      if (!stars.length || !productId || !clientSelect.value) {
        stars.forEach((s) => s.classList.remove("visible"));
        stars.forEach((s) => {
          const idx = s.querySelector(".favorite-star__index");
          if (idx) {
            idx.textContent = "";
            idx.classList.remove("visible", "two-digits", "three-digits");
          }
        });
        return;
      }

      const applyStarMeta = (star, meta) => {
        const index = star.querySelector(".favorite-star__index");
        if (!meta) {
          star.classList.remove("visible");
          if (index) {
            index.textContent = "";
            index.classList.remove("visible", "two-digits", "three-digits");
          }
          return;
        }

        star.classList.add("visible");
        const starOpacity = Math.max(0.25, meta.brightness);
        star.style.opacity = String(starOpacity);
        star.style.filter = `drop-shadow(0 0 ${Math.round(starOpacity * 6)}px #ffd36e)`;

        if (index) {
          const value = meta.orderIndex;
          if (Number.isFinite(value) && value > 0) {
            const label = String(value);
            index.textContent = label;
            index.classList.add("visible");
            index.classList.toggle("two-digits", label.length === 2);
            index.classList.toggle("three-digits", label.length >= 3);
          } else {
            index.textContent = "";
            index.classList.remove("visible", "two-digits", "three-digits");
          }
        }
      };

      stars.forEach((star) => {
        const scope = String(star.dataset.favoriteScope || "");
        if (scope === "combo") {
          const rowId = String(star.dataset.rowId || "");
          const item = rowId ? productState.get(rowId) : null;
          const meta = item ? getFavoriteComboMeta(productId, item.unit, item.variant) : null;
          applyStarMeta(star, meta);
          return;
        }

        if (scope === "primary") {
          const primaryRowId = String(card.dataset.primaryRowId || "");
          const item = primaryRowId ? productState.get(primaryRowId) : null;
          const meta = item
            ? getFavoriteComboMeta(productId, item.unit, item.variant)
            : getFavoriteMeta(productId);
          applyStarMeta(star, meta);
          return;
        }

        applyStarMeta(star, getFavoriteMeta(productId));
      });
    });
  };

  return { updateFavoriteIndicators };
};
