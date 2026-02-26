export const createAliasesController = ({
  clientSelect,
  aliasSourceInput,
  aliasProductSelect,
  aliasUnitSelect,
  aliasVariantSelect,
  getProductsById,
  getFavoritesData,
  parseQuantityUnitAndName,
  normalizeProductFromHeader,
  slugify,
  normalizeSpaces,
}) => {
  const normalizeKey = (value) =>
    String(value || "")
      .toLowerCase()
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  const getMostRecentVariantForClient = (productId, clientId) => {
    const favoritesData = typeof getFavoritesData === "function" ? getFavoritesData() : null;
    const record = favoritesData?.[clientId]?.[productId];
    if (!record?.combos) {
      return "";
    }
    const combos = Object.values(record.combos).filter(Boolean);
    if (!combos.length) {
      return "";
    }
    combos.sort((a, b) => {
      const at = a.lastDate ? new Date(a.lastDate).getTime() : 0;
      const bt = b.lastDate ? new Date(b.lastDate).getTime() : 0;
      return bt - at;
    });
    return String(combos[0]?.variant || "").trim();
  };

  const applyAliasLechugaHints = () => {
    const clientId = clientSelect?.value || "";
    const productId = aliasProductSelect?.value || "";
    if (!clientId || productId !== "lechuga") {
      return;
    }

    const recentVariant = getMostRecentVariantForClient("lechuga", clientId);
    if (!recentVariant) {
      return;
    }

    const options = Array.from(aliasVariantSelect?.options || []);
    options.forEach((opt) => {
      if (!opt) return;
      const raw = String(opt.value || "").trim();
      if (!raw) return;
      opt.textContent = raw;
    });

    const target = options.find((opt) => String(opt.value || "").trim() === recentVariant);
    if (target) {
      target.textContent = `★ ${recentVariant}`;
      aliasVariantSelect.value = recentVariant;
    }
  };

  const handleAliasSourceInput = () => {
    const clientId = clientSelect?.value || "";
    const raw = String(aliasSourceInput?.value || "").trim();
    if (!clientId || !raw) {
      return;
    }

    const productsById = typeof getProductsById === "function" ? getProductsById() : null;

    const parsed = parseQuantityUnitAndName(raw);
    const name = String(parsed?.name || raw).trim();
    const normalizedGuess = normalizeProductFromHeader(
      `${name} ${String(parsed?.unit || "").trim()}`.trim(),
      {
        defaultUnitIfMissing: false,
      }
    );

    let guessedProductId = normalizedGuess?.key ? String(normalizedGuess.key).trim() : "";
    if (!guessedProductId) {
      guessedProductId = slugify(name);
    }

    if (guessedProductId && !productsById?.get?.(guessedProductId)) {
      const parts = normalizeSpaces(name).split(" ").filter(Boolean);
      for (let i = parts.length - 1; i >= 1; i -= 1) {
        const candidate = slugify(parts.slice(0, i).join(" "));
        if (candidate && productsById?.get?.(candidate)) {
          guessedProductId = candidate;
          break;
        }
      }
    }

    if (guessedProductId && !productsById?.get?.(guessedProductId) && /s$/i.test(guessedProductId)) {
      const singular = guessedProductId.replace(/s$/i, "");
      if (productsById?.get?.(singular)) {
        guessedProductId = singular;
      }
    }

    if (!(guessedProductId && productsById?.get?.(guessedProductId))) {
      return;
    }

    if (aliasProductSelect?.value !== guessedProductId) {
      aliasProductSelect.value = guessedProductId;
      aliasProductSelect.dispatchEvent(new Event("change", { bubbles: true }));
    }

    const product = productsById.get(guessedProductId) || null;
    if (product) {
      const rawKey = normalizeKey(raw);

      if (aliasUnitSelect && !aliasUnitSelect.disabled && !aliasUnitSelect.value) {
        const explicitUnit = String(parsed?.unit || "").trim();
        const hasExplicitUnit =
          explicitUnit && Array.from(aliasUnitSelect.options || []).some((opt) => opt.value === explicitUnit);

        if (hasExplicitUnit) {
          aliasUnitSelect.value = explicitUnit;
        } else {
          const unitMatch = (product.units || []).find((u) => {
            const key = normalizeKey(u);
            return key && rawKey.includes(key);
          });
          if (unitMatch) {
            aliasUnitSelect.value = unitMatch;
          }
        }
      }

      if (aliasVariantSelect && !aliasVariantSelect.disabled && !aliasVariantSelect.value) {
        const variantFromText = String(normalizedGuess?.variant || "").trim();
        const canUseDetected =
          variantFromText &&
          Array.from(aliasVariantSelect.options || []).some((opt) => opt.value === variantFromText);

        if (canUseDetected) {
          aliasVariantSelect.value = variantFromText;
        } else {
          const variants = Array.isArray(product.variants) ? product.variants : [];
          const match = variants
            .map((v) => ({ value: v, key: normalizeKey(v) }))
            .filter((entry) => entry.key && rawKey.includes(entry.key))
            .sort((a, b) => b.key.length - a.key.length)[0];
          if (match && match.value) {
            aliasVariantSelect.value = match.value;
          }
        }
      }
    }

    if (guessedProductId === "lechuga") {
      const explicitUnit = String(parsed?.unit || "").trim();
      if (explicitUnit && aliasUnitSelect) {
        aliasUnitSelect.value = explicitUnit;
      } else if (aliasUnitSelect) {
        const hasUnidad = Array.from(aliasUnitSelect.options).some((o) => o.value === "Unidad");
        if (hasUnidad) {
          aliasUnitSelect.value = "Unidad";
        } else {
          const hasAtado = Array.from(aliasUnitSelect.options).some((o) => o.value === "Atado");
          if (hasAtado) {
            aliasUnitSelect.value = "Atado";
          }
        }
      }
      applyAliasLechugaHints();
    }
  };

  const init = () => {
    aliasProductSelect?.addEventListener("change", () => {
      queueMicrotask(() => {
        applyAliasLechugaHints();
      });
    });

    aliasSourceInput?.addEventListener("input", handleAliasSourceInput);
  };

  return {
    init,
    applyAliasLechugaHints,
  };
};
