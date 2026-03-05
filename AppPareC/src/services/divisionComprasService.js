const normalizeSpaces = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

const normalizeClientName = (value) => {
  const cleaned = normalizeSpaces(String(value ?? "").replace(/^\d{1,3}\)\s*/, ""));
  return cleaned || "Sin cliente";
};

const toDateKey = (date) => {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());
  return `${day}/${month}/${year}`;
};

const parseRequestedDate = (raw) => {
  const text = normalizeSpaces(raw);
  if (!text) {
    return new Date();
  }

  const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    const parsed = new Date(year, month - 1, day);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  const localMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (localMatch) {
    const day = Number(localMatch[1]);
    const month = Number(localMatch[2]);
    const yearRaw = Number(localMatch[3]);
    const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;
    const parsed = new Date(year, month - 1, day);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  return new Date();
};

const dateValueMatches = (value, targetDate) => {
  const text = normalizeSpaces(value);
  if (!text) {
    return false;
  }
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!match) {
    return false;
  }
  const day = Number(match[1]);
  const month = Number(match[2]);
  const yearRaw = Number(match[3]);
  const year = yearRaw < 100 ? 2000 + yearRaw : yearRaw;

  return (
    day === targetDate.getDate() &&
    month === targetDate.getMonth() + 1 &&
    year === targetDate.getFullYear()
  );
};

const parseCellQuantity = (value) => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const text = normalizeSpaces(String(value ?? ""));
  if (!text) {
    return null;
  }

  const numericToken = text.match(/-?\d+(?:[\.,]\d+)?/);
  if (!numericToken) {
    return null;
  }

  let normalized = numericToken[0];
  if (normalized.includes(".") && normalized.includes(",")) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else if (normalized.includes(",")) {
    normalized = normalized.replace(",", ".");
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
};

