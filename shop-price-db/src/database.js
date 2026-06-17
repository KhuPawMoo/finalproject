const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const CATEGORIES = ['Drinks', 'Snacks', 'Household Items', 'Other'];
const DEFAULT_LIMIT = 80;
const MAX_LIMIT = 250;

function resolveDatabasePath() {
  const configuredPath = process.env.DATABASE_FILE || './data/shop-prices.sqlite';
  return path.isAbsolute(configuredPath)
    ? configuredPath
    : path.join(__dirname, '..', configuredPath);
}

function createDatabase() {
  const databasePath = resolveDatabasePath();
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });

  const db = new DatabaseSync(databasePath);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA busy_timeout = 5000;');
  db.exec('PRAGMA foreign_keys = ON;');

  const schema = fs.readFileSync(path.join(__dirname, '..', 'database', 'schema.sql'), 'utf8');
  db.exec(schema);

  return db;
}

function normalizeCategory(category) {
  return CATEGORIES.includes(category) ? category : 'Other';
}

function normalizeLimit(limit) {
  const parsedLimit = Number.parseInt(limit, 10);

  if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
    return DEFAULT_LIMIT;
  }

  return Math.min(parsedLimit, MAX_LIMIT);
}

function priceToCents(price) {
  const cleanedPrice = String(price ?? '').trim().replace(/,/g, '');
  const numericPrice = Number(cleanedPrice);

  if (!Number.isFinite(numericPrice) || numericPrice < 0) {
    throw new Error('Price must be a valid non-negative number.');
  }

  return Math.round(numericPrice * 100);
}

function rowToProduct(row) {
  return {
    id: row.id,
    product_name: row.product_name,
    category: row.category,
    price: row.price / 100,
    price_cents: row.price,
    updated_at: row.updated_at
  };
}

function createProductStore(db) {
  const statements = {
    countProducts: db.prepare('SELECT COUNT(*) AS count FROM products'),
    listProducts: db.prepare(`
      SELECT id, product_name, category, price, updated_at
      FROM products
      WHERE (@search = '' OR product_name LIKE '%' || @search || '%')
        AND (@category = '' OR category = @category)
      ORDER BY product_name COLLATE NOCASE ASC
      LIMIT @limit
    `),
    getProduct: db.prepare(`
      SELECT id, product_name, category, price, updated_at
      FROM products
      WHERE id = @id
    `),
    createProduct: db.prepare(`
      INSERT INTO products (product_name, category, price, updated_at)
      VALUES (@product_name, @category, @price, @updated_at)
    `),
    updateProduct: db.prepare(`
      UPDATE products
      SET product_name = @product_name,
          category = @category,
          price = @price,
          updated_at = @updated_at
      WHERE id = @id
    `),
    deleteProduct: db.prepare('DELETE FROM products WHERE id = @id')
  };

  function list({ search = '', category = '', limit } = {}) {
    const safeCategory = CATEGORIES.includes(category) ? category : '';

    return statements.listProducts
      .all({
        search: String(search).trim(),
        category: safeCategory,
        limit: normalizeLimit(limit)
      })
      .map(rowToProduct);
  }

  function get(id) {
    const row = statements.getProduct.get({ id: Number(id) });
    return row ? rowToProduct(row) : null;
  }

  function create(input) {
    const productName = String(input.product_name || '').trim();

    if (!productName) {
      throw new Error('Product name is required.');
    }

    const result = statements.createProduct.run({
      product_name: productName,
      category: normalizeCategory(input.category),
      price: priceToCents(input.price),
      updated_at: new Date().toISOString()
    });

    return get(Number(result.lastInsertRowid));
  }

  function update(id, input) {
    const productName = String(input.product_name || '').trim();

    if (!productName) {
      throw new Error('Product name is required.');
    }

    const result = statements.updateProduct.run({
      id: Number(id),
      product_name: productName,
      category: normalizeCategory(input.category),
      price: priceToCents(input.price),
      updated_at: new Date().toISOString()
    });

    if (result.changes === 0) {
      return null;
    }

    return get(id);
  }

  function remove(id) {
    return statements.deleteProduct.run({ id: Number(id) }).changes > 0;
  }

  function seedDemoProducts() {
    const count = statements.countProducts.get().count;

    if (count > 0) {
      return false;
    }

    const seed = fs.readFileSync(path.join(__dirname, '..', 'database', 'seed.sql'), 'utf8');
    db.exec(seed);
    return true;
  }

  return {
    categories: CATEGORIES,
    create,
    get,
    list,
    remove,
    seedDemoProducts,
    update
  };
}

module.exports = {
  CATEGORIES,
  createDatabase,
  createProductStore,
  priceToCents
};
