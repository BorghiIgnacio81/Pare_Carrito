import { loadFavoritesFromSheet, saveFavoritesToStorage } from "../catalog/favorites.js";

export const createFavoritesStore = ({ clientSelect, getProductsById }) => {
  let favoritesData = {};

  const getClientIdFromLabel = (value) => {
    const matches = [...String(value || "").matchAll(/(\d{3})\)/g)];
    if (!matches.length) {
      return "";
    }
    return matches[matches.length - 1][1];
  };

  const daysBetween = (dateA, dateB) => {
    const start = Date.UTC(dateA.getFullYear(), dateA.getMonth(), dateA.getDate());
    const end = Date.UTC(dateB.getFullYear(), dateB.getMonth(), dateB.getDate());
    return Math.floor((end - start) / (1000 * 60 * 60 * 24));
  };

  const normalizeFavoriteVariantKey = (value) => {
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

  const setData = (data) => {
    favoritesData = data && typeof data === "object" ? data : {};
  };

  const getData = () => favoritesData;

  const loadFromSheet = (sheetValues = []) => {
    const productsById = typeof getProductsById === "function" ? getProductsById() : null;
    favoritesData = loadFavoritesFromSheet(sheetValues, {
      productsById,
      getClientIdFromLabel,
    });
    return favoritesData;
  };

  const saveToStorage = (dataOverride) => {
    const data = dataOverride && typeof dataOverride === "object" ? dataOverride : favoritesData;
    saveFavoritesToStorage(data);
  };

  const getFavoriteMeta = (productId) => {
    const clientId = clientSelect?.value;
    if (!clientId) {
      return null;
    }
    const clientFavorites = favoritesData[clientId] || {};
    const record = clientFavorites[productId];
    if (!record) {
      return null;
    }
    let lastDate = record.lastDate ? new Date(record.lastDate) : null;
    if (lastDate && Number.isNaN(lastDate.getTime())) {
      lastDate = null;
    }
    let brightness = 0.6;
    if (lastDate) {
      const today = new Date();
      const days = Math.max(0, daysBetween(lastDate, today));
      brightness = days <= 1 ? 1 : Math.max(0, 1 - (days - 1) / 29);
    }
    return {
      count: record.count || 0,
      lastDate,
      brightness,
      orderIndex: Number.isFinite(record.lastOrderIndex) ? record.lastOrderIndex : null,
    };
  };

  const getFavoriteComboMeta = (productId, unit, variantLabel) => {
    const clientId = clientSelect?.value;
    if (!clientId) {
      return null;
    }
    const clientFavorites = favoritesData[clientId] || {};
    const record = clientFavorites[productId];
    if (!record?.combos) {
      return null;
    }
    const variantKey = normalizeFavoriteVariantKey(variantLabel);
    const comboKey = `${String(unit || "").trim()}__${variantKey}`;
    const combo = record.combos[comboKey];
    if (!combo) {
      return null;
    }

    let lastDate = combo.lastDate ? new Date(combo.lastDate) : null;
    if (lastDate && Number.isNaN(lastDate.getTime())) {
      lastDate = null;
    }
    let brightness = 0.6;
    if (lastDate) {
      const today = new Date();
      const days = Math.max(0, daysBetween(lastDate, today));
      brightness = days <= 1 ? 1 : Math.max(0, 1 - (days - 1) / 29);
    }

    return {
      count: combo.count || 0,
      lastDate,
      brightness,
      orderIndex: Number.isFinite(combo.lastOrderIndex) ? combo.lastOrderIndex : null,
    };
  };

  const getFavoritePresets = (productId, clientIdOverride = "") => {
    const clientId = clientIdOverride || clientSelect?.value;
    if (!clientId) {
      return [];
    }
    const clientFavorites = favoritesData[clientId] || {};
    const record = clientFavorites[productId];
    if (!record?.combos) {
      return [];
    }
    const combos = Object.values(record.combos);
    if (!combos.length) {
      return [];
    }

    const productsById = typeof getProductsById === "function" ? getProductsById() : null;
    const product = productsById?.get?.(productId);

    const withScores = combos.map((combo) => ({
      unit: combo.unit || product?.defaultUnit || "",
      variant: combo.variant || "",
      count: combo.count || 0,
      lastDate: combo.lastDate ? new Date(combo.lastDate) : null,
    }));

    let preferred = withScores;
    if (product?.variants?.length) {
      const byVariant = new Map();
      withScores.forEach((combo) => {
        const key = (combo.variant || "").toLowerCase();
        const current = byVariant.get(key);
        if (!current || combo.count > current.count) {
          byVariant.set(key, combo);
        }
      });
      preferred = Array.from(byVariant.values());
    }

    preferred.sort((a, b) => {
      if (a.count !== b.count) {
        return b.count - a.count;
      }
      const aTime = a.lastDate ? a.lastDate.getTime() : 0;
      const bTime = b.lastDate ? b.lastDate.getTime() : 0;
      return bTime - aTime;
    });

    return preferred.slice(0, 2).map(({ unit, variant }) => ({ unit, variant }));
  };

  return {
    setData,
    getData,
    loadFromSheet,
    saveToStorage,
    getFavoriteMeta,
    getFavoriteComboMeta,
    getFavoritePresets,
  };
};
