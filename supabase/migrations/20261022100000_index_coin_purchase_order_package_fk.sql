-- Index the package foreign key used by purchase-order joins and admin reports.
CREATE INDEX IF NOT EXISTS coin_purchase_orders_package_id_idx
  ON public.coin_purchase_orders (package_id);
