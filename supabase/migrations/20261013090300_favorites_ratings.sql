-- Çeşme Kahve — favourite drinks and "Nasıldı?" ratings after pickup.

create table public.favorites (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  product_id  text not null references public.products on delete cascade,
  milk_id     text references public.milk_options on delete cascade,
  created_at  timestamptz not null default now(),
  unique nulls not distinct (user_id, product_id, milk_id)
);
alter table public.favorites enable row level security;
revoke all on public.favorites from anon, authenticated;
grant select, insert, delete on public.favorites to authenticated;
create policy "favorites: read own"   on public.favorites for select to authenticated using (user_id = (select auth.uid()));
create policy "favorites: add own"    on public.favorites for insert to authenticated with check (user_id = (select auth.uid()));
create policy "favorites: remove own" on public.favorites for delete to authenticated using (user_id = (select auth.uid()));

create function public._limit_favorites() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.favorites where user_id = new.user_id) >= 30 then raise exception 'too_many_favorites'; end if;
  return new;
end $$;
create trigger favorites_limit before insert on public.favorites for each row execute function public._limit_favorites();
revoke execute on function public._limit_favorites() from public, anon, authenticated;

create table public.order_ratings (
  order_id    uuid primary key references public.orders on delete cascade,
  user_id     uuid references auth.users on delete set null,
  liked       boolean not null,
  comment     text check (char_length(comment) <= 500),
  created_at  timestamptz not null default now()
);
alter table public.order_ratings enable row level security;
revoke all on public.order_ratings from anon, authenticated;
grant select on public.order_ratings to authenticated;
create policy "ratings: own"          on public.order_ratings for select to authenticated using (user_id = (select auth.uid()));
create policy "ratings: branch staff" on public.order_ratings for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and public.is_staff(o.branch_id)));

/** The customer rates a collected order (within 7 days; can change their mind in that time). */
create function public.rate_order(p_order uuid, p_liked boolean, p_comment text default null) returns public.order_ratings
language plpgsql security definer set search_path = '' as $$
declare
  o public.orders;
  r public.order_ratings;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '28000'; end if;
  select * into o from public.orders where id = p_order and user_id = auth.uid();
  if not found then raise exception 'order_not_found'; end if;
  if o.status <> 'collected' or o.collected_at < now() - interval '7 days' then raise exception 'cannot_rate'; end if;
  if p_liked is null then raise exception 'invalid_request'; end if;
  insert into public.order_ratings (order_id, user_id, liked, comment)
  values (o.id, auth.uid(), p_liked, nullif(left(btrim(coalesce(p_comment, '')), 500), ''))
  on conflict (order_id) do update set liked = excluded.liked, comment = excluded.comment, created_at = now()
  returning * into r;
  return r;
end $$;
revoke execute on function public.rate_order(uuid, boolean, text) from public, anon;
grant execute on function public.rate_order(uuid, boolean, text) to authenticated;

notify pgrst, 'reload schema';
