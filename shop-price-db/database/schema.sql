CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_name TEXT NOT NULL COLLATE NOCASE,
  category TEXT NOT NULL DEFAULT 'Other'
    CHECK (category IN ('Drinks', 'Snacks', 'Household Items', 'Other')),
  price INTEGER NOT NULL CHECK (price >= 0),
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_products_name
  ON products(product_name COLLATE NOCASE);

CREATE INDEX IF NOT EXISTS idx_products_category
  ON products(category);
