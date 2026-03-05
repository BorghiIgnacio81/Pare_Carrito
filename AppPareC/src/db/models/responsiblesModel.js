const normalizeText = (value) => String(value ?? "").trim();

export const createResponsiblesModel = ({ pool }) => {
  const getById = async ({ id } = {}) => {
    const result = await pool.query(
      `
        SELECT
          r.id,
          r.code,
          r.name,
          r.is_active,
          r.notes,
          r.created_at,
          r.updated_at
        FROM responsibles r
        WHERE r.id = $1
        LIMIT 1;
      `,
      [id]
    );
    return result.rows[0] || null;
  };

  const list = async ({ includeInactive = false } = {}) => {
    const filter = includeInactive ? "" : "WHERE r.is_active = TRUE";
    const result = await pool.query(
      `
        SELECT
          r.id,
          r.code,
          r.name,
          r.is_active,
          r.notes,
          r.created_at,
          r.updated_at
        FROM responsibles r
        ${filter}
        ORDER BY r.name ASC;
      `
    );
    return result.rows;
  };

  const create = async ({ code = null, name, notes = null } = {}) => {
    const cleanCode = normalizeText(code) || null;
    const cleanName = normalizeText(name);
    if (!cleanName) {
      throw new Error("name is required");
    }

    const result = await pool.query(
      `
        INSERT INTO responsibles (code, name, notes)
        VALUES ($1, $2, $3)
        RETURNING *;
      `,
      [cleanCode, cleanName, notes]
    );

    return result.rows[0] || null;
  };

  const upsertByCode = async ({ code, name, notes = null } = {}) => {
    const cleanCode = normalizeText(code);
    const cleanName = normalizeText(name);
    if (!cleanCode) {
      throw new Error("code is required");
    }
    if (!cleanName) {
      throw new Error("name is required");
    }

    const result = await pool.query(
      `
        INSERT INTO responsibles (code, name, notes)
        VALUES ($1, $2, $3)
        ON CONFLICT (code)
        DO UPDATE SET
          name = EXCLUDED.name,
          notes = EXCLUDED.notes,
          updated_at = NOW()
        RETURNING *;
      `,
      [cleanCode, cleanName, notes]
    );

    return result.rows[0] || null;
  };

  const updateById = async ({ id, code = undefined, name = undefined, notes = undefined, isActive = undefined } = {}) => {
    const current = await getById({ id });
    if (!current) {
      return null;
    }

    const nextCode = code === undefined ? current.code : normalizeText(code) || null;
    const nextName = name === undefined ? current.name : normalizeText(name);
    const nextNotes = notes === undefined ? current.notes : notes;
    const nextIsActive = isActive === undefined ? current.is_active : Boolean(isActive);

    if (!nextName) {
      throw new Error("name is required");
    }

    const result = await pool.query(
      `
        UPDATE responsibles
        SET
          code = $2,
          name = $3,
          notes = $4,
          is_active = $5,
          updated_at = NOW()
        WHERE id = $1
        RETURNING *;
      `,
      [id, nextCode, nextName, nextNotes, nextIsActive]
    );

    return result.rows[0] || null;
  };

  const softDeleteById = async ({ id } = {}) => {
    const result = await pool.query(
      `
        UPDATE responsibles
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
    upsertByCode,
    updateById,
    softDeleteById,
  };
};
