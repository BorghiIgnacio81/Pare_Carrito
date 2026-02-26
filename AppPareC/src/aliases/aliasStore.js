import { unitPatterns, unitSynonyms } from "../constants/units.js";
import { slugify } from "../utils/text.js";

const normalizeSpaces = (value) =>
  String(value ?? "")
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();

export const normalizeAliasKey = (value) => {
  const cleaned = normalizeSpaces(String(value ?? ""))
    .replace(/[\.,;:!\?]+/g, " ")
    .replace(/[()\[\]{}]/g, " ");
  return slugify(cleaned);
};

export const globalAliases = {
  [normalizeAliasKey("coreano")]: { productId: "zapallo", variant: "Amarillo", unit: "Kg" },
  [normalizeAliasKey("coreanito")]: { productId: "zapallo", variant: "Amarillo", unit: "Kg" },
  [normalizeAliasKey("zuchini")]: { productId: "zukini" },
  [normalizeAliasKey("zucchini")]: { productId: "zukini" },
  [normalizeAliasKey("cebolla verde")]: { productId: "verdeo", unit: "Atado" },
  [normalizeAliasKey("cebolla de verdeo")]: { productId: "verdeo", unit: "Atado" },
  [normalizeAliasKey("raiz de jengibre")]: { productId: "jengibre" },
  [normalizeAliasKey("raiz jengibre")]: { productId: "jengibre" },
  [normalizeAliasKey("raices de jengibre")]: { productId: "jengibre" },
  [normalizeAliasKey("raices jengibre")]: { productId: "jengibre" },
  [normalizeAliasKey("cherry")]: { productId: "tomate", variant: "Cherry", unit: "Kg" },
};

const normalizeClientId = (value) => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const match = raw.match(/\b(\d{1,3})\b/);
  if (!match) return "";
  const n = Number(match[1]);
  if (!Number.isFinite(n) || n <= 0) return "";
  return String(n).padStart(3, "0");
};

const collectClientNumbers = (value) => {
  const raw = String(value ?? "").trim();
  if (!raw) return [];
  const ids = new Set();
  const matches = [...raw.matchAll(/\b(\d{1,3})\b/g)];
  matches.forEach((match) => {
    const n = Number(match[1]);
    if (!Number.isFinite(n) || n <= 0) return;
    ids.add(String(n).padStart(3, "0"));
    ids.add(String(n));
  });
  return Array.from(ids);
};

const getCandidateClientIds = (clientId, clientLabel = "") => {
  const ids = new Set();
  const raw = String(clientId ?? "").trim();
  if (raw) ids.add(raw);
  collectClientNumbers(raw).forEach((id) => ids.add(id));
  collectClientNumbers(clientLabel).forEach((id) => ids.add(id));
  const normalized = normalizeClientId(raw);
  if (normalized) ids.add(normalized);
  return Array.from(ids).filter(Boolean);
};

const CLIENT_ALIAS_PREFIX = "clientAliasMap__";
const LEGACY_ALIAS_PREFIXES = [
  "clientAliasMap__",
  "clientAliasMap_",
  "clientAliases__",
  "clientAliases_",
];
const getClientAliasStorageKey = (clientId) => `${CLIENT_ALIAS_PREFIX}${clientId || ""}`;
const ALIAS_RECOVERY_KEY = "aliasRecoveryDone__v1";

const getLegacyAliasKeysForClient = (clientId, clientLabel = "") => {
  const normalizedIds = getCandidateClientIds(clientId, clientLabel)
    .map((id) => normalizeClientId(id))
    .filter(Boolean);
  if (!normalizedIds.length || typeof localStorage === "undefined") {
    return [];
  }
  const normalizedSet = new Set(normalizedIds);
  const keys = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key) {
      continue;
    }
    const prefix = LEGACY_ALIAS_PREFIXES.find((candidate) => key.startsWith(candidate));
    if (!prefix) {
      continue;
    }
    const suffix = key.slice(prefix.length);
    if (normalizedSet.has(normalizeClientId(suffix))) {
      keys.push(key);
    }
  }
  return keys;
};

const looksLikeAliasMap = (value) => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const entries = Object.values(value);
  return entries.some((entry) => entry && typeof entry === "object" && "productId" in entry);
};

