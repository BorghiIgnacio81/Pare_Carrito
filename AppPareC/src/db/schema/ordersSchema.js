const ensureOrdersTable = async (db) => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id BIGSERIAL PRIMARY KEY,
      client_id BIGINT REFERENCES clients(id) ON DELETE SET NULL,
      responsible_id BIGINT REFERENCES responsibles(id) ON DELETE SET NULL,
      source TEXT NOT NULL DEFAULT 'sheet',
      status TEXT NOT NULL DEFAULT 'draft',
      order_date TIMESTAMPTZ,
      notes TEXT,
      raw_row_json JSONB NOT NULL DEFAULT '[]'::jsonb,
      sheet_name TEXT,
      sheet_updated_range TEXT,
      sheet_row_number INTEGER,
      raw_client_text TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (status IN ('draft', 'confirmed', 'cancelled', 'imported')),
      CHECK (source IN ('sheet', 'whatsapp', 'manual', 'api'))
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_orders_client_id ON orders (client_id);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_orders_responsible_id ON orders (responsible_id);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_orders_order_date ON orders (order_date);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_orders_sheet_row_number ON orders (sheet_row_number);
  `);

  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS ux_orders_sheet_source_row
      ON orders (source, sheet_name, sheet_row_number)
      WHERE source = 'sheet' AND sheet_name IS NOT NULL AND sheet_row_number IS NOT NULL;
  `);

  await db.query(`
    ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS raw_row_json JSONB NOT NULL DEFAULT '[]'::jsonb;
  `);
};

const ensureOrderItemsTable = async (db) => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS order_items (
      id BIGSERIAL PRIMARY KEY,
      order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id BIGINT REFERENCES products(id) ON DELETE SET NULL,
      product_name_text TEXT,
      quantity NUMERIC(12, 3),
      quantity_text TEXT,
      unit TEXT,
      variant TEXT,
      notes TEXT,
      raw_value_text TEXT,
      source_column_index INTEGER,
      source_header_text TEXT,
      position INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (quantity IS NULL OR quantity > 0)
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items (order_id);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items (product_id);
  `);

  await db.query(`
    ALTER TABLE order_items
    ADD COLUMN IF NOT EXISTS quantity_text TEXT;
  `);

  await db.query(`
    ALTER TABLE order_items
    ADD COLUMN IF NOT EXISTS variant TEXT;
  `);

  await db.query(`
    ALTER TABLE order_items
    ADD COLUMN IF NOT EXISTS raw_value_text TEXT;
  `);

  await db.query(`
    ALTER TABLE order_items
    ADD COLUMN IF NOT EXISTS source_column_index INTEGER;
  `);

  await db.query(`
    ALTER TABLE order_items
    ADD COLUMN IF NOT EXISTS source_header_text TEXT;
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_order_items_source_col
      ON order_items (source_column_index);
  `);

  await db.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS ux_order_items_order_source_col
      ON order_items (order_id, source_column_index)
      WHERE source_column_index IS NOT NULL;
  `);

  await db.query(`
    ALTER TABLE order_items
    ALTER COLUMN quantity DROP NOT NULL;
  `);

  await db.query(`
    ALTER TABLE order_items
    DROP CONSTRAINT IF EXISTS order_items_quantity_check;
  `);

  await db.query(`
    ALTER TABLE order_items
    ADD CONSTRAINT order_items_quantity_check
    CHECK (quantity IS NULL OR quantity > 0);
  `);
};

const ensureOrdersSchema = async (db) => {
  await ensureOrdersTable(db);
  await ensureOrderItemsTable(db);
};

export { ensureOrdersSchema };
