const entries = [
  ["E", "020"],
  ["F", "021"],
  ["G", "022"],
  ["H", "023"],
  ["I", "024"],
  ["J", "001"],
  ["K", "002"],
  ["L", "003"],
  ["M", "004"],
  ["N", "005"],
  ["O", "006"],
  ["P", "007"],
  ["Q", "008"],
  ["R", "009"],
  ["S", "010"],
  ["T", "011"],
  ["U", "012"],
  ["V", "013"],
  ["W", "014"],
  ["X", "015"],
  ["Y", "016"],
  ["AA", "018"],
  ["AB", "019"],
  ["AC", "025"],
  ["AD", "030"],
  ["AE", "031"],
  ["AF", "032"],
  ["AG", "033"],
  ["AI", "035"],
  ["AK", "037"],
  ["AL", "038"],
  ["AM", "039"],
  ["AN", "040"],
  ["AO", "041"],
  ["AP", "042"],
  ["AQ", "043"],
  ["AR", "044"],
  ["AS", "045"],
  ["AT", "046"],
  ["AU", "047"],
  ["AV", "048"],
  ["AW", "049"],
  ["AX", "050"],
  ["AY", "051"],
  ["AZ", "052"],
  ["BB", "054"],
  ["BF", "058"],
  ["BH", "060"],
  ["BI", "061"],
];

export const todosClientColumnEntries = entries.map(([column, clientId]) => ({
  column,
  clientId,
}));

export const todosColumnToClientId = new Map(entries.map(([column, clientId]) => [column, clientId]));

export const todosClientIdToColumn = new Map(entries.map(([column, clientId]) => [clientId, column]));

export const getClientIdByTodosColumn = (column) => {
  const key = String(column || "").trim().toUpperCase();
  return todosColumnToClientId.get(key) || "";
};

export const getTodosColumnByClientId = (clientId) => {
  const key = String(clientId || "").trim().padStart(3, "0");
  return todosClientIdToColumn.get(key) || "";
};
