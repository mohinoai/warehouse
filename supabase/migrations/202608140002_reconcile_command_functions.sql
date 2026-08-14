-- Reconcile the remote command dispatcher.
--
-- The remote DB was provisioned without migration history, so 202607230001
-- (which drops the single-draft index and creates private.execute_command_legacy)
-- and 202608040001/2/3 were never actually applied, yet 202608140001 assumed
-- execute_command_legacy existed. Result: every command that delegates to the
-- legacy dispatcher raised "function private.execute_command_legacy(jsonb) does
-- not exist". This migration re-establishes those objects idempotently, bodies
-- copied verbatim from their original migrations. Safe to run on any state.

-- From 202607230001: allow concurrent draft opname sessions.
drop index if exists public.opname_sessions_one_draft;

-- ===== From 202608040001 (receive_stock duplicate-batch guard) =====
create or replace function private.receive_stock(
  p_mode text,
  p_product_id text,
  p_batch_code text,
  p_qty integer,
  p_expiry_date date,
  p_reference text,
  p_created_at timestamptz default clock_timestamp(),
  p_reference_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.current_user_id();
  v_batch_id text := private.new_id('batch');
  v_entry_id text;
  v_opening boolean := upper(p_mode) = 'OPENING';
begin
  if upper(coalesce(p_mode, '')) not in ('MAKLON', 'OPENING') then
    raise exception 'Mode penerimaan harus MAKLON atau OPENING' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.products p
    where p.id = p_product_id and not p.is_bundle and p.is_active
  ) then
    raise exception 'Produk stok tidak ditemukan' using errcode = '22023';
  end if;
  if btrim(coalesce(p_batch_code, '')) = '' or btrim(coalesce(p_reference, '')) = '' then
    raise exception 'Batch dan reference wajib diisi' using errcode = '22023';
  end if;
  if exists (select 1 from public.batches b where b.code = btrim(p_batch_code)) then
    raise exception 'Kode batch sudah dipakai: %', btrim(p_batch_code) using errcode = 'P0001';
  end if;
  if p_qty <= 0 then
    raise exception 'Qty harus bilangan bulat positif' using errcode = '22023';
  end if;
  if p_expiry_date <= current_date then
    raise exception 'Expiry harus berada di masa depan' using errcode = '22023';
  end if;

  insert into public.batches (
    id, code, product_id, expiry_date, origin, verification_status,
    sellable, created_at, created_by
  ) values (
    v_batch_id, btrim(p_batch_code), p_product_id, p_expiry_date,
    case when v_opening then 'OPENING'::public.batch_origin else 'MAKLON'::public.batch_origin end,
    case when v_opening then 'UNVERIFIED'::public.verification_status else 'VERIFIED'::public.verification_status end,
    true, p_created_at, v_user_id
  );

  v_entry_id := private.append_stock_ledger(
    p_product_id, v_batch_id, p_qty,
    case when v_opening then 'OPENING_BALANCE'::public.stock_reason else 'INCOMING_MAKLON'::public.stock_reason end,
    'INTERNAL',
    case when v_opening then 'OPENING'::public.reference_type else 'MAKLON'::public.reference_type end,
    btrim(p_reference), p_reference_note, null, null,
    case when v_opening then 'UNVERIFIED'::public.verification_status else 'VERIFIED'::public.verification_status end,
    p_created_at
  );

  return private.command_result(
    true, 'PROCESSED',
    case when v_opening then 'Opening balance dicatat' else 'Barang masuk dicatat' end,
    p_qty || ' unit masuk ke ' || btrim(p_batch_code) || '.',
    v_batch_id, pg_catalog.jsonb_build_array(v_entry_id)
  );
end;
$$;

