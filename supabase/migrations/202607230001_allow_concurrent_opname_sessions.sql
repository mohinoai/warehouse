drop index if exists public.opname_sessions_one_draft;

-- Keep the established command implementation intact, but route opname creation
-- through a wrapper that permits multiple independently editable draft sessions.
alter function public.execute_command(jsonb) set schema private;
alter function private.execute_command(jsonb) rename to execute_command_legacy;
revoke all on function private.execute_command_legacy(jsonb) from public, anon, authenticated;

create function public.execute_command(p_command jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type text := p_command ->> 'type';
  v_entry_id text;
  v_user_id uuid := private.current_user_id();
begin
  if pg_catalog.jsonb_typeof(p_command) <> 'object' or v_type is null then
    return private.command_result(false, 'REJECTED', 'Command ditolak', 'Payload command tidak valid.');
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
