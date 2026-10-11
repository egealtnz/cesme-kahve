-- Çeşme Kahve — server logic
-- Every function that changes money, stamps or rewards runs here, inside one transaction, with the
-- caller's identity taken from the JWT (auth.uid()). Internal helpers start with "_" and are not
-- callable from the app.

-- ---------------------------------------------------------------- helpers
-- Random code from an alphabet without look-alike characters (no I, O, 0, 1). Uses the strong
-- random source behind gen_random_uuid().
create function public._new_code(p_len int) returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea := '';
  out text := '';
  i int;
begin
  while length(bytes) < p_len loop
    bytes := bytes || uuid_send(gen_random_uuid());
  end loop;
  for i in 0 .. p_len - 1 loop
    out := out || substr(alphabet, 1 + (get_byte(bytes, i) % 32), 1);
  end loop;
  return out;
end $$;

create function public.is_staff(p_branch text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.staff_members s
    where s.user_id = auth.uid() and (s.role = 'admin' or s.branch_id = p_branch)
  );
$$;

create function public._settings() returns public.app_settings
language sql stable set search_path = '' as $$ select * from public.app_settings where id $$;

-- ---------------------------------------------------------------- new accounts
-- The app sends the profile fields as sign-up metadata; this trigger turns them into a profile row.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_code text;
  v_birthday date;
  v_phone text := regexp_replace(coalesce(m ->> 'phone', ''), '\D', '', 'g');
begin
  loop
    v_code := public._new_code(10);
    exit when not exists (select 1 from public.profiles where member_code = v_code);
  end loop;

  begin
    v_birthday := nullif(m ->> 'birthday', '')::date;
    if v_birthday > current_date or v_birthday < date '1900-01-01' then v_birthday := null; end if;
  exception when others then v_birthday := null;
  end;

  insert into public.profiles (
    id, first_name, last_name, phone, birthday, favorite_branch_id, marketing_opt_in,
    terms_accepted_at, privacy_notice_at, member_code)
  values (
    new.id,
    left(coalesce(nullif(trim(m ->> 'first_name'), ''), split_part(coalesce(new.email, 'Misafir'), '@', 1)), 60),
    left(coalesce(nullif(trim(m ->> 'last_name'), ''), '-'), 60),
    case when v_phone ~ '^5[0-9]{9}$' then v_phone end,
    v_birthday,
    (select b.id from public.branches b where b.id = m ->> 'favorite_branch_id'),
    coalesce((m ->> 'marketing_opt_in')::boolean, false),
    case when (m ->> 'terms_accepted')::boolean then now() end,
    case when (m ->> 'privacy_notice_ack')::boolean then now() end,
    v_code);
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- loyalty internals
-- Adds stamps; every full card turns into a free coffee.
create function public._add_stamps(
  p_user uuid, p_stamps int, p_kind text, p_order uuid, p_branch text, p_staff uuid)
returns int language plpgsql set search_path = '' as $$
declare
  s public.app_settings := public._settings();
  v_total int;
  v_new int;
  v_reward uuid;
  i int;
begin
  if p_stamps <= 0 then return 0; end if;
  update public.profiles set stamps = stamps + p_stamps where id = p_user returning stamps into v_total;
  if not found then return 0; end if;
  insert into public.loyalty_events (user_id, kind, stamps, order_id, branch_id, staff_id)
  values (p_user, p_kind, p_stamps, p_order, p_branch, p_staff);

  v_new := v_total / s.stamps_per_reward;
  if v_new > 0 then
    update public.profiles set stamps = v_total % s.stamps_per_reward where id = p_user;
    for i in 1 .. v_new loop
      loop
        begin
          insert into public.rewards (user_id, code, expires_at, source_order_id)
          values (p_user, public._new_code(6), now() + make_interval(days => s.reward_valid_days), p_order)
          returning id into v_reward;
          exit;
        exception when unique_violation then
          -- code collision: try another one
        end;
      end loop;
      insert into public.loyalty_events (user_id, kind, reward_id, order_id, branch_id, staff_id)
      values (p_user, 'reward_earned', v_reward, p_order, p_branch, p_staff);
    end loop;
  end if;
  return v_new;
end $$;

