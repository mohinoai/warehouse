begin;

create extension if not exists pgtap with schema extensions;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-1111-1111-111111111111',
  'authenticated', 'authenticated', 'admin@jejak.test', 'test', clock_timestamp(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Test Admin"}'::jsonb,
  clock_timestamp(), clock_timestamp(), '', '', ''
);

select pg_catalog.set_config(
  'request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true
);
select public.bootstrap_demo();

select plan(21);

select has_function('public', 'execute_command', array['jsonb'], 'command RPC tersedia');
select has_function('public', 'get_app_state', array[]::text[], 'state RPC tersedia');
select ok((select count(*) > 0 from public.products), 'bootstrap membuat produk');
select ok((select count(*) > 0 from public.stock_ledger), 'bootstrap membuat ledger');
create temporary table create_opname_result as
select public.execute_command('{"type":"CREATE_OPNAME"}'::jsonb) as result;
select is(
  (select result ->> 'status' from create_opname_result),
  'PROCESSED',
  'sesi opname baru dapat dibuat saat draft lain aktif'
);
select is(
  (select count(*) from public.opname_sessions where status = 'DRAFT'),
  2::bigint,
  'sesi opname baru dipersist bersama draft yang sudah ada'
);
delete from public.opname_counts
where session_id = (select result ->> 'entityId' from create_opname_result);
delete from public.opname_sessions
where id = (select result ->> 'entityId' from create_opname_result);
select is(
  (select count(*) from (
    select b.id
    from public.batches b
    left join public.stock_balance_summary s on s.batch_id = b.id
    left join (
      select l.batch_id, sum(l.qty_delta)::integer as qty
      from public.stock_ledger l group by l.batch_id
    ) x on x.batch_id = b.id
    where coalesce(s.qty_on_hand, 0) <> coalesce(x.qty, 0)
  ) mismatch),
  0::bigint,
  'summary dapat direkonstruksi dari ledger'
);
select throws_ok(
  $$update public.stock_ledger set reference_note = 'mutated' where id = (select id from public.stock_ledger limit 1)$$,
  '55000',
  'stock_ledger is immutable; append a linked reversal instead',
  'ledger menolak update'
);
select is(
  (public.execute_command('{"type":"MANUAL_STOCK_OUT","productId":"p-serum","qty":2,"reason":"SAMPLE","channel":"INTERNAL","referenceNote":"QA"}'::jsonb) ->> 'status'),
  'PROCESSED',
  'stock-out manual diproses lewat FEFO'
);
select is(
  (public.execute_command('{"type":"INJECT_EVENT","event":{"id":"retry-any","idempotencyKey":"DEMO:SHOPEE:RESERVED","source":"WEBHOOK","channel":"SHOPEE","orderId":"SHP-DEMO-RESERVED","occurredAt":"2026-07-20T00:00:00Z","type":"ORDER_CREATED","payload":{"items":[{"productId":"p-serum","qty":1}]}}}'::jsonb) ->> 'status'),
  'DUPLICATE',
  'idempotency key mencegah proses kedua'
);

create temporary table test_return as
select r.id as return_id, i.id as item_id
from public.returns r
join public.return_items i on i.return_id = r.id
where i.condition is null
order by r.created_at
limit 1;
create temporary table ledger_before as select count(*)::bigint as qty from public.stock_ledger;
do $test$
declare
  t record;
begin
  select * into t from test_return;
  perform public.execute_command(pg_catalog.jsonb_build_object(
    'type', 'INSPECT_RETURN',
    'returnId', t.return_id,
    'returnItemId', t.item_id,
    'condition', 'DAMAGED',
    'note', 'Rusak saat transit'
  ));
end;
$test$;
select is(
  (select count(*)::bigint from public.stock_ledger),
  (select qty from ledger_before),
  'retur rusak tidak menulis movement kedua'
);
select ok(
  exists (select 1 from public.return_claims where condition = 'DAMAGED'),
  'retur rusak membuat claim/loss'
);

create temporary table correction_target as
select l.id from public.stock_ledger l
where l.reason = 'INCOMING_MAKLON'
  and not exists (select 1 from public.stock_ledger x where x.reverses_entry_id = l.id)
limit 1;
do $test$
declare
  v_id text;
begin
  select id into v_id from correction_target;
  perform public.execute_command(pg_catalog.jsonb_build_object(
    'type', 'CORRECT_ENTRY', 'entryId', v_id, 'note', 'Uji reversal'
  ));