const parseSectionRules = (raw) => {
  const text = normalizeSpaces(raw);
  if (!text) {
    return [];
  }
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object") {
      return [];
    }
    return Object.entries(parsed)
      .map(([section, patterns]) => {
        const patternList = (Array.isArray(patterns) ? patterns : [patterns])
          .map((item) => normalizeSpaces(item))
          .filter(Boolean);
        if (!patternList.length) {
          return null;
        }
        return {
          section,
          regexes: patternList.map((pattern) => new RegExp(pattern, "i")),
        };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
};

const defaultSectionNames = ["Lucas", "Roberto", "Beatriz", "Pato", "Miriam"];

const resolveSectionForClient = (clientName, rules) => {
  const text = normalizeSpaces(clientName);
  if (!text) {
    return "Sin sección";
  }

  for (const section of defaultSectionNames) {
    const labelRegex = new RegExp(`(^|\\W)${section}($|\\W)`, "i");
    if (labelRegex.test(text)) {
      return section;
    }
  }

  for (const rule of rules) {
    if (rule.regexes.some((regex) => regex.test(text))) {
      return rule.section;
    }
  }

  return "Sin sección";
};

const sortByTotalDescThenName = (a, b) => {
  const diff = Number(b.total || 0) - Number(a.total || 0);
  if (diff !== 0) {
    return diff;
  }
  return String(a.name || "").localeCompare(String(b.name || ""), "es");
};

export const buildDivisionComprasSnapshot = ({
  values,
  date,
  sectionRulesRaw,
  includeRows,
}) => {
  const allValues = Array.isArray(values) ? values : [];
  const headers = Array.isArray(allValues[0]) ? allValues[0] : [];
  const rows = allValues.slice(1);
  const targetDate = parseRequestedDate(date);
  const targetDateKey = toDateKey(targetDate);
  const sectionRules = parseSectionRules(sectionRulesRaw);

  const productTotals = new Map();
  const clientTotals = new Map();
  const sectionTotals = new Map();
  const traceRows = [];

  const ensureClient = (name, section) => {
    if (!clientTotals.has(name)) {
      clientTotals.set(name, {
        name,
        section,
        total: 0,
        products: new Map(),
      });
    }
    return clientTotals.get(name);
  };

  const ensureSection = (name) => {
    if (!sectionTotals.has(name)) {
      sectionTotals.set(name, {
        name,
        total: 0,
        clients: new Map(),
        products: new Map(),
      });
    }
    return sectionTotals.get(name);
  };

  rows.forEach((row, index) => {
    const currentRow = Array.isArray(row) ? row : [];
    const dateCell = currentRow[0];
    if (!dateValueMatches(dateCell, targetDate)) {
      return;
    }

    const clientName = normalizeClientName(currentRow[1]);
    const section = resolveSectionForClient(clientName, sectionRules);
    const client = ensureClient(clientName, section);
    const sectionEntry = ensureSection(section);

    const rowProducts = [];
    let rowTotal = 0;

    for (let col = 2; col < headers.length; col += 1) {
      const productName = normalizeSpaces(headers[col]);
      if (!productName) {
        continue;
      }
      const quantity = parseCellQuantity(currentRow[col]);
      if (!quantity) {
        continue;
      }

      rowTotal += quantity;

      const productEntry = productTotals.get(productName) || {
        name: productName,
        total: 0,
        clients: new Map(),
      };
      productEntry.total += quantity;
      productEntry.clients.set(
        clientName,
        (productEntry.clients.get(clientName) || 0) + quantity
      );
      productTotals.set(productName, productEntry);

      client.total += quantity;
      client.products.set(productName, (client.products.get(productName) || 0) + quantity);

      sectionEntry.total += quantity;
      sectionEntry.clients.set(clientName, (sectionEntry.clients.get(clientName) || 0) + quantity);
      sectionEntry.products.set(productName, (sectionEntry.products.get(productName) || 0) + quantity);

      if (includeRows) {
        rowProducts.push({ product: productName, quantity });
      }
    }

    if (includeRows && rowProducts.length) {
      traceRows.push({
        rowIndex: index + 2,
        date: String(dateCell ?? ""),
        client: clientName,
        section,
        total: rowTotal,
        products: rowProducts,
      });
    }
  });

  const products = Array.from(productTotals.values())
    .map((entry) => ({
      name: entry.name,
      total: entry.total,
      clients: Array.from(entry.clients.entries())
        .map(([client, total]) => ({ client, total }))
        .sort((a, b) => Number(b.total) - Number(a.total)),
    }))
    .sort(sortByTotalDescThenName);

  const clients = Array.from(clientTotals.values())
    .map((entry) => ({
      name: entry.name,
      section: entry.section,
      total: entry.total,
      products: Array.from(entry.products.entries())
        .map(([product, total]) => ({ product, total }))
        .sort((a, b) => Number(b.total) - Number(a.total)),
    }))
    .sort(sortByTotalDescThenName);

  const sections = Array.from(sectionTotals.values())
    .map((entry) => ({
      name: entry.name,
      total: entry.total,
      clients: Array.from(entry.clients.entries())
        .map(([client, total]) => ({ client, total }))
        .sort((a, b) => Number(b.total) - Number(a.total)),
      products: Array.from(entry.products.entries())
        .map(([product, total]) => ({ product, total }))
        .sort((a, b) => Number(b.total) - Number(a.total)),
    }))
    .sort(sortByTotalDescThenName);

  const summary = {
    rowCount: clients.length,
    distinctProducts: products.length,
    distinctSections: sections.length,
    totalQuantity: products.reduce((acc, item) => acc + Number(item.total || 0), 0),
  };

  return {
    date: {
      requested: targetDateKey,
      iso: `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, "0")}-${String(
        targetDate.getDate()
      ).padStart(2, "0")}`,
    },
    summary,
    products,
    clients,
    sections,
    rows: includeRows ? traceRows : undefined,
  };
};