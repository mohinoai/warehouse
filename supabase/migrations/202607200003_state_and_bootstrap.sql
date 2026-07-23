create or replace function private.bootstrap_demo_data()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.current_user_id();
  v_actor text := private.actor_name(v_user_id);
  v_result jsonb;
  v_return_id text;
  v_session_id text := 'OPN-DEMO-DRAFT';
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('jejak-bootstrap', 0));
  if exists (select 1 from public.products) then return; end if;

  insert into public.products (id, sku, name, brand_line, is_bundle, created_by) values
    ('p-serum', 'SKU-SG-30', 'Serum Glow 30ml', 'Aura Hydrogel', false, v_user_id),
    ('p-toner', 'SKU-TC-100', 'Toner Calming 100ml', 'Aura Calm', false, v_user_id),
    ('p-sunscreen', 'SKU-SS-50T', 'Sunscreen SPF50 Travel', 'Aura Shield', false, v_user_id),
    ('p-cleanser', 'SKU-CG-150', 'Cleanser Gentle Foam', 'Aura Pure', false, v_user_id),
    ('p-sample', 'SKU-ST-5', 'Sampel Serum Trial 5ml', 'Aura Hydrogel', false, v_user_id),
    ('p-bundle-glow', 'SKU-BGS-01', 'Bundle Glow Set', null, true, v_user_id);

  insert into public.bundle_recipes (
    id, bundle_product_id, version, effective_at, status, created_by
  ) values
    ('recipe-glow-v1', 'p-bundle-glow', 1, clock_timestamp() - interval '60 days', 'ARCHIVED', v_user_id),
    ('recipe-glow-v2', 'p-bundle-glow', 2, clock_timestamp() - interval '5 days', 'ACTIVE', v_user_id);
  insert into public.bundle_recipe_items (recipe_id, product_id, qty) values
    ('recipe-glow-v1', 'p-serum', 1),
    ('recipe-glow-v1', 'p-toner', 1),
    ('recipe-glow-v2', 'p-serum', 1),
    ('recipe-glow-v2', 'p-toner', 1),
    ('recipe-glow-v2', 'p-sunscreen', 1);

  insert into public.batches (
    id, code, product_id, expiry_date, origin, verification_status,
    sellable, created_at, created_by
  ) values
    ('b-serum-opening', 'SG-OPEN-01', 'p-serum', current_date + 19, 'OPENING', 'UNVERIFIED', true, clock_timestamp() - interval '45 days', v_user_id),
    ('b-serum-02', 'SG-MAK-02', 'p-serum', current_date + 215, 'MAKLON', 'VERIFIED', true, clock_timestamp() - interval '25 days', v_user_id),
    ('b-toner-01', 'TC-MAK-01', 'p-toner', current_date + 10, 'MAKLON', 'VERIFIED', true, clock_timestamp() - interval '35 days', v_user_id),
    ('b-sunscreen-01', 'SS-MAK-01', 'p-sunscreen', current_date + 88, 'MAKLON', 'VERIFIED', true, clock_timestamp() - interval '20 days', v_user_id),
    ('b-cleanser-expired', 'CG-OLD-03', 'p-cleanser', current_date - 14, 'MAKLON', 'VERIFIED', true, clock_timestamp() - interval '120 days', v_user_id),
    ('b-sample-01', 'ST-MAK-01', 'p-sample', current_date + 255, 'MAKLON', 'VERIFIED', true, clock_timestamp() - interval '15 days', v_user_id);

  perform private.append_stock_ledger(
    'p-serum', 'b-serum-opening', 120, 'OPENING_BALANCE', 'INTERNAL',
    'OPENING', 'OPEN-DEMO-01', 'Saldo awal migrasi spreadsheet', null, null,
    'UNVERIFIED', clock_timestamp() - interval '45 days'
  );
  perform private.append_stock_ledger(
    'p-serum', 'b-serum-02', 220, 'INCOMING_MAKLON', 'INTERNAL',
    'MAKLON', 'PO-SERUM-DEMO', 'Surat jalan maklon terverifikasi', null, null,
    'VERIFIED', clock_timestamp() - interval '25 days'
  );
  perform private.append_stock_ledger(
    'p-toner', 'b-toner-01', 90, 'INCOMING_MAKLON', 'INTERNAL',
    'MAKLON', 'PO-TONER-DEMO', 'Surat jalan maklon terverifikasi', null, null,
    'VERIFIED', clock_timestamp() - interval '35 days'
  );
  perform private.append_stock_ledger(
    'p-sunscreen', 'b-sunscreen-01', 75, 'INCOMING_MAKLON', 'INTERNAL',
    'MAKLON', 'PO-SUN-DEMO', 'Surat jalan maklon terverifikasi', null, null,
    'VERIFIED', clock_timestamp() - interval '20 days'
  );
  perform private.append_stock_ledger(
    'p-cleanser', 'b-cleanser-expired', 36, 'INCOMING_MAKLON', 'INTERNAL',
    'MAKLON', 'PO-CLEANSER-DEMO', 'Batch historis', null, null,
    'VERIFIED', clock_timestamp() - interval '120 days'
  );
  perform private.append_stock_ledger(
    'p-sample', 'b-sample-01', 240, 'INCOMING_MAKLON', 'INTERNAL',
    'MAKLON', 'PO-SAMPLE-DEMO', 'Surat jalan maklon terverifikasi', null, null,
    'VERIFIED', clock_timestamp() - interval '15 days'
  );
  perform private.append_stock_ledger(
    'p-sample', 'b-sample-01', -5, 'BONUS', 'INTERNAL',
    'MANUAL', 'MAN-DEMO-NO-REF', null, null, null, null,
    clock_timestamp() - interval '4 days'
  );

  v_result := private.process_import_event(pg_catalog.jsonb_build_object(
    'id', 'evt-demo-shopee-reserved',
    'idempotencyKey', 'DEMO:SHOPEE:RESERVED',
    'source', 'SIMULATOR', 'channel', 'SHOPEE',
    'orderId', 'SHP-DEMO-RESERVED', 'occurredAt', clock_timestamp() - interval '1 day',
    'type', 'ORDER_CREATED',
    'payload', pg_catalog.jsonb_build_object('items', pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('productId', 'p-serum', 'qty', 3),
      pg_catalog.jsonb_build_object('productId', 'p-sunscreen', 'qty', 1)
    ))
  ));

  v_result := private.process_import_event(pg_catalog.jsonb_build_object(
    'id', 'evt-demo-tiktok-bundle',
    'idempotencyKey', 'DEMO:TIKTOK:BUNDLE',
    'source', 'SIMULATOR', 'channel', 'TIKTOK',
    'orderId', 'TT-DEMO-BUNDLE', 'occurredAt', clock_timestamp() - interval '1 day',
    'type', 'ORDER_CREATED',
    'payload', pg_catalog.jsonb_build_object('items', pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('productId', 'p-bundle-glow', 'qty', 1)
    ))
  ));

  v_result := private.process_import_event(pg_catalog.jsonb_build_object(
    'id', 'evt-demo-shipped-create',
    'idempotencyKey', 'DEMO:SHOPEE:SHIPPED:CREATE',
    'source', 'SIMULATOR', 'channel', 'SHOPEE',
    'orderId', 'SHP-DEMO-SHIPPED', 'occurredAt', clock_timestamp() - interval '8 days',
    'type', 'ORDER_CREATED',
    'payload', pg_catalog.jsonb_build_object('items', pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('productId', 'p-sunscreen', 'qty', 2)
    ))
  ));
  v_result := private.process_import_event(pg_catalog.jsonb_build_object(
    'id', 'evt-demo-shipped-send',
    'idempotencyKey', 'DEMO:SHOPEE:SHIPPED:SEND',
    'source', 'SIMULATOR', 'channel', 'SHOPEE',
    'orderId', 'SHP-DEMO-SHIPPED', 'occurredAt', clock_timestamp() - interval '6 days',
    'type', 'ORDER_SHIPPED', 'payload', '{}'::jsonb
  ));
  v_result := private.process_import_event(pg_catalog.jsonb_build_object(
    'id', 'evt-demo-shipped-return',
    'idempotencyKey', 'DEMO:SHOPEE:SHIPPED:RETURN',
    'source', 'SIMULATOR', 'channel', 'SHOPEE',
    'orderId', 'SHP-DEMO-SHIPPED', 'occurredAt', clock_timestamp() - interval '5 days',
    'type', 'RETURN_REQUESTED',
    'payload', pg_catalog.jsonb_build_object('itemId', 'SHP-DEMO-SHIPPED-item-1', 'qty', 1)
  ));

  v_result := private.process_import_event(pg_catalog.jsonb_build_object(
    'id', 'evt-demo-h40-create',
    'idempotencyKey', 'DEMO:TIKTOK:H40:CREATE',
    'source', 'SIMULATOR', 'channel', 'TIKTOK',
    'orderId', 'TT-DEMO-H40', 'occurredAt', clock_timestamp() - interval '39 days',
    'type', 'ORDER_CREATED',
    'payload', pg_catalog.jsonb_build_object('items', pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('productId', 'p-serum', 'qty', 1)
    ))
  ));
  v_result := private.process_import_event(pg_catalog.jsonb_build_object(
    'id', 'evt-demo-h40-send',
    'idempotencyKey', 'DEMO:TIKTOK:H40:SEND',
    'source', 'SIMULATOR', 'channel', 'TIKTOK',
    'orderId', 'TT-DEMO-H40', 'occurredAt', clock_timestamp() - interval '38 days',
    'type', 'ORDER_SHIPPED', 'payload', '{}'::jsonb
  ));
  v_result := private.process_import_event(pg_catalog.jsonb_build_object(
    'id', 'evt-demo-h40-return',
    'idempotencyKey', 'DEMO:TIKTOK:H40:RETURN',
    'source', 'SIMULATOR', 'channel', 'TIKTOK',
    'orderId', 'TT-DEMO-H40', 'occurredAt', clock_timestamp() - interval '37 days',
    'type', 'RETURN_REQUESTED',
    'payload', pg_catalog.jsonb_build_object('itemId', 'TT-DEMO-H40-item-1', 'qty', 1)
  ));
  v_return_id := v_result ->> 'entityId';
  update public.returns set received_at = clock_timestamp() - interval '2 days' where id = v_return_id;

  insert into public.orders (id, channel, status, created_at, updated_at, source_event_id)
  values (
    'TT-DEMO-MISSING', 'TIKTOK', 'IN_TRANSIT', clock_timestamp() - interval '3 days',
    clock_timestamp() - interval '2 days', 'evt-demo-missing-ledger'
  );
  insert into public.order_items (
    id, order_id, product_id, ordered_qty, reserved_qty, shipped_qty
  ) values ('TT-DEMO-MISSING-item-1', 'TT-DEMO-MISSING', 'p-toner', 2, 0, 2);
  insert into public.order_item_components (order_item_id, product_id, qty_per_item)
  values ('TT-DEMO-MISSING-item-1', 'p-toner', 1);

  insert into public.opname_sessions (id, warehouse, status, started_at, created_by)
  values (v_session_id, 'Gudang Utama', 'DRAFT', clock_timestamp() - interval '1 hour', v_user_id);
  insert into public.opname_counts (session_id, batch_id, system_qty, physical_qty)
  select v_session_id, b.id, coalesce(s.qty_on_hand, 0),
    case when row_number() over (order by b.id) <= 2 then coalesce(s.qty_on_hand, 0) end
  from public.batches b left join public.stock_balance_summary s on s.batch_id = b.id;

  perform private.run_reconciliation();
