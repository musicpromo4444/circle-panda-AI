-- Allow the storefront to list only purchasable packages; all writes remain behind admin RPCs.
CREATE POLICY "Anyone can read enabled coin packages"
ON public.coin_packages
FOR SELECT
TO anon, authenticated
USING (enabled = true AND price_ngn IS NOT NULL AND price_ngn > 0);

-- A signed-in user can inspect only their own payment orders. Order creation and status changes remain server-controlled.
CREATE POLICY "Users can read their own coin purchase orders"
ON public.coin_purchase_orders
FOR SELECT
TO authenticated
USING (user_id = (SELECT auth.uid()));

-- signup_rate_limits intentionally has no client policy: it is server-side abuse-prevention state.
