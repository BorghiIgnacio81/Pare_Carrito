# Modularización backend y capa de datos

## Estructura de módulos

```mermaid
graph TD
  A[server.js] --> B[src/controllers/pdfReportsController.js]
  A --> C[src/controllers/divisionComprasController.js]
  C --> D[src/services/divisionComprasService.js]

  A --> E[src/db/postgres.js]
  E --> F[src/db/schema/index.js]
  F --> G[src/db/schema/masterDataSchema.js]
  F --> H[src/db/schema/ordersSchema.js]
  F --> I[src/db/schema/ingestionSchema.js]

  E --> J[src/db/models/index.js]
  J --> K[src/db/models/clientsModel.js]
  J --> L[src/db/models/responsiblesModel.js]
  J --> M[src/db/models/clientResponsiblesModel.js]
```

## Esquema de tablas (ER)

```mermaid
erDiagram
  clients ||--o{ client_responsibles : "asigna"
  responsibles ||--o{ client_responsibles : "atiende"
  clients ||--o{ orders : "realiza"
  responsibles ||--o{ orders : "gestiona"
  orders ||--o{ order_items : "incluye"
  products ||--o{ order_items : "referencia"
  products ||--o{ product_aliases : "tiene"

  app_orders {
    bigint id PK
    timestamptz created_at
    text sheet_name
    text sheet_updated_range
    integer sheet_row_number
    text order_date_text
    text client_text
    jsonb row_json
  }

  clients {
    bigint id PK
    text external_id UK
    text name
    integer code
    boolean is_active
    text notes
    timestamptz created_at
    timestamptz updated_at
  }

  responsibles {
    bigint id PK
    text code UK
    text name
    boolean is_active
    text notes
    timestamptz created_at
    timestamptz updated_at
  }

  client_responsibles {
    bigint id PK
    bigint client_id FK
    bigint responsible_id FK
    text role_label
    boolean is_primary
    timestamptz assigned_at
  }

  products {
    bigint id PK
    text slug UK
    text name
    text default_unit
    boolean is_active
    timestamptz created_at
    timestamptz updated_at
  }

  product_aliases {
    bigint id PK
    bigint product_id FK
    text alias
    text normalized_alias
    timestamptz created_at
  }

  orders {
    bigint id PK
    bigint client_id FK
    bigint responsible_id FK
    text source
    text status
    timestamptz order_date
    text notes
    text sheet_name
    text sheet_updated_range
    integer sheet_row_number
    text raw_client_text
    timestamptz created_at
    timestamptz updated_at
  }

  order_items {
    bigint id PK
    bigint order_id FK
    bigint product_id FK
    text product_name_text
    numeric quantity
    text unit
    text notes
    integer position
    timestamptz created_at
  }
```

## Estado actual

- `app_orders` se mantiene para persistencia raw (compatibilidad con flujo actual).
- Se agregan tablas normalizadas para evolución por dominios (`clients`, `responsibles`, `orders`, `order_items`).
- Se agrega semilla inicial de responsables: Lucas, Miriam, Roberto, Beatriz, Pato.
- `server.js` ahora inicializa el esquema al arrancar y expone `app.locals.dbModels`.
