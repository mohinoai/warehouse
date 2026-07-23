create or replace function private.command_result(
  p_ok boolean,
  p_status text,
  p_title text,
  p_description text,
  p_entity_id text default null,
  p_ledger_entry_ids jsonb default '[]'::jsonb
)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'ok', p_ok,
    'status', p_status,
    'title', p_title,
    'description', p_description,
    'entityId', p_entity_id,
    'ledgerEntryIds', p_ledger_entry_ids
  ))
$$;

create or replace function private.current_user_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  return v_user_id;
end;
$$;

create or replace function private.actor_name(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    nullif(u.raw_user_meta_data ->> 'full_name', ''),
    nullif(u.raw_user_meta_data ->> 'name', ''),
    nullif(split_part(u.email, '@', 1), ''),
    'Admin'
  )
  from auth.users u
  where u.id = p_user_id
$$;

create or replace function private.positive_integer(p_value jsonb, p_label text)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_text text := p_value #>> '{}';
  v_value integer;
begin
  if v_text is null or v_text !~ '^[0-9]+$' then
    raise exception '% harus bilangan bulat positif', p_label using errcode = '22023';
  end if;
  v_value := v_text::integer;
  if v_value <= 0 then
    raise exception '% harus bilangan bulat positif', p_label using errcode = '22023';
  end if;
  return v_value;
end;
$$;

create or replace function private.append_stock_ledger(
  p_product_id text,
  p_batch_id text,
  p_qty_delta integer,
  p_reason public.stock_reason,
  p_channel public.stock_channel,
  p_reference_type public.reference_type,
  p_reference_id text,
  p_reference_note text default null,
  p_allocation_group_id text default null,
  p_reverses_entry_id text default null,
  p_verification_status public.verification_status default null,
  p_created_at timestamptz default clock_timestamp()
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.current_user_id();
  v_actor text := private.actor_name(v_user_id);
  v_entry_id text := private.new_id('led');
  v_current integer;
begin
  if p_qty_delta = 0 then
    raise exception 'Ledger delta tidak boleh nol' using errcode = '22023';
  end if;
  if btrim(coalesce(p_reference_id, '')) = '' then
    raise exception 'Reference wajib diisi' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.batches b
    where b.id = p_batch_id and b.product_id = p_product_id
  ) then
    raise exception 'Produk dan batch tidak cocok' using errcode = '23503';
  end if;

  perform pg_catalog.set_config('jejak.stock_append', '1', true);
  insert into public.stock_balance_summary (
    batch_id, product_id, qty_on_hand, ledger_entry_id, updated_at
  ) values (p_batch_id, p_product_id, 0, null, p_created_at)
  on conflict (batch_id) do nothing;

  select s.qty_on_hand into v_current
  from public.stock_balance_summary s
  where s.batch_id = p_batch_id
  for update;

  insert into public.stock_ledger (
    id, created_at, product_id, batch_id, qty_delta, reason, channel,
    reference_type, reference_id, reference_note, created_by, actor_name,
    balance_after, allocation_group_id, reverses_entry_id,
    verification_status_at_entry
  ) values (
    v_entry_id, p_created_at, p_product_id, p_batch_id, p_qty_delta, p_reason,
    p_channel, p_reference_type, p_reference_id, nullif(btrim(p_reference_note), ''),
    v_user_id, v_actor, v_current + p_qty_delta, p_allocation_group_id,
    p_reverses_entry_id, p_verification_status
  );

  update public.stock_balance_summary
  set qty_on_hand = v_current + p_qty_delta,
      ledger_entry_id = v_entry_id,
      updated_at = p_created_at
  where batch_id = p_batch_id;

  return v_entry_id;
end;
$$;

create or replace function private.product_reserved(p_product_id text)
returns integer
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(c.qty_per_item * i.reserved_qty), 0)::integer
  from public.order_items i
  join public.order_item_components c on c.order_item_id = i.id
  where c.product_id = p_product_id
$$;

create or replace function private.product_sellable(p_product_id text)
returns integer
language sql
stable
set search_path = ''
as $$
  select (
    coalesce(sum(s.qty_on_hand) filter (
      where b.sellable and b.expiry_date >= current_date
    ), 0) - private.product_reserved(p_product_id)
  )::integer
  from public.batches b
  left join public.stock_balance_summary s on s.batch_id = b.id
  where b.product_id = p_product_id
$$;

