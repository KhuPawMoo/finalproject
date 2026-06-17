# Shop Price DB

A small internal web application for looking up and managing product prices in a local shop. Employees can search prices without logging in. Admins can add, edit, update, and delete products after logging in.

## Folder Structure

```text
shop-price-db/
  database/
    schema.sql        SQLite table and indexes
    seed.sql          Optional demo products
  data/
    .gitkeep          Database directory placeholder
  public/
    index.html        Employee price lookup page
    admin.html        Admin dashboard page
    styles.css        Mobile-friendly interface styles
    app.js            Price lookup JavaScript
    admin.js          Admin dashboard JavaScript
  src/
    auth.js           Cookie-based admin login
    database.js       SQLite access and product store
    env.js            Tiny .env loader
    server.js         Express app and API routes
  .env.example        Configuration template
  package.json        App scripts and dependencies
```

## Database Schema

The SQLite database is created automatically at startup from `database/schema.sql`.

```sql
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
```

`price` is stored as cents to avoid decimal rounding mistakes. The API accepts normal decimal prices like `1.50` and returns prices as decimal numbers.

## API Routes

Public routes:

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Health check |
| `GET` | `/api/config` | Currency and category list |
| `GET` | `/api/products?search=&category=&limit=` | Search products |
| `GET` | `/api/products/:id` | Get one product |
| `POST` | `/api/login` | Admin login |
| `POST` | `/api/logout` | Admin logout |
| `GET` | `/api/session` | Current login state |

Admin-only routes:

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/products` | Add product |
| `PUT` | `/api/products/:id` | Edit product name, category, and price |
| `DELETE` | `/api/products/:id` | Delete product |

Example product payload:

```json
{
  "product_name": "Bottled Water 500ml",
  "category": "Drinks",
  "price": "1.00"
}
```

## Setup

Requirements:

- Node.js `22.5.0` or newer
- npm

Install and configure:

```bash
cd shop-price-db
npm install
cp .env.example .env
```

Edit `.env` before daily use:

```text
PORT=3000
HOST=0.0.0.0
DATABASE_FILE=./data/shop-prices.sqlite
SHOP_CURRENCY=USD
ADMIN_USERNAME=admin
ADMIN_PASSWORD=choose-a-strong-password
SESSION_SECRET=choose-a-long-random-secret
```

Start the app:

```bash
npm start
```

Open:

- Employee lookup: `http://localhost:3000`
- Admin dashboard: `http://localhost:3000/admin`

Optional demo data:

```bash
npm run seed
```

## Daily Use

- Employees use the lookup page to search by product name and category.
- The latest price is shown directly in each result.
- Admins log in at `/admin` to add products, edit names, update prices, change categories, or delete products.
- Every create or update writes a fresh `updated_at` timestamp.

## Backup Guide

The database file is stored at `data/shop-prices.sqlite` by default.

Create a backup while the app is running:

```bash
sqlite3 data/shop-prices.sqlite ".backup 'backup/shop-prices-$(date +%Y-%m-%d).sqlite'"
```

Restore from a backup:

```bash
cp backup/shop-prices-YYYY-MM-DD.sqlite data/shop-prices.sqlite
```

Keep copies of backups on another computer, drive, or cloud folder.

## Deployment Guide

For a small shop computer or local server:

1. Install Node.js and npm.
2. Copy the `shop-price-db` folder to the server.
3. Run `npm install`.
4. Create `.env` from `.env.example`.
5. Set `HOST=0.0.0.0` so other devices on the same network can open it.
6. Run `npm start`.
7. Visit `http://SERVER-IP:3000` from phones, tablets, or shop computers.

For continuous operation on Linux with systemd, create `/etc/systemd/system/shop-price-db.service`:

```ini
[Unit]
Description=Shop Price DB
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/shop-price-db
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable shop-price-db
sudo systemctl start shop-price-db
sudo systemctl status shop-price-db
```

Recommended maintenance:

- Back up `data/shop-prices.sqlite` daily.
- Keep the admin password private.
- Use a simple UPS for the shop computer if power cuts are common.
- Export or copy backups before replacing the server machine.
