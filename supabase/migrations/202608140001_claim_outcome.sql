-- Differentiate the claim process for DAMAGED vs LOST returns.
-- Damaged goods physically return, so a replacement claim is possible; lost
-- goods never came back, so only reimbursement or write-off apply. The resolve
-- step now records a structured outcome and enforces which outcomes are valid
-- per condition, on top of the existing status separation.

create type public.claim_outcome as enum ('REPLACED', 'REIMBURSED', 'WRITE_OFF');

alter table public.return_claims
  add column outcome public.claim_outcome;

create or replace function public.execute_command(p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text := p_command ->> 'type';
  v_entry_id text;
  v_user_id uuid := private.current_user_id();
  v_claim record;
  v_outcome public.claim_outcome;
  v_resolution text;
begin
  if pg_catalog.jsonb_typeof(p_command) <> 'object' or v_type is null then
    return private.command_result(false, 'REJECTED', 'Command ditolak', 'Payload command tidak valid.');
  end if;

  if v_type = 'RESOLVE_CLAIM' then
    select c.* into v_claim from public.return_claims c
    where c.id = p_command ->> 'claimId' for update;
    v_resolution := btrim(coalesce(p_command ->> 'resolution', ''));
    if not found or v_claim.status <> 'FILED' or v_resolution = '' then
      raise exception 'Resolution wajib dan klaim harus FILED' using errcode = '22023';
    end if;
    if p_command ->> 'outcome' is null then
      raise exception 'Hasil penyelesaian klaim wajib dipilih' using errcode = '22023';
    end if;
    v_outcome := (p_command ->> 'outcome')::public.claim_outcome;
    if v_claim.condition = 'LOST' and v_outcome = 'REPLACED' then
      raise exception 'Barang hilang tidak bisa REPLACED; pilih REIMBURSED atau WRITE_OFF' using errcode = '22023';
    end if;
    update public.return_claims
    set status = 'RESOLVED', resolved_at = clock_timestamp(),
        resolution = v_resolution, outcome = v_outcome
    where id = v_claim.id;
    perform private.run_reconciliation();
    return private.command_result(
      true, 'PROCESSED', 'Klaim diselesaikan',
      v_claim.id || ' · ' || v_outcome::text || ' · tidak lagi memicu reminder.', v_claim.id
    );
  end if;

  if v_type <> 'CREATE_OPNAME' then
    return private.execute_command_legacy(p_command);
  end if;

  v_entry_id := private.new_id('opn');
  insert into public.opname_sessions (id, warehouse, status, created_by)
  values (v_entry_id, 'Gudang Utama', 'DRAFT', v_user_id);
  insert into public.opname_counts (session_id, batch_id, system_qty)
  select v_entry_id, b.id, coalesce(s.qty_on_hand, 0)
  from public.batches b
  left join public.stock_balance_summary s on s.batch_id = b.id;

  return private.command_result(
    true,
    'PROCESSED',
    'Sesi opname baru dibuat',
    v_entry_id || ' memiliki ' ||
      (select count(*) from public.opname_counts where session_id = v_entry_id) ||
      ' batch dalam scope.',
    v_entry_id
  );
exception
  when others then
    return private.command_result(false, 'REJECTED', 'Operasi ditolak', sqlerrm);
end;
$$;

revoke all on function public.execute_command(jsonb) from public, anon;
grant execute on function public.execute_command(jsonb) to authenticated;

-- Surface the new claim outcome in the app state snapshot without rewriting the
-- whole serializer: move the existing builder aside and wrap it, injecting
-- `outcome` into each returnClaims element it produced.
alter function public.get_app_state() set schema private;
alter function private.get_app_state() rename to get_app_state_v1;
revoke all on function private.get_app_state_v1() from public, anon, authenticated;

create function public.get_app_state()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state jsonb := private.get_app_state_v1();
  v_claims jsonb;
begin
  select coalesce(
    pg_catalog.jsonb_agg(
      case when c.outcome is null then t.elem
        else t.elem || pg_catalog.jsonb_build_object('outcome', c.outcome) end
      order by t.ord
    ),
    '[]'::jsonb
  )
  into v_claims
  from pg_catalog.jsonb_array_elements(v_state -> 'returnClaims')
    with ordinality as t(elem, ord)
  left join public.return_claims c on c.id = t.elem ->> 'id';

  return pg_catalog.jsonb_set(v_state, '{returnClaims}', v_claims);
end;
$$;

revoke all on function public.get_app_state() from public, anon;
grant execute on function public.get_app_state() to authenticated;
