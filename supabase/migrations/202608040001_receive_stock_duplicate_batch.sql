-- Manual RECEIVE_STOCK hit the raw unique violation on batches.code, so the UI
-- surfaced "duplicate key value violates unique constraint" instead of a domain
-- message. CSV import already guards this in private.process_import_event.
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
