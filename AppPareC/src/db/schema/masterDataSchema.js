const ensureResponsiblesTable = async (db) => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS responsibles (
      id BIGSERIAL PRIMARY KEY,
      code TEXT UNIQUE,
      name TEXT NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_responsibles_name ON responsibles (name);
  `);

  await db.query(`
    INSERT INTO responsibles (code, name)
    VALUES
      ('lucas', 'Lucas'),
      ('miriam', 'Miriam'),
      ('roberto', 'Roberto'),
      ('beatriz', 'Beatriz'),
      ('pato', 'Pato')
    ON CONFLICT (code) DO NOTHING;
  `);
};

const ensureClientsTable = async (db) => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS clients (
      id BIGSERIAL PRIMARY KEY,
      external_id TEXT UNIQUE,
      name TEXT NOT NULL,
      code INTEGER,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_clients_external_id ON clients (external_id);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_clients_name ON clients (name);
  `);
};

const ensureClientResponsiblesTable = async (db) => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS client_responsibles (
      id BIGSERIAL PRIMARY KEY,
      client_id BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      responsible_id BIGINT NOT NULL REFERENCES responsibles(id) ON DELETE CASCADE,
      role_label TEXT,
      is_primary BOOLEAN NOT NULL DEFAULT FALSE,
      assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(client_id, responsible_id)
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_client_responsibles_client_id
      ON client_responsibles (client_id);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_client_responsibles_responsible_id
      ON client_responsibles (responsible_id);
  `);
};

const ensureProductsTable = async (db) => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS products (
      id BIGSERIAL PRIMARY KEY,
      slug TEXT UNIQUE,
      name TEXT NOT NULL,
      default_unit TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_products_name ON products (name);
  `);
};

const ensureProductAliasesTable = async (db) => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS product_aliases (
      id BIGSERIAL PRIMARY KEY,
      product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      alias TEXT NOT NULL,
      normalized_alias TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(product_id, alias)
    );
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_product_aliases_alias ON product_aliases (alias);
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_product_aliases_normalized_alias
      ON product_aliases (normalized_alias);
  `);
};

const ensureMasterDataSchema = async (db) => {
  await ensureResponsiblesTable(db);
  await ensureClientsTable(db);
  await ensureClientResponsiblesTable(db);
  await ensureProductsTable(db);
  await ensureProductAliasesTable(db);
};

export { ensureMasterDataSchema };
