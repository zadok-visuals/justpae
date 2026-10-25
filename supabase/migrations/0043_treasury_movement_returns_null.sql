-- ============================================================================
-- justpae 0043 — record_treasury_movement returns NULL, not a row of nulls.
--
-- A plpgsql function with a composite return type hands back a ROW whose
-- every field is null when its RETURNING clause matched nothing. Over
-- PostgREST that arrives as `{"id": null, …}` — an object, and therefore
-- truthy. A caller writing `if (!recorded) return` would read "the reference
-- already exists" as "recorded fine" and send a second transfer.
--
-- The application already checks `.id` rather than the row, so this closes
-- the trap at the other end too: the contract is now "null means somebody
-- else got there first", in both languages.
-- ============================================================================

create or replace function record_treasury_movement(
  p_currency currency,
  p_amount numeric,
  p_from_account text,
  p_to_account text,
  p_reference text,
  p_source text default 'manual',
  p_occurred_on date default current_date,
  p_note text default null,
  p_created_by uuid default null
)
returns treasury_movements
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row treasury_movements;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'A treasury movement needs a positive amount.';
  end if;
  if p_reference is null or p_reference = '' then
    raise exception 'A treasury movement needs a reference.';
  end if;
  if coalesce(trim(p_from_account), '') = '' or coalesce(trim(p_to_account), '') = '' then
    raise exception 'A treasury movement needs both ends of the transfer.';
  end if;

  insert into treasury_movements (
    currency, amount, from_account, to_account, reference, source, occurred_on, note, created_by
  )
  values (
    p_currency, p_amount, trim(p_from_account), trim(p_to_account), p_reference,
    p_source, coalesce(p_occurred_on, current_date), p_note, p_created_by
  )
  on conflict (reference) do nothing
  returning * into v_row;

  -- The one line this file exists for.
  if v_row.id is null then
    return null;
  end if;

  return v_row;
end;
$$;

revoke execute on function record_treasury_movement(currency, numeric, text, text, text, text, date, text, uuid)
  from public, anon, authenticated;

do $$
declare
  v_first treasury_movements;
  v_again treasury_movements;
begin
  perform assert_treasury_invariants();

  v_first := record_treasury_movement(
    'NGN', 100, 'a', 'b', 'null_return_test', 'manual', current_date, null, null
  );
  if v_first.id is null then
    raise exception 'ASSERTION FAILED: the first movement was not recorded.';
  end if;

  v_again := record_treasury_movement(
    'NGN', 100, 'a', 'b', 'null_return_test', 'manual', current_date, null, null
  );
  if v_again is not null then
    raise exception 'ASSERTION FAILED: a duplicate returned a row rather than NULL.';
  end if;

  delete from treasury_movements where reference = 'null_return_test';
  raise notice 'record_treasury_movement returns NULL on a duplicate.';
end;
$$;
