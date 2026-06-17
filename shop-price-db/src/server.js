const path = require('node:path');
const express = require('express');
const { createAuth } = require('./auth');
const { createDatabase, createProductStore } = require('./database');
const { loadEnv } = require('./env');

loadEnv();

const app = express();
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';
const currency = process.env.SHOP_CURRENCY || 'USD';
const db = createDatabase();
const products = createProductStore(db);
const auth = createAuth();

if (process.env.SEED_DEMO_PRODUCTS === 'true' || process.argv.includes('--seed-only')) {
  const didSeed = products.seedDemoProducts();
  console.log(didSeed ? 'Demo products added.' : 'Products already exist; seed skipped.');

  if (process.argv.includes('--seed-only')) {
    process.exit(0);
  }
}

app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, '..', 'public'), {
  extensions: ['html']
}));

app.get('/admin', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/config', (_req, res) => {
  res.json({
    currency,
    categories: products.categories
  });
});

app.get('/api/products', (req, res) => {
  res.json({
    products: products.list({
      search: req.query.search,
      category: req.query.category,
      limit: req.query.limit
    })
  });
});

app.get('/api/products/:id', (req, res) => {
  const product = products.get(req.params.id);

  if (!product) {
    return res.status(404).json({ error: 'Product not found.' });
  }

  return res.json({ product });
});

app.post('/api/login', auth.login);
app.post('/api/logout', auth.logout);
app.get('/api/session', auth.session);

app.post('/api/products', auth.requireAdmin, (req, res, next) => {
  try {
    const product = products.create(req.body);
    return res.status(201).json({ product });
  } catch (error) {
    return next(error);
  }
});

app.put('/api/products/:id', auth.requireAdmin, (req, res, next) => {
  try {
    const product = products.update(req.params.id, req.body);

    if (!product) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    return res.json({ product });
  } catch (error) {
    return next(error);
  }
});

app.delete('/api/products/:id', auth.requireAdmin, (req, res) => {
  const deleted = products.remove(req.params.id);

  if (!deleted) {
    return res.status(404).json({ error: 'Product not found.' });
  }

  return res.status(204).end();
});

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API route not found.' });
  }

  return res.status(404).sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.use((error, _req, res, _next) => {
  const status = error.message?.includes('required') || error.message?.includes('valid') ? 400 : 500;
  return res.status(status).json({ error: error.message || 'Unexpected server error.' });
});

app.listen(port, host, () => {
  console.log(`Shop Price DB running at http://${host}:${port}`);
});
