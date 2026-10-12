-- Çeşme Kahve — who handled each order.
--
-- Every status change made by a staff member (accepting = "Hazırlamaya başla", marking ready, handing over,
-- cancelling) is recorded with that person's name, so the branch screen can show "Hazırlayan: Ece K.".
-- Recorded by a trigger, so it works for every way a status changes (edge function, SQL) without
-- touching the status logic. Changes made by the system (payment, timeout) or by the customer are not
-- staff actions and are not recorded here.
-- Only staff of the order's branch can read these rows; customers never see staff names.

create table public.order_events (
  id          bigint generated always as identity primary key,
  order_id    uuid not null references public.orders on delete cascade,
  status      public.order_status not null,
  actor_id    uuid references auth.users on delete set null,
  actor_name  text,                       -- snapshot ("Ece K."), so history stays readable
  created_at  timestamptz not null default now()
);
create index order_events_order_idx on public.order_events (order_id, created_at);

alter table public.order_events enable row level security;
revoke all on public.order_events from anon, authenticated;
grant select on public.order_events to authenticated;
create policy "order events: branch staff" on public.order_events for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and public.is_staff(o.branch_id)));

create function public._record_order_event() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_actor uuid := auth.uid();
  v_name text;
begin
  if v_actor is null or new.status is not distinct from old.status then return new; end if;
  if not exists (
    select 1 from public.staff_members s
    where s.user_id = v_actor and (s.role = 'admin' or s.branch_id = new.branch_id)
  ) then
    return new;   -- customer cancelling their own order, or a system change
  end if;
  select btrim(p.first_name || coalesce(' ' || nullif(left(nullif(p.last_name, '-'), 1), '') || '.', ''))
    into v_name from public.profiles p where p.id = v_actor;
  insert into public.order_events (order_id, status, actor_id, actor_name)
  values (new.id, new.status, v_actor, coalesce(nullif(v_name, ''), 'Personel'));
  return new;
end $$;

create trigger orders_record_staff_event
  after update of status on public.orders
  for each row execute function public._record_order_event();

-- Deleted accounts: forget the name too (the event itself stays, without a person).
create function public._forget_order_event_actor() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.order_events set actor_name = null where actor_id = old.id;
  return old;
end $$;

create trigger on_auth_user_deleted_forget_order_events
  before delete on auth.users
  for each row execute function public._forget_order_event_actor();

revoke execute on function public._record_order_event(), public._forget_order_event_actor() from public, anon, authenticated;

notify pgrst, 'reload schema';
