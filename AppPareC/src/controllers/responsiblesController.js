export const createResponsiblesController = ({
  responsibleSelect,
  newResponsibleButton,
  editResponsibleButton,
  assignResponsibleButton,
  removeResponsibleButton,
  assignmentStatus,
  clientSelect,
  ordersApi,
} = {}) => {
  let responsibles = [];
  let assignmentByClient = new Map();

  const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

  const setStatus = (message, isError = false) => {
    if (!assignmentStatus) {
      return;
    }
    assignmentStatus.textContent = String(message || "").trim();
    assignmentStatus.classList.remove("save-status--success", "save-status--error");
    if (!message) {
      return;
    }
    assignmentStatus.classList.add(isError ? "save-status--error" : "save-status--success");
  };

  const selectedClientId = () => String(clientSelect?.value || "").trim();
  const selectedResponsibleId = () => String(responsibleSelect?.value || "").trim();

  const buildOptionLabel = (item) => {
    const code = String(item.code || "").trim();
    return code ? `${item.name} (${code})` : item.name;
  };

  const refreshButtonsState = () => {
    const hasClient = Boolean(selectedClientId());
    const hasResponsible = Boolean(selectedResponsibleId());

    if (editResponsibleButton) {
      editResponsibleButton.disabled = !hasResponsible;
    }
    if (assignResponsibleButton) {
      assignResponsibleButton.disabled = !(hasClient && hasResponsible);
    }

    if (removeResponsibleButton) {
      if (!hasClient || !hasResponsible) {
        removeResponsibleButton.disabled = true;
      } else {
        const current = assignmentByClient.get(selectedClientId()) || [];
        removeResponsibleButton.disabled = !current.some(
          (item) => String(item.responsible_id) === selectedResponsibleId()
        );
      }
    }
  };

  const renderResponsibles = () => {
    if (!responsibleSelect) {
      return;
    }
    const current = selectedResponsibleId();
    responsibleSelect.innerHTML = '<option value="">Seleccione un responsable</option>';
    responsibles
      .slice()
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "es"))
      .forEach((item) => {
        const option = document.createElement("option");
        option.value = String(item.id);
        option.textContent = buildOptionLabel(item);
        responsibleSelect.appendChild(option);
      });
    if (current && responsibles.some((item) => String(item.id) === current)) {
      responsibleSelect.value = current;
    }
    refreshButtonsState();
  };

  const showAssignmentSummary = (clientId) => {
    const items = assignmentByClient.get(String(clientId || "")) || [];
    if (!items.length) {
      setStatus("Cliente sin responsable asignado.");
      return;
    }

    const primary = items.find((item) => item.is_primary) || items[0];
    const label = String(primary.responsible_name || "").trim() || "Responsable";
    setStatus(`Responsable actual: ${label}`);
  };

  const loadAssignmentsForClient = async (clientId) => {
    const id = String(clientId || "").trim();
    if (!id) {
      setStatus("");
      assignmentByClient.delete(id);
      refreshButtonsState();
      return;
    }

    if (!ordersApi || typeof ordersApi.listClientResponsibles !== "function") {
      setStatus("API de responsables no disponible.", true);
      return;
    }

    try {
      const response = await ordersApi.listClientResponsibles({ clientId: id });
      const items = Array.isArray(response?.data) ? response.data : [];
      assignmentByClient.set(id, items);
      const primary = items.find((item) => item.is_primary);
      if (primary && responsibleSelect) {
        responsibleSelect.value = String(primary.responsible_id);
      }
      showAssignmentSummary(id);
    } catch (error) {
      console.error(error);
      setStatus(String(error?.message || error || "No se pudieron cargar asignaciones."), true);
    } finally {
      refreshButtonsState();
    }
  };

  const loadResponsibles = async () => {
    if (!ordersApi || typeof ordersApi.listDbResponsibles !== "function") {
      setStatus("API de responsables no disponible.", true);
      return;
    }

    const response = await ordersApi.listDbResponsibles({ includeInactive: false });
    responsibles = Array.isArray(response?.data) ? response.data : [];
    renderResponsibles();
  };

  const wireCreateResponsible = () => {
    if (!newResponsibleButton) {
      return;
    }

    newResponsibleButton.addEventListener("click", async () => {
      try {
        const name = window.prompt("Nombre del responsable:", "");
        if (name == null) {
          return;
        }
        const cleanName = normalize(name);
        if (!cleanName) {
          alert("Debe ingresar un nombre.");
          return;
        }

        const code = window.prompt("Código corto (opcional):", cleanName.toLowerCase());
        const cleanCode = normalize(code || "") || null;

        const created = await ordersApi.createDbResponsible({
          name: cleanName,
          code: cleanCode,
        });

        const item = created?.data;
        if (item) {
          responsibles.push(item);
          renderResponsibles();
          responsibleSelect.value = String(item.id);
          refreshButtonsState();
          setStatus(`Responsable creado: ${item.name}`);
        }
      } catch (error) {
        console.error(error);
        alert(String(error?.message || error || "No se pudo crear responsable."));
      }
    });
  };

  const wireEditResponsible = () => {
    if (!editResponsibleButton) {
      return;
    }

    editResponsibleButton.addEventListener("click", async () => {
      const id = selectedResponsibleId();
      if (!id) {
        return;
      }
      const current = responsibles.find((item) => String(item.id) === id);
      if (!current) {
        return;
      }

      const nextName = window.prompt("Nuevo nombre del responsable:", current.name || "");
      if (nextName == null) {
        return;
      }

      const cleanName = normalize(nextName);
      if (!cleanName) {
        alert("El nombre no puede quedar vacío.");
        return;
      }

      const nextCode = window.prompt("Código corto (opcional):", current.code || "");
      if (nextCode == null) {
        return;
      }

      try {
        const response = await ordersApi.updateDbResponsibleById({
          id,
          name: cleanName,
          code: normalize(nextCode) || null,
        });

        const updated = response?.data;
        if (updated) {
          const index = responsibles.findIndex((item) => String(item.id) === id);
          if (index >= 0) {
            responsibles[index] = updated;
          }
          renderResponsibles();
          responsibleSelect.value = String(updated.id);
          setStatus(`Responsable actualizado: ${updated.name}`);
          refreshButtonsState();
        }
      } catch (error) {
        console.error(error);
        alert(String(error?.message || error || "No se pudo actualizar responsable."));
      }
    });
  };

  const wireAssignResponsible = () => {
    if (!assignResponsibleButton) {
      return;
    }

    assignResponsibleButton.addEventListener("click", async () => {
      const clientId = selectedClientId();
      const responsibleId = selectedResponsibleId();
      if (!clientId || !responsibleId) {
        return;
      }

      try {
        await ordersApi.assignResponsibleToClient({
          clientId,
          responsibleId,
          isPrimary: true,
        });
        await loadAssignmentsForClient(clientId);
        setStatus("Responsable asignado al cliente.");
      } catch (error) {
        console.error(error);
        alert(String(error?.message || error || "No se pudo asignar responsable."));
      }
    });
  };

  const wireRemoveResponsible = () => {
    if (!removeResponsibleButton) {
      return;
    }

    removeResponsibleButton.addEventListener("click", async () => {
      const clientId = selectedClientId();
      const responsibleId = selectedResponsibleId();
      if (!clientId || !responsibleId) {
        return;
      }

      try {
        await ordersApi.removeResponsibleFromClient({
          clientId,
          responsibleId,
        });
        await loadAssignmentsForClient(clientId);
        setStatus("Responsable desasignado del cliente.");
      } catch (error) {
        console.error(error);
        alert(String(error?.message || error || "No se pudo quitar responsable."));
      }
    });
  };

  const init = async () => {
    if (!responsibleSelect || !ordersApi) {
      return;
    }

    await loadResponsibles();
    await loadAssignmentsForClient(selectedClientId());

    responsibleSelect.addEventListener("change", () => {
      refreshButtonsState();
    });

    if (clientSelect) {
      clientSelect.addEventListener("change", () => {
        loadAssignmentsForClient(selectedClientId());
      });
    }

    wireCreateResponsible();
    wireEditResponsible();
    wireAssignResponsible();
    wireRemoveResponsible();

    refreshButtonsState();
  };

  return {
    init,
    refreshForClient: async (clientId) => {
      await loadAssignmentsForClient(clientId);
    },
  };
};
