-- Çeşme Kahve — company owner (admin) panel: every branch live, all staff, customers, order lookup,
-- milk options. Everything here is for admins only (public.is_admin()); branch managers keep using
-- their own branch tools.

-- ---------------------------------------------------------------- new event kinds
alter table public.loyalty_events drop constraint if exists loyalty_events_kind_check;
alter table public.loyalty_events add constraint loyalty_events_kind_check
  check (kind in ('stamps_earned', 'counter_stamps', 'reward_earned', 'reward_used', 'reward_released', 'stamps_revoked',
                  'admin_stamps', 'reward_gifted'));
alter table public.push_outbox drop constraint if exists push_outbox_kind_check;
alter table public.push_outbox add constraint push_outbox_kind_check
  check (kind in ('campaign', 'birthday', 'winback', 'gift'));

-- ---------------------------------------------------------------- milk options (prices, hide/show)
grant insert, update on public.milk_options to authenticated;
create policy "admin: milk read"   on public.milk_options for select to authenticated using (public.is_admin());
create policy "admin: milk insert" on public.milk_options for insert to authenticated with check (public.is_admin());
create policy "admin: milk update" on public.milk_options for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------- live view of every branch
-- Open orders by stage, the oldest one still waiting, today's numbers, sold-out items and staff count.
create function public.admin_live_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_day timestamptz := date_trunc('day', now() at time zone 'Europe/Istanbul') at time zone 'Europe/Istanbul';
begin
  if not public.is_admin() then raise exception 'not_allowed' using errcode = '42501'; end if;
  return jsonb_build_object(
    'generated_at', now(),
    'branches', coalesce((
      select jsonb_agg(jsonb_build_object(
               'branch_id', b.id,
               'waiting', q.waiting, 'scheduled', q.scheduled, 'preparing', q.preparing, 'ready', q.ready,
               'oldest_waiting_at', q.oldest_waiting_at,
               'today_orders', t.orders, 'today_revenue', t.revenue, 'today_cancelled', t.cancelled,
               'sold_out', (select count(*) from public.product_availability a where a.branch_id = b.id and a.sold_out),
               'staff', (select count(*) from public.staff_members s where s.branch_id = b.id))
             order by b.sort)
        from public.branches b
        cross join lateral (
          select count(*) filter (where o.status = 'placed'
                                    and coalesce(o.pickup_at, now()) <= now() + make_interval(mins => b.prep_minutes + 10)) as waiting,
                 count(*) filter (where o.status = 'placed'
                                    and o.pickup_at > now() + make_interval(mins => b.prep_minutes + 10)) as scheduled,
                 count(*) filter (where o.status = 'preparing') as preparing,
                 count(*) filter (where o.status = 'ready') as ready,
                 min(o.created_at) filter (where o.status in ('placed', 'preparing')
                                             and coalesce(o.pickup_at, now()) <= now() + make_interval(mins => b.prep_minutes + 10)) as oldest_waiting_at
            from public.orders o
           where o.branch_id = b.id and o.status in ('placed', 'preparing', 'ready')) q
        cross join lateral (
          select count(*) filter (where o.status = 'collected') as orders,
                 coalesce(sum(o.total) filter (where o.status = 'collected'), 0) as revenue,
                 count(*) filter (where o.status = 'cancelled') as cancelled
            from public.orders o
           where o.branch_id = b.id and o.created_at >= v_day) t), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------- all staff of the company
create function public.admin_staff_list() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not_allowed' using errcode = '42501'; end if;
  return jsonb_build_object(
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
               'user_id', s.user_id, 'branch_id', s.branch_id, 'role', s.role, 'email', u.email,
               'first_name', p.first_name, 'last_name', p.last_name, 'since', s.created_at,
               'last_sign_in_at', u.last_sign_in_at, 'is_me', s.user_id = auth.uid())
             order by s.branch_id nulls first, s.role desc, p.first_name)
        from public.staff_members s
        join auth.users u on u.id = s.user_id
        left join public.profiles p on p.id = s.user_id), '[]'::jsonb),
    'invites', coalesce((
      select jsonb_agg(jsonb_build_object('email', i.email, 'branch_id', i.branch_id, 'role', i.role, 'since', i.created_at)
             order by i.branch_id, i.created_at)
        from public.staff_invites i), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------- customers
create function public._like_pattern(p text) returns text
language sql immutable set search_path = '' as $$
  select '%' || replace(replace(replace(p, '\', '\\'), '%', '\%'), '_', '\_') || '%'
$$;

-- Search by name, e-mail, phone or member code. An empty search lists the newest sign-ups.
create function public.admin_find_customers(p_query text default null, p_limit int default 30) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_q text := nullif(btrim(coalesce(p_query, '')), '');
  v_digits text;
  v_limit int := least(greatest(coalesce(p_limit, 30), 1), 100);
begin
  if not public.is_admin() then raise exception 'not_allowed' using errcode = '42501'; end if;
  if v_q is not null and char_length(v_q) > 100 then raise exception 'invalid_request'; end if;
  v_digits := regexp_replace(coalesce(v_q, ''), '\D', '', 'g');
  if v_digits like '90%' and char_length(v_digits) = 12 then v_digits := substr(v_digits, 3); end if;
  if v_digits like '0%' and char_length(v_digits) = 11 then v_digits := substr(v_digits, 2); end if;

  return jsonb_build_object(
    'total', (select count(*) from public.profiles),
    'new_7d', (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'opted_in', (select count(*) from public.profiles where marketing_opt_in),
    'results', coalesce((
      select jsonb_agg(r order by r_sort desc)
        from (
          select jsonb_build_object(
                   'id', p.id, 'first_name', p.first_name, 'last_name', p.last_name, 'email', u.email, 'phone', p.phone,
                   'stamps', p.stamps, 'created_at', p.created_at,
                   'rewards', (select count(*) from public.rewards w
                                where w.user_id = p.id and w.used_at is null and w.reserved_order_id is null and w.expires_at > now()),
                   'orders', st.orders, 'spent', st.spent, 'last_order_at', st.last_at,
                   'is_staff', exists (select 1 from public.staff_members s where s.user_id = p.id)) as r,
                 p.created_at as r_sort
            from public.profiles p
            join auth.users u on u.id = p.id
            cross join lateral (
              select count(*) filter (where o.status = 'collected') as orders,
                     coalesce(sum(o.total) filter (where o.status = 'collected'), 0) as spent,
                     max(o.created_at) as last_at
                from public.orders o where o.user_id = p.id) st
           where v_q is null
              or u.email ilike public._like_pattern(v_q)
              or (p.first_name || ' ' || p.last_name) ilike public._like_pattern(v_q)
              or (char_length(v_digits) >= 4 and p.phone like '%' || v_digits || '%')
              or p.member_code = upper(regexp_replace(v_q, '[^A-Za-z0-9]', '', 'g'))
           order by p.created_at desc
           limit v_limit) x), '[]'::jsonb));
end $$;

create function public.admin_customer_detail(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  p public.profiles;
  v_email text;
begin
  if not public.is_admin() then raise exception 'not_allowed' using errcode = '42501'; end if;
  select * into p from public.profiles where id = p_user;
  if not found then raise exception 'not_found'; end if;
  select email into v_email from auth.users where id = p_user;
  return jsonb_build_object(
    'id', p.id, 'first_name', p.first_name, 'last_name', p.last_name, 'email', v_email, 'phone', p.phone,
    'birthday', p.birthday, 'member_code', p.member_code, 'stamps', p.stamps, 'marketing_opt_in', p.marketing_opt_in,
    'created_at', p.created_at,
    'favorite_branch', (select b.name from public.branches b where b.id = p.favorite_branch_id),
    'staff', coalesce((select jsonb_agg(jsonb_build_object('branch_id', s.branch_id, 'role', s.role))
                         from public.staff_members s where s.user_id = p.id), '[]'::jsonb),
    'stats', (select jsonb_build_object(
                'orders', count(*) filter (where o.status = 'collected'),
                'spent', coalesce(sum(o.total) filter (where o.status = 'collected'), 0),
                'cancelled', count(*) filter (where o.status = 'cancelled'),
                'first_order_at', min(o.created_at), 'last_order_at', max(o.created_at))
                from public.orders o where o.user_id = p.id),
    'rewards', coalesce((select jsonb_agg(jsonb_build_object('code', w.code, 'reason', w.reason, 'earned_at', w.earned_at,
                                                               'expires_at', w.expires_at) order by w.expires_at)
                           from public.rewards w
                          where w.user_id = p.id and w.used_at is null and w.reserved_order_id is null and w.expires_at > now()), '[]'::jsonb),
    'orders', coalesce((select jsonb_agg(x order by x->>'created_at' desc) from (
                          select jsonb_build_object('id', o.id, 'order_no', o.order_no, 'branch', b.name, 'status', o.status,
                                                    'total', o.total, 'created_at', o.created_at) as x
                            from public.orders o join public.branches b on b.id = o.branch_id
                           where o.user_id = p.id
                           order by o.created_at desc limit 20) y), '[]'::jsonb));
end $$;

-- A free coffee from the owner (an apology, a regular's treat). The customer gets a notification.
create function public.admin_gift_reward(p_user uuid, p_days int default 30, p_message text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_first text;
  v_id uuid;
  v_code text;
  v_msg text := nullif(btrim(coalesce(p_message, '')), '');
begin
  if not public.is_admin() then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_days is null or p_days < 1 or p_days > 365 then raise exception 'invalid_quantity'; end if;
  if v_msg is not null and char_length(v_msg) > 160 then raise exception 'invalid_message'; end if;
  select first_name into v_first from public.profiles where id = p_user;
  if not found then raise exception 'not_found'; end if;
  loop
    begin
      insert into public.rewards (user_id, code, expires_at, reason)
      values (p_user, public._new_code(6), now() + make_interval(days => p_days), 'gift')
      returning id, code into v_id, v_code;
      exit;
    exception when unique_violation then
      -- code collision: try another one
    end;
  end loop;
  insert into public.loyalty_events (user_id, kind, reward_id, staff_id) values (p_user, 'reward_gifted', v_id, auth.uid());
  insert into public.push_outbox (user_id, kind, title, body, data, channel)
  values (p_user, 'gift', 'Bir kahve bizden ☕',
          coalesce(v_msg, 'Kahve kartına hediye bir kahve ekledik. ' || p_days || ' gün içinde istediğin şubede kullanabilirsin.'),
          jsonb_build_object('screen', 'loyalty'), 'rewards');
  return jsonb_build_object('code', v_code, 'expires_at', now() + make_interval(days => p_days));
end $$;

-- Correct a customer's stamps (a missed scan, a mistake). Completed cards turn into free coffees as usual.
create function public.admin_adjust_stamps(p_user uuid, p_delta int) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_stamps int;
  v_new int := 0;
begin
  if not public.is_admin() then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_delta is null or p_delta = 0 or p_delta < -50 or p_delta > 50 then raise exception 'invalid_quantity'; end if;
  select stamps into v_stamps from public.profiles where id = p_user for update;
  if not found then raise exception 'not_found'; end if;
  if p_delta > 0 then
    v_new := public._add_stamps(p_user, p_delta, 'admin_stamps', null, null, auth.uid());
  else
    if v_stamps + p_delta < 0 then raise exception 'invalid_quantity'; end if;
    update public.profiles set stamps = stamps + p_delta where id = p_user;
    insert into public.loyalty_events (user_id, kind, stamps, staff_id) values (p_user, 'admin_stamps', p_delta, auth.uid());
  end if;
  select stamps into v_stamps from public.profiles where id = p_user;
  return jsonb_build_object('stamps', v_stamps, 'rewards_earned', v_new);
end $$;

-- ---------------------------------------------------------------- order lookup across branches
-- p_query: an order number, a phone number, or part of a name / e-mail. p_status: 'open', 'collected',
-- 'cancelled' or null for all.
create function public.admin_find_orders(p_query text default null, p_branch text default null,
                                         p_status text default null, p_limit int default 50) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_q text := nullif(btrim(coalesce(p_query, '')), '');
  v_no int;
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 200);
begin
  if not public.is_admin() then raise exception 'not_allowed' using errcode = '42501'; end if;
  if v_q is not null and char_length(v_q) > 100 then raise exception 'invalid_request'; end if;
  if p_status is not null and p_status not in ('open', 'collected', 'cancelled') then raise exception 'invalid_request'; end if;
  if v_q ~ '^#?[0-9]{1,9}$' then v_no := replace(v_q, '#', '')::int; end if;

  return coalesce((
    select jsonb_agg(x.r order by x.created_at desc)
      from (
        select o.created_at, jsonb_build_object(
                 'id', o.id, 'order_no', o.order_no, 'branch_id', o.branch_id, 'customer_name', o.customer_name,
                 'email', u.email, 'status', o.status, 'payment_method', o.payment_method, 'payment_status', o.payment_status,
                 'total', o.total, 'created_at', o.created_at, 'pickup_at', o.pickup_at,
                 'items', (select string_agg(i.quantity || '× ' || i.product_name, ', ' order by i.id)
                             from public.order_items i where i.order_id = o.id)) as r
          from public.orders o
          left join auth.users u on u.id = o.user_id
          left join public.profiles p on p.id = o.user_id
         where (p_branch is null or o.branch_id = p_branch)
           and o.status <> 'awaiting_payment'
           and (p_status is null
                or (p_status = 'open' and o.status in ('placed', 'preparing', 'ready'))
                or o.status::text = p_status)
           and (v_q is null
                or o.order_no = v_no
                or o.customer_name ilike public._like_pattern(v_q)
                or u.email ilike public._like_pattern(v_q)
                or (p.first_name || ' ' || p.last_name) ilike public._like_pattern(v_q)
                or (char_length(regexp_replace(v_q, '\D', '', 'g')) >= 7
                    and p.phone like '%' || right(regexp_replace(v_q, '\D', '', 'g'), 10) || '%'))
         order by o.created_at desc
         limit v_limit) x), '[]'::jsonb);
end $$;

-- ---------------------------------------------------------------- permissions
revoke execute on function public.admin_live_overview(), public.admin_staff_list(),
  public.admin_find_customers(text, int), public.admin_customer_detail(uuid),
  public.admin_gift_reward(uuid, int, text), public.admin_adjust_stamps(uuid, int),
  public.admin_find_orders(text, text, text, int), public._like_pattern(text) from public, anon;
grant execute on function public.admin_live_overview(), public.admin_staff_list(),
  public.admin_find_customers(text, int), public.admin_customer_detail(uuid),
  public.admin_gift_reward(uuid, int, text), public.admin_adjust_stamps(uuid, int),
  public.admin_find_orders(text, text, text, int), public._like_pattern(text) to authenticated;

notify pgrst, 'reload schema';
