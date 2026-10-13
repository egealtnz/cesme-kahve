-- Çeşme Kahve — owner (admin) manages the business from the app: menu, prices, photos, branches,
-- campaign cards and settings. Everyone else keeps read-only access to the catalogue.

create function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff_members s where s.user_id = auth.uid() and s.role = 'admin');
$$;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- ---------------------------------------------------------------- settings used by the new features
alter table public.app_settings
  add column if not exists birthday_reward_enabled boolean not null default true,
  add column if not exists birthday_reward_days int not null default 14 check (birthday_reward_days between 1 and 60),
  add column if not exists winback_enabled boolean not null default false,
  add column if not exists winback_after_days int not null default 30 check (winback_after_days between 7 and 180),
  add column if not exists winback_title text not null default 'Seni özledik ☕'
    check (char_length(winback_title) between 1 and 60),
  add column if not exists winback_body text not null default 'Bir süredir uğramadın. Sıcak bir kahve seni bekliyor.'
    check (char_length(winback_body) between 1 and 180);

-- ---------------------------------------------------------------- admin write access (rows limited by RLS)
grant insert, update on public.products, public.menu_categories, public.branches to authenticated;
grant insert, update, delete on public.campaigns to authenticated;
grant update on public.app_settings to authenticated;

-- admins also see inactive products, categories and campaigns
create policy "admin: products read"     on public.products        for select to authenticated using (public.is_admin());
create policy "admin: products insert"   on public.products        for insert to authenticated with check (public.is_admin());
create policy "admin: products update"   on public.products        for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin: categories read"   on public.menu_categories for select to authenticated using (public.is_admin());
create policy "admin: categories insert" on public.menu_categories for insert to authenticated with check (public.is_admin());
create policy "admin: categories update" on public.menu_categories for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin: branches insert"   on public.branches        for insert to authenticated with check (public.is_admin());
create policy "admin: branches update"   on public.branches        for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin: campaigns read"    on public.campaigns       for select to authenticated using (public.is_admin());
create policy "admin: campaigns insert"  on public.campaigns       for insert to authenticated with check (public.is_admin());
create policy "admin: campaigns update"  on public.campaigns       for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin: campaigns delete"  on public.campaigns       for delete to authenticated using (public.is_admin());
create policy "admin: settings update"   on public.app_settings    for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------- product photos (public "menu" bucket)
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'objects') then
    execute $p$create policy "menu photos: admin insert" on storage.objects for insert to authenticated
      with check (bucket_id = 'menu' and public.is_admin())$p$;
    execute $p$create policy "menu photos: admin update" on storage.objects for update to authenticated
      using (bucket_id = 'menu' and public.is_admin()) with check (bucket_id = 'menu' and public.is_admin())$p$;
    execute $p$create policy "menu photos: admin delete" on storage.objects for delete to authenticated
      using (bucket_id = 'menu' and public.is_admin())$p$;
  end if;
end $$;

notify pgrst, 'reload schema';
