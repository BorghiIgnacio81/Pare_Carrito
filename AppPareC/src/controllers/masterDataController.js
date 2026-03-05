const parseId = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
};

const pickBoolean = (value, fallback = undefined) => {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value === "boolean") {
    return value;
  }
  const text = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "si", "sí"].includes(text)) {
    return true;
  }
  if (["0", "false", "no"].includes(text)) {
    return false;
  }
  return fallback;
};

const parseNullableInt = (value, fallback = undefined) => {
  if (value === undefined) {
    return fallback;
  }
  if (value === null || String(value).trim() === "") {
    return null;
  }
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new Error("Invalid numeric value");
  }
  return Math.trunc(n);
};

export const createMasterDataController = ({ getDbModels } = {}) => {
  const withModels = async (res, action) => {
    const models = typeof getDbModels === "function" ? await getDbModels() : null;
    if (!models) {
      res.status(503).json({ ok: false, error: "DB models not initialized." });
      return;
    }
    await action(models);
  };

  const handleListClients = async (req, res) => {
    await withModels(res, async (models) => {
      try {
        const includeInactive = pickBoolean(req.query.includeInactive, false);
        const data = await models.clients.list({ includeInactive });
        res.json({ ok: true, data });
      } catch (error) {
        res.status(500).json({ ok: false, error: String(error?.message || error) });
      }
    });
  };

  const handleCreateClient = async (req, res) => {
    await withModels(res, async (models) => {
      try {
        const payload = req.body || {};
        const code = parseNullableInt(payload.code, null);
        const created = await models.clients.create({
          externalId: payload.externalId,
          name: payload.name,
          code,
          notes: payload.notes ?? null,
        });
        res.status(201).json({ ok: true, data: created });
      } catch (error) {
        res.status(400).json({ ok: false, error: String(error?.message || error) });
      }
    });
  };

  const handleGetClientById = async (req, res) => {
    await withModels(res, async (models) => {
      try {
        const id = parseId(req.params.clientId);
        if (!id) {
          res.status(400).json({ ok: false, error: "Invalid clientId." });
          return;
        }
        const item = await models.clients.getById({ id });
        if (!item) {
          res.status(404).json({ ok: false, error: "Client not found." });
          return;
        }
        res.json({ ok: true, data: item });
      } catch (error) {
        res.status(500).json({ ok: false, error: String(error?.message || error) });
      }
    });
  };

  const handleUpdateClient = async (req, res) => {
    await withModels(res, async (models) => {
      try {
        const id = parseId(req.params.clientId);
        if (!id) {
          res.status(400).json({ ok: false, error: "Invalid clientId." });
          return;
        }

        const payload = req.body || {};
        const code = parseNullableInt(payload.code, undefined);
        const updated = await models.clients.updateById({
          id,
          externalId: payload.externalId,
          name: payload.name,
          code,
          notes: payload.notes,
          isActive: pickBoolean(payload.isActive, undefined),
        });
        if (!updated) {
          res.status(404).json({ ok: false, error: "Client not found." });
          return;
        }
        res.json({ ok: true, data: updated });
      } catch (error) {
        res.status(400).json({ ok: false, error: String(error?.message || error) });
      }
    });
  };

  const handleUpsertClientByExternalId = async (req, res) => {
    await withModels(res, async (models) => {
      try {
        const externalId = String(req.params.externalId || "").trim();
        if (!externalId) {
          res.status(400).json({ ok: false, error: "Invalid externalId." });
          return;
        }

        const payload = req.body || {};
        const code = parseNullableInt(payload.code, null);
        const item = await models.clients.upsertByExternalId({
          externalId,
          name: payload.name,
          code,
          notes: payload.notes ?? null,
        });
        res.json({ ok: true, data: item });
      } catch (error) {
        res.status(400).json({ ok: false, error: String(error?.message || error) });
      }
    });
  };

  const handleDeleteClient = async (req, res) => {
    await withModels(res, async (models) => {
      try {
        const id = parseId(req.params.clientId);
        if (!id) {
          res.status(400).json({ ok: false, error: "Invalid clientId." });
          return;
        }
        const deleted = await models.clients.softDeleteById({ id });
        if (!deleted) {
          res.status(404).json({ ok: false, error: "Client not found." });
          return;
        }
        res.json({ ok: true, data: deleted });
      } catch (error) {
        res.status(500).json({ ok: false, error: String(error?.message || error) });
      }
    });
  };

  const handleListResponsibles = async (req, res) => {
    await withModels(res, async (models) => {
      try {
        const includeInactive = pickBoolean(req.query.includeInactive, false);
        const data = await models.responsibles.list({ includeInactive });
        res.json({ ok: true, data });
      } catch (error) {
        res.status(500).json({ ok: false, error: String(error?.message || error) });
      }
    });
  };

  const handleCreateResponsible = async (req, res) => {
    await withModels(res, async (models) => {
      try {
        const payload = req.body || {};
        const created = await models.responsibles.create({
          code: payload.code,
          name: payload.name,
          notes: payload.notes ?? null,
        });
        res.status(201).json({ ok: true, data: created });
      } catch (error) {
        res.status(400).json({ ok: false, error: String(error?.message || error) });
      }
    });
  };

  const handleGetResponsibleById = async (req, res) => {
    await withModels(res, async (models) => {
      try {
        const id = parseId(req.params.responsibleId);
        if (!id) {
          res.status(400).json({ ok: false, error: "Invalid responsibleId." });
          return;
        }
        const item = await models.responsibles.getById({ id });
        if (!item) {
          res.status(404).json({ ok: false, error: "Responsible not found." });
          return;
        }
        res.json({ ok: true, data: item });
      } catch (error) {
        res.status(500).json({ ok: false, error: String(error?.message || error) });
      }
    });
  };

  const handleUpdateResponsible = async (req, res) => {
    await withModels(res, async (models) => {
      try {
        const id = parseId(req.params.responsibleId);
        if (!id) {
          res.status(400).json({ ok: false, error: "Invalid responsibleId." });
          return;
        }

        const payload = req.body || {};
        const updated = await models.responsibles.updateById({
          id,
          code: payload.code,
          name: payload.name,
          notes: payload.notes,
          isActive: pickBoolean(payload.isActive, undefined),
        });
        if (!updated) {
          res.status(404).json({ ok: false, error: "Responsible not found." });
          return;
        }
        res.json({ ok: true, data: updated });
      } catch (error) {
        res.status(400).json({ ok: false, error: String(error?.message || error) });
      }
    });
  };

  const handleDeleteResponsible = async (req, res) => {
    await withModels(res, async (models) => {
      try {
        const id = parseId(req.params.responsibleId);
        if (!id) {
          res.status(400).json({ ok: false, error: "Invalid responsibleId." });
          return;
        }
        const deleted = await models.responsibles.softDeleteById({ id });
        if (!deleted) {
          res.status(404).json({ ok: false, error: "Responsible not found." });
          return;
        }
        res.json({ ok: true, data: deleted });
      } catch (error) {
        res.status(500).json({ ok: false, error: String(error?.message || error) });
      }
    });
  };

  const handleAssignResponsible = async (req, res) => {
    await withModels(res, async (models) => {
      try {
        const clientId = parseId(req.params.clientId);
        if (!clientId) {
          res.status(400).json({ ok: false, error: "Invalid clientId." });
          return;
        }
        const responsibleId = parseId(req.body?.responsibleId);
        if (!responsibleId) {
          res.status(400).json({ ok: false, error: "Invalid responsibleId." });
          return;
        }

        const assigned = await models.clientResponsibles.assign({
          clientId,
          responsibleId,
          roleLabel: req.body?.roleLabel ?? null,
          isPrimary: pickBoolean(req.body?.isPrimary, false),
        });

        res.status(201).json({ ok: true, data: assigned });
      } catch (error) {
        res.status(400).json({ ok: false, error: String(error?.message || error) });
      }
    });
  };

  const handleListClientAssignments = async (req, res) => {
    await withModels(res, async (models) => {
      try {
        const clientId = parseId(req.params.clientId);
        if (!clientId) {
          res.status(400).json({ ok: false, error: "Invalid clientId." });
          return;
        }
        const data = await models.clientResponsibles.listByClient({ clientId });
        res.json({ ok: true, data });
      } catch (error) {
        res.status(500).json({ ok: false, error: String(error?.message || error) });
      }
    });
  };

  const handleListResponsibleAssignments = async (req, res) => {
    await withModels(res, async (models) => {
      try {
        const responsibleId = parseId(req.params.responsibleId);
        if (!responsibleId) {
          res.status(400).json({ ok: false, error: "Invalid responsibleId." });
          return;
        }
        const data = await models.clientResponsibles.listByResponsible({ responsibleId });
        res.json({ ok: true, data });
      } catch (error) {
        res.status(500).json({ ok: false, error: String(error?.message || error) });
      }
    });
  };

  const handleDeleteAssignment = async (req, res) => {
    await withModels(res, async (models) => {
      try {
        const clientId = parseId(req.params.clientId);
        const responsibleId = parseId(req.params.responsibleId);
        if (!clientId || !responsibleId) {
          res.status(400).json({ ok: false, error: "Invalid ids." });
          return;
        }

        const removed = await models.clientResponsibles.removeAssignment({
          clientId,
          responsibleId,
        });

        if (!removed) {
          res.status(404).json({ ok: false, error: "Assignment not found." });
          return;
        }

        res.json({ ok: true, data: removed });
      } catch (error) {
        res.status(500).json({ ok: false, error: String(error?.message || error) });
      }
    });
  };

  return {
    handleListClients,
    handleCreateClient,
    handleGetClientById,
    handleUpdateClient,
    handleUpsertClientByExternalId,
    handleDeleteClient,
    handleListResponsibles,
    handleCreateResponsible,
    handleGetResponsibleById,
    handleUpdateResponsible,
    handleDeleteResponsible,
    handleAssignResponsible,
    handleListClientAssignments,
    handleListResponsibleAssignments,
    handleDeleteAssignment,
  };
};
