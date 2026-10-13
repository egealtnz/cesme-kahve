-- Çeşme Kahve — sales report and order export for the owner (all branches) and branch managers (their branch).
-- Revenue counts delivered orders ("Teslim edildi") only.

create function public._can_see_report(p_branch text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin() or (p_branch is not null and public.can_manage_branch(p_branch));
$$;

create function public.admin_report(p_from timestamptz, p_to timestamptz, p_branch text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v jsonb;
begin
  if not public._can_see_report(p_branch) then raise exception 'not_allowed'; end if;
  if p_to <= p_from or p_to - p_from > interval '400 days' then raise exception 'invalid_request'; end if;

  with o as (
    select * from public.orders
     where created_at >= p_from and created_at < p_to
       and (p_branch is null or branch_id = p_branch)
       and status in ('collected', 'cancelled')
  ), done as (select * from o where status = 'collected'),
  items as (
    select i.* from public.order_items i join done on done.id = i.order_id
  ), rt as (
    select r.*, o.branch_id from public.order_ratings r join o on o.id = r.order_id
  )
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'orders', (select count(*) from done),
      'revenue', (select coalesce(sum(total), 0) from done),
      'avg_ticket', (select coalesce(round(avg(total)), 0) from done),
      'coffees', (select coalesce(sum(quantity), 0) from items where is_coffee),
      'cancelled', (select count(*) from o where status = 'cancelled'),
      'customers', (select count(distinct user_id) from done),
      'likes', (select count(*) from rt where liked),
      'dislikes', (select count(*) from rt where not liked),
      'scheduled', (select count(*) from done where pickup_at is not null)),
    'by_branch', coalesce((
      select jsonb_agg(x order by x.revenue desc) from (
        select b.id as branch_id, b.name, count(d.id) as orders, coalesce(sum(d.total), 0) as revenue,
               (select count(*) from rt where rt.branch_id = b.id and rt.liked) as likes,
               (select count(*) from rt where rt.branch_id = b.id and not rt.liked) as dislikes
          from public.branches b join done d on d.branch_id = b.id
         group by b.id, b.name) x), '[]'::jsonb),
    'top_products', coalesce((
      select jsonb_agg(x order by x.qty desc, x.revenue desc) from (
        select product_name as name, sum(quantity) as qty, sum(unit_price * (quantity - free_quantity)) as revenue
          from items group by product_name order by sum(quantity) desc limit 10) x), '[]'::jsonb),
    'by_hour', coalesce((
      select jsonb_agg(x order by x.hour) from (
        select extract(hour from created_at at time zone 'Europe/Istanbul')::int as hour, count(*) as orders
          from done group by 1) x), '[]'::jsonb),
    'by_day', coalesce((
      select jsonb_agg(x order by x.day) from (
        select (created_at at time zone 'Europe/Istanbul')::date as day, count(*) as orders, sum(total) as revenue
          from done group by 1) x), '[]'::jsonb),
    'comments', coalesce((
      select jsonb_agg(x order by x.created_at desc) from (
        select rt.liked, rt.comment, rt.created_at, b.name as branch, o.order_no
          from rt join o on o.id = rt.order_id join public.branches b on b.id = o.branch_id
         where rt.comment is not null order by rt.created_at desc limit 20) x), '[]'::jsonb)
  ) into v;
  return v;
end $$;

create function public.admin_export_orders(p_from timestamptz, p_to timestamptz, p_branch text default null)
returns table (
  order_no int, created_at timestamptz, pickup_at timestamptz, branch text, customer text, status text,
  payment text, subtotal int, discount int, total int, items text, liked boolean, comment text, handled_by text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public._can_see_report(p_branch) then raise exception 'not_allowed'; end if;
  if p_to <= p_from or p_to - p_from > interval '400 days' then raise exception 'invalid_request'; end if;
  return query
    select o.order_no, o.created_at, o.pickup_at, b.name, coalesce(o.customer_name, 'Misafir'), o.status::text,
           o.payment_method::text, o.subtotal, o.subtotal - o.total, o.total,
           (select string_agg(i.quantity || 'x ' || i.product_name || coalesce(' (' || i.milk_label || ')', ''), ', ' order by i.id)
              from public.order_items i where i.order_id = o.id),
           r.liked, r.comment,
           (select string_agg(distinct e.actor_name, ', ') from public.order_events e where e.order_id = o.id)
      from public.orders o
      join public.branches b on b.id = o.branch_id
      left join public.order_ratings r on r.order_id = o.id
     where o.created_at >= p_from and o.created_at < p_to
       and (p_branch is null or o.branch_id = p_branch)
       and o.status in ('collected', 'cancelled')
     order by o.created_at
     limit 20000;
end $$;

revoke execute on function public._can_see_report(text) from public, anon, authenticated;
revoke execute on function public.admin_report(timestamptz, timestamptz, text), public.admin_export_orders(timestamptz, timestamptz, text)
  from public, anon;
grant execute on function public.admin_report(timestamptz, timestamptz, text), public.admin_export_orders(timestamptz, timestamptz, text)
  to authenticated;

notify pgrst, 'reload schema';
