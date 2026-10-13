-- Çeşme Kahve — notifications that are not about a single order:
--   • the owner sends an offer to customers who agreed to marketing messages
--   • a free coffee on the customer's birthday (once a year)
--   • "Seni özledik": customers who agreed to marketing and have not ordered for a while (off by default)
--
-- Messages are written to push_outbox; the push-outbox edge function sends them. Writing a row pokes the
-- function through pg_net, and the function only ever sends what is in the outbox, so it needs no secret.

alter table public.rewards add column if not exists reason text not null default 'stamps'
  check (reason in ('stamps', 'birthday', 'gift'));

create table public.push_campaigns (
  id          bigint generated always as identity primary key,
  title       text not null check (char_length(title) between 1 and 60),
  body        text not null check (char_length(body) between 1 and 180),
  branch_id   text references public.branches on delete set null,     -- customers whose favourite branch this is; null = everyone
  sent_by     uuid references auth.users on delete set null,
  recipients  int not null default 0,
  created_at  timestamptz not null default now()
);
alter table public.push_campaigns enable row level security;
revoke all on public.push_campaigns from anon, authenticated;
grant select on public.push_campaigns to authenticated;
create policy "push campaigns: admin" on public.push_campaigns for select to authenticated using (public.is_admin());

create table public.push_outbox (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users on delete cascade,
  kind         text not null check (kind in ('campaign', 'birthday', 'winback')),
  title        text not null,
  body         text not null,
  data         jsonb not null default '{}'::jsonb,
  channel      text not null default 'offers',
  campaign_id  bigint references public.push_campaigns on delete set null,
  created_at   timestamptz not null default now(),
  sent_at      timestamptz
);
create index push_outbox_pending_idx on public.push_outbox (id) where sent_at is null;
create index push_outbox_user_kind_idx on public.push_outbox (user_id, kind, created_at desc);
alter table public.push_outbox enable row level security;
revoke all on public.push_outbox from anon, authenticated;

-- ---------------------------------------------------------------- sending
create function public._kick_push_outbox() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_url text := (select functions_url from public.app_settings where id);
begin
  if v_url is null or not exists (select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
                                   where n.nspname = 'net' and p.proname = 'http_post') then
    return null;
  end if;
  begin
    execute 'select net.http_post(url := $1, body := $2, headers := $3)'
      using rtrim(v_url, '/') || '/push-outbox', '{}'::jsonb, jsonb_build_object('Content-Type', 'application/json');
  exception when others then
    raise warning 'push-outbox call failed: %', sqlerrm;
  end;
  return null;
end $$;
create trigger push_outbox_kick after insert on public.push_outbox
  for each statement execute function public._kick_push_outbox();

/** Takes a batch of unsent messages (used by the push-outbox function with the service key). */
create function public.claim_push_outbox(p_limit int default 200)
returns setof public.push_outbox
language sql security definer set search_path = '' as $$
  update public.push_outbox set sent_at = now()
   where id in (select id from public.push_outbox where sent_at is null order by id
                limit least(greatest(p_limit, 1), 500) for update skip locked)
  returning *;
$$;