create or replace function private.allocate_fefo(
  p_product_id text,
  p_qty integer,
  p_reason public.stock_reason,
  p_channel public.stock_channel,
  p_reference_type public.reference_type,
  p_reference_id text,
  p_reference_note text,
  p_allocation_group_id text,
  p_include_expired boolean default false,
  p_order_item_id text default null,
  p_created_at timestamptz default clock_timestamp()
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_remaining integer := p_qty;
  v_available integer;
  v_take integer;
  v_entry_id text;
  v_ids jsonb := '[]'::jsonb;
  v_count integer := 0;
  r record;
begin
  if p_qty <= 0 then
    raise exception 'Qty alokasi harus positif' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_product_id, 0)
  );

  perform 1
  from public.stock_balance_summary s
  join public.batches b on b.id = s.batch_id
  where b.product_id = p_product_id
    and b.sellable
    and s.qty_on_hand > 0
    and case when p_include_expired
      then b.expiry_date < current_date
      else b.expiry_date >= current_date
    end
  order by b.expiry_date, b.created_at, b.id
  for update of s;

  select coalesce(sum(s.qty_on_hand), 0)::integer into v_available
  from public.stock_balance_summary s
  join public.batches b on b.id = s.batch_id
  where b.product_id = p_product_id
    and b.sellable
    and s.qty_on_hand > 0
    and case when p_include_expired
      then b.expiry_date < current_date
      else b.expiry_date >= current_date
    end;

  if v_available < p_qty then
    raise exception 'Stok valid kurang % unit', p_qty - v_available using errcode = 'P0001';
  end if;

  for r in
    select b.id as batch_id, s.qty_on_hand
    from public.stock_balance_summary s
    join public.batches b on b.id = s.batch_id
    where b.product_id = p_product_id
      and b.sellable
      and s.qty_on_hand > 0
      and case when p_include_expired
        then b.expiry_date < current_date
        else b.expiry_date >= current_date
      end
    order by b.expiry_date, b.created_at, b.id
  loop
    exit when v_remaining = 0;
    v_take := least(v_remaining, r.qty_on_hand);
    v_entry_id := private.append_stock_ledger(
      p_product_id, r.batch_id, -v_take, p_reason, p_channel,
      p_reference_type, p_reference_id, p_reference_note,
      p_allocation_group_id, null, null, p_created_at
    );
    v_ids := v_ids || pg_catalog.jsonb_build_array(v_entry_id);
    v_count := v_count + 1;

    if p_order_item_id is not null then
      insert into public.shipment_allocations (
        id, order_item_id, product_id, batch_id, qty, ledger_entry_id, created_at
      ) values (
        private.new_id('ship'), p_order_item_id, p_product_id, r.batch_id,
        v_take, v_entry_id, p_created_at
      );
    end if;
    v_remaining := v_remaining - v_take;
  end loop;

  return pg_catalog.jsonb_build_object('ledgerIds', v_ids, 'allocationCount', v_count);
