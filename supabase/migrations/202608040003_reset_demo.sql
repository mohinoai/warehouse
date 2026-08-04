-- Reset the demo dataset back to its seeded state.
--
-- private.bootstrap_demo_data() is seed-once: it returns early when
-- public.products is non-empty, so state accumulates forever across runs.
-- That makes the end-to-end suite non-deterministic (orders pile up as
-- SHIPPED, inventory is drawn down). reset_demo() clears the dataset and
-- re-seeds so every test run starts from a known state.
--
-- TRUNCATE does not fire row-level triggers, so the stock_ledger
-- immutability guard and the stock_balance_summary write guard do not
-- block the reset.

create or replace function public.reset_demo()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.current_user_id();
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('jejak-bootstrap', 0));

  truncate table
    public.notifications,
    public.anomaly_worklist,
    public.reconciliation_runs,
    public.import_events,
    public.opname_counts,
    public.return_claims,
    public.return_items,
    public.returns,
    public.shipment_allocations,
    public.order_item_components,
    public.order_items,
    public.orders,
    public.stock_ledger,
    public.stock_balance_summary,
    public.opname_sessions,
    public.batches,
    public.bundle_recipe_items,
    public.bundle_recipes,
    public.products
    restart identity cascade;

  perform private.bootstrap_demo_data();
end;
$$;

revoke all on function public.reset_demo() from public, anon;
grant execute on function public.reset_demo() to authenticated;
