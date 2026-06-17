const state = {
  categories: [],
  currency: 'USD',
  editingId: null,
  products: []
};

const loginPanel = document.querySelector('#login-panel');
const dashboardPanel = document.querySelector('#dashboard-panel');
const loginForm = document.querySelector('#login-form');
const loginMessage = document.querySelector('#login-message');
const logoutButton = document.querySelector('#logout-button');
const productForm = document.querySelector('#product-form');
const productId = document.querySelector('#product-id');
const productName = document.querySelector('#product-name');
const productCategory = document.querySelector('#product-category');
const productPrice = document.querySelector('#product-price');
const saveProductButton = document.querySelector('#save-product-button');
const cancelEditButton = document.querySelector('#cancel-edit-button');
const formTitle = document.querySelector('#form-title');
const formMessage = document.querySelector('#form-message');
const adminSearch = document.querySelector('#admin-search');
const adminCategoryFilter = document.querySelector('#admin-category-filter');
const adminProducts = document.querySelector('#admin-products');
const adminCount = document.querySelector('#admin-count');

function debounce(callback, wait = 120) {
  let timeoutId;

  return (...args) => {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => callback(...args), wait);
  };
}

function showMessage(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle('error', isError);
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
  productCategory.replaceChildren();
  adminCategoryFilter.replaceChildren(option('', 'All categories'));

  for (const category of state.categories) {
    productCategory.append(option(category, category));
    adminCategoryFilter.append(option(category, category));
  }
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });

  if (response.status === 204) {
    return null;
  }

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Request failed.');
  }

  return data;
}

function setAuthenticated(isAuthenticated) {
  loginPanel.classList.toggle('hidden', isAuthenticated);
  dashboardPanel.classList.toggle('hidden', !isAuthenticated);
  logoutButton.classList.toggle('hidden', !isAuthenticated);
}

function resetForm() {
  state.editingId = null;
  productId.value = '';
  productForm.reset();
  productCategory.value = state.categories[0] || 'Other';
  formTitle.textContent = 'Add Product';
  saveProductButton.textContent = 'Add Product';
  cancelEditButton.classList.add('hidden');
  showMessage(formMessage, '');
}

function startEdit(product) {
  state.editingId = product.id;
  productId.value = product.id;
  productName.value = product.product_name;
  productCategory.value = product.category;
  productPrice.value = product.price.toFixed(2);
  formTitle.textContent = 'Edit Product';
  saveProductButton.textContent = 'Save Product';
  cancelEditButton.classList.remove('hidden');
  productName.focus();
}

function adminRow(product) {
  const row = document.createElement('article');
  row.className = 'admin-row';

  const details = document.createElement('div');
  details.className = 'admin-row-details';

  const name = document.createElement('p');
  name.className = 'product-name';
  name.textContent = product.product_name;

  const meta = document.createElement('div');
  meta.className = 'product-meta';

  const category = document.createElement('span');
  category.className = 'category-pill';
  category.textContent = product.category;

  const price = document.createElement('span');
  price.className = 'admin-row-price';
  price.textContent = formatPrice(product.price);

  const updated = document.createElement('span');
  updated.textContent = formatDate(product.updated_at);

  meta.append(category, price, updated);
  details.append(name, meta);

  const actions = document.createElement('div');
  actions.className = 'row-actions';

  const editButton = document.createElement('button');
  editButton.className = 'secondary-button';
  editButton.type = 'button';
  editButton.textContent = 'Edit';
  editButton.addEventListener('click', () => startEdit(product));

  const deleteButton = document.createElement('button');
  deleteButton.className = 'danger-button';
  deleteButton.type = 'button';
  deleteButton.textContent = 'Delete';
  deleteButton.addEventListener('click', () => deleteProduct(product));

  actions.append(editButton, deleteButton);
  row.append(details, actions);
  return row;
}

function renderProducts() {
  adminCount.textContent = `${state.products.length} product${state.products.length === 1 ? '' : 's'}`;

  if (state.products.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'No products found.';
    adminProducts.replaceChildren(empty);
    return;
  }

  adminProducts.replaceChildren(...state.products.map(adminRow));
}

async function fetchProducts() {
  const params = new URLSearchParams({
    search: adminSearch.value.trim(),
    category: adminCategoryFilter.value,
    limit: '160'
  });

  adminCount.textContent = 'Loading';
  const data = await api(`/api/products?${params}`);
  state.products = data.products;
  renderProducts();
}

async function deleteProduct(product) {
  const confirmed = window.confirm(`Delete ${product.product_name}?`);

  if (!confirmed) {
    return;
  }

  await api(`/api/products/${product.id}`, { method: 'DELETE' });

  if (state.editingId === product.id) {
    resetForm();
  }

  await fetchProducts();
  showMessage(formMessage, 'Product deleted.');
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  showMessage(loginMessage, '');

  try {
    await api('/api/login', {
      method: 'POST',
      body: JSON.stringify(Object.fromEntries(new FormData(loginForm)))
    });
    setAuthenticated(true);
    loginForm.reset();
    await fetchProducts();
  } catch (error) {
    showMessage(loginMessage, error.message, true);
  }
});

logoutButton.addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' });
  setAuthenticated(false);
});

productForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const payload = {
    product_name: productName.value,
    category: productCategory.value,
    price: productPrice.value
  };

  try {
    if (state.editingId) {
      await api(`/api/products/${state.editingId}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      resetForm();
      showMessage(formMessage, 'Product updated.');
    } else {
      await api('/api/products', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      resetForm();
      showMessage(formMessage, 'Product added.');
    }

    await fetchProducts();
  } catch (error) {
    showMessage(formMessage, error.message, true);
  }
});

cancelEditButton.addEventListener('click', resetForm);
adminSearch.addEventListener('input', debounce(fetchProducts));
adminCategoryFilter.addEventListener('change', fetchProducts);

async function initialize() {
  const config = await api('/api/config');
  state.categories = config.categories;
  state.currency = config.currency;
  fillCategories();
  resetForm();

  const session = await api('/api/session');
  setAuthenticated(session.authenticated);

  if (session.authenticated) {
    await fetchProducts();
  }
}

initialize();
