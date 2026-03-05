const ensureRawOrdersTable = async (db) => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS app_sheets (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      headers_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    ALTER TABLE app_sheets
    ADD COLUMN IF NOT EXISTS headers_json JSONB NOT NULL DEFAULT '[]'::jsonb;
  `);

  await db.query(`
    ALTER TABLE app_sheets
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  `);

  await db.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'app_orders'
          AND column_name IN ('sheet_name', 'sheet_updated_range', 'order_date_text', 'client_text', 'row_json')
      ) THEN
        DROP TABLE IF EXISTS app_orders;
      END IF;
    END
    $$;
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS app_orders (
      id BIGSERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      sheet_id BIGINT NOT NULL REFERENCES app_sheets(id) ON DELETE RESTRICT,
      sheet_row_number INTEGER NOT NULL,
      client_id BIGINT REFERENCES clients(id) ON DELETE SET NULL,
      order_timestamp TIMESTAMPTZ,
      cells_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      UNIQUE(sheet_id, sheet_row_number)
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_app_orders_created_at ON app_orders (created_at DESC);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_app_orders_sheet_id_row
      ON app_orders (sheet_id, sheet_row_number);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_app_orders_sheet_row_number ON app_orders (sheet_row_number);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_app_orders_client_id ON app_orders (client_id);
  `);
};

const ensureIngestionSchema = async (db) => {
  await ensureRawOrdersTable(db);
};

export { ensureIngestionSchema };
