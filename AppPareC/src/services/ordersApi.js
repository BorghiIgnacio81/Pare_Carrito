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

const fetchWithTimeout = async (url, init, timeoutMs = 15000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

export const createOrdersApi = (options = {}) => {
  const baseUrl = String(options.baseUrl || getDefaultOrdersApiBaseUrl());

  return {
    baseUrl,

    loadOrdersSheetValues: async () => {
      const url = `${baseUrl}/orders`;
      let response;
      try {
        response = await fetchWithTimeout(url, { cache: "no-store" }, 15000);
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

    listDbClients: async ({ includeInactive = false } = {}) => {
      const q = includeInactive ? "?includeInactive=1" : "";
      const url = `${baseUrl}/db/clients${q}`;
      const { response, data } = await fetchJson(url);
      if (!response.ok) {
        const msg = String(data?.error || "No se pudieron listar clientes en DB.").trim();
        throw new Error(msg || "No se pudieron listar clientes en DB.");
      }
      return { data: Array.isArray(data?.data) ? data.data : [] };
    },

    createDbClient: async ({ externalId, name, code = null, notes = null } = {}) => {
      const url = `${baseUrl}/db/clients`;
      const { response, data } = await fetchJson(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ externalId, name, code, notes }),
      });
      if (!response.ok) {
        const msg = String(data?.error || "No se pudo crear cliente en DB.").trim();
        throw new Error(msg || "No se pudo crear cliente en DB.");
      }
      return { data: data?.data || null };
    },

    updateDbClientById: async ({ id, externalId, name, code, notes, isActive } = {}) => {
      const url = `${baseUrl}/db/clients/${encodeURIComponent(String(id || ""))}`;
      const { response, data } = await fetchJson(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ externalId, name, code, notes, isActive }),
      });
      if (!response.ok) {
        const msg = String(data?.error || "No se pudo actualizar cliente en DB.").trim();
        throw new Error(msg || "No se pudo actualizar cliente en DB.");
      }
      return { data: data?.data || null };
    },

    upsertDbClientByExternalId: async ({ externalId, name, code = null, notes = null } = {}) => {
      const url = `${baseUrl}/db/clients/by-external/${encodeURIComponent(String(externalId || ""))}`;
      const { response, data } = await fetchJson(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, code, notes }),
      });
      if (!response.ok) {
        const msg = String(data?.error || "No se pudo sincronizar cliente en DB.").trim();
        throw new Error(msg || "No se pudo sincronizar cliente en DB.");
      }
      return { data: data?.data || null };
    },

    listDbResponsibles: async ({ includeInactive = false } = {}) => {
      const q = includeInactive ? "?includeInactive=1" : "";
      const url = `${baseUrl}/db/responsibles${q}`;
      const { response, data } = await fetchJson(url);
      if (!response.ok) {
        const msg = String(data?.error || "No se pudieron listar responsables en DB.").trim();
        throw new Error(msg || "No se pudieron listar responsables en DB.");
      }
      return { data: Array.isArray(data?.data) ? data.data : [] };
    },

    createDbResponsible: async ({ code = null, name, notes = null } = {}) => {
      const url = `${baseUrl}/db/responsibles`;
      const { response, data } = await fetchJson(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, name, notes }),
      });
      if (!response.ok) {
        const msg = String(data?.error || "No se pudo crear responsable en DB.").trim();
        throw new Error(msg || "No se pudo crear responsable en DB.");
      }
      return { data: data?.data || null };
    },

    updateDbResponsibleById: async ({ id, code, name, notes, isActive } = {}) => {
      const url = `${baseUrl}/db/responsibles/${encodeURIComponent(String(id || ""))}`;
      const { response, data } = await fetchJson(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, name, notes, isActive }),
      });
      if (!response.ok) {
        const msg = String(data?.error || "No se pudo actualizar responsable en DB.").trim();
        throw new Error(msg || "No se pudo actualizar responsable en DB.");
      }
      return { data: data?.data || null };
    },

    listClientResponsibles: async ({ clientId } = {}) => {
      const url = `${baseUrl}/db/clients/${encodeURIComponent(String(clientId || ""))}/responsibles`;
      const { response, data } = await fetchJson(url);
      if (!response.ok) {
        const msg = String(data?.error || "No se pudo listar asignaciones del cliente.").trim();
        throw new Error(msg || "No se pudo listar asignaciones del cliente.");
      }
      return { data: Array.isArray(data?.data) ? data.data : [] };
    },

    assignResponsibleToClient: async ({ clientId, responsibleId, roleLabel = null, isPrimary = true } = {}) => {
      const url = `${baseUrl}/db/clients/${encodeURIComponent(String(clientId || ""))}/responsibles`;
      const { response, data } = await fetchJson(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responsibleId, roleLabel, isPrimary }),
      });
      if (!response.ok) {
        const msg = String(data?.error || "No se pudo asignar responsable al cliente.").trim();
        throw new Error(msg || "No se pudo asignar responsable al cliente.");
      }
      return { data: data?.data || null };
    },

    removeResponsibleFromClient: async ({ clientId, responsibleId } = {}) => {
      const url = `${baseUrl}/db/clients/${encodeURIComponent(String(clientId || ""))}/responsibles/${encodeURIComponent(
        String(responsibleId || "")
      )}`;
      const { response, data } = await fetchJson(url, {
        method: "DELETE",
      });
      if (!response.ok) {
        const msg = String(data?.error || "No se pudo quitar responsable del cliente.").trim();
        throw new Error(msg || "No se pudo quitar responsable del cliente.");
      }
      return { data: data?.data || null };
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