end;
$$;

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

      for v_order_item in
        select i.* from public.order_items i where i.order_id = v_order_id order by i.id for update
      loop
        v_qty_to_ship := case when v_repair then v_order_item.shipped_qty
          else v_order_item.ordered_qty - v_order_item.cancelled_qty - v_order_item.shipped_qty end;
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

      update public.orders
      set status = case when channel = 'SHOPEE' then 'SHIPPED'::public.order_status else 'IN_TRANSIT'::public.order_status end,
          updated_at = v_occurred_at
      where id = v_order_id;
      v_result := private.command_result(
        true, 'PROCESSED',
        case when v_order.channel = 'SHOPEE' then 'SHIPPED diproses' else 'IN_TRANSIT diproses' end,
        v_count || ' entry ledger dibuat melalui alokasi FEFO.', v_order_id, v_ids
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

create or replace function private.inspect_return(p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.current_user_id();
  v_return record;
  v_item record;
  v_condition public.return_condition := (p_command ->> 'condition')::public.return_condition;
  v_note text := btrim(coalesce(p_command ->> 'note', ''));
  v_batch_id text;
  v_claim_id text;
  v_entry_id text;
  v_expiry date;
  v_code text;
begin
  select r.* into v_return from public.returns r where r.id = p_command ->> 'returnId' for update;
  select i.* into v_item from public.return_items i
  where i.id = p_command ->> 'returnItemId' and i.return_id = p_command ->> 'returnId'
  for update;
  if v_return.id is null or v_item.id is null or v_item.condition is not null then
    raise exception 'Item retur tidak tersedia atau sudah diproses' using errcode = 'P0001';
  end if;
  if v_note = '' then raise exception 'Catatan inspeksi wajib' using errcode = '22023'; end if;

  if v_condition = 'SELLABLE' then
    v_expiry := (p_command ->> 'expiryDate')::date;
    v_code := btrim(coalesce(p_command ->> 'batchCode', ''));
    if v_code = '' or v_expiry <= current_date then
      raise exception 'Batch retur baru dan expiry mendatang wajib' using errcode = '22023';
    end if;
    v_batch_id := private.new_id('batch-ret');
    insert into public.batches (
      id, code, product_id, expiry_date, origin, verification_status,
      sellable, created_at, created_by
    ) values (
      v_batch_id, v_code, v_item.product_id, v_expiry, 'RETURN', 'VERIFIED',
      true, clock_timestamp(), v_user_id
    );
    v_entry_id := private.append_stock_ledger(
      v_item.product_id, v_batch_id, v_item.qty, 'RETURN_RESTOCK',
      v_return.channel, 'RETURN', v_return.id, v_note
    );
    update public.return_items
    set condition = v_condition, inspection_note = v_note, new_batch_id = v_batch_id,
        inspected_at = clock_timestamp(), inspected_by = v_user_id
    where id = v_item.id;
  else
    v_claim_id := private.new_id('claim');
    insert into public.return_claims (
      id, return_id, return_item_id, condition, status, deadline,
      evidence_reference, note, created_by
    ) values (
      v_claim_id, v_return.id, v_item.id, v_condition, 'OPEN',
      case when v_return.channel = 'TIKTOK' then v_return.created_at + interval '40 days' end,
      nullif(btrim(p_command ->> 'evidenceReference'), ''), v_note, v_user_id
    );
    update public.return_items
    set condition = v_condition, inspection_note = v_note,
        inspected_at = clock_timestamp(), inspected_by = v_user_id
    where id = v_item.id;
  end if;

  update public.returns
  set received_at = coalesce(received_at, clock_timestamp()),
      inspection_status = case when not exists (
        select 1 from public.return_items i
        where i.return_id = v_return.id and i.condition is null
      ) then 'COMPLETED'::public.inspection_status else 'PENDING'::public.inspection_status end
  where id = v_return.id;

  return private.command_result(
    true, 'PROCESSED',
    case when v_condition = 'SELLABLE' then 'Batch retur baru dibuat' else 'Catatan klaim/loss dibuat' end,
    case when v_condition = 'SELLABLE' then v_item.qty || ' unit masuk melalui RETURN_RESTOCK.' else 'Tidak ada movement ledger kedua.' end,
    v_return.id,
    case when v_entry_id is null then '[]'::jsonb else pg_catalog.jsonb_build_array(v_entry_id) end
  );
end;
$$;

create or replace function private.run_reconciliation()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_run_id bigint;
  v_anomaly_count integer;
  v_notification_count integer;
  v_row record;
begin
  insert into public.reconciliation_runs (requested_by) values (v_user_id) returning id into v_run_id;

  for v_row in
    select
      'anomaly-negative-' || b.id as id,
      'KRITIS'::public.anomaly_priority as priority,
      'NEGATIVE_STOCK'::public.anomaly_type as type,
      'Stok negatif terdeteksi' as title,
      'Saldo ' || s.qty_on_hand || ' unit perlu ditelusuri sebelum transaksi berikutnya.' as description,
      p.name || ' · ' || b.code as reference_label,
      '/ledger?product=' || p.id || '&batch=' || b.id as target,
      'Cron harian' as source
    from public.stock_balance_summary s
    join public.batches b on b.id = s.batch_id
    join public.products p on p.id = b.product_id
    where s.qty_on_hand < 0

    union all

    select
      'anomaly-order-' || o.id,
      'KRITIS'::public.anomaly_priority,
      'MISSING_SHIPMENT_LEDGER'::public.anomaly_type,
      'Shipment tanpa ledger entry',
      o.status::text || ' terdeteksi tanpa hasil alokasi FEFO.',
      o.id,
      '/simulasi?order=' || o.id,
      'Cron harian'
    from public.orders o
    where o.status in ('SHIPPED', 'IN_TRANSIT')
      and not exists (
        select 1 from public.shipment_allocations a
        join public.order_items i on i.id = a.order_item_id
        where i.order_id = o.id
      )

    union all

    select
      'anomaly-claim-' || r.id,
      case when r.created_at + interval '40 days' <= clock_timestamp() + interval '3 days'
        then 'KRITIS'::public.anomaly_priority else 'PERINGATAN'::public.anomaly_priority end,
      'CLAIM_DEADLINE'::public.anomaly_type,
      case when r.created_at + interval '40 days' < clock_timestamp()
        then 'Klaim TikTok melewati H-40' else 'Klaim TikTok mendekati H-40' end,
      'Batas klaim dihitung sejak retur diajukan.',
      r.id,
      '/retur?return=' || r.id,
      'Reminder'
    from public.returns r
    where r.channel = 'TIKTOK'
      and r.created_at + interval '40 days' <= clock_timestamp() + interval '7 days'
      and exists (
        select 1 from public.return_items i
        left join public.return_claims c on c.return_item_id = i.id
        where i.return_id = r.id and (i.condition is null or c.status is distinct from 'RESOLVED')
      )

    union all

    select
      'anomaly-expiry-' || b.id,
      case when b.expiry_date < current_date then 'KRITIS'::public.anomaly_priority else 'PERINGATAN'::public.anomaly_priority end,
      'EXPIRY'::public.anomaly_type,
      case when b.expiry_date < current_date then 'Batch sudah kedaluwarsa' else 'Batch mendekati kedaluwarsa' end,
      case when b.expiry_date < current_date then 'Batch tidak dihitung sellable.' else (b.expiry_date - current_date) || ' hari menuju expiry.' end,
      p.name || ' · ' || b.code,
      '/produk?product=' || p.id || '&batch=' || b.id,
      'Notifikasi'
    from public.batches b
    join public.products p on p.id = b.product_id
    join public.stock_balance_summary s on s.batch_id = b.id
    where s.qty_on_hand > 0 and b.expiry_date <= current_date + 30

    union all

    select
      'anomaly-reference-' || l.id,
      'PERINGATAN'::public.anomaly_priority,
      'MISSING_REFERENCE'::public.anomaly_type,
      l.reason::text || ' tanpa referensi',
      'Campaign atau catatan approval belum tersedia.',
      l.id,
      '/ledger?entry=' || l.id,
      'Audit'
    from public.stock_ledger l
    where l.reason in ('BONUS', 'PROMO', 'SAMPLE')
      and nullif(btrim(l.reference_note), '') is null
      and not exists (select 1 from public.stock_ledger x where x.reverses_entry_id = l.id)
  loop
    insert into public.anomaly_worklist (
      id, priority, type, title, description, reference_label, target,
      source, status, last_detected_at, last_seen_run_id
    ) values (
      v_row.id, v_row.priority, v_row.type, v_row.title, v_row.description, v_row.reference_label,
      v_row.target, v_row.source, 'OPEN', clock_timestamp(), v_run_id
    )
    on conflict (id) do update set
      priority = excluded.priority,
      title = excluded.title,
      description = excluded.description,
      reference_label = excluded.reference_label,
      target = excluded.target,
      source = excluded.source,
      status = 'OPEN',
      resolved_at = null,
      last_detected_at = excluded.last_detected_at,
      last_seen_run_id = excluded.last_seen_run_id;
  end loop;

  update public.anomaly_worklist
  set status = 'RESOLVED', resolved_at = clock_timestamp()
  where status = 'OPEN' and last_seen_run_id <> v_run_id;

  for v_row in
    select
      'notification-expiry-' || b.id as id,
      'EXPIRY'::public.notification_type as type,
      case when b.expiry_date < current_date then 'Batch kedaluwarsa' else 'Batch mendekati expiry' end as title,
      p.name || ' · ' || b.code || ' · ' || abs(b.expiry_date - current_date) || ' hari' as description,
      '/produk?product=' || p.id || '&batch=' || b.id as target
    from public.batches b
    join public.products p on p.id = b.product_id
    join public.stock_balance_summary s on s.batch_id = b.id
    where s.qty_on_hand > 0 and b.expiry_date <= current_date + 30

    union all

    select
      'notification-claim-' || r.id,
      'TIKTOK_CLAIM'::public.notification_type,
      case when r.created_at + interval '40 days' < clock_timestamp() then 'Klaim TikTok terlambat' else 'Deadline klaim TikTok' end,
      r.id || ' · batas H-40 sejak retur diajukan',
      '/retur?return=' || r.id
    from public.returns r
    where r.channel = 'TIKTOK'
      and r.created_at + interval '40 days' <= clock_timestamp() + interval '7 days'
      and exists (
        select 1 from public.return_items i
        left join public.return_claims c on c.return_item_id = i.id
        where i.return_id = r.id and (i.condition is null or c.status is distinct from 'RESOLVED')
      )
  loop
    insert into public.notifications (
      id, type, title, description, target, active, last_seen_run_id
    ) values (v_row.id, v_row.type, v_row.title, v_row.description, v_row.target, true, v_run_id)
    on conflict (id) do update set
      type = excluded.type,
      title = excluded.title,
      description = excluded.description,
      target = excluded.target,
      active = true,
      last_seen_run_id = excluded.last_seen_run_id;
  end loop;

  update public.notifications set active = false
  where active and last_seen_run_id <> v_run_id;

  select count(*) into v_anomaly_count from public.anomaly_worklist where status = 'OPEN';
  select count(*) into v_notification_count from public.notifications where active;
  update public.reconciliation_runs
  set anomaly_count = v_anomaly_count, notification_count = v_notification_count
  where id = v_run_id;

  return private.command_result(
    true, 'PROCESSED', 'Rekonsiliasi selesai',
    'Worklist dan notifikasi dihitung ulang dari sumber data.', v_run_id::text
  );
end;
$$;

create or replace function public.execute_command(p_command jsonb)
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

revoke all on function public.execute_command(jsonb) from public, anon;
grant execute on function public.execute_command(jsonb) to authenticated;
