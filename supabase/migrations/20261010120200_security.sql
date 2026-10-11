-- Çeşme Kahve — row level security, grants, realtime, scheduled jobs, storage

-- ---------------------------------------------------------------- RLS on every table
alter table public.app_settings          enable row level security;
alter table public.branches              enable row level security;
alter table public.menu_categories       enable row level security;
alter table public.products              enable row level security;
alter table public.milk_options          enable row level security;
alter table public.product_availability  enable row level security;
alter table public.campaigns             enable row level security;
alter table public.profiles              enable row level security;
alter table public.staff_members         enable row level security;
alter table public.orders                enable row level security;
alter table public.order_items           enable row level security;
alter table public.rewards               enable row level security;
alter table public.loyalty_events        enable row level security;
alter table public.push_tokens           enable row level security;

-- Start from nothing, then grant exactly what the app needs. Writes to orders, stamps and rewards
-- only happen through the functions in the logic migration.
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- Public catalogue (readable before sign-in)
grant select on public.app_settings, public.branches, public.menu_categories, public.products,
                public.milk_options, public.product_availability, public.campaigns
  to anon, authenticated;

create policy "catalogue: settings"      on public.app_settings         for select to anon, authenticated using (true);
create policy "catalogue: branches"      on public.branches             for select to anon, authenticated using (true);
create policy "catalogue: categories"    on public.menu_categories      for select to anon, authenticated using (is_active);
create policy "catalogue: products"      on public.products             for select to anon, authenticated using (is_active);
create policy "catalogue: milk"          on public.milk_options         for select to anon, authenticated using (is_active);
create policy "catalogue: availability"  on public.product_availability for select to anon, authenticated using (true);
create policy "catalogue: campaigns"     on public.campaigns            for select to anon, authenticated
  using (is_active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()));

-- Profiles: read and edit your own; stamps, member code and consent timestamps are read-only.
grant select on public.profiles to authenticated;
grant update (first_name, last_name, phone, birthday, favorite_branch_id, marketing_opt_in) on public.profiles to authenticated;
create policy "profiles: read own"   on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "profiles: update own" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Staff membership: each user sees their own rows (the app uses this to show staff mode).
grant select on public.staff_members to authenticated;
create policy "staff: read own" on public.staff_members for select to authenticated using (user_id = (select auth.uid()));

-- Orders: customers see their own; staff see their branch's.
grant select on public.orders, public.order_items to authenticated;
create policy "orders: own or branch staff" on public.orders for select to authenticated
  using (user_id = (select auth.uid()) or public.is_staff(branch_id));
create policy "order items: via order" on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o
                 where o.id = order_id and (o.user_id = (select auth.uid()) or public.is_staff(o.branch_id))));

-- Loyalty: own rows only.
grant select on public.rewards, public.loyalty_events to authenticated;
create policy "rewards: read own" on public.rewards        for select to authenticated using (user_id = (select auth.uid()));
create policy "loyalty: read own" on public.loyalty_events for select to authenticated using (user_id = (select auth.uid()));

-- Push tokens: a device registers and removes its own token.
grant select, insert, update, delete on public.push_tokens to authenticated;
create policy "push: own" on public.push_tokens for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------- realtime
-- Order status changes reach the customer's phone and the branch screen live (RLS still applies).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.orders, public.product_availability;
  end if;
end $$;

-- ---------------------------------------------------------------- scheduled cleanup
-- Unfinished card payments are cancelled every 10 minutes (Supabase: enable pg_cron in the dashboard).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('expire-unpaid-orders', '*/10 * * * *', 'select public._expire_stale_orders(null)');
  end if;
end $$;

-- ---------------------------------------------------------------- storage: public menu photos
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('menu', 'menu', true, 2097152, array['image/webp', 'image/png', 'image/jpeg'])
    on conflict (id) do nothing;
  end if;
end $$;