-- ---------------------------------------------------------------- owner: offers to opted-in customers
create function public._marketing_audience(p_branch text) returns table (user_id uuid, first_name text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.first_name from public.profiles p
   where p.marketing_opt_in
     and (p_branch is null or p.favorite_branch_id = p_branch)
     and exists (select 1 from public.push_tokens t where t.user_id = p.id);
$$;

create function public.admin_push_audience(p_branch text default null) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'not_allowed'; end if;
  return jsonb_build_object(
    'reachable', (select count(*) from public._marketing_audience(p_branch)),
    'opted_in', (select count(*) from public.profiles p where p.marketing_opt_in and (p_branch is null or p.favorite_branch_id = p_branch)));
end $$;

create function public.admin_send_push(p_title text, p_body text, p_branch text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_title text := btrim(coalesce(p_title, ''));
  v_body text := btrim(coalesce(p_body, ''));
  v_campaign bigint;
  v_count int;
begin
  if not public.is_admin() then raise exception 'not_allowed'; end if;
  if char_length(v_title) not between 1 and 60 or char_length(v_body) not between 1 and 180 then raise exception 'invalid_message'; end if;
  if p_branch is not null and not exists (select 1 from public.branches where id = p_branch) then raise exception 'branch_not_found'; end if;
  if exists (select 1 from public.push_campaigns where created_at > now() - interval '10 minutes') then
    raise exception 'campaign_too_soon';
  end if;
  insert into public.push_campaigns (title, body, branch_id, sent_by) values (v_title, v_body, p_branch, auth.uid())
  returning id into v_campaign;
  insert into public.push_outbox (user_id, kind, title, body, data, channel, campaign_id)
  select a.user_id, 'campaign', v_title, v_body, jsonb_build_object('screen', 'home'), 'offers', v_campaign
    from public._marketing_audience(p_branch) a;
  get diagnostics v_count = row_count;
  update public.push_campaigns set recipients = v_count where id = v_campaign;
  return jsonb_build_object('campaign_id', v_campaign, 'recipients', v_count);
end $$;

-- ---------------------------------------------------------------- daily: birthdays and win-back
create function public._daily_customer_jobs() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  s public.app_settings := public._settings();
  v_today date := (now() at time zone 'Europe/Istanbul')::date;
  v_leap boolean := extract(day from (date_trunc('year', v_today) + interval '2 months' - interval '1 day')) = 29;
  r record;
  v_birthdays int := 0;
  v_winback int := 0;
begin
  if s.birthday_reward_enabled then
    for r in
      select p.id, p.first_name from public.profiles p
       where p.birthday is not null
         and (to_char(p.birthday, 'MM-DD') = to_char(v_today, 'MM-DD')
              or (to_char(p.birthday, 'MM-DD') = '02-29' and not v_leap and to_char(v_today, 'MM-DD') = '02-28'))
         and not exists (select 1 from public.rewards w where w.user_id = p.id and w.reason = 'birthday'
                           and w.earned_at > now() - interval '300 days')
    loop
      loop
        begin
          insert into public.rewards (user_id, code, expires_at, reason)
          values (r.id, public._new_code(6), now() + make_interval(days => s.birthday_reward_days), 'birthday');
          exit;
        exception when unique_violation then
          -- code collision: try another one
        end;
      end loop;
      insert into public.push_outbox (user_id, kind, title, body, data, channel)
      values (r.id, 'birthday', 'İyi ki doğdun ' || r.first_name || '! 🎂',
              'Bir kahve bizden. ' || s.birthday_reward_days || ' gün içinde istediğin şubede kullanabilirsin.',
              jsonb_build_object('screen', 'loyalty'), 'rewards');
      v_birthdays := v_birthdays + 1;
    end loop;
  end if;

  if s.winback_enabled then
    insert into public.push_outbox (user_id, kind, title, body, data, channel)
    select a.user_id, 'winback', s.winback_title, s.winback_body, jsonb_build_object('screen', 'home'), 'offers'
      from public._marketing_audience(null) a
      join lateral (select max(o.created_at) as last_at from public.orders o
                     where o.user_id = a.user_id and o.status = 'collected') lo on true
     where lo.last_at is not null
       and lo.last_at < now() - make_interval(days => s.winback_after_days)
       and not exists (select 1 from public.push_outbox x where x.user_id = a.user_id and x.kind = 'winback'
                         and x.created_at > greatest(lo.last_at, now() - interval '60 days'));
    get diagnostics v_winback = row_count;
  end if;

  return jsonb_build_object('birthdays', v_birthdays, 'winback', v_winback);
end $$;

revoke execute on function public._kick_push_outbox(), public.claim_push_outbox(int), public._marketing_audience(text),
  public._daily_customer_jobs() from public, anon, authenticated;
grant execute on function public.claim_push_outbox(int), public._daily_customer_jobs() to service_role;
revoke execute on function public.admin_push_audience(text), public.admin_send_push(text, text, text) from public, anon;
grant execute on function public.admin_push_audience(text), public.admin_send_push(text, text, text) to authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- 06:05 Turkey time
    perform cron.schedule('daily-customer-jobs', '5 3 * * *', 'select public._daily_customer_jobs()');
  end if;
end $$;

notify pgrst, 'reload schema';