end;
$$;

create or replace function public.bootstrap_demo()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.current_user_id();
  perform private.bootstrap_demo_data();
end;
$$;

create or replace function public.get_app_state()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.current_user_id();
  v_actor text := private.actor_name(v_user_id);
  v_now timestamptz := clock_timestamp();
begin
  return pg_catalog.jsonb_build_object(
    'demoNow', v_now,
    'actor', v_actor,
    'products', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'id', p.id, 'sku', p.sku, 'name', p.name,
        'brandLine', p.brand_line, 'isBundle', case when p.is_bundle then true end
      )) order by p.name)
      from public.products p where p.is_active
    ), '[]'::jsonb),
    'batches', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'id', b.id, 'code', b.code, 'productId', b.product_id,
        'expiryDate', b.expiry_date, 'origin', b.origin,
        'verificationStatus', b.verification_status,
        'verifiedBySessionId', b.verified_by_session_id,
        'createdAt', b.created_at, 'sellable', b.sellable
      )) order by b.expiry_date, b.code)
      from public.batches b
    ), '[]'::jsonb),
    'balanceSummary', coalesce((
      select pg_catalog.jsonb_object_agg(s.batch_id, pg_catalog.jsonb_build_object(
        'batchId', s.batch_id, 'qtyOnHand', s.qty_on_hand,
        'ledgerEntryId', s.ledger_entry_id, 'updatedAt', s.updated_at
      )) from public.stock_balance_summary s
    ), '{}'::jsonb),
    'ledgerEntries', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'id', l.id, 'createdAt', l.created_at, 'productId', l.product_id,
        'batchId', l.batch_id, 'qtyDelta', l.qty_delta, 'reason', l.reason,
        'channel', l.channel, 'referenceType', l.reference_type,
        'referenceId', l.reference_id, 'referenceNote', l.reference_note,
        'actor', l.actor_name, 'balanceAfter', l.balance_after,
        'allocationGroupId', l.allocation_group_id,
        'reversesEntryId', l.reverses_entry_id,
        'reversedByEntryId', (
          select x.id from public.stock_ledger x where x.reverses_entry_id = l.id limit 1
        ),
        'verificationStatus', case when l.reason = 'OPENING_BALANCE'
          then b.verification_status else l.verification_status_at_entry end
      )) order by l.created_at desc, l.id desc)
      from public.stock_ledger l join public.batches b on b.id = l.batch_id
    ), '[]'::jsonb),
    'orders', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', o.id, 'channel', o.channel, 'status', o.status,
        'createdAt', o.created_at, 'updatedAt', o.updated_at,
        'sourceEventId', o.source_event_id,
        'items', coalesce((
          select pg_catalog.jsonb_agg(pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
            'id', i.id, 'productId', i.product_id, 'orderedQty', i.ordered_qty,
            'reservedQty', i.reserved_qty, 'shippedQty', i.shipped_qty,
            'cancelledQty', i.cancelled_qty, 'returnedQty', i.returned_qty,
            'recipeVersionId', i.recipe_version_id,
            'componentSnapshot', case when i.recipe_version_id is not null then (
              select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                'productId', c.product_id, 'qty', c.qty_per_item
              ) order by c.product_id)
              from public.order_item_components c where c.order_item_id = i.id
            ) end
          )) order by i.id)
          from public.order_items i where i.order_id = o.id
        ), '[]'::jsonb),
        'allocations', coalesce((
          select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'id', a.id, 'orderItemId', a.order_item_id, 'productId', a.product_id,
            'batchId', a.batch_id, 'qty', a.qty, 'ledgerEntryId', a.ledger_entry_id
          ) order by a.created_at, a.id)
          from public.shipment_allocations a
          join public.order_items i on i.id = a.order_item_id
          where i.order_id = o.id
        ), '[]'::jsonb)
      ) order by o.created_at desc, o.id)
      from public.orders o
    ), '[]'::jsonb),
    'returns', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'id', r.id, 'orderId', r.order_id, 'channel', r.channel,
        'createdAt', r.created_at, 'receivedAt', r.received_at,
        'inspectionStatus', r.inspection_status,
        'items', coalesce((
          select pg_catalog.jsonb_agg(pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
            'id', i.id, 'orderItemId', i.order_item_id, 'productId', i.product_id,
            'qty', i.qty, 'condition', i.condition, 'inspectionNote', i.inspection_note,
            'newBatchId', i.new_batch_id, 'claimId', c.id
          )) order by i.id)
          from public.return_items i
          left join public.return_claims c on c.return_item_id = i.id
          where i.return_id = r.id
        ), '[]'::jsonb)
      )) order by r.created_at desc, r.id)
      from public.returns r
    ), '[]'::jsonb),
    'returnClaims', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'id', c.id, 'returnId', c.return_id, 'returnItemId', c.return_item_id,
        'condition', c.condition, 'status', c.status, 'deadline', c.deadline,
        'evidenceReference', c.evidence_reference, 'note', c.note,
        'filedAt', c.filed_at, 'resolvedAt', c.resolved_at, 'resolution', c.resolution
      )) order by c.created_at desc, c.id)
      from public.return_claims c
    ), '[]'::jsonb),
    'bundleRecipes', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', r.id, 'bundleProductId', r.bundle_product_id, 'version', r.version,
        'effectiveAt', r.effective_at, 'status', r.status,
        'createdBy', private.actor_name(r.created_by),
        'items', coalesce((
          select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'productId', i.product_id, 'qty', i.qty
          ) order by i.product_id)
          from public.bundle_recipe_items i where i.recipe_id = r.id
        ), '[]'::jsonb)
      ) order by r.bundle_product_id, r.version desc)
      from public.bundle_recipes r
    ), '[]'::jsonb),
    'opnameSessions', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'id', s.id, 'warehouse', s.warehouse, 'status', s.status,
        'startedAt', s.started_at, 'finalizedAt', s.finalized_at,
        'createdBy', private.actor_name(s.created_by),
        'counts', coalesce((
          select pg_catalog.jsonb_agg(pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
            'batchId', c.batch_id, 'systemQty', c.system_qty,
            'physicalQty', c.physical_qty, 'exceptionReason', c.exception_reason
          )) order by c.batch_id)
          from public.opname_counts c where c.session_id = s.id
        ), '[]'::jsonb),
        'correctionEntryIds', coalesce((
          select pg_catalog.jsonb_agg(l.id order by l.created_at, l.id)
          from public.stock_ledger l
          where l.reason = 'OPNAME_CORRECTION' and l.reference_id = s.id
        ), '[]'::jsonb)
      )) order by s.started_at desc, s.id)
      from public.opname_sessions s
    ), '[]'::jsonb),
    'anomalies', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', a.id, 'priority', a.priority, 'type', a.type, 'title', a.title,
        'description', a.description, 'referenceLabel', a.reference_label,
        'target', a.target, 'source', a.source, 'status', a.status
      ) order by case when a.status = 'OPEN' then 0 else 1 end,
        case when a.priority = 'KRITIS' then 0 else 1 end, a.last_detected_at desc)
      from public.anomaly_worklist a
    ), '[]'::jsonb),
    'notifications', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'id', n.id, 'type', n.type, 'title', n.title,
        'description', n.description, 'createdAt', n.created_at,
        'target', n.target, 'readAt', n.read_at
      )) order by n.created_at desc, n.id)
      from public.notifications n where n.active
    ), '[]'::jsonb),
    'processedEventKeys', coalesce((
      select pg_catalog.jsonb_agg(e.idempotency_key order by e.processed_at)
      from public.import_events e
    ), '[]'::jsonb),
    'lastReconciledAt', coalesce((
      select max(r.run_at) from public.reconciliation_runs r
    ), v_now),
    'nextSequence', 1000
      + (select count(*) from public.import_events)
      + (select count(*) from public.stock_ledger)
      + (select count(*) from public.batches)
      + (select count(*) from public.returns),
    'failNextOperation', false
  );
end;
$$;

revoke all on function public.bootstrap_demo() from public, anon;
revoke all on function public.get_app_state() from public, anon;
grant execute on function public.bootstrap_demo() to authenticated;
grant execute on function public.get_app_state() to authenticated;