-- ===== From 202608040002 (partial shipment) =====
create or replace function private.process_import_event(p_event jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id text := btrim(coalesce(p_event ->> 'id', ''));
  v_key text := btrim(coalesce(p_event ->> 'idempotencyKey', ''));
  v_source public.import_source;
  v_channel public.stock_channel;
  v_order_id text := btrim(coalesce(p_event ->> 'orderId', ''));
  v_occurred_at timestamptz;
  v_type public.import_event_type;
  v_payload jsonb := coalesce(p_event -> 'payload', '{}'::jsonb);
  v_result jsonb;
  v_existing jsonb;
  v_user_id uuid := private.current_user_id();
  v_item jsonb;
  v_product record;
  v_recipe_id text;
  v_item_id text;
  v_qty integer;
  v_index integer := 0;
  v_component record;
  v_order record;
  v_order_item record;
  v_group text;
  v_allocation jsonb;
  v_ids jsonb := '[]'::jsonb;
  v_count integer := 0;
  v_qty_to_ship integer;
  v_repair boolean;
  v_remaining integer;
  v_reverse integer;
  v_return_id text;
  v_post_cancelled integer;
  v_ship_request jsonb;
  v_planned_total integer := 0;
  v_outstanding integer;
begin
  if v_id = '' or v_key = '' or v_order_id = '' then
    raise exception 'Event ID, idempotency key, dan order ID wajib' using errcode = '22023';
  end if;
  v_source := (p_event ->> 'source')::public.import_source;
  v_channel := (p_event ->> 'channel')::public.stock_channel;
  v_type := (p_event ->> 'type')::public.import_event_type;
  v_occurred_at := coalesce((p_event ->> 'occurredAt')::timestamptz, clock_timestamp());
  if pg_catalog.jsonb_typeof(v_payload) <> 'object' then
    raise exception 'Payload event harus object' using errcode = '22023';
  end if;

  select e.result into v_existing
  from public.import_events e
  where e.idempotency_key = v_key;
  if found then
    return private.command_result(
      true, 'DUPLICATE', 'Event sudah diproses',
      v_key || ' tidak mengubah data untuk kedua kalinya.', v_order_id
    );
  end if;

  if v_type = 'STOCK_RECEIVED' then
    if exists (select 1 from public.batches b where b.code = btrim(v_payload ->> 'batchCode')) then
      return private.command_result(
        true, 'DUPLICATE', 'Batch sudah diproses',
        btrim(v_payload ->> 'batchCode') || ' tidak diimpor dua kali.'
      );
    end if;
    v_result := private.receive_stock(
      coalesce(v_payload ->> 'mode', 'MAKLON'),
      v_payload ->> 'productId',
      v_payload ->> 'batchCode',
      private.positive_integer(v_payload -> 'qty', 'Qty'),
      (v_payload ->> 'expiryDate')::date,
      v_payload ->> 'reference',
      v_occurred_at,
      'Import ' || v_source::text || ' · ' || v_id
    );

  elsif v_type = 'ORDER_CREATED' then
    if v_channel not in ('SHOPEE', 'TIKTOK') then
      raise exception 'Order marketplace harus memakai SHOPEE atau TIKTOK' using errcode = '22023';
    end if;
    if exists (select 1 from public.orders o where o.id = v_order_id) then
      return private.command_result(true, 'DUPLICATE', 'Order sudah diproses', v_order_id, v_order_id);
    end if;
    if pg_catalog.jsonb_typeof(v_payload -> 'items') <> 'array'
      or pg_catalog.jsonb_array_length(v_payload -> 'items') = 0 then
      raise exception 'Order harus memiliki item' using errcode = '22023';
    end if;

    insert into public.orders (id, channel, status, created_at, updated_at, source_event_id)
    values (v_order_id, v_channel, 'RESERVED', v_occurred_at, v_occurred_at, v_id);

    for v_item in select value from pg_catalog.jsonb_array_elements(v_payload -> 'items')
    loop
      v_index := v_index + 1;
      v_qty := private.positive_integer(v_item -> 'qty', 'Qty order');
      select p.* into v_product from public.products p
      where p.id = v_item ->> 'productId' and p.is_active;
      if not found then
        raise exception 'Produk order tidak valid' using errcode = '22023';
      end if;

      v_recipe_id := null;
      if v_product.is_bundle then
        select r.id into v_recipe_id
        from public.bundle_recipes r
        where r.bundle_product_id = v_product.id and r.status = 'ACTIVE';
        if v_recipe_id is null then
          raise exception 'Resep bundle aktif tidak tersedia untuk %', v_product.name using errcode = '22023';
        end if;
      end if;

      v_item_id := v_order_id || '-item-' || v_index;
      insert into public.order_items (
        id, order_id, product_id, ordered_qty, reserved_qty, recipe_version_id
      ) values (v_item_id, v_order_id, v_product.id, v_qty, v_qty, v_recipe_id);

      if v_recipe_id is null then
        insert into public.order_item_components (order_item_id, product_id, qty_per_item)
        values (v_item_id, v_product.id, 1);
      else
        insert into public.order_item_components (order_item_id, product_id, qty_per_item)
        select v_item_id, i.product_id, i.qty
        from public.bundle_recipe_items i where i.recipe_id = v_recipe_id;
      end if;

      for v_component in
        select c.product_id, c.qty_per_item
        from public.order_item_components c where c.order_item_id = v_item_id
        order by c.product_id
      loop
        perform pg_catalog.pg_advisory_xact_lock(
          pg_catalog.hashtextextended(v_component.product_id, 0)
        );
        if private.product_sellable(v_component.product_id) < 0 then
          raise exception 'Stok tidak cukup untuk reservasi produk %', v_component.product_id using errcode = 'P0001';
        end if;
      end loop;
    end loop;
    v_result := private.command_result(
      true, 'PROCESSED', 'Pesanan menjadi reservasi',
      v_order_id || ' mengurangi sellable tanpa mengubah on-hand.', v_order_id
    );

  else
    select o.* into v_order from public.orders o where o.id = v_order_id for update;
    if not found then
      raise exception 'Order tidak ditemukan: %', v_order_id using errcode = 'P0001';
    end if;

    if v_type = 'ORDER_SHIPPED' then
      v_repair := v_order.status in ('SHIPPED', 'IN_TRANSIT') and not exists (
        select 1 from public.shipment_allocations a
        join public.order_items i on i.id = a.order_item_id
        where i.order_id = v_order_id
      );
      if v_order.status not in ('RESERVED', 'PARTIALLY_CANCELLED') and not v_repair then
        raise exception 'Shipment tidak dapat diproses dari status %', v_order.status using errcode = 'P0001';
      end if;
      v_group := private.new_id('alloc');
      v_ship_request := case
        when pg_catalog.jsonb_typeof(v_payload -> 'items') = 'array'
          and pg_catalog.jsonb_array_length(v_payload -> 'items') > 0
        then v_payload -> 'items'
      end;

      for v_order_item in
        select i.* from public.order_items i where i.order_id = v_order_id order by i.id for update
      loop
        if v_repair then
          v_qty_to_ship := v_order_item.shipped_qty;
        else
          v_remaining := greatest(
            0, v_order_item.ordered_qty - v_order_item.cancelled_qty - v_order_item.shipped_qty
          );
          if v_ship_request is null then
            v_qty_to_ship := v_remaining;
          else
            select coalesce(max(
              case when (r ->> 'qty') ~ '^[0-9]+$' then (r ->> 'qty')::integer else -1 end
            ), 0)
            into v_qty_to_ship
            from pg_catalog.jsonb_array_elements(v_ship_request) r
            where r ->> 'itemId' = v_order_item.id;
            if v_qty_to_ship < 0 then
              raise exception 'Qty shipment % harus bilangan bulat nol atau lebih', v_order_item.id
                using errcode = '22023';
            end if;
            if v_qty_to_ship > v_remaining then
              raise exception 'Qty shipment % melebihi sisa % unit', v_order_item.id, v_remaining
                using errcode = '22023';
            end if;
          end if;
          v_planned_total := v_planned_total + v_qty_to_ship;
        end if;
        if v_qty_to_ship <= 0 then continue; end if;

        for v_component in
          select c.product_id, c.qty_per_item
          from public.order_item_components c where c.order_item_id = v_order_item.id
          order by c.product_id
        loop
          v_allocation := private.allocate_fefo(
            v_component.product_id, v_component.qty_per_item * v_qty_to_ship,
            'OFFLINE', v_order.channel, 'ORDER', v_order_id,
            'Shipment ' || v_order.channel::text, v_group, false,
            v_order_item.id, v_occurred_at
          );
          v_ids := v_ids || (v_allocation -> 'ledgerIds');
          v_count := v_count + (v_allocation ->> 'allocationCount')::integer;
        end loop;

        if not v_repair then
          update public.order_items
          set shipped_qty = shipped_qty + v_qty_to_ship,
              reserved_qty = greatest(0, reserved_qty - v_qty_to_ship)
          where id = v_order_item.id;
        end if;
      end loop;

      if not v_repair and v_planned_total = 0 then
        raise exception 'Minimal satu item harus memiliki qty kirim di atas nol'
          using errcode = '22023';
      end if;

      select coalesce(sum(greatest(0, i.ordered_qty - i.cancelled_qty - i.shipped_qty)), 0)
      into v_outstanding
      from public.order_items i where i.order_id = v_order_id;

      if v_repair or v_outstanding = 0 then
        update public.orders
        set status = case when channel = 'SHOPEE' then 'SHIPPED'::public.order_status else 'IN_TRANSIT'::public.order_status end,
            updated_at = v_occurred_at
        where id = v_order_id;
      else
        update public.orders set updated_at = v_occurred_at where id = v_order_id;
      end if;

      v_result := private.command_result(
        true, 'PROCESSED',
        case
          when v_repair or v_outstanding = 0 then
            case when v_order.channel = 'SHOPEE' then 'SHIPPED diproses' else 'IN_TRANSIT diproses' end
          else 'Shipment parsial diproses'
        end,
        case when v_repair or v_outstanding = 0
          then v_count || ' entry ledger dibuat melalui alokasi FEFO.'
          else v_count || ' entry ledger dibuat; ' || v_outstanding || ' unit belum dikirim.' end,
        v_order_id, v_ids
      );

    elsif v_type = 'ORDER_CANCELLED' then
      v_qty := private.positive_integer(v_payload -> 'qty', 'Qty pembatalan');
      select i.* into v_order_item
      from public.order_items i
      where i.id = v_payload ->> 'itemId' and i.order_id = v_order_id
      for update;
      if not found or v_qty > v_order_item.ordered_qty - v_order_item.cancelled_qty - v_order_item.returned_qty then
        raise exception 'Item atau qty pembatalan tidak valid' using errcode = '22023';
      end if;

      if v_order_item.shipped_qty > 0 then
        v_post_cancelled := v_order_item.cancelled_qty - v_order_item.cancelled_before_shipment_qty;
        if v_qty > v_order_item.shipped_qty - v_post_cancelled - v_order_item.returned_qty then
          raise exception 'Qty pembatalan melebihi item terkirim yang tersisa' using errcode = '22023';
        end if;
        for v_component in
          select c.product_id, c.qty_per_item
          from public.order_item_components c where c.order_item_id = v_order_item.id
          order by c.product_id
        loop
          v_remaining := v_component.qty_per_item * v_qty;
          for v_product in
            select a.* from public.shipment_allocations a
            where a.order_item_id = v_order_item.id
              and a.product_id = v_component.product_id
              and a.cancelled_qty < a.qty
            order by a.created_at, a.id
            for update
          loop
            exit when v_remaining = 0;
            v_reverse := least(v_remaining, v_product.qty - v_product.cancelled_qty);
            v_item_id := private.append_stock_ledger(
              v_product.product_id, v_product.batch_id, v_reverse,
              'CANCELLATION_REVERSAL', v_order.channel, 'ORDER', v_order_id,
              'Pembatalan ' || v_qty || ' item setelah shipment', null, null, null,
              v_occurred_at
            );
            update public.shipment_allocations
            set cancelled_qty = cancelled_qty + v_reverse where id = v_product.id;
            v_ids := v_ids || pg_catalog.jsonb_build_array(v_item_id);
            v_remaining := v_remaining - v_reverse;
          end loop;
          if v_remaining <> 0 then
            raise exception 'Allocation shipment tidak cukup untuk reversal' using errcode = 'P0001';
          end if;
        end loop;
        update public.order_items set cancelled_qty = cancelled_qty + v_qty
        where id = v_order_item.id;
      else
        update public.order_items
        set reserved_qty = greatest(0, reserved_qty - v_qty),
            cancelled_before_shipment_qty = cancelled_before_shipment_qty + v_qty,
            cancelled_qty = cancelled_qty + v_qty
        where id = v_order_item.id;
      end if;
      update public.orders
      set status = case when not exists (
        select 1 from public.order_items i
        where i.order_id = v_order_id and i.ordered_qty > i.cancelled_qty
      ) then 'CANCELLED'::public.order_status else 'PARTIALLY_CANCELLED'::public.order_status end,
      updated_at = v_occurred_at
      where id = v_order_id;
      v_result := private.command_result(
        true, 'PROCESSED',
        case when pg_catalog.jsonb_array_length(v_ids) > 0 then 'Pembatalan menulis reversal' else 'Reservasi dilepas' end,
        case when pg_catalog.jsonb_array_length(v_ids) > 0
          then pg_catalog.jsonb_array_length(v_ids) || ' CANCELLATION_REVERSAL dibuat.'
          else v_qty || ' unit dilepas tanpa movement ledger.' end,
        v_order_id, v_ids
      );

    elsif v_type = 'RETURN_REQUESTED' then
      v_qty := private.positive_integer(v_payload -> 'qty', 'Qty retur');
      select i.* into v_order_item
      from public.order_items i
      where i.id = v_payload ->> 'itemId' and i.order_id = v_order_id
      for update;
      if not found then raise exception 'Item retur tidak ditemukan' using errcode = '22023'; end if;
      v_post_cancelled := v_order_item.cancelled_qty - v_order_item.cancelled_before_shipment_qty;
      if v_qty > v_order_item.shipped_qty - v_order_item.returned_qty - v_post_cancelled then
        raise exception 'Qty retur melebihi item terkirim yang tersedia' using errcode = '22023';
      end if;

      v_return_id := private.new_id('ret');
      insert into public.returns (id, order_id, channel, created_at, inspection_status)
      values (v_return_id, v_order_id, v_order.channel, v_occurred_at, 'PENDING');
      v_index := 0;
      for v_component in
        select c.product_id, c.qty_per_item
        from public.order_item_components c where c.order_item_id = v_order_item.id
        order by c.product_id
      loop
        v_index := v_index + 1;
        insert into public.return_items (id, return_id, order_item_id, product_id, qty)
        values (
          v_return_id || '-item-' || v_index, v_return_id, v_order_item.id,
          v_component.product_id, v_component.qty_per_item * v_qty
        );
      end loop;
      update public.order_items set returned_qty = returned_qty + v_qty where id = v_order_item.id;
      v_result := private.command_result(
        true, 'PROCESSED', 'Retur diajukan',
        v_index || ' produk satuan menunggu inspeksi.', v_return_id
      );
    else
      raise exception 'Event tidak didukung: %', v_type using errcode = '22023';
    end if;
  end if;

  insert into public.import_events (
    id, idempotency_key, source, channel, order_id, occurred_at, type, payload, result
  ) values (v_id, v_key, v_source, v_channel, v_order_id, v_occurred_at, v_type, v_payload, v_result);
  return v_result;
end;
$$;

-- ===== From 202608040003 (reset_demo) =====

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

-- ===== Legacy dispatcher: migration 02 public.execute_command, renamed =====
create or replace function private.execute_command_legacy(p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text := p_command ->> 'type';
  v_result jsonb;
  v_qty integer;
  v_entry record;
  v_entry_id text;
  v_session record;
  v_count record;
  v_batch record;
  v_ids jsonb := '[]'::jsonb;
  v_user_id uuid := private.current_user_id();
  v_recipe_id text;
  v_version integer;
  v_item jsonb;
  v_claim record;
begin
  if pg_catalog.jsonb_typeof(p_command) <> 'object' or v_type is null then
    return private.command_result(false, 'REJECTED', 'Command ditolak', 'Payload command tidak valid.');
  end if;

  if v_type = 'MANUAL_STOCK_OUT' then
    v_qty := private.positive_integer(p_command -> 'qty', 'Qty');
    if (p_command ->> 'reason') not in ('OFFLINE', 'BONUS', 'PROMO', 'SAMPLE', 'DAMAGED', 'EXPIRED') then
      raise exception 'Reason tidak valid untuk stock-out manual' using errcode = '22023';
    end if;
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(p_command ->> 'productId', 0)
    );
    if (p_command ->> 'reason') <> 'EXPIRED'
      and private.product_sellable(p_command ->> 'productId') < v_qty then
      raise exception 'Qty melebihi sellable stock' using errcode = 'P0001';
    end if;
    v_result := private.allocate_fefo(
      p_command ->> 'productId', v_qty,
      (p_command ->> 'reason')::public.stock_reason,
      (p_command ->> 'channel')::public.stock_channel,
      'MANUAL', private.new_id('manual'), p_command ->> 'referenceNote',
      private.new_id('alloc'), (p_command ->> 'reason') = 'EXPIRED'
    );
    return private.command_result(
      true, 'PROCESSED', 'Pergerakan ditulis ke ledger',
      (v_result ->> 'allocationCount') || ' batch dialokasikan tanpa mengubah entry lama.',
      null, v_result -> 'ledgerIds'
    );

  elsif v_type = 'RECEIVE_STOCK' then
    return private.receive_stock(
      p_command ->> 'mode', p_command ->> 'productId', p_command ->> 'batchCode',
      private.positive_integer(p_command -> 'qty', 'Qty'),
      (p_command ->> 'expiryDate')::date, p_command ->> 'reference'
    );

  elsif v_type = 'INJECT_EVENT' then
    return private.process_import_event(p_command -> 'event');

  elsif v_type = 'INSPECT_RETURN' then
    return private.inspect_return(p_command);

  elsif v_type = 'FILE_CLAIM' then
    select c.* into v_claim from public.return_claims c
    where c.id = p_command ->> 'claimId' for update;
    if not found or v_claim.status <> 'OPEN' or btrim(coalesce(p_command ->> 'evidenceReference', '')) = '' then
      raise exception 'Evidence reference wajib dan klaim harus terbuka' using errcode = '22023';
    end if;
    update public.return_claims
    set status = 'FILED', filed_at = clock_timestamp(),
        evidence_reference = btrim(p_command ->> 'evidenceReference')
    where id = v_claim.id;
    return private.command_result(true, 'PROCESSED', 'Klaim diajukan', v_claim.id || ' kini berstatus FILED.', v_claim.id);

  elsif v_type = 'RESOLVE_CLAIM' then
    select c.* into v_claim from public.return_claims c
    where c.id = p_command ->> 'claimId' for update;
    if not found or v_claim.status <> 'FILED' or btrim(coalesce(p_command ->> 'resolution', '')) = '' then
      raise exception 'Resolution wajib dan klaim harus FILED' using errcode = '22023';
    end if;
    update public.return_claims
    set status = 'RESOLVED', resolved_at = clock_timestamp(),
        resolution = btrim(p_command ->> 'resolution')
    where id = v_claim.id;
    perform private.run_reconciliation();
    return private.command_result(true, 'PROCESSED', 'Klaim diselesaikan', v_claim.id || ' tidak lagi memicu reminder.', v_claim.id);

  elsif v_type = 'CORRECT_ENTRY' then
    select l.* into v_entry from public.stock_ledger l
    where l.id = p_command ->> 'entryId' for share;
    if not found or v_entry.reason = 'MANUAL_ENTRY_CORRECTION'
      or exists (select 1 from public.stock_ledger x where x.reverses_entry_id = v_entry.id) then
      raise exception 'Entry sudah direversal atau bukan entry yang valid' using errcode = 'P0001';
    end if;
    if btrim(coalesce(p_command ->> 'note', '')) = '' then
      raise exception 'Alasan koreksi wajib' using errcode = '22023';
    end if;
    v_entry_id := private.append_stock_ledger(
      v_entry.product_id, v_entry.batch_id, -v_entry.qty_delta,
      'MANUAL_ENTRY_CORRECTION', 'INTERNAL', 'CORRECTION', v_entry.id,
      btrim(p_command ->> 'note'), null, v_entry.id
    );
    return private.command_result(
      true, 'PROCESSED', 'Reversal koreksi dibuat',
      v_entry_id || ' tertaut ke ' || v_entry.id || '.', v_entry_id,
      pg_catalog.jsonb_build_array(v_entry_id)
    );

  elsif v_type = 'CREATE_OPNAME' then
    if exists (select 1 from public.opname_sessions s where s.status = 'DRAFT') then
      select s.id into v_entry_id from public.opname_sessions s where s.status = 'DRAFT';
      raise exception 'Masih ada sesi aktif: %', v_entry_id using errcode = 'P0001';
    end if;
    v_entry_id := private.new_id('opn');
    insert into public.opname_sessions (id, warehouse, status, created_by)
    values (v_entry_id, 'Gudang Utama', 'DRAFT', v_user_id);
    insert into public.opname_counts (session_id, batch_id, system_qty)
    select v_entry_id, b.id, coalesce(s.qty_on_hand, 0)
    from public.batches b left join public.stock_balance_summary s on s.batch_id = b.id;
    return private.command_result(
      true, 'PROCESSED', 'Sesi opname baru dibuat',
      v_entry_id || ' memiliki ' || (select count(*) from public.opname_counts where session_id = v_entry_id) || ' batch dalam scope.',
      v_entry_id
    );

  elsif v_type = 'SAVE_OPNAME_COUNT' then
    select s.* into v_session from public.opname_sessions s
    where s.id = p_command ->> 'sessionId' for update;
    if not found or v_session.status <> 'DRAFT' then
      raise exception 'Sesi tidak tersedia atau sudah terkunci' using errcode = 'P0001';
    end if;
    if p_command ? 'physicalQty' and p_command -> 'physicalQty' <> 'null'::jsonb then
      if (p_command ->> 'physicalQty') !~ '^[0-9]+$' then
        raise exception 'Stok fisik harus bilangan bulat nol atau lebih' using errcode = '22023';
      end if;
      update public.opname_counts
      set physical_qty = (p_command ->> 'physicalQty')::integer,
          exception_reason = null, updated_at = clock_timestamp()
      where session_id = v_session.id and batch_id = p_command ->> 'batchId';
    else
      update public.opname_counts
      set physical_qty = null,
          exception_reason = nullif(btrim(p_command ->> 'exceptionReason'), ''),
          updated_at = clock_timestamp()
      where session_id = v_session.id and batch_id = p_command ->> 'batchId';
    end if;
    if not found then raise exception 'Batch tidak ada dalam scope opname' using errcode = 'P0001'; end if;
    return private.command_result(true, 'PROCESSED', 'Draft tersimpan', 'Batch diperbarui.', v_session.id);

  elsif v_type = 'FINALIZE_OPNAME' then
    select s.* into v_session from public.opname_sessions s
    where s.id = p_command ->> 'sessionId' for update;
    if not found or v_session.status <> 'DRAFT' then
      raise exception 'Sesi tidak ditemukan atau sudah terkunci' using errcode = 'P0001';
    end if;
    if exists (
      select 1 from public.opname_counts c
      where c.session_id = v_session.id and c.physical_qty is null
        and nullif(btrim(c.exception_reason), '') is null
    ) then
      raise exception 'Semua batch harus dihitung atau diberi alasan pengecualian' using errcode = 'P0001';
    end if;

    for v_count in select c.* from public.opname_counts c where c.session_id = v_session.id
    loop
      if v_count.physical_qty is not null and v_count.physical_qty <> v_count.system_qty then
        select b.* into v_batch from public.batches b where b.id = v_count.batch_id;
        v_entry_id := private.append_stock_ledger(
          v_batch.product_id, v_batch.id, v_count.physical_qty - v_count.system_qty,
          'OPNAME_CORRECTION', 'INTERNAL', 'OPNAME', v_session.id, null
        );
        v_ids := v_ids || pg_catalog.jsonb_build_array(v_entry_id);
      end if;
      update public.batches
      set verification_status = 'VERIFIED', verified_by_session_id = v_session.id
      where id = v_count.batch_id and verification_status = 'UNVERIFIED'
        and v_count.physical_qty is not null;
    end loop;
    update public.opname_sessions
    set status = 'FINALIZED', finalized_at = clock_timestamp() where id = v_session.id;
    return private.command_result(
      true, 'PROCESSED', 'Sesi opname difinalisasi',
      pg_catalog.jsonb_array_length(v_ids) || ' OPNAME_CORRECTION dibuat; sesi kini terkunci.',
      v_session.id, v_ids
    );

  elsif v_type = 'CREATE_RECIPE_VERSION' then
    if not exists (
      select 1 from public.products p where p.id = p_command ->> 'bundleProductId' and p.is_bundle
    ) or pg_catalog.jsonb_typeof(p_command -> 'items') <> 'array'
      or pg_catalog.jsonb_array_length(p_command -> 'items') = 0 then
      raise exception 'Bundle dan minimal satu komponen wajib dipilih' using errcode = '22023';
    end if;
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(p_command ->> 'bundleProductId', 0)
    );
    select coalesce(max(r.version), 0) + 1 into v_version
    from public.bundle_recipes r where r.bundle_product_id = p_command ->> 'bundleProductId';
    update public.bundle_recipes set status = 'ARCHIVED'
    where bundle_product_id = p_command ->> 'bundleProductId' and status = 'ACTIVE';
    v_recipe_id := private.new_id('recipe');
    insert into public.bundle_recipes (
      id, bundle_product_id, version, status, created_by
    ) values (v_recipe_id, p_command ->> 'bundleProductId', v_version, 'ACTIVE', v_user_id);
    for v_item in select value from pg_catalog.jsonb_array_elements(p_command -> 'items')
    loop
      insert into public.bundle_recipe_items (recipe_id, product_id, qty)
      values (
        v_recipe_id, v_item ->> 'productId', private.positive_integer(v_item -> 'qty', 'Qty komponen')
      );
    end loop;
    return private.command_result(
      true, 'PROCESSED', 'Versi resep baru aktif',
      'Versi ' || v_version || ' dibuat; order lama tetap memakai snapshot lama.', v_recipe_id
    );

  elsif v_type = 'RERUN_RECONCILIATION' then
    return private.run_reconciliation();

  elsif v_type = 'MARK_NOTIFICATION_READ' then
    update public.notifications set read_at = clock_timestamp()
    where id = p_command ->> 'notificationId' and active;
    if not found then raise exception 'Notifikasi tidak ditemukan' using errcode = 'P0001'; end if;
    return private.command_result(true, 'PROCESSED', 'Notifikasi dibaca', 'Status unread diperbarui.', p_command ->> 'notificationId');

  elsif v_type = 'MARK_ALL_NOTIFICATIONS_READ' then
    update public.notifications set read_at = clock_timestamp() where active and read_at is null;
    get diagnostics v_qty = row_count;
    return private.command_result(true, 'PROCESSED', 'Semua notifikasi dibaca', v_qty || ' item diperbarui.');
  else
    return private.command_result(false, 'REJECTED', 'Command tidak didukung', coalesce(v_type, 'UNKNOWN'));
  end if;
exception
  when others then
    return private.command_result(false, 'REJECTED', 'Operasi ditolak', sqlerrm);
end;
$$;

revoke all on function private.execute_command_legacy(jsonb) from public, anon, authenticated;
