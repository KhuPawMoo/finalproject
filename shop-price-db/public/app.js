const state = {
  categories: [],
  currency: 'USD',
  products: []
};

const searchInput = document.querySelector('#product-search');
const categoryFilter = document.querySelector('#category-filter');
const productList = document.querySelector('#products');
const resultCount = document.querySelector('#result-count');

function debounce(callback, wait = 120) {
  let timeoutId;

  return (...args) => {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => callback(...args), wait);
  };
}

function formatPrice(value) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: state.currency
    }).format(value);
  } catch {
    return `${Number(value).toFixed(2)} ${state.currency}`;
  }
}

function formatDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Updated date unavailable';
  }

  return `Updated ${new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date)}`;
}

function option(value, label) {
  const element = document.createElement('option');
  element.value = value;
  element.textContent = label;
  return element;
}

function fillCategories() {
  categoryFilter.replaceChildren(option('', 'All categories'));

  for (const category of state.categories) {
    categoryFilter.append(option(category, category));
  }
}

function productCard(product) {
  const card = document.createElement('article');
  card.className = 'product-card';

  const details = document.createElement('div');

  const name = document.createElement('p');
  name.className = 'product-name';
  name.textContent = product.product_name;

  const meta = document.createElement('div');
  meta.className = 'product-meta';

  const category = document.createElement('span');
  category.className = 'category-pill';
  category.textContent = product.category;

  const updated = document.createElement('span');
  updated.textContent = formatDate(product.updated_at);

  meta.append(category, updated);
  details.append(name, meta);

  const price = document.createElement('div');
  price.className = 'price-value';
  price.textContent = formatPrice(product.price);

  card.append(details, price);
  return card;
}

function renderProducts() {
  resultCount.textContent = `${state.products.length} product${state.products.length === 1 ? '' : 's'}`;

  if (state.products.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'No products found.';
    productList.replaceChildren(empty);
    return;
  }

  productList.replaceChildren(...state.products.map(productCard));
}

async function fetchProducts() {
  const params = new URLSearchParams({
    search: searchInput.value.trim(),
    category: categoryFilter.value,
    limit: '120'
  });

  resultCount.textContent = 'Searching';

  try {
    const response = await fetch(`/api/products?${params}`);

    if (!response.ok) {
      throw new Error('Could not load products.');
    }

    const data = await response.json();
    state.products = data.products;
    renderProducts();
  } catch {
    resultCount.textContent = 'Unavailable';
    productList.innerHTML = '<p class="empty-state">Prices are temporarily unavailable.</p>';
  }
}

async function initialize() {
  const response = await fetch('/api/config');
  const config = await response.json();
  state.categories = config.categories;
  state.currency = config.currency;
  fillCategories();

  const debouncedFetch = debounce(fetchProducts);
  searchInput.addEventListener('input', debouncedFetch);
  categoryFilter.addEventListener('change', fetchProducts);

  await fetchProducts();
}

initialize();
