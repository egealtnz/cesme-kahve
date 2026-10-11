-- Çeşme Kahve — switch for card payments.
-- Card payments stay hidden in the app until the iyzico keys are in place. Turn them on with:
--   update public.app_settings set card_payments_enabled = true;

alter table public.app_settings add column if not exists card_payments_enabled boolean not null default false;

create function public._check_card_payments() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.payment_method = 'card' and not coalesce((select card_payments_enabled from public.app_settings), false) then
    raise exception 'card_payments_disabled';
  end if;
  return new;
end $$;

create trigger orders_card_payments_enabled
  before insert on public.orders
  for each row execute function public._check_card_payments();

revoke execute on function public._check_card_payments() from public, anon, authenticated;
