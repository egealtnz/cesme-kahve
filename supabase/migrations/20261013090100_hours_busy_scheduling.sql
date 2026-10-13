-- Çeşme Kahve — opening hours, busy mode, pausing orders and ordering for a later pickup time.
--
-- opening_hours: {"1": ["08:00", "22:00"], ..., "7": ["09:00", "23:00"]}, keys are ISO weekdays
-- (1 = Monday), times are Turkey time. A missing day means closed that day; null means no limits.
-- A closing time at or before the opening time means the branch closes after midnight.

alter table public.branches
  add column if not exists opening_hours jsonb,
  add column if not exists busy_extra_minutes int not null default 0 check (busy_extra_minutes between 0 and 60),
  add column if not exists busy_until timestamptz,
  add column if not exists paused_until timestamptz;

alter table public.orders add column if not exists pickup_at timestamptz;

-- ---------------------------------------------------------------- opening hours
create function public.branch_open_at(p_hours jsonb, p_at timestamptz) returns boolean
language plpgsql stable set search_path = '' as $$
declare
  t timestamp := p_at at time zone 'Europe/Istanbul';
  d int := extract(isodow from t)::int;
  prev int := case when extract(isodow from t)::int = 1 then 7 else extract(isodow from t)::int - 1 end;
  tm time := t::time;
  o time;
  c time;
begin
  if p_hours is null or jsonb_typeof(p_hours) <> 'object' then return true; end if;
  if p_hours ? d::text then
    o := (p_hours -> d::text ->> 0)::time;
    c := (p_hours -> d::text ->> 1)::time;
    if c > o then
      if tm >= o and tm < c then return true; end if;
    elsif tm >= o then
      return true;                         -- open past midnight, evening part
    end if;
  end if;
  if p_hours ? prev::text then
    o := (p_hours -> prev::text ->> 0)::time;
    c := (p_hours -> prev::text ->> 1)::time;
    if c <= o and tm < c then return true; end if;   -- yesterday's late opening, after midnight
  end if;
  return false;
end $$;
grant execute on function public.branch_open_at(jsonb, timestamptz) to anon, authenticated;

-- Hours are validated when they are saved.
create function public._check_opening_hours() returns trigger
language plpgsql set search_path = '' as $$
declare k text;
begin
  if new.opening_hours is null then return new; end if;
  if jsonb_typeof(new.opening_hours) <> 'object' then raise exception 'invalid_hours'; end if;
  for k in select jsonb_object_keys(new.opening_hours) loop
    if k !~ '^[1-7]$'
       or jsonb_typeof(new.opening_hours -> k) <> 'array'
       or jsonb_array_length(new.opening_hours -> k) <> 2
       or (new.opening_hours -> k ->> 0) !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
       or (new.opening_hours -> k ->> 1) !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
      raise exception 'invalid_hours';
    end if;
  end loop;
  return new;
end $$;
create trigger branches_check_hours before insert or update of opening_hours on public.branches
  for each row execute function public._check_opening_hours();

-- ---------------------------------------------------------------- every new order: pickup time, open, not paused
create function public._prepare_new_order() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  b public.branches;
  v_at timestamptz;
begin
  -- set by place_order_v2 for "order for later"
  new.pickup_at := nullif(current_setting('ck.pickup_at', true), '')::timestamptz;
  select * into b from public.branches where id = new.branch_id;
  v_at := coalesce(new.pickup_at, now());
  if b.paused_until is not null and b.paused_until > now() and v_at < b.paused_until then
    raise exception 'branch_paused';
  end if;
  if not public.branch_open_at(b.opening_hours, v_at) then
    raise exception '%', case when new.pickup_at is null then 'branch_closed_now' else 'pickup_outside_hours' end;
  end if;
  return new;
end $$;
create trigger orders_prepare_new before insert on public.orders
  for each row execute function public._prepare_new_order();

-- ---------------------------------------------------------------- placing an order, optionally for later
create function public.place_order_v2(
  p_branch_id text,
  p_items jsonb,
  p_payment_method public.payment_method,
  p_use_rewards int default 0,
  p_eco_packaging boolean default true,
  p_own_cup boolean default false,
  p_pickup_at timestamptz default null)
returns public.orders
language plpgsql security definer set search_path = '' as $$
declare
  b public.branches;