const getLegacyAliasMapsFromStorage = (clientId, clientLabel = "") => {
  if (typeof localStorage === "undefined") {
    return [];
  }
  const ids = getCandidateClientIds(clientId, clientLabel);
  if (!ids.length) {
    return [];
  }
  const normalizedTargets = new Set(ids.map((id) => normalizeClientId(id)).filter(Boolean));
  const results = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key) continue;
    try {
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || typeof parsed !== "object") {
        continue;
      }

      const keyId = normalizeClientId(key);
      if (looksLikeAliasMap(parsed) && keyId && normalizedTargets.has(keyId)) {
        results.push(parsed);
      }

      ids.forEach((id) => {
        const map = parsed[id];
        if (looksLikeAliasMap(map)) {
          results.push(map);
        }
      });

      Object.entries(parsed).forEach(([entryKey, map]) => {
        if (!looksLikeAliasMap(map)) {
          return;
        }
        const entryId = normalizeClientId(entryKey);
        if (entryId && normalizedTargets.has(entryId)) {
          results.push(map);
        }
      });
    } catch {
      // ignore malformed storage entries
    }
  }
  return results;
};

export const loadClientAliases = (clientId, clientLabel = "") => {
  const ids = getCandidateClientIds(clientId, clientLabel);
  const merged = {};
  const keys = new Set();
  ids.forEach((id) => keys.add(getClientAliasStorageKey(id)));
  getLegacyAliasKeysForClient(clientId, clientLabel).forEach((key) => keys.add(key));
  if (!keys.size) {
    return {};
  }
  keys.forEach((key) => {
    try {
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === "object") {
        Object.assign(merged, parsed);
      }
    } catch {
      // ignore malformed entries
    }
  });
  if (!Object.keys(merged).length) {
    getLegacyAliasMapsFromStorage(clientId, clientLabel).forEach((map) => {
      Object.assign(merged, map);
    });
  }
  return merged;
};

export const saveClientAliases = (clientId, aliases) => {
  const ids = getCandidateClientIds(clientId);
  if (!ids.length) {
    return;
  }
  ids.forEach((id) => {
    try {
      localStorage.setItem(getClientAliasStorageKey(id), JSON.stringify(aliases || {}));
    } catch (error) {
      console.warn("No se pudo guardar alias en localStorage.", error);
    }
  });
};

const normalizeClientIdFromStorageKey = (key) => {
  if (!key) return "";
  const prefix = LEGACY_ALIAS_PREFIXES.find((candidate) => key.startsWith(candidate));
  if (prefix) {
    return normalizeClientId(key.slice(prefix.length));
  }
  return normalizeClientId(key);
};

const mergeAliasMap = (target, source) => {
  if (!looksLikeAliasMap(source)) {
    return target;
  }
  const next = target && typeof target === "object" ? { ...target } : {};
  Object.entries(source).forEach(([aliasKey, entry]) => {
    if (entry && typeof entry === "object" && "productId" in entry) {
      next[aliasKey] = entry;
    }
  });
  return next;
};

export const recoverAllAliasesFromStorage = () => {
  if (typeof localStorage === "undefined") {
    return { recovered: 0, clients: [] };
  }
  if (localStorage.getItem(ALIAS_RECOVERY_KEY) === "1") {
    return { recovered: 0, clients: [] };
  }

  const mergedByClient = new Map();
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key || key === ALIAS_RECOVERY_KEY) {
      continue;
    }
    try {
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || typeof parsed !== "object") {
        continue;
      }

      const directId = normalizeClientIdFromStorageKey(key);
      if (directId && looksLikeAliasMap(parsed)) {
        const current = mergedByClient.get(directId) || {};
        mergedByClient.set(directId, mergeAliasMap(current, parsed));
      }

      Object.entries(parsed).forEach(([entryKey, map]) => {
        if (!looksLikeAliasMap(map)) {
          return;
        }
        const entryId = normalizeClientId(entryKey);
        if (!entryId) {
          return;
        }
        const current = mergedByClient.get(entryId) || {};
        mergedByClient.set(entryId, mergeAliasMap(current, map));
      });
    } catch {
      // ignore malformed entries
    }
  }

  let recovered = 0;
  const clients = [];
  mergedByClient.forEach((map, clientId) => {
    const keys = Object.keys(map || {});
    if (!keys.length) {
      return;
    }
    saveClientAliases(clientId, map);
    recovered += keys.length;
    clients.push(clientId);
  });

  if (recovered > 0) {
    try {
      localStorage.setItem(ALIAS_RECOVERY_KEY, "1");
    } catch {
      // ignore
    }
  }

  return { recovered, clients };
};

const collectAliasesFromStorage = () => {
  const mergedByClient = new Map();
  if (typeof localStorage === "undefined") {
    return mergedByClient;
  }
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key || key === ALIAS_RECOVERY_KEY) {
      continue;
    }
    try {
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || typeof parsed !== "object") {
        continue;
      }

      const directId = normalizeClientIdFromStorageKey(key);
      if (directId && looksLikeAliasMap(parsed)) {
        const current = mergedByClient.get(directId) || {};
        mergedByClient.set(directId, mergeAliasMap(current, parsed));
      }

      Object.entries(parsed).forEach(([entryKey, map]) => {
        if (!looksLikeAliasMap(map)) {
          return;
        }
        const entryId = normalizeClientId(entryKey);
        if (!entryId) {
          return;
        }
        const current = mergedByClient.get(entryId) || {};
        mergedByClient.set(entryId, mergeAliasMap(current, map));
      });
    } catch {
      // ignore malformed entries
    }
  }
  return mergedByClient;
};

