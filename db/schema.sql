-- Gaztetxe Stock · esquema PostgreSQL
-- Todas las cantidades de stock en UNIDADES DE INVENTARIO; los pedidos en UNIDADES DE COMPRA.
-- Ids de texto generados en el cliente (permite trabajar sin conexión y sincronizar después).

CREATE TABLE IF NOT EXISTS categories (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  emoji       text NOT NULL DEFAULT '',
  sort_order  integer NOT NULL DEFAULT 0,
  active      boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS suppliers (
  id       text PRIMARY KEY,
  name     text NOT NULL,
  contact  text NOT NULL DEFAULT '',
  phone    text NOT NULL DEFAULT '',
  email    text NOT NULL DEFAULT '',
  notes    text NOT NULL DEFAULT '',
  active   boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS products (
  id                  text PRIMARY KEY,
  name                text NOT NULL,
  category_id         text REFERENCES categories(id) ON DELETE SET NULL,
  format              text NOT NULL DEFAULT '',
  count_mode          text NOT NULL DEFAULT 'unit' CHECK (count_mode IN ('unit','bottle','container')),
  inventory_unit      text NOT NULL DEFAULT 'unidad',
  container_volume_l  numeric,
  purchase_unit       text NOT NULL DEFAULT 'caja' CHECK (purchase_unit IN ('caja','pack','unidad')),
  units_per_pack      numeric,
  units_per_box       numeric,
  supplier_id         text REFERENCES suppliers(id) ON DELETE SET NULL,
  supplier_code       text NOT NULL DEFAULT '',
  purchase_price      numeric,          -- € neto por unidad de inventario, sin IVA
  list_price          numeric,          -- € tarifa antes de descuento
  vat_rate            numeric,
  sale_price          numeric,          -- € por consumición (opcional)
  servings_per_unit   numeric,
  min_stock           numeric,
  par_level           numeric,          -- stock objetivo
  reorder_point       numeric,          -- punto de pedido
  returnable          boolean NOT NULL DEFAULT false,
  return_value        numeric,          -- € por envase devuelto
  sort_order          integer NOT NULL DEFAULT 9999,  -- orden físico en el almacén
  active              boolean NOT NULL DEFAULT true,
  unconfirmed         jsonb NOT NULL DEFAULT '[]',     -- campos "POR CONFIRMAR"
  notes               text NOT NULL DEFAULT '',
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory_sessions (
  id          text PRIMARY KEY,
  date        timestamptz NOT NULL,
  event_name  text NOT NULL DEFAULT '',
  event_type  text NOT NULL DEFAULT 'Evento normal',
  attendees   integer,
  created_by  text NOT NULL DEFAULT '',
  notes       text NOT NULL DEFAULT '',
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  closed_at   timestamptz
);

CREATE TABLE IF NOT EXISTS inventory_lines (
  id                 text PRIMARY KEY,           -- sessionId:productId
  session_id         text NOT NULL REFERENCES inventory_sessions(id) ON DELETE CASCADE,
  product_id         text NOT NULL REFERENCES products(id),
  quantity           numeric NOT NULL DEFAULT 0,  -- enteras / envases cerrados
  partial_quantity   numeric NOT NULL DEFAULT 0,  -- fracción de botella abierta o litros de la caja abierta
  empty_containers   integer NOT NULL DEFAULT 0,  -- botellines vacíos
  counted            boolean NOT NULL DEFAULT true,
  UNIQUE (session_id, product_id)
);

-- Un inventario = el cierre de un evento. EVENTS es una vista para consultas y futuras predicciones.
CREATE OR REPLACE VIEW events AS
  SELECT id, event_name AS name, date, event_type AS type, attendees FROM inventory_sessions;

CREATE TABLE IF NOT EXISTS orders (
  id                  text PRIMARY KEY,
  date                timestamptz NOT NULL,
  supplier_id         text REFERENCES suppliers(id) ON DELETE SET NULL,  -- null = varios proveedores
  status              text NOT NULL DEFAULT 'borrador' CHECK (status IN ('borrador','enviado','recibido')),
  title               text NOT NULL DEFAULT '',
  notes               text NOT NULL DEFAULT '',
  based_on_session_id text,
  estimated_cost      numeric NOT NULL DEFAULT 0,
  message             text NOT NULL DEFAULT '',
  received_at         timestamptz
);

CREATE TABLE IF NOT EXISTS order_lines (
  id                       text PRIMARY KEY,     -- orderId:productId
  order_id                 text NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id               text NOT NULL REFERENCES products(id),
  supplier_id              text,
  quantity                 numeric NOT NULL,     -- en unidades de compra
  purchase_unit            text NOT NULL,
  units_per_purchase_unit  numeric NOT NULL DEFAULT 1,
  unit_price               numeric,              -- € por unidad de compra
  recommended              numeric NOT NULL DEFAULT 0,
  manual                   boolean NOT NULL DEFAULT false,
  note                     text NOT NULL DEFAULT '',
  position                 integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS purchases (
  id           text PRIMARY KEY,
  date         timestamptz NOT NULL,
  supplier_id  text REFERENCES suppliers(id) ON DELETE SET NULL,
  product_id   text NOT NULL REFERENCES products(id),
  quantity     numeric NOT NULL,          -- unidades de inventario; negativo = devolución al proveedor
  unit_price   numeric,
  total        numeric,
  order_id     text REFERENCES orders(id) ON DELETE SET NULL,
  invoice_ref  text NOT NULL DEFAULT '',
  notes        text NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS returns (
  id               text PRIMARY KEY,
  date             timestamptz NOT NULL,
  product_id       text NOT NULL REFERENCES products(id),
  quantity         numeric NOT NULL,      -- envases devueltos
  refund_per_unit  numeric NOT NULL,
  total_refund     numeric NOT NULL,
  notes            text NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS settings (
  key    text PRIMARY KEY,
  value  jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS purchases_product_date ON purchases (product_id, date);
CREATE INDEX IF NOT EXISTS lines_session ON inventory_lines (session_id);
CREATE INDEX IF NOT EXISTS order_lines_order ON order_lines (order_id);

-- v2: produktuaren kolorea eta eskaeraren ekitaldi mota (iragarpena)
ALTER TABLE products ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT '#5b6470';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS event_type text NOT NULL DEFAULT '';

-- v3: eskaeraren harrera (zenbaketa) eta noizko behar den
ALTER TABLE inventory_sessions ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'inventory';
ALTER TABLE inventory_sessions ADD COLUMN IF NOT EXISTS order_id text;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS needed_by date;
