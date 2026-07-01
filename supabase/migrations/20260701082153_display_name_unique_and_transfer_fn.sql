-- Phase 4 scoreboard: unique display names (so a name can be used to target a
-- coin transfer unambiguously) + an atomic coin-transfer RPC.

-- 1. Case-insensitive uniqueness on display_name (NULLs excluded, so players
--    without a name yet never collide). Existing duplicates (from before this
--    constraint existed) are disambiguated first by suffixing all but the
--    oldest row per name — otherwise the index creation would fail.
with dupes as (
  select
    player_id,
    row_number() over (
      partition by lower(display_name)
      order by updated_at asc
    ) as rn
  from public.player_progress
  where display_name is not null
)
update public.player_progress p
  set display_name = p.display_name || '_' || substr(p.player_id::text, 1, 4)
  from dupes
  where dupes.player_id = p.player_id and dupes.rn > 1;

create unique index if not exists player_progress_display_name_lower_idx
  on public.player_progress (lower(display_name))
  where display_name is not null;

-- 2. transfer_coins — atomic sender-debit/recipient-credit by display name.
--    SECURITY DEFINER + fixed search_path so it can be called via the
--    service-role RPC without exposing table access to anon/authenticated.
--    Row locks (FOR UPDATE) on both rows prevent lost updates from concurrent
--    transfers touching the same player.
create or replace function public.transfer_coins(
  p_sender_id text,
  p_recipient_name text,
  p_amount integer
) returns table (sender_coins integer, recipient_coins integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender record;
  v_recipient record;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;

  select player_id, coins into v_sender
    from public.player_progress
    where player_id = p_sender_id
    for update;
  if not found then
    raise exception 'SENDER_NOT_FOUND';
  end if;

  select player_id, coins, display_name into v_recipient
    from public.player_progress
    where lower(display_name) = lower(p_recipient_name)
    for update;
  if not found then
    raise exception 'RECIPIENT_NOT_FOUND';
  end if;

  if v_recipient.player_id = v_sender.player_id then
    raise exception 'SELF_TRANSFER';
  end if;

  if v_sender.coins < p_amount then
    raise exception 'INSUFFICIENT_COINS';
  end if;

  update public.player_progress
    set coins = coins - p_amount, updated_at = now()
    where player_id = v_sender.player_id;

  update public.player_progress
    set coins = coins + p_amount, updated_at = now()
    where player_id = v_recipient.player_id;

  return query
    select
      (select coins from public.player_progress where player_id = v_sender.player_id),
      (select coins from public.player_progress where player_id = v_recipient.player_id);
end;
$$;

revoke all on function public.transfer_coins(text, text, integer) from public;
grant execute on function public.transfer_coins(text, text, integer) to service_role;
