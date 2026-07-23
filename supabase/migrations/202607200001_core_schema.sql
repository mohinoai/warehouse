create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type public.stock_reason as enum (
  'OFFLINE',
  'BONUS',
  'PROMO',
  'SAMPLE',
  'DAMAGED',
  'EXPIRED',
  'RETURN_RESTOCK',
  'CANCELLATION_REVERSAL',
  'OPNAME_CORRECTION',
  'MANUAL_ENTRY_CORRECTION',
  'OPENING_BALANCE',
  'INCOMING_MAKLON'
);

create type public.stock_channel as enum ('OFFLINE', 'SHOPEE', 'TIKTOK', 'INTERNAL');
create type public.batch_origin as enum ('MAKLON', 'OPENING', 'RETURN');
create type public.verification_status as enum ('VERIFIED', 'UNVERIFIED');
create type public.reference_type as enum (
  'ORDER', 'RETURN', 'CLAIM', 'OPNAME', 'MANUAL', 'MAKLON', 'OPENING', 'CORRECTION'
);
create type public.recipe_status as enum ('ACTIVE', 'ARCHIVED');
create type public.order_status as enum (
  'RESERVED', 'SHIPPED', 'IN_TRANSIT', 'PARTIALLY_CANCELLED', 'CANCELLED'
);
create type public.return_condition as enum ('SELLABLE', 'DAMAGED', 'LOST');
create type public.inspection_status as enum ('PENDING', 'COMPLETED');
create type public.claim_status as enum ('OPEN', 'FILED', 'RESOLVED', 'REJECTED');
create type public.opname_status as enum ('DRAFT', 'FINALIZED');
create type public.import_source as enum ('SIMULATOR', 'CSV', 'WEBHOOK');
create type public.import_event_type as enum (
  'ORDER_CREATED', 'ORDER_SHIPPED', 'ORDER_CANCELLED', 'RETURN_REQUESTED', 'STOCK_RECEIVED'
);
create type public.anomaly_priority as enum ('KRITIS', 'PERINGATAN');
create type public.anomaly_type as enum (
  'NEGATIVE_STOCK', 'MISSING_SHIPMENT_LEDGER', 'CLAIM_DEADLINE', 'EXPIRY', 'MISSING_REFERENCE'
);
create type public.worklist_status as enum ('OPEN', 'RESOLVED');
create type public.notification_type as enum ('EXPIRY', 'TIKTOK_CLAIM');

create table public.products (
  id text primary key,
  sku text not null unique,
  name text not null,
  brand_line text,
  is_bundle boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid not null references auth.users(id),
  constraint products_id_not_blank check (btrim(id) <> ''),
  constraint products_sku_not_blank check (btrim(sku) <> ''),
  constraint products_name_not_blank check (btrim(name) <> '')
);

create table public.bundle_recipes (
  id text primary key,
  bundle_product_id text not null references public.products(id),
  version integer not null check (version > 0),
  effective_at timestamptz not null default clock_timestamp(),
  status public.recipe_status not null,
  created_by uuid not null references auth.users(id),
  unique (bundle_product_id, version)
);

create unique index bundle_recipes_one_active
  on public.bundle_recipes (bundle_product_id)
  where status = 'ACTIVE';

create table public.bundle_recipe_items (
  recipe_id text not null references public.bundle_recipes(id) on delete restrict,
  product_id text not null references public.products(id),
  qty integer not null check (qty > 0),
  primary key (recipe_id, product_id)
);

create table public.opname_sessions (
  id text primary key,
  warehouse text not null default 'Gudang Utama',
  status public.opname_status not null default 'DRAFT',
  started_at timestamptz not null default clock_timestamp(),
  finalized_at timestamptz,
  created_by uuid not null references auth.users(id),
  constraint opname_finalized_state check (
    (status = 'DRAFT' and finalized_at is null)
    or (status = 'FINALIZED' and finalized_at is not null)
  )
);

create unique index opname_sessions_one_draft
  on public.opname_sessions ((true))
  where status = 'DRAFT';