export const exportAliasesDump = () => {
  const mergedByClient = collectAliasesFromStorage();
  const data = {};
  let count = 0;
  const clients = [];
  mergedByClient.forEach((map, clientId) => {
    const keys = Object.keys(map || {});
    if (!keys.length) {
      return;
    }
    data[clientId] = map;
    count += keys.length;
    clients.push(clientId);
  });
  const payload = {
    version: "aliases-v1",
    exportedAt: new Date().toISOString(),
    data,
  };
  return { json: JSON.stringify(payload, null, 2), count, clients };
};

const extractAliasDumpData = (payload) => {
  if (!payload || typeof payload !== "object") {
    return {};
  }
  if (payload.data && typeof payload.data === "object") {
    return payload.data;
  }
  if (payload.aliases && typeof payload.aliases === "object") {
    return payload.aliases;
  }
  return payload;
};

const stripUnitTokens = (value) => {
  let result = normalizeSpaces(value);
  unitPatterns.forEach((pattern) => {
    result = result.replace(pattern.regex, " ");
  });
  unitSynonyms.forEach((pattern) => {
    result = result.replace(pattern.regex, " ");
  });
  result = result.replace(/\b(de|del|d)\b/gi, " ");
  result = result.replace(/\bx\b/gi, " ");
  return normalizeSpaces(result);
};

const normalizeAliasKeyFromStoredKey = (aliasKey) => {
  const raw = normalizeSpaces(String(aliasKey ?? "").replace(/[-_]+/g, " "));
  if (!raw) {
    return "";
  }
  let cleaned = stripUnitTokens(raw);
  cleaned = cleaned.replace(/\b\d+\s*\/\s*\d+\b/g, " ");
  cleaned = cleaned.replace(/\b\d+(?:[\.,]\d+)?\b/g, " ");
  cleaned = normalizeSpaces(cleaned);
  return normalizeAliasKey(cleaned || raw);
};

export const importAliasesDump = (jsonText, options = {}) => {
  const raw = String(jsonText || "").trim();
  if (!raw) {
    return { imported: 0, clients: [], error: "empty" };
  }
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return { imported: 0, clients: [], error: "invalid" };
  }
  const data = extractAliasDumpData(parsed);
  if (!data || typeof data !== "object") {
    return { imported: 0, clients: [], error: "invalid" };
  }

  if (looksLikeAliasMap(data)) {
    const fallbackClientId = normalizeClientId(options.clientId) || String(options.clientId || "").trim();
    if (!fallbackClientId) {
      return { imported: 0, clients: [], error: "invalid" };
    }
    return importAliasesDump(
      JSON.stringify({ data: { [fallbackClientId]: data } }),
      { clientId: fallbackClientId }
    );
  }

  let imported = 0;
  const clients = [];
  Object.entries(data).forEach(([rawClientId, map]) => {
    if (!looksLikeAliasMap(map)) {
      return;
    }
    const clientId = normalizeClientId(rawClientId) || String(rawClientId || "").trim();
    if (!clientId) {
      return;
    }

    const normalizedMap = {};
    Object.entries(map).forEach(([aliasKey, entry]) => {
      if (!entry || typeof entry !== "object" || !("productId" in entry)) {
        return;
      }
      normalizedMap[aliasKey] = entry;
      const normalizedKey = normalizeAliasKeyFromStoredKey(aliasKey);
      if (normalizedKey && normalizedKey !== aliasKey) {
        normalizedMap[normalizedKey] = entry;
      }
    });

    const existing = loadClientAliases(clientId);
    const merged = mergeAliasMap(existing, normalizedMap);
    const keys = Object.keys(merged || {});
    if (!keys.length) {
      return;
    }
    saveClientAliases(clientId, merged);
    imported += Object.keys(map || {}).length;
    clients.push(clientId);
  });

  return { imported, clients, error: "" };
};

export const getAliasStorageKeyFromSource = (source, options = {}) => {
  const raw = normalizeSpaces(String(source ?? ""));
  if (!raw) {
    return "";
  }
  const parseQuantityUnitAndName = options?.parseQuantityUnitAndName;
  if (typeof parseQuantityUnitAndName === "function") {
    const parsed = parseQuantityUnitAndName(raw);
    if (parsed?.name) {
      const cleaned = stripUnitTokens(parsed.name);
      return normalizeAliasKey(cleaned || parsed.name);
    }
  }
  const cleaned = stripUnitTokens(raw);
  return normalizeAliasKey(cleaned || raw);
};
