INSERT INTO products (product_name, category, price, updated_at) VALUES
  ('Bottled Water 500ml', 'Drinks', 100, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('Orange Juice 1L', 'Drinks', 399, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('Potato Chips', 'Snacks', 249, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('Laundry Soap', 'Household Items', 650, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('Notebook', 'Other', 199, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