create table public.batches (
  id text primary key,
  code text not null unique,
  product_id text not null references public.products(id),
  expiry_date date not null,
  origin public.batch_origin not null,
  verification_status public.verification_status not null,
  verified_by_session_id text references public.opname_sessions(id),
  sellable boolean not null default true,
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid not null references auth.users(id),
  constraint batches_id_not_blank check (btrim(id) <> ''),
  constraint batches_code_not_blank check (btrim(code) <> ''),
  constraint batches_verification_link check (
    (verification_status = 'UNVERIFIED' and verified_by_session_id is null)
    or verification_status = 'VERIFIED'
  )
);

create table public.stock_balance_summary (
  batch_id text primary key references public.batches(id),
  product_id text not null references public.products(id),
  qty_on_hand integer not null default 0,
  ledger_entry_id text,
  updated_at timestamptz not null default clock_timestamp()
);

create index stock_balance_summary_product_idx
  on public.stock_balance_summary (product_id);

create table public.stock_ledger (
  id text primary key,
  created_at timestamptz not null default clock_timestamp(),
  product_id text not null references public.products(id),
  batch_id text not null references public.batches(id),
  qty_delta integer not null check (qty_delta <> 0),
  reason public.stock_reason not null,
  channel public.stock_channel not null,
  reference_type public.reference_type not null,
  reference_id text not null,
  reference_note text,
  created_by uuid not null references auth.users(id),
  actor_name text not null,
  balance_after integer not null,
  allocation_group_id text,
  reverses_entry_id text references public.stock_ledger(id),
  verification_status_at_entry public.verification_status,
  constraint stock_ledger_reference_not_blank check (btrim(reference_id) <> ''),
  constraint stock_ledger_actor_not_blank check (btrim(actor_name) <> ''),
  constraint stock_ledger_reversal_reason check (
    reverses_entry_id is null or reason = 'MANUAL_ENTRY_CORRECTION'
  )
);

create unique index stock_ledger_one_manual_reversal
  on public.stock_ledger (reverses_entry_id)
  where reverses_entry_id is not null;
create index stock_ledger_batch_time_idx
  on public.stock_ledger (batch_id, created_at desc, id);
create index stock_ledger_product_time_idx
  on public.stock_ledger (product_id, created_at desc, id);
create index stock_ledger_reference_idx
  on public.stock_ledger (reference_type, reference_id);
create index stock_ledger_reason_channel_idx
  on public.stock_ledger (reason, channel, created_at desc);

alter table public.stock_balance_summary
  add constraint stock_balance_summary_latest_ledger_fk
  foreign key (ledger_entry_id) references public.stock_ledger(id)
  deferrable initially deferred;

create table public.orders (
  id text primary key,
  channel public.stock_channel not null check (channel in ('SHOPEE', 'TIKTOK')),
  status public.order_status not null,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  source_event_id text not null unique,
  constraint orders_id_not_blank check (btrim(id) <> '')
);

create table public.order_items (
  id text primary key,
  order_id text not null references public.orders(id) on delete restrict,
  product_id text not null references public.products(id),
  ordered_qty integer not null check (ordered_qty > 0),
  reserved_qty integer not null default 0 check (reserved_qty >= 0),
  shipped_qty integer not null default 0 check (shipped_qty >= 0),
  cancelled_qty integer not null default 0 check (cancelled_qty >= 0),
  cancelled_before_shipment_qty integer not null default 0 check (cancelled_before_shipment_qty >= 0),
  returned_qty integer not null default 0 check (returned_qty >= 0),
  recipe_version_id text references public.bundle_recipes(id),
  constraint order_item_quantities check (
    reserved_qty + shipped_qty <= ordered_qty
    and cancelled_qty + returned_qty <= ordered_qty
    and cancelled_qty <= ordered_qty
    and cancelled_before_shipment_qty <= cancelled_qty
    and returned_qty <= shipped_qty
  ),
  unique (order_id, id)
);

create index order_items_order_idx on public.order_items (order_id);

create table public.order_item_components (
  order_item_id text not null references public.order_items(id) on delete restrict,
  product_id text not null references public.products(id),
  qty_per_item integer not null check (qty_per_item > 0),
  primary key (order_item_id, product_id)
);

