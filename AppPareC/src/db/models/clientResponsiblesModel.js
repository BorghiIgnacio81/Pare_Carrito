export const createClientResponsiblesModel = ({ pool }) => {
  const assign = async ({ clientId, responsibleId, roleLabel = null, isPrimary = false } = {}) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      if (Boolean(isPrimary)) {
        await client.query(
          `
            UPDATE client_responsibles
            SET is_primary = FALSE
            WHERE client_id = $1;
          `,
          [clientId]
        );
      }

      const result = await client.query(
        `
          INSERT INTO client_responsibles (client_id, responsible_id, role_label, is_primary)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (client_id, responsible_id)
          DO UPDATE SET
            role_label = EXCLUDED.role_label,
            is_primary = EXCLUDED.is_primary
          RETURNING *;
        `,
        [clientId, responsibleId, roleLabel, Boolean(isPrimary)]
      );

      await client.query("COMMIT");
      return result.rows[0] || null;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  };

  const listByClient = async ({ clientId } = {}) => {
    const result = await pool.query(
      `
        SELECT
          cr.id,
          cr.client_id,
          cr.responsible_id,
          cr.role_label,
          cr.is_primary,
          cr.assigned_at,
          r.name AS responsible_name,
          r.code AS responsible_code
        FROM client_responsibles cr
        INNER JOIN responsibles r ON r.id = cr.responsible_id
        WHERE cr.client_id = $1
        ORDER BY cr.is_primary DESC, r.name ASC;
      `,
      [clientId]
    );

    return result.rows;
  };

  const listByResponsible = async ({ responsibleId } = {}) => {
    const result = await pool.query(
      `
        SELECT
          cr.id,
          cr.client_id,
          cr.responsible_id,
          cr.role_label,
          cr.is_primary,
          cr.assigned_at,
          c.name AS client_name,
          c.external_id AS client_external_id
        FROM client_responsibles cr
        INNER JOIN clients c ON c.id = cr.client_id
        WHERE cr.responsible_id = $1
        ORDER BY cr.is_primary DESC, c.name ASC;
      `,
      [responsibleId]
    );

    return result.rows;
  };

  const removeAssignment = async ({ clientId, responsibleId } = {}) => {
    const result = await pool.query(
      `
        DELETE FROM client_responsibles
        WHERE client_id = $1 AND responsible_id = $2
        RETURNING *;
      `,
      [clientId, responsibleId]
    );

    return result.rows[0] || null;
  };

  return {
    assign,
    listByClient,
    listByResponsible,
    removeAssignment,
  };
};