create function public._award_order_stamps(p_order uuid) returns int
language plpgsql set search_path = '' as $$
declare o public.orders;
begin
  update public.orders set stamps_awarded_at = now()
  where id = p_order and stamps_awarded_at is null and user_id is not null
  returning * into o;
  if not found or o.stamps_earned = 0 then return 0; end if;
  return public._add_stamps(o.user_id, o.stamps_earned, 'stamps_earned', o.id, o.branch_id, null);
end $$;

create function public._consume_rewards(p_order uuid) returns void
language plpgsql set search_path = '' as $$
begin
  with used as (
    update public.rewards r
       set used_at = now(), used_branch_id = o.branch_id
      from public.orders o
     where o.id = p_order and r.reserved_order_id = p_order and r.used_at is null
    returning r.id, r.user_id, o.branch_id
  )
  insert into public.loyalty_events (user_id, kind, reward_id, order_id, branch_id)
  select user_id, 'reward_used', id, p_order, branch_id from used;
end $$;

create function public._release_rewards(p_order uuid) returns void
language plpgsql set search_path = '' as $$
begin
  with released as (
    update public.rewards
       set reserved_order_id = null, used_at = null, used_branch_id = null
     where reserved_order_id = p_order and used_by is null
    returning id, user_id
  )
  insert into public.loyalty_events (user_id, kind, reward_id, order_id)
  select user_id, 'reward_released', id, p_order from released;
end $$;

-- Card orders whose payment never finished are cancelled and their free coffees come back.
create function public._expire_stale_orders(p_user uuid default null) returns int
language plpgsql set search_path = '' as $$
declare
  s public.app_settings := public._settings();
  r record;
  n int := 0;
begin
  for r in
    select id from public.orders
     where status = 'awaiting_payment'
       and created_at < now() - make_interval(mins => s.payment_timeout_min)
       and (p_user is null or user_id = p_user)
     for update skip locked
  loop
    update public.orders
       set status = 'cancelled', payment_status = 'failed', cancelled_at = now(), cancel_reason = 'payment_timeout'
     where id = r.id;
    perform public._release_rewards(r.id);
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------- customer: place an order
-- p_items: [{"product_id": "flat-white", "milk_id": "badem", "quantity": 2}, ...]
-- Free coffees go to the most expensive coffees (milk extra included). "Second coffee x% off" then
-- pairs the remaining paid coffees from the most expensive down and discounts the cheaper of each pair.
create function public.place_order(
  p_branch_id text,
  p_items jsonb,
  p_payment_method public.payment_method,
  p_use_rewards int default 0,
  p_eco_packaging boolean default true,
  p_own_cup boolean default false)
returns public.orders
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  s public.app_settings := public._settings();
  b public.branches;
  v_profile public.profiles;
  o public.orders;
  v_item jsonb;
  v_prod public.products;
  v_cat public.menu_categories;
  v_milk public.milk_options;
  v_qty int;
  v_total_qty int := 0;
  v_free int;
  v_left int;
  r record;
  v_subtotal int;
  v_reward int;
  v_campaign int := 0;
  v_cup int := 0;
  v_paid_coffees int;
  v_has_drink boolean;
  v_total int;