create table public.shipment_allocations (
  id text primary key,
  order_item_id text not null references public.order_items(id) on delete restrict,
  product_id text not null references public.products(id),
  batch_id text not null references public.batches(id),
  qty integer not null check (qty > 0),
  cancelled_qty integer not null default 0 check (cancelled_qty >= 0 and cancelled_qty <= qty),
  ledger_entry_id text not null unique references public.stock_ledger(id),
  created_at timestamptz not null default clock_timestamp()
);

create index shipment_allocations_item_idx
  on public.shipment_allocations (order_item_id, product_id, created_at, id);

create table public.returns (
  id text primary key,
  order_id text not null references public.orders(id),
  channel public.stock_channel not null check (channel in ('SHOPEE', 'TIKTOK')),
  created_at timestamptz not null,
  received_at timestamptz,
  inspection_status public.inspection_status not null default 'PENDING'
);

create table public.return_items (
  id text primary key,
  return_id text not null references public.returns(id) on delete restrict,
  order_item_id text not null references public.order_items(id),
  product_id text not null references public.products(id),
  qty integer not null check (qty > 0),
  condition public.return_condition,
  inspection_note text,
  new_batch_id text unique references public.batches(id),
  inspected_at timestamptz,
  inspected_by uuid references auth.users(id),
  constraint return_item_inspection_complete check (
    (condition is null and inspected_at is null and inspected_by is null)
    or (condition is not null and inspected_at is not null and inspected_by is not null)
  ),
  constraint sellable_return_has_batch check (
    condition is distinct from 'SELLABLE' or new_batch_id is not null
  )
);

create index return_items_return_idx on public.return_items (return_id);

create table public.return_claims (
  id text primary key,
  return_id text not null references public.returns(id),
  return_item_id text not null unique references public.return_items(id),
  condition public.return_condition not null check (condition in ('DAMAGED', 'LOST')),
  status public.claim_status not null default 'OPEN',
  deadline timestamptz,
  evidence_reference text,
  note text not null,
  filed_at timestamptz,
  resolved_at timestamptz,
  resolution text,
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid not null references auth.users(id),
  constraint return_claim_note_not_blank check (btrim(note) <> ''),
  constraint return_claim_lifecycle check (
    (status = 'OPEN' and filed_at is null and resolved_at is null)
    or (status = 'FILED' and filed_at is not null and resolved_at is null)
    or (status in ('RESOLVED', 'REJECTED') and filed_at is not null and resolved_at is not null)
  )
);

create table public.opname_counts (
  session_id text not null references public.opname_sessions(id) on delete restrict,
  batch_id text not null references public.batches(id),
  system_qty integer not null,
  physical_qty integer check (physical_qty >= 0),
  exception_reason text,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (session_id, batch_id),
  constraint opname_count_or_exception check (
    physical_qty is null or exception_reason is null or btrim(exception_reason) <> ''
  )
);

create table public.import_events (
  id text primary key,
  idempotency_key text not null unique,
  source public.import_source not null,
  channel public.stock_channel not null,
  order_id text not null,
  occurred_at timestamptz not null,
  type public.import_event_type not null,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz not null default clock_timestamp(),
  result jsonb not null,
  constraint import_event_key_not_blank check (btrim(idempotency_key) <> ''),
  constraint import_event_payload_object check (jsonb_typeof(payload) = 'object')
);

create table public.reconciliation_runs (
  id bigint generated always as identity primary key,
  run_at timestamptz not null default clock_timestamp(),
  requested_by uuid references auth.users(id),
  anomaly_count integer not null default 0,
  notification_count integer not null default 0
);

create table public.anomaly_worklist (
  id text primary key,
  priority public.anomaly_priority not null,
  type public.anomaly_type not null,
  title text not null,
  description text not null,
  reference_label text not null,
  target text not null,
  source text not null,
  status public.worklist_status not null default 'OPEN',
  first_detected_at timestamptz not null default clock_timestamp(),
  last_detected_at timestamptz not null default clock_timestamp(),
  resolved_at timestamptz,
  last_seen_run_id bigint not null references public.reconciliation_runs(id)
);

