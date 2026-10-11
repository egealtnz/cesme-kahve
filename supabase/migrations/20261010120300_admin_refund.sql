-- Çeşme Kahve — refunding a card order after the money was returned in the iyzico merchant panel.
-- Run from the Supabase SQL editor:   select public.admin_refund_order(1234);
-- Cancels the order, marks it refunded, gives back the free coffees it used and takes back the
-- stamps it earned (if those stamps already completed a card, the unused reward is withdrawn instead).

alter table public.loyalty_events drop constraint if exists loyalty_events_kind_check;
alter table public.loyalty_events add constraint loyalty_events_kind_check
  check (kind in ('stamps_earned', 'counter_stamps', 'reward_earned', 'reward_used', 'reward_released', 'stamps_revoked'));

create function public.admin_refund_order(p_order_no bigint) returns public.orders
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders;
  s public.app_settings := public._settings();
  v_have int;
  v_reward uuid;
begin
  select * into o from public.orders where order_no = p_order_no for update;
  if not found then raise exception 'order_not_found'; end if;
  if o.payment_status <> 'paid' or o.payment_method <> 'card' then raise exception 'not_a_paid_card_order'; end if;

  -- free coffees used on this order come back to the customer
  update public.rewards set used_at = null, used_branch_id = null
   where reserved_order_id = o.id and used_by is null;
  perform public._release_rewards(o.id);

  -- stamps earned by this order are taken back
  if o.user_id is not null and o.stamps_awarded_at is not null and o.stamps_earned > 0 then
    select stamps into v_have from public.profiles where id = o.user_id for update;
    if v_have >= o.stamps_earned then
      update public.profiles set stamps = stamps - o.stamps_earned where id = o.user_id;
    else
      select id into v_reward from public.rewards
       where source_order_id = o.id and used_at is null and reserved_order_id is null and expires_at > now()
       limit 1;
      if v_reward is not null then
        update public.rewards set expires_at = now() where id = v_reward;
        update public.profiles set stamps = greatest(v_have + s.stamps_per_reward - o.stamps_earned, 0) where id = o.user_id;
      else
        update public.profiles set stamps = 0 where id = o.user_id;
      end if;
    end if;
    insert into public.loyalty_events (user_id, kind, stamps, order_id, branch_id)
    values (o.user_id, 'stamps_revoked', -o.stamps_earned, o.id, o.branch_id);
  end if;

  update public.orders
     set status = 'cancelled', payment_status = 'refunded', cancelled_at = coalesce(cancelled_at, now()),
         cancel_reason = 'refunded'
   where id = o.id returning * into o;
  return o;
end $$;

revoke execute on function public.admin_refund_order(bigint) from public, anon, authenticated;
grant execute on function public.admin_refund_order(bigint) to service_role;