begin
  if v_uid is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into v_profile from public.profiles where id = v_uid;
  if not found then raise exception 'profile_missing'; end if;

  select * into b from public.branches where id = p_branch_id;
  if not found then raise exception 'branch_not_found'; end if;
  if b.status <> 'open' or not b.accepts_orders then raise exception 'branch_not_accepting_orders'; end if;

  perform public._expire_stale_orders(v_uid);
  if (select count(*) from public.orders
       where user_id = v_uid and status in ('awaiting_payment', 'placed', 'preparing', 'ready')) >= s.max_open_orders then
    raise exception 'too_many_open_orders';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 30 then
    raise exception 'invalid_items';
  end if;

  insert into public.orders (user_id, customer_name, branch_id, status, payment_method, eco_packaging, own_cup, subtotal, total)
  values (v_uid, v_profile.first_name, b.id, 'awaiting_payment', p_payment_method,
          coalesce(p_eco_packaging, true), coalesce(p_own_cup, false), 0, 0)
  returning * into o;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item ->> 'quantity')::int;
    if v_qty is null or v_qty < 1 or v_qty > 20 then raise exception 'invalid_quantity'; end if;
    v_total_qty := v_total_qty + v_qty;
    if v_total_qty > 50 then raise exception 'order_too_large'; end if;

    select * into v_prod from public.products where id = v_item ->> 'product_id' and is_active;
    if not found then raise exception 'product_unavailable:%', v_item ->> 'product_id'; end if;
    select * into v_cat from public.menu_categories where id = v_prod.category_id;
    if not v_cat.is_active then raise exception 'product_unavailable:%', v_prod.id; end if;
    if exists (select 1 from public.product_availability a
                where a.branch_id = b.id and a.product_id = v_prod.id and a.sold_out) then
      raise exception 'product_sold_out:%', v_prod.id;
    end if;

    v_milk := null;
    if v_prod.has_milk_options then
      if nullif(v_item ->> 'milk_id', '') is null then
        select * into v_milk from public.milk_options where is_default and is_active;
      else
        select * into v_milk from public.milk_options where id = v_item ->> 'milk_id' and is_active;
        if not found then raise exception 'milk_unavailable:%', v_item ->> 'milk_id'; end if;
      end if;
    elsif nullif(v_item ->> 'milk_id', '') is not null then
      raise exception 'milk_not_allowed:%', v_prod.id;
    end if;

    insert into public.order_items (order_id, product_id, product_name, milk_id, milk_label, unit_price, quantity, is_coffee)
    values (o.id, v_prod.id, v_prod.name, v_milk.id, v_milk.label,
            v_prod.price + coalesce(v_milk.extra_price, 0), v_qty, v_prod.is_coffee);
  end loop;

  -- Free coffees: reserve the customer's soonest-expiring rewards.
  v_free := least(greatest(coalesce(p_use_rewards, 0), 0),
                  (select coalesce(sum(quantity), 0) from public.order_items where order_id = o.id and is_coffee));
  if v_free > 0 then
    with picked as (
      select id from public.rewards
       where user_id = v_uid and used_at is null and reserved_order_id is null and expires_at > now()
       order by expires_at, earned_at
       limit v_free
       for update skip locked
    )
    update public.rewards rw set reserved_order_id = o.id from picked where rw.id = picked.id;
    get diagnostics v_free = row_count;
  end if;

  v_left := v_free;
  for r in select id, quantity from public.order_items
            where order_id = o.id and is_coffee order by unit_price desc, id loop
    exit when v_left = 0;
    update public.order_items set free_quantity = least(v_left, r.quantity) where id = r.id;
    v_left := v_left - least(v_left, r.quantity);
  end loop;

  select coalesce(sum(unit_price * quantity), 0),
         coalesce(sum(unit_price * free_quantity), 0),
         coalesce(sum(quantity - free_quantity) filter (where is_coffee), 0)
    into v_subtotal, v_reward, v_paid_coffees
    from public.order_items where order_id = o.id;

  if s.second_coffee_active and s.second_coffee_pct > 0 then
    select coalesce(sum(round(price * s.second_coffee_pct / 100.0)) filter (where rn % 2 = 0), 0)::int
      into v_campaign
      from (
        select i.unit_price as price, row_number() over (order by i.unit_price desc, i.id, g) as rn
          from public.order_items i
          cross join lateral generate_series(1, i.quantity - i.free_quantity) g
         where i.order_id = o.id and i.is_coffee
      ) paid;
  end if;

  select exists (select 1 from public.order_items i
                   join public.products p on p.id = i.product_id
                   join public.menu_categories c on c.id = p.category_id
                  where i.order_id = o.id and c.is_drink)
    into v_has_drink;
  if coalesce(p_own_cup, false) and v_has_drink then
    v_cup := least(s.own_cup_discount, greatest(v_subtotal - v_reward - v_campaign, 0));
  end if;

  v_total := greatest(v_subtotal - v_reward - v_campaign - v_cup, 0);

  update public.orders set
    subtotal = v_subtotal, reward_discount = v_reward, campaign_discount = v_campaign, cup_discount = v_cup,
    total = v_total, rewards_used = v_free, stamps_earned = v_paid_coffees,
    own_cup = coalesce(p_own_cup, false) and v_has_drink,
    payment_method = case when v_total = 0 then 'store'::public.payment_method else p_payment_method end,
    payment_status = case when v_total = 0 then 'paid'::public.payment_status else 'unpaid'::public.payment_status end,
    paid_at        = case when v_total = 0 then now() end,
    status = case when v_total > 0 and p_payment_method = 'card' then 'awaiting_payment'::public.order_status
                  else 'placed'::public.order_status end
  where id = o.id
  returning * into o;

  if o.status = 'placed' then
    perform public._consume_rewards(o.id);
  end if;
  return o;
