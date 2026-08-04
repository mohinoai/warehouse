-- ORDER_SHIPPED now accepts an optional per-line plan:
--   payload = {"items": [{"itemId": "...", "qty": 3}, ...]}
-- Missing/empty items array keeps the previous behaviour (ship everything
-- outstanding). Partial shipments leave the order in its current status so a
-- follow-up ORDER_SHIPPED event can ship the rest.
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
