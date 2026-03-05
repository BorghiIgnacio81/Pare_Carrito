export const createClientsController = ({
  clients,
  clientSelect,
  editClientButton,
  newClientButton,
  ordersApi,
  onClientUpdated,
} = {}) => {
  const normalizeSpaces = (value) => String(value || "").replace(/\s+/g, " ").trim();
  let dbEnabled = false;

  const CLIENT_NAME_OVERRIDES_KEY = "clientNameOverrides__v1";
  const EXTRA_CLIENTS_KEY = "extraClients__v1";

  const originalClientNameById = new Map(
    (clients || []).map((client) => [String(client.id), String(client.name || "")])
  );

  const normalizeClientId = (value) => {
    const raw = String(value ?? "").trim();
    const match = raw.match(/\b(\d{1,3})\b/);
    if (!match) return "";
    const n = Number(match[1]);
    if (!Number.isFinite(n) || n <= 0) return "";
    return String(n).padStart(3, "0");
  };

  const parseNullableCode = (value) => {
    if (value == null || String(value).trim() === "") {
      return null;
    }
    const n = Number(value);
    if (!Number.isFinite(n)) {
      return null;
    }
    return Math.trunc(n);
  };

  const canUseDbClients = () =>
    Boolean(ordersApi && typeof ordersApi.listDbClients === "function");

  const mergeDbClientsIntoLocal = (dbClients) => {
    const byId = new Map((clients || []).map((c) => [String(c.id), c]));
    (Array.isArray(dbClients) ? dbClients : []).forEach((entry) => {
      const externalId = normalizeClientId(entry?.external_id);
      if (!externalId) {
        return;
      }

      const name = normalizeSpaces(entry?.name);
      if (!name) {
        return;
      }

      const code = parseNullableCode(entry?.code);
      const dbId = Number(entry?.id);

      if (byId.has(externalId)) {
        const existing = byId.get(externalId);
        existing.name = name;
        existing.code = Number.isFinite(code) ? code : existing.code;
        if (Number.isFinite(dbId)) {
          existing.dbId = dbId;
        }
        if (!originalClientNameById.has(externalId)) {
          originalClientNameById.set(externalId, name);
        }
        return;
      }

      const next = {
        id: externalId,
        name,
        code: Number.isFinite(code) ? code : 0,
      };
      if (Number.isFinite(dbId)) {
        next.dbId = dbId;
      }
      clients.push(next);
      byId.set(externalId, next);
      if (!originalClientNameById.has(externalId)) {
        originalClientNameById.set(externalId, name);
      }
    });
  };

  const loadExtraClients = () => {
    try {
      const raw = localStorage.getItem(EXTRA_CLIENTS_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const saveExtraClients = (list) => {
    try {
      localStorage.setItem(EXTRA_CLIENTS_KEY, JSON.stringify(Array.isArray(list) ? list : []));
    } catch {
      // ignore
    }
  };

  const mergeExtraClientsIntoConstants = () => {
    const extras = loadExtraClients();
    const byId = new Map((clients || []).map((c) => [String(c.id), c]));
    extras.forEach((entry) => {
      const id = normalizeClientId(entry?.id);
      const name = normalizeSpaces(entry?.name);
      if (!id || !name) return;
      if (byId.has(id)) return;
      const code = Number(entry?.code);
      const client = { id, name, code: Number.isFinite(code) ? code : 0 };
      clients.push(client);
      byId.set(id, client);
      if (!originalClientNameById.has(id)) {
        originalClientNameById.set(id, name);
      }
    });
  };

  const loadClientNameOverrides = () => {
    try {
      const raw = localStorage.getItem(CLIENT_NAME_OVERRIDES_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  };

  const saveClientNameOverrides = (overrides) => {
    try {
      localStorage.setItem(CLIENT_NAME_OVERRIDES_KEY, JSON.stringify(overrides || {}));
    } catch {
      // ignore
    }
  };

  const applyClientNameOverrides = () => {
    const overrides = loadClientNameOverrides();
    (clients || []).forEach((client) => {
      const id = String(client.id);
      const override = normalizeSpaces(overrides?.[id]);
      if (override) {
        client.name = override;
        return;
      }
      const original = originalClientNameById.get(id);
      if (typeof original === "string") {
        client.name = original;
      }
    });
  };

  const populateClients = () => {
    if (!clientSelect) return;
    const sorted = [...clients].sort((a, b) => Number(a.id) - Number(b.id));
    sorted.forEach((client) => {
      const option = document.createElement("option");
      option.value = client.id;
      option.textContent = `${client.id} - ${client.name} (${client.code})`;
      clientSelect.appendChild(option);
    });
  };

  const refreshClientSelectLabels = () => {
    if (!clientSelect) return;
    const options = Array.from(clientSelect.options || []);
    options.forEach((option) => {
      if (!option?.value) return;
      const client = (clients || []).find((c) => String(c.id) === String(option.value));
      if (!client) return;
      option.textContent = `${client.id} - ${client.name} (${client.code})`;
    });
  };

  const rebuildClientSelect = () => {
    if (!clientSelect) return;
    const current = String(clientSelect.value || "");
    clientSelect.innerHTML = '<option value="">Seleccione un cliente</option>';
    populateClients();
    if (current) {
      clientSelect.value = current;
    }
    refreshClientSelectLabels();
  };

  const wireEditClient = () => {
    if (!editClientButton) {
      return;
    }

    editClientButton.disabled = !clientSelect?.value;
    editClientButton.addEventListener("click", async () => {
      const selectedId = String(clientSelect?.value || "").trim();
      if (!selectedId) {
        return;
      }
      const client = (clients || []).find((c) => String(c.id) === selectedId);
      if (!client) {
        return;
      }

      const originalName = originalClientNameById.get(selectedId) || "";
      const currentName = normalizeSpaces(client.name);
      const next = window.prompt(`Nuevo nombre para el cliente ${selectedId}:`, currentName || originalName);
      if (next == null) {
        return;
      }
      const trimmed = normalizeSpaces(next);
      const overrides = loadClientNameOverrides();

      if (dbEnabled && canUseDbClients()) {
        try {
          if (!trimmed) {
            alert("El nombre no puede quedar vacío cuando está sincronizado con DB.");
            return;
          }
          const response = await ordersApi.upsertDbClientByExternalId({
            externalId: selectedId,
            name: trimmed,
            code: parseNullableCode(client.code) ?? 0,
          });
          const dbClient = response?.data || null;
          if (dbClient && Number.isFinite(Number(dbClient.id))) {
            client.dbId = Number(dbClient.id);
          }
        } catch (error) {
          console.error(error);
          alert(String(error?.message || error || "No se pudo actualizar cliente en DB."));
          return;
        }
      }

      if (!trimmed) {
        // vacío => volver al nombre original
        delete overrides[selectedId];
        client.name = originalName;
      } else {
        overrides[selectedId] = trimmed;
        client.name = trimmed;
      }
      saveClientNameOverrides(overrides);
      refreshClientSelectLabels();
      if (typeof onClientUpdated === "function") {
        onClientUpdated();
      }
    });
  };

  const wireNewClient = () => {
    if (!newClientButton) {
      return;
    }
    newClientButton.addEventListener("click", async () => {
      try {
        if (!ordersApi || typeof ordersApi.getClientNumbers !== "function") {
          throw new Error("API no disponible para buscar números de cliente.");
        }

        const { available } = await ordersApi.getClientNumbers({ max: 200 });
        const existingIds = new Set((clients || []).map((c) => String(c.id)));
        const filteredAvailable = (Array.isArray(available) ? available : []).filter(
          (id) => !existingIds.has(String(id))
        );
        const sample = filteredAvailable.slice(0, 30).join(", ");
        const suggested = filteredAvailable[0] || "";
        const rawId = window.prompt(
          `Número de cliente (3 dígitos). Disponibles: ${sample}${filteredAvailable.length > 30 ? ", ..." : ""}`,
          suggested
        );
        if (rawId == null) return;
        const id = normalizeClientId(rawId);
        if (!id) {
          alert("Número inválido. Debe ser un número de 1 a 999.");
          return;
        }

        const existing = (clients || []).some((c) => String(c.id) === id);
        if (existing) {
          alert(`El cliente ${id} ya existe en la app.`);
          return;
        }

        const name = window.prompt(`Nombre del nuevo cliente ${id}:`, "");
        if (name == null) return;
        const trimmedName = normalizeSpaces(name);
        if (!trimmedName) {
          alert("Debe ingresar un nombre.");
          return;
        }

        let dbId = null;
        if (dbEnabled && canUseDbClients()) {
          const db = await ordersApi.createDbClient({
            externalId: id,
            name: trimmedName,
            code: 0,
          });
          if (Number.isFinite(Number(db?.data?.id))) {
            dbId = Number(db.data.id);
          }
        }

        const extra = { id, name: trimmedName, code: 0 };
        if (Number.isFinite(dbId)) {
          extra.dbId = dbId;
        }
        const extras = loadExtraClients();
        extras.push(extra);
        saveExtraClients(extras);

        // Agregar al listado en memoria y refrescar UI.
        clients.push(extra);
        if (!originalClientNameById.has(id)) {
          originalClientNameById.set(id, trimmedName);
        }

        rebuildClientSelect();
        clientSelect.value = id;
        clientSelect.dispatchEvent(new Event("change", { bubbles: true }));
      } catch (error) {
        console.error(error);
        alert(String(error?.message || error || "No se pudo crear el cliente."));
      }
    });
  };

  const init = () => {
    if (canUseDbClients()) {
      ordersApi
        .listDbClients({ includeInactive: false })
        .then((response) => {
          mergeDbClientsIntoLocal(response?.data || []);
          dbEnabled = true;
          rebuildClientSelect();
          if (typeof onClientUpdated === "function") {
            onClientUpdated();
          }
        })
        .catch((error) => {
          console.warn("DB clients sync skipped:", error);
          dbEnabled = false;
        });
    }

    mergeExtraClientsIntoConstants();
    applyClientNameOverrides();
    populateClients();

    if (editClientButton) {
      editClientButton.disabled = !clientSelect?.value;
    }
    if (clientSelect && editClientButton) {
      clientSelect.addEventListener("change", () => {
        editClientButton.disabled = !clientSelect?.value;
      });
    }

    wireEditClient();
    wireNewClient();
  };

  return {
    init,
    rebuildClientSelect,
    refreshClientSelectLabels,
  };
};