end $$;

-- ---------------------------------------------------------------- customer: cancel
create function public.cancel_my_order(p_order uuid) returns public.orders
language plpgsql security definer set search_path = '' as $$
declare o public.orders;
begin
  select * into o from public.orders where id = p_order and user_id = auth.uid() for update;
  if not found then raise exception 'order_not_found'; end if;
  if not (o.status = 'awaiting_payment'
          or (o.status = 'placed' and o.payment_method = 'store' and o.payment_status = 'unpaid')) then
    raise exception 'cannot_cancel';
  end if;
  update public.orders
     set status = 'cancelled', cancelled_at = now(), cancel_reason = 'customer',
         payment_status = case when payment_status = 'unpaid' then 'unpaid'::public.payment_status else payment_status end
   where id = o.id returning * into o;
  perform public._release_rewards(o.id);
  return o;
end $$;

-- ---------------------------------------------------------------- payments (service role only)
create function public.attach_payment_token(p_order uuid, p_token text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.orders set iyzico_token = p_token
   where id = p_order and status = 'awaiting_payment' and payment_method = 'card';
  if not found then raise exception 'order_not_awaiting_payment'; end if;
end $$;

create function public.mark_order_paid(p_order uuid, p_payment_id text, p_paid_amount int)
returns public.orders
language plpgsql security definer set search_path = '' as $$
declare o public.orders;
begin
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'order_not_found'; end if;
  if o.payment_status = 'paid' then
    return o;                                  -- callback delivered twice
  end if;
  if p_paid_amount <> o.total then raise exception 'amount_mismatch'; end if;
  if not (o.status = 'awaiting_payment'
          or (o.status = 'cancelled' and o.cancel_reason = 'payment_timeout')) then
    raise exception 'order_not_awaiting_payment';
  end if;

  if o.status = 'cancelled' then
    -- Paid after the timeout: honour the order; take back any free coffees still unused.
    update public.rewards set reserved_order_id = o.id
     where id in (select reward_id from public.loyalty_events
                   where order_id = o.id and kind = 'reward_released' and reward_id is not null)
       and used_at is null and reserved_order_id is null;
  end if;

  update public.orders
     set status = 'placed', payment_status = 'paid', paid_at = now(), iyzico_payment_id = p_payment_id,
         cancelled_at = null, cancel_reason = null
   where id = o.id returning * into o;
  perform public._consume_rewards(o.id);
  perform public._award_order_stamps(o.id);
  select * into o from public.orders where id = p_order;
  return o;
end $$;

create function public.mark_order_payment_failed(p_order uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.orders
     set status = 'cancelled', payment_status = 'failed', cancelled_at = now(), cancel_reason = 'payment_failed'
   where id = p_order and status = 'awaiting_payment';
  if found then perform public._release_rewards(p_order); end if;
end $$;

-- ---------------------------------------------------------------- staff
create function public.staff_set_order_status(p_order uuid, p_status public.order_status)
returns public.orders
language plpgsql security definer set search_path = '' as $$
declare o public.orders;
begin
  select * into o from public.orders where id = p_order for update;
  if not found then raise exception 'order_not_found'; end if;
  if not public.is_staff(o.branch_id) then raise exception 'not_allowed' using errcode = '42501'; end if;

  if not (
       (o.status = 'placed'    and p_status in ('preparing', 'ready', 'cancelled'))
    or (o.status = 'preparing' and p_status in ('ready', 'cancelled'))
    or (o.status = 'ready'     and p_status in ('collected', 'cancelled'))
  ) then
    raise exception 'invalid_transition:%->%', o.status, p_status;
  end if;

  if p_status = 'cancelled' and o.payment_status = 'paid' and o.total > 0 then
    raise exception 'refund_required';            -- refund in the iyzico panel first, then an admin cancels
  end if;

  update public.orders set
    status         = p_status,
    ready_at       = case when p_status = 'ready' then now() else ready_at end,
    collected_at   = case when p_status = 'collected' then now() else collected_at end,
    cancelled_at   = case when p_status = 'cancelled' then now() else cancelled_at end,
    cancel_reason  = case when p_status = 'cancelled' then 'branch' else cancel_reason end,
    payment_status = case when p_status = 'collected' and payment_method = 'store' then 'paid'::public.payment_status
                          else payment_status end,
    paid_at        = case when p_status = 'collected' and payment_method = 'store' and paid_at is null then now()
                          else paid_at end
  where id = o.id
  returning * into o;

  if p_status = 'collected' then
    perform public._award_order_stamps(o.id);
  elsif p_status = 'cancelled' then
    perform public._release_rewards(o.id);
  end if;
  select * into o from public.orders where id = p_order;
  return o;
end $$;

create function public.staff_set_sold_out(p_branch text, p_product text, p_sold_out boolean)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff(p_branch) then raise exception 'not_allowed' using errcode = '42501'; end if;
  insert into public.product_availability (branch_id, product_id, sold_out, updated_at, updated_by)
  values (p_branch, p_product, p_sold_out, now(), auth.uid())
  on conflict (branch_id, product_id)
  do update set sold_out = excluded.sold_out, updated_at = now(), updated_by = auth.uid();
end $$;

-- Free coffee shown as a QR at the counter.
create function public.staff_redeem_reward(p_code text, p_branch text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  r public.rewards;
  v_name text;
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  if not public.is_staff(p_branch) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if v_code like 'CKR%' then v_code := substr(v_code, 4); end if;   -- QR payload "CK-R:XXXXXX"
  select * into r from public.rewards where code = v_code for update;
  if not found then raise exception 'reward_not_found'; end if;
  if r.used_at is not null then raise exception 'reward_already_used'; end if;
  if r.reserved_order_id is not null then raise exception 'reward_reserved'; end if;
  if r.expires_at <= now() then raise exception 'reward_expired'; end if;

  update public.rewards set used_at = now(), used_branch_id = p_branch, used_by = auth.uid() where id = r.id;
  insert into public.loyalty_events (user_id, kind, reward_id, branch_id, staff_id)
  values (r.user_id, 'reward_used', r.id, p_branch, auth.uid());
  select first_name into v_name from public.profiles where id = r.user_id;
  return jsonb_build_object('first_name', v_name, 'code', r.code, 'expires_at', r.expires_at);
end $$;

-- Coffees bought at the counter: barista scans the member QR and enters how many coffees.
create function public.staff_add_counter_stamps(p_member_code text, p_branch text, p_coffees int)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s public.app_settings := public._settings();
  p public.profiles;
  v_code text := upper(regexp_replace(coalesce(p_member_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_new int;
begin
  if not public.is_staff(p_branch) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_coffees is null or p_coffees < 1 or p_coffees > s.max_counter_stamps then raise exception 'invalid_quantity'; end if;
  if v_code like 'CKM%' then v_code := substr(v_code, 4); end if;   -- QR payload "CK-M:XXXXXXXXXX"
  select * into p from public.profiles where member_code = v_code;
  if not found then raise exception 'member_not_found'; end if;
  v_new := public._add_stamps(p.id, p_coffees, 'counter_stamps', null, p_branch, auth.uid());
  select * into p from public.profiles where id = p.id;
  return jsonb_build_object('first_name', p.first_name, 'stamps', p.stamps, 'rewards_earned', v_new);
end $$;

-- ---------------------------------------------------------------- account deletion (service role)
-- Orders are kept for accounting (Turkish tax law) but lose every link to the person.
create function public.anonymize_user(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.orders set customer_name = null where user_id = p_user;
  delete from public.push_tokens where user_id = p_user;
end $$;

-- ---------------------------------------------------------------- privileges
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.is_staff(text)                                         to authenticated;
grant execute on function public.place_order(text, jsonb, public.payment_method, int, boolean, boolean) to authenticated;
grant execute on function public.cancel_my_order(uuid)                                  to authenticated;
grant execute on function public.staff_set_order_status(uuid, public.order_status)      to authenticated;
grant execute on function public.staff_set_sold_out(text, text, boolean)                to authenticated;
grant execute on function public.staff_redeem_reward(text, text)                        to authenticated;
grant execute on function public.staff_add_counter_stamps(text, text, int)              to authenticated;

grant execute on function public.attach_payment_token(uuid, text)                       to service_role;
grant execute on function public.mark_order_paid(uuid, text, int)                       to service_role;
grant execute on function public.mark_order_payment_failed(uuid)                        to service_role;
grant execute on function public.anonymize_user(uuid)                                   to service_role;
grant execute on function public._expire_stale_orders(uuid)                             to service_role;