create index anomaly_worklist_status_idx
  on public.anomaly_worklist (status, priority, last_detected_at desc);

create table public.notifications (
  id text primary key,
  type public.notification_type not null,
  title text not null,
  description text not null,
  created_at timestamptz not null default clock_timestamp(),
  target text not null,
  read_at timestamptz,
  active boolean not null default true,
  last_seen_run_id bigint not null references public.reconciliation_runs(id)
);

create index notifications_active_idx
  on public.notifications (active, read_at, created_at desc);

create or replace function private.new_id(p_prefix text)
returns text
language sql
volatile
set search_path = ''
as $$
  select p_prefix || '-' || pg_catalog.gen_random_uuid()::text
$$;

create or replace function private.reject_ledger_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'stock_ledger is immutable; append a linked reversal instead'
    using errcode = '55000';
end;
$$;

create or replace function private.guard_ledger_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if pg_catalog.current_setting('jejak.stock_append', true) is distinct from '1' then
    raise exception 'stock_ledger inserts must use private.append_stock_ledger'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function private.guard_summary_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if pg_catalog.current_setting('jejak.stock_append', true) is distinct from '1' then
    raise exception 'stock_balance_summary is maintained only by ledger append'
      using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger stock_ledger_insert_guard
before insert on public.stock_ledger
for each row execute function private.guard_ledger_insert();

create trigger stock_ledger_immutable
before update or delete on public.stock_ledger
for each row execute function private.reject_ledger_mutation();

create trigger stock_balance_summary_guard
before insert or update or delete on public.stock_balance_summary
for each row execute function private.guard_summary_write();

create or replace function private.ensure_non_bundle_batch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.products p where p.id = new.product_id and p.is_bundle
  ) then
    raise exception 'bundle products cannot own stock batches' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger batches_non_bundle_only
before insert or update of product_id on public.batches
for each row execute function private.ensure_non_bundle_batch();

create or replace function private.validate_bundle_recipe()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.products p where p.id = new.bundle_product_id and p.is_bundle
  ) then
    raise exception 'bundle recipe owner must be a bundle product' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger bundle_recipes_bundle_only
before insert or update of bundle_product_id on public.bundle_recipes
for each row execute function private.validate_bundle_recipe();

create or replace function private.validate_recipe_component()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.products p where p.id = new.product_id and p.is_bundle
  ) then
    raise exception 'bundle recipe components must be stock-tracked products' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger bundle_recipe_items_non_bundle_only
before insert or update of product_id on public.bundle_recipe_items
for each row execute function private.validate_recipe_component();

do $rls$
declare
  table_name text;
begin
  foreach table_name in array array[
    'products', 'bundle_recipes', 'bundle_recipe_items', 'opname_sessions', 'batches',
    'stock_balance_summary', 'stock_ledger', 'orders', 'order_items',
    'order_item_components', 'shipment_allocations', 'returns', 'return_items',
    'return_claims', 'opname_counts', 'import_events', 'reconciliation_runs',
    'anomaly_worklist', 'notifications'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format(
      'create policy authenticated_read on public.%I for select to authenticated using ((select auth.uid()) is not null)',
      table_name
    );
  end loop;
end;
$rls$;

revoke all on all tables in schema public from public, anon, authenticated;
revoke all on all sequences in schema public from public, anon, authenticated;
revoke all on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema private revoke execute on functions from public, anon, authenticated;

grant usage on schema public to authenticated;
grant select on table
  public.products,
  public.bundle_recipes,
  public.bundle_recipe_items,
  public.opname_sessions,
  public.batches,
  public.stock_balance_summary,
  public.stock_ledger,
  public.orders,
  public.order_items,
  public.order_item_components,
  public.shipment_allocations,
  public.returns,
  public.return_items,
  public.return_claims,
  public.opname_counts,
  public.import_events,
  public.reconciliation_runs,
  public.anomaly_worklist,
  public.notifications
to authenticated;

revoke insert, update, delete, truncate, references, trigger
  on public.stock_ledger, public.stock_balance_summary
  from public, anon, authenticated;
