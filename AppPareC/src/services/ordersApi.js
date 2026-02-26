const getDefaultOrdersApiBaseUrl = () => {
  // Preferimos misma-origin para que funcione con cualquier puerto.
  // Si el HTML se abre como file://, caemos al default localhost:3000.
  try {
    if (window.location && (window.location.protocol === "http:" || window.location.protocol === "https:")) {
      return `${window.location.origin}/api`;
    }
  } catch {
    // ignore
  }
  return "http://localhost:3000/api";
};

const fetchJson = async (url, init) => {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => null);
  return { response, data };
};

export const createOrdersApi = (options = {}) => {
  const baseUrl = String(options.baseUrl || getDefaultOrdersApiBaseUrl());

  return {
    baseUrl,

    loadOrdersSheetValues: async () => {
      const url = `${baseUrl}/orders`;
      let response;
      try {
        response = await fetch(url, { cache: "no-store" });
      } catch (error) {
        const detail = String(error?.message || error || "").trim();
        const extra = detail ? ` Detalle: ${detail}` : "";
        throw new Error(
          `No se pudo conectar con la API local (${url}). Iniciá el server local (npm start) y recargá.${extra}`
        );
      }

      let data = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }

      if (!response.ok) {
        const apiError = typeof data?.error === "string" ? data.error.trim() : "";
        const extra = apiError ? ` Detalle: ${apiError}` : "";
        throw new Error(
          `No se pudo leer el Google Sheet (API local). Asegurate de tener el server corriendo y con acceso al Sheet.${extra}`
        );
      }

      const values = Array.isArray(data?.values) ? data.values : [];
      const warning = typeof data?.warning === "string" ? data.warning : "";
      return { values, warning };
    },

    getClientNumbers: async ({ max = 200 } = {}) => {
      const url = `${baseUrl}/client-numbers?max=${encodeURIComponent(String(max))}`;
      const { response, data } = await fetchJson(url);
      if (!response.ok) {
        const msg = String(data?.error || "No se pudieron obtener números disponibles.").trim();
        throw new Error(msg || "No se pudieron obtener números disponibles.");
      }
      return {
        used: Array.isArray(data?.used) ? data.used : [],
        available: Array.isArray(data?.available) ? data.available : [],
      };
    },

    appendOrderRow: async ({ row }) => {
      const url = `${baseUrl}/append-order`;
      const { response, data } = await fetchJson(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ row }),
      });

      if (!response.ok) {
        const apiError = typeof data?.error === "string" ? data.error : "";
        throw new Error(apiError || "No se pudo escribir en el Google Sheet.");
      }

      return data;
    },

    loadAliases: async () => {
      const url = `${baseUrl}/aliases`;
      const { response, data } = await fetchJson(url);
      if (!response.ok) {
        const msg = String(data?.error || "No se pudieron leer los alias.").trim();
        throw new Error(msg || "No se pudieron leer los alias.");
      }
      return { data: data?.data && typeof data.data === "object" ? data.data : {} };
    },

    saveAliases: async ({ data }) => {
      const url = `${baseUrl}/aliases`;
      const { response, data: responseData } = await fetchJson(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data }),
      });
      if (!response.ok) {
        const msg = String(responseData?.error || "No se pudieron guardar los alias.").trim();
        throw new Error(msg || "No se pudieron guardar los alias.");
      }
      return responseData;
    },
  };
};
