-- Çeşme Kahve — push notification to the branch's staff when a new order reaches them.
--
-- When an order becomes 'placed' (pay at counter: immediately; card: after payment) the database asks the
-- notify-branch edge function to send it. The call goes through pg_net (asynchronous, after commit), so
-- placing an order never waits for or fails because of notifications.
--
-- Setup on a project (once): set the edge function base URL, e.g.
--   update public.app_settings set functions_url = 'https://<project-ref>.supabase.co/functions/v1';
-- Without it (or without pg_net, e.g. in local tests) nothing is sent.

alter table public.orders add column if not exists staff_notified_at timestamptz;
alter table public.app_settings add column if not exists functions_url text;

-- pg_net ships with every Supabase project; skipped where it is not installed (plain Postgres test setups).
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
  end if;
end $$;

create function public._notify_branch_new_order() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_url text := (select functions_url from public.app_settings where id);
begin
  if v_url is null or new.staff_notified_at is not null then return new; end if;
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

create trigger orders_notify_branch_insert
  after insert on public.orders
  for each row when (new.status = 'placed')
  execute function public._notify_branch_new_order();

create trigger orders_notify_branch_update
  after update of status on public.orders
  for each row when (new.status = 'placed' and old.status is distinct from 'placed')
  execute function public._notify_branch_new_order();

revoke execute on function public._notify_branch_new_order() from public, anon, authenticated;

-- Let the Data API see the new columns right away.
notify pgrst, 'reload schema';
