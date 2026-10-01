-- Display names are free-text labels: any player may pick any name, including
-- one another player already uses (the leaderboard tells rows apart by
-- player_id, not by name). The unique index added in
-- `display_name_unique_and_transfer_fn` contradicted that: saving a taken name
-- made the whole progress upsert fail with 500, so the client showed
-- "saved locally only" and every later save for that player kept failing too.
drop index if exists public.player_progress_display_name_lower_idx;

-- transfer_coins looks the recipient up by name. Now that names can repeat,
-- refuse an ambiguous name instead of silently paying an arbitrary player.
create or replace function public.transfer_coins(p_sender_id text, p_recipient_name text, p_amount integer)
 returns table(sender_coins integer, recipient_coins integer)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_sender record;
  v_recipient record;
  v_matches integer;
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

  select count(*) into v_matches
    from public.player_progress
    where lower(display_name) = lower(p_recipient_name);
  if v_matches = 0 then
    raise exception 'RECIPIENT_NOT_FOUND';
  end if;
  if v_matches > 1 then
    raise exception 'AMBIGUOUS_RECIPIENT';
  end if;

  select player_id, coins, display_name into v_recipient
    from public.player_progress
    where lower(display_name) = lower(p_recipient_name)
    for update;

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
$function$;