begin
  if p_pickup_at is not null then
    select * into b from public.branches where id = p_branch_id;
    if not found then raise exception 'branch_not_found'; end if;
    if p_pickup_at < now() + make_interval(mins => b.prep_minutes) then raise exception 'pickup_too_soon'; end if;
    if p_pickup_at > now() + interval '2 days' then raise exception 'pickup_too_late'; end if;
  end if;
  perform set_config('ck.pickup_at', coalesce(p_pickup_at::text, ''), true);
  return public.place_order(p_branch_id, p_items, p_payment_method, p_use_rewards, p_eco_packaging, p_own_cup);
end $$;
revoke execute on function public.place_order_v2(text, jsonb, public.payment_method, int, boolean, boolean, timestamptz) from public, anon;
grant execute on function public.place_order_v2(text, jsonb, public.payment_method, int, boolean, boolean, timestamptz) to authenticated;

-- ---------------------------------------------------------------- busy mode and pausing (any staff of the branch)
/** Adds minutes to the wait customers see, for the next 2 hours. 0 turns it off. */
create function public.staff_set_busy(p_branch text, p_extra_minutes int) returns public.branches
language plpgsql security definer set search_path = '' as $$
declare b public.branches;
begin
  if not public.is_staff(p_branch) then raise exception 'not_allowed'; end if;
  if p_extra_minutes is null or p_extra_minutes < 0 or p_extra_minutes > 60 then raise exception 'invalid_quantity'; end if;
  update public.branches set
    busy_extra_minutes = p_extra_minutes,
    busy_until = case when p_extra_minutes > 0 then now() + interval '2 hours' end
  where id = p_branch returning * into b;
  return b;
end $$;

/** Stops new app orders for a while (scheduled pickups after that time still come in). 0 resumes. */
create function public.staff_pause_orders(p_branch text, p_minutes int) returns public.branches
language plpgsql security definer set search_path = '' as $$
declare b public.branches;
begin
  if not public.is_staff(p_branch) then raise exception 'not_allowed'; end if;
  if p_minutes is null or p_minutes < 0 or p_minutes > 240 then raise exception 'invalid_quantity'; end if;
  update public.branches set paused_until = case when p_minutes > 0 then now() + make_interval(mins => p_minutes) end
  where id = p_branch returning * into b;
  return b;
end $$;
revoke execute on function public.staff_set_busy(text, int), public.staff_pause_orders(text, int) from public, anon;
grant execute on function public.staff_set_busy(text, int), public.staff_pause_orders(text, int) to authenticated;

-- ---------------------------------------------------------------- scheduled orders reach the baristas in time
-- The new-order notification of an order for later is held back until it is time to start preparing it.
create or replace function public._notify_branch_new_order() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_url text := (select functions_url from public.app_settings where id);
  v_prep int;
begin
  if v_url is null or new.staff_notified_at is not null then return new; end if;
  if new.pickup_at is not null then
    select prep_minutes into v_prep from public.branches where id = new.branch_id;
    if new.pickup_at > now() + make_interval(mins => coalesce(v_prep, 6) + 10) then return new; end if;
  end if;
  if not exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'net' and p.proname = 'http_post') then
    return new;
  end if;
  begin
    execute 'select net.http_post(url := $1, body := $2, headers := $3)'
      using rtrim(v_url, '/') || '/notify-branch',
            jsonb_build_object('order_id', new.id),
            jsonb_build_object('Content-Type', 'application/json');
  exception when others then
    raise warning 'notify-branch call failed for order %: %', new.id, sqlerrm;
  end;
  return new;
end $$;

create function public._notify_due_scheduled_orders() returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_url text := (select functions_url from public.app_settings where id);
  r record;
  n int := 0;
begin
  if v_url is null or not exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace ns on ns.oid = p.pronamespace
                                   where ns.nspname = 'net' and p.proname = 'http_post') then
    return 0;
  end if;
  for r in
    select o.id from public.orders o join public.branches b on b.id = o.branch_id
     where o.status = 'placed' and o.staff_notified_at is null and o.pickup_at is not null
       and o.pickup_at <= now() + make_interval(mins => b.prep_minutes + 10)
       and o.created_at > now() - interval '3 days'
  loop
    execute 'select net.http_post(url := $1, body := $2, headers := $3)'
      using rtrim(v_url, '/') || '/notify-branch', jsonb_build_object('order_id', r.id),
            jsonb_build_object('Content-Type', 'application/json');
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public._notify_due_scheduled_orders(), public._prepare_new_order(), public._check_opening_hours()
  from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('notify-scheduled-orders', '* * * * *', 'select public._notify_due_scheduled_orders()');
  end if;
end $$;

notify pgrst, 'reload schema';