end;
$test$;
select ok(
  exists (
    select 1 from public.stock_ledger x
    join correction_target t on t.id = x.reverses_entry_id
    where x.reason = 'MANUAL_ENTRY_CORRECTION'
  ),
  'koreksi membuat reversal tertaut'
);

create temporary table ledger_before_cancel as
select count(*)::bigint as qty from public.stock_ledger;
select is(
  (public.execute_command(pg_catalog.jsonb_build_object(
    'type', 'INJECT_EVENT',
    'event', pg_catalog.jsonb_build_object(
      'id', 'test-cancel-pre', 'idempotencyKey', 'TEST:CANCEL:PRE',
      'source', 'SIMULATOR', 'channel', 'SHOPEE',
      'orderId', 'SHP-DEMO-RESERVED', 'occurredAt', clock_timestamp(),
      'type', 'ORDER_CANCELLED',
      'payload', pg_catalog.jsonb_build_object(
        'itemId', 'SHP-DEMO-RESERVED-item-1', 'qty', 1
      )
    )
  )) ->> 'status',
  'PROCESSED',
  'pembatalan parsial sebelum shipment diproses'
);
select is(
  (select count(*)::bigint from public.stock_ledger),
  (select qty from ledger_before_cancel),
  'pembatalan sebelum shipment tidak menulis ledger'
);
select is(
  (public.execute_command(pg_catalog.jsonb_build_object(
    'type', 'INJECT_EVENT',
    'event', pg_catalog.jsonb_build_object(
      'id', 'test-ship-after-cancel', 'idempotencyKey', 'TEST:SHIP:AFTER-CANCEL',
      'source', 'SIMULATOR', 'channel', 'SHOPEE',
      'orderId', 'SHP-DEMO-RESERVED', 'occurredAt', clock_timestamp(),
      'type', 'ORDER_SHIPPED', 'payload', '{}'::jsonb
    )
  )) ->> 'status',
  'PROCESSED',
  'sisa order dikirim setelah pembatalan parsial'
);
create temporary table post_cancel_result as
select public.execute_command(pg_catalog.jsonb_build_object(
  'type', 'INJECT_EVENT',
  'event', pg_catalog.jsonb_build_object(
    'id', 'test-cancel-post', 'idempotencyKey', 'TEST:CANCEL:POST',
    'source', 'SIMULATOR', 'channel', 'SHOPEE',
    'orderId', 'SHP-DEMO-RESERVED', 'occurredAt', clock_timestamp(),
    'type', 'ORDER_CANCELLED',
    'payload', pg_catalog.jsonb_build_object(
      'itemId', 'SHP-DEMO-RESERVED-item-1', 'qty', 1
    )
  )
)) as result;
select is(
  (select result ->> 'status' from post_cancel_result),
  'PROCESSED',
  'pembatalan parsial setelah shipment diproses'
);
select ok(
  (select pg_catalog.jsonb_array_length(result -> 'ledgerEntryIds') > 0 from post_cancel_result),
  'pembatalan setelah shipment membuat reversal ledger'
);

do $test$
declare
  c record;
  v_session_id text;
begin
  select id into v_session_id from public.opname_sessions where status = 'DRAFT';
  for c in select * from public.opname_counts where session_id = v_session_id
  loop
    perform public.execute_command(pg_catalog.jsonb_build_object(
      'type', 'SAVE_OPNAME_COUNT', 'sessionId', v_session_id,
      'batchId', c.batch_id, 'physicalQty', c.system_qty
    ));
  end loop;
end;
$test$;
create temporary table opname_result as
select public.execute_command(pg_catalog.jsonb_build_object(
  'type', 'FINALIZE_OPNAME',
  'sessionId', (select id from public.opname_sessions where status = 'DRAFT')
)) as result;
select is(
  (select result ->> 'status' from opname_result),
  'PROCESSED',
  'opname lengkap dapat difinalisasi'
);
select is(
  (select verification_status::text from public.batches where id = 'b-serum-opening'),
  'VERIFIED',
  'opname pertama memverifikasi opening balance'
);
select is(
  (public.execute_command(pg_catalog.jsonb_build_object(
    'type', 'FINALIZE_OPNAME', 'sessionId', 'OPN-DEMO-DRAFT'
  ))) ->> 'status',
  'REJECTED',
  'sesi opname tidak dapat difinalisasi dua kali'
);

select * from finish();
rollback;
