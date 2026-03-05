const normalizeText = (value) => String(value ?? "").trim();

export const createClientsModel = ({ pool }) => {
  const getById = async ({ id } = {}) => {
    const result = await pool.query(
      `
        SELECT
          c.id,
          c.external_id,
          c.name,
          c.code,
          c.is_active,
          c.notes,
          c.created_at,
          c.updated_at
        FROM clients c
        WHERE c.id = $1
        LIMIT 1;
      `,
      [id]
    );
    return result.rows[0] || null;
  };

  const list = async ({ includeInactive = false } = {}) => {
    const filter = includeInactive ? "" : "WHERE c.is_active = TRUE";
    const result = await pool.query(
      `
        SELECT
          c.id,
          c.external_id,
          c.name,
          c.code,
          c.is_active,
          c.notes,
          c.created_at,
          c.updated_at
        FROM clients c
        ${filter}
        ORDER BY c.name ASC;
      `
    );
    return result.rows;
  };

  const create = async ({ externalId = null, name, code = null, notes = null } = {}) => {
    const external_id = normalizeText(externalId) || null;
    const cleanName = normalizeText(name);
    if (!cleanName) {
      throw new Error("name is required");
    }

    const result = await pool.query(
      `
        INSERT INTO clients (external_id, name, code, notes)
        VALUES ($1, $2, $3, $4)
        RETURNING *;
      `,
      [external_id, cleanName, code, notes]
    );

    return result.rows[0] || null;
  };

  const upsertByExternalId = async ({ externalId, name, code = null, notes = null } = {}) => {
    const external_id = normalizeText(externalId);
    const cleanName = normalizeText(name);
    if (!external_id) {
      throw new Error("externalId is required");
    }
    if (!cleanName) {
      throw new Error("name is required");
    }

    const result = await pool.query(
      `
        INSERT INTO clients (external_id, name, code, notes)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (external_id)
        DO UPDATE SET
          name = EXCLUDED.name,
          code = EXCLUDED.code,
          notes = EXCLUDED.notes,
          updated_at = NOW()
        RETURNING *;
      `,
      [external_id, cleanName, code, notes]
    );

    return result.rows[0] || null;
  };

  const updateById = async ({ id, externalId = undefined, name = undefined, code = undefined, notes = undefined, isActive = undefined } = {}) => {
    const current = await getById({ id });
    if (!current) {
      return null;
    }

    const nextExternalId =
      externalId === undefined ? current.external_id : normalizeText(externalId) || null;
    const nextName = name === undefined ? current.name : normalizeText(name);
    const nextCode = code === undefined ? current.code : code;
    const nextNotes = notes === undefined ? current.notes : notes;
    const nextIsActive = isActive === undefined ? current.is_active : Boolean(isActive);

    if (!nextName) {
      throw new Error("name is required");
    }

    const result = await pool.query(
      `
        UPDATE clients
        SET
          external_id = $2,
          name = $3,
          code = $4,
          notes = $5,
          is_active = $6,
          updated_at = NOW()
        WHERE id = $1
        RETURNING *;
      `,
      [id, nextExternalId, nextName, nextCode, nextNotes, nextIsActive]
    );

    return result.rows[0] || null;
  };

  const softDeleteById = async ({ id } = {}) => {
    const result = await pool.query(
      `
        UPDATE clients
        SET
          is_active = FALSE,
          updated_at = NOW()
        WHERE id = $1
        RETURNING *;
      `,
      [id]
    );
    return result.rows[0] || null;
  };

  return {
    getById,
    list,
    create,
    upsertByExternalId,
    updateById,
    softDeleteById,
  };
};
