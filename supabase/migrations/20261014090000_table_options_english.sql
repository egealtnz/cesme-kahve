-- Çeşme Kahve — order to the table, drink customisation, a note for the barista, allergens and dietary
-- tags, and English for customers.
--
--  * Table service: branches.table_count (0 = off). A QR code on each table opens the app with the
--    branch and table filled in; the order carries orders.table_label and the staff bring it over.
--  * Customisation: option groups (size, extras, syrup, decaf, sugar…) with values that add to the
--    price; which groups a product offers is set per product. Prices stay server-side.
--  * orders.note: up to 140 characters for the barista.
--  * products.allergens / products.diet and milk_options.allergens.
--  * *_en columns for menu content and campaigns; profiles.locale for notification language.

-- ---------------------------------------------------------------- columns
alter table public.branches add column table_count int not null default 0 check (table_count between 0 and 200);

alter table public.orders
  add column table_label text check (table_label ~ '^[1-9][0-9]{0,2}$'),
  add column note text check (char_length(note) between 1 and 140);

alter table public.order_items
  add column options jsonb not null default '[]'::jsonb,
  add column options_label text;

alter table public.products
  add column name_en text check (char_length(name_en) between 1 and 80),
  add column description_en text check (char_length(description_en) <= 300),
  add column allergens text[] not null default '{}'
    check (allergens <@ array['gluten', 'sut', 'yumurta', 'kuruyemis', 'yer_fistigi', 'soya', 'susam']::text[]),
  add column diet text[] not null default '{}'
    check (diet <@ array['vegan', 'vegan_option', 'vegetarian']::text[]);

alter table public.milk_options
  add column label_en text check (char_length(label_en) between 1 and 60),
  add column allergens text[] not null default '{}'
    check (allergens <@ array['gluten', 'sut', 'yumurta', 'kuruyemis', 'yer_fistigi', 'soya', 'susam']::text[]);

alter table public.menu_categories
  add column name_en text check (char_length(name_en) between 1 and 60),
  add column blurb_en text check (char_length(blurb_en) <= 120);

alter table public.campaigns
  add column eyebrow_en text, add column title_en text, add column body_en text;

alter table public.profiles add column locale text not null default 'tr' check (locale in ('tr', 'en'));
grant update (locale) on public.profiles to authenticated;

-- ---------------------------------------------------------------- customisation
create table public.option_groups (
  id          text primary key check (id ~ '^[a-z0-9-]{2,40}$'),
  name        text not null check (char_length(name) between 1 and 40),
  name_en     text check (char_length(name_en) between 1 and 40),
  multi       boolean not null default false,     -- several values can be picked (extras)
  required    boolean not null default false,     -- one value must be picked (the default if none)
  none_label  text check (char_length(none_label) between 1 and 30),    -- "Standart", shown for "nothing picked"
  none_label_en text check (char_length(none_label_en) between 1 and 30),
  is_active   boolean not null default true,
  sort        int not null default 0
);
create table public.option_values (
  id           text primary key check (id ~ '^[a-z0-9-]{2,40}$'),
  group_id     text not null references public.option_groups on delete cascade,
  label        text not null check (char_length(label) between 1 and 40),
  label_en     text check (char_length(label_en) between 1 and 40),
  extra_price  int not null default 0 check (extra_price between 0 and 100000),   -- kuruş
  is_default   boolean not null default false,
  is_active    boolean not null default true,
  sort         int not null default 0
);
create unique index option_values_one_default on public.option_values (group_id) where is_default;
create index option_values_group_idx on public.option_values (group_id, sort);
create table public.product_option_groups (
  product_id  text not null references public.products on delete cascade,
  group_id    text not null references public.option_groups on delete cascade,
  primary key (product_id, group_id)
);

alter table public.option_groups enable row level security;
alter table public.option_values enable row level security;
alter table public.product_option_groups enable row level security;
grant select on public.option_groups, public.option_values, public.product_option_groups to anon, authenticated;
grant insert, update on public.option_groups, public.option_values to authenticated;
grant insert, delete on public.product_option_groups to authenticated;
create policy "catalogue: option groups"  on public.option_groups  for select to anon, authenticated using (is_active);
create policy "catalogue: option values"  on public.option_values  for select to anon, authenticated using (is_active);
create policy "catalogue: product groups" on public.product_option_groups for select to anon, authenticated using (true);
create policy "admin: option groups read"   on public.option_groups for select to authenticated using (public.is_admin());
create policy "admin: option groups insert" on public.option_groups for insert to authenticated with check (public.is_admin());
create policy "admin: option groups update" on public.option_groups for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin: option values read"   on public.option_values for select to authenticated using (public.is_admin());
create policy "admin: option values insert" on public.option_values for insert to authenticated with check (public.is_admin());
create policy "admin: option values update" on public.option_values for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin: product groups insert" on public.product_option_groups for insert to authenticated with check (public.is_admin());
create policy "admin: product groups delete" on public.product_option_groups for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------- placing an order (now with options)
-- Same as before, plus: each item may carry "options": [value ids]. Every value must be active and
-- belong to an active group the product offers; single-choice groups take at most one value and
-- required groups fall back to their default. The extra prices are added to the unit price.
create or replace function public.place_order(
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
  v_chosen text[];
  v_extra int;
  v_opts jsonb;
  v_opts_label text;
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

    -- options
    if v_item ? 'options' and jsonb_typeof(v_item -> 'options') not in ('array', 'null') then raise exception 'invalid_options'; end if;
    v_chosen := array(select distinct x from jsonb_array_elements_text(coalesce(nullif(v_item -> 'options', 'null'::jsonb), '[]'::jsonb)) x);
    if cardinality(v_chosen) > 10 then raise exception 'invalid_options'; end if;
    if exists (select 1 from unnest(v_chosen) c(id)
                where not exists (select 1 from public.option_values ov
                                    join public.option_groups og on og.id = ov.group_id and og.is_active
                                    join public.product_option_groups pg on pg.group_id = og.id and pg.product_id = v_prod.id
                                   where ov.id = c.id and ov.is_active)) then
      raise exception 'option_unavailable:%', v_prod.id;
    end if;
    if exists (select 1 from public.option_values ov join public.option_groups og on og.id = ov.group_id
                where ov.id = any(v_chosen) and not og.multi group by og.id having count(*) > 1) then
      raise exception 'invalid_options';
    end if;
    v_chosen := v_chosen || array(
      select ov.id from public.product_option_groups pg
        join public.option_groups og on og.id = pg.group_id and og.is_active and og.required
        join public.option_values ov on ov.group_id = og.id and ov.is_default and ov.is_active
       where pg.product_id = v_prod.id
         and not exists (select 1 from public.option_values x where x.id = any(v_chosen) and x.group_id = og.id));
    select coalesce(sum(ov.extra_price), 0)::int,
           coalesce(jsonb_agg(jsonb_build_object('id', ov.id, 'group', og.id, 'label', ov.label,
                                                 'label_en', coalesce(ov.label_en, ov.label), 'price', ov.extra_price)
                              order by og.sort, ov.sort), '[]'::jsonb),
           string_agg(ov.label, ' · ' order by og.sort, ov.sort)
      into v_extra, v_opts, v_opts_label
      from public.option_values ov join public.option_groups og on og.id = ov.group_id
     where ov.id = any(v_chosen);

    insert into public.order_items (order_id, product_id, product_name, milk_id, milk_label, unit_price, quantity, is_coffee,
                                    options, options_label)
    values (o.id, v_prod.id, v_prod.name, v_milk.id, v_milk.label,
            v_prod.price + coalesce(v_milk.extra_price, 0) + v_extra, v_qty, v_prod.is_coffee, v_opts, v_opts_label);
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

-- ---------------------------------------------------------------- table and note travel with the new order
create or replace function public._prepare_new_order() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  b public.branches;
  v_at timestamptz;
begin
  -- set by place_order_v2 / v3
  new.pickup_at := nullif(current_setting('ck.pickup_at', true), '')::timestamptz;
  new.table_label := nullif(current_setting('ck.table', true), '');
  new.note := nullif(current_setting('ck.note', true), '');
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

-- p_table: the table number from the QR code ("5"), for an order brought to the table now.
-- p_note: up to 140 characters for the barista.
create function public.place_order_v3(
  p_branch_id text,
  p_items jsonb,
  p_payment_method public.payment_method,
  p_use_rewards int default 0,
  p_eco_packaging boolean default true,
  p_own_cup boolean default false,
  p_pickup_at timestamptz default null,
  p_table text default null,
  p_note text default null)
returns public.orders
language plpgsql security definer set search_path = '' as $$
declare
  b public.branches;
  v_table text := nullif(btrim(coalesce(p_table, '')), '');
  v_note text := nullif(btrim(regexp_replace(coalesce(p_note, ''), '[[:space:][:cntrl:]]+', ' ', 'g')), '');
begin
  if v_note is not null and char_length(v_note) > 140 then raise exception 'invalid_note'; end if;
  if v_table is not null then
    select * into b from public.branches where id = p_branch_id;
    if not found then raise exception 'branch_not_found'; end if;
    if v_table !~ '^[1-9][0-9]{0,2}$' or v_table::int > b.table_count then raise exception 'invalid_table'; end if;
    if p_pickup_at is not null then raise exception 'invalid_table'; end if;
  end if;
  perform set_config('ck.table', coalesce(v_table, ''), true);
  perform set_config('ck.note', coalesce(v_note, ''), true);
  return public.place_order_v2(p_branch_id, p_items, p_payment_method, p_use_rewards,
                               case when v_table is not null then false else p_eco_packaging end,
                               case when v_table is not null then false else p_own_cup end, p_pickup_at);
end $$;
revoke execute on function public.place_order_v3(text, jsonb, public.payment_method, int, boolean, boolean, timestamptz, text, text) from public, anon;
grant execute on function public.place_order_v3(text, jsonb, public.payment_method, int, boolean, boolean, timestamptz, text, text) to authenticated;

-- ---------------------------------------------------------------- notifications in the customer's language
create or replace function public.admin_gift_reward(p_user uuid, p_days int default 30, p_message text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_first text;
  v_locale text;
  v_id uuid;
  v_code text;
  v_msg text := nullif(btrim(coalesce(p_message, '')), '');
begin
  if not public.is_admin() then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_days is null or p_days < 1 or p_days > 365 then raise exception 'invalid_quantity'; end if;
  if v_msg is not null and char_length(v_msg) > 160 then raise exception 'invalid_message'; end if;
  select first_name, locale into v_first, v_locale from public.profiles where id = p_user;
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
  values (p_user, 'gift',
          case when v_locale = 'en' then 'A coffee on us ☕' else 'Bir kahve bizden ☕' end,
          coalesce(v_msg, case when v_locale = 'en'
            then 'We added a free coffee to your coffee card. Use it at any branch within ' || p_days || ' days.'
            else 'Kahve kartına hediye bir kahve ekledik. ' || p_days || ' gün içinde istediğin şubede kullanabilirsin.' end),
          jsonb_build_object('screen', 'loyalty'), 'rewards');
  return jsonb_build_object('code', v_code, 'expires_at', now() + make_interval(days => p_days));
end $$;

create or replace function public._daily_customer_jobs() returns jsonb
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
      select p.id, p.first_name, p.locale from public.profiles p
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
      values (r.id, 'birthday',
              case when r.locale = 'en' then 'Happy birthday ' || r.first_name || '! 🎂' else 'İyi ki doğdun ' || r.first_name || '! 🎂' end,
              case when r.locale = 'en' then 'A coffee on us. Use it at any branch within ' || s.birthday_reward_days || ' days.'
                   else 'Bir kahve bizden. ' || s.birthday_reward_days || ' gün içinde istediğin şubede kullanabilirsin.' end,
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

-- the order search shows the table and the note too
create or replace function public.admin_find_orders(p_query text default null, p_branch text default null,
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
                 'total', o.total, 'created_at', o.created_at, 'pickup_at', o.pickup_at, 'table_label', o.table_label,
                 'items', (select string_agg(i.quantity || '× ' || i.product_name
                                             || coalesce(' (' || nullif(concat_ws(' · ', i.milk_label, i.options_label), '') || ')', ''), ', ' order by i.id)
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

-- ---------------------------------------------------------------- starting data
-- Option groups and prices are a starting point; the owner edits them in the app (Şirket paneli →
-- Seçenekler). Allergen data is a starting point too and must be checked against recipes/suppliers.
insert into public.option_groups (id, name, name_en, multi, required, none_label, none_label_en, sort) values
  ('boy',    'Boy',             'Size',          false, false, 'Standart',  'Regular',  0),
  ('ekstra', 'Ekstra',          'Extras',        true,  false, null,        null,       1),
  ('surup',  'Şurup',           'Syrup',         false, false, 'Şurupsuz',  'No syrup', 2),
  ('kafein', 'Kahve çekirdeği', 'Coffee beans',  false, false, 'Normal',    'Regular',  3),
  ('seker',  'Şeker',           'Sugar',         false, true,  null,        null,       4)
on conflict (id) do nothing;
insert into public.option_values (id, group_id, label, label_en, extra_price, is_default, sort) values
  ('buyuk',        'boy',    'Büyük',        'Large',        2000, false, 0),
  ('ekstra-shot',  'ekstra', 'Ekstra shot',  'Extra shot',   2500, false, 0),
  ('vanilya',      'surup',  'Vanilya',      'Vanilla',      1500, false, 0),
  ('karamel',      'surup',  'Karamel',      'Caramel',      1500, false, 1),
  ('findik',       'surup',  'Fındık',       'Hazelnut',     1500, false, 2),
  ('kafeinsiz',    'kafein', 'Kafeinsiz',    'Decaf',           0, false, 0),
  ('sade',         'seker',  'Sade',         'No sugar',        0, true,  0),
  ('az-sekerli',   'seker',  'Az şekerli',   'Little sugar',    0, false, 1),
  ('orta-sekerli', 'seker',  'Orta şekerli', 'Medium sugar',    0, false, 2),
  ('sekerli',      'seker',  'Şekerli',      'Sweet',           0, false, 3)
on conflict (id) do nothing;
insert into public.product_option_groups (product_id, group_id)
select p.id, g.g from public.products p
cross join lateral unnest(case
  when p.id in ('latte', 'cappuccino', 'mocha-ruby', 'mocha-caramel', 'iced-latte', 'iced-mocha-white', 'iced-mocha-ruby')
    then array['boy', 'ekstra', 'surup', 'kafein']
  when p.id in ('americano', 'iced-americano') then array['boy', 'ekstra', 'surup', 'kafein']
  when p.id in ('flat-white', 'cortado', 'macchiato', 'espresso') then array['ekstra', 'kafein']
  when p.id = 'frappe' then array['boy', 'ekstra', 'surup']
  when p.id = 'cold-brew' then array['boy', 'surup']
  when p.id = 'turk-kahvesi' then array['seker']
  else array[]::text[] end) g(g)
on conflict do nothing;

update public.menu_categories c set name_en = v.n, blurb_en = v.b from (values
  ('espresso', 'Espresso Bar', 'Hot espresso-based coffees'),
  ('iced', 'Iced Espresso Bar', 'Iced espresso-based coffees'),
  ('brew', 'Brew Bar', 'Speciality brewed coffees'),
  ('frozen', 'Frappé & Frozen', 'Blended with ice'),
  ('tea', 'Teas', 'Brewed fresh in a teapot'),
  ('other', 'Other Drinks', 'Freshly squeezed and bottled'),
  ('croissant', 'Croissants', 'Fresh from the oven every morning'),
  ('dessert', 'Desserts', 'To go with your coffee'),
  ('snack', 'Snacks', 'Light and filling')) v(id, n, b)
where c.id = v.id and c.name_en is null;

update public.milk_options m set label_en = v.l, allergens = v.a from (values
  ('tam', 'Whole milk', array['sut']), ('yagsiz', 'Skimmed milk', array['sut']), ('laktozsuz', 'Lactose-free milk', array['sut']),
  ('soya', 'Soy milk', array['soya']), ('badem', 'Almond milk', array['kuruyemis'])) v(id, l, a)
where m.id = v.id;

update public.products p set name_en = coalesce(p.name_en, v.n), description_en = coalesce(p.description_en, v.d),
       allergens = v.a::text[], diet = v.t::text[]
from (values
  ('espresso', 'Espresso', 'Served single or double.', '{}', '{vegan}'),
  ('americano', 'Americano', 'Double espresso and hot water.', '{}', '{vegan}'),
  ('macchiato', 'Espresso Macchiato', 'Double espresso with a spoonful of microfoam.', '{}', '{vegetarian}'),
  ('cortado', 'Cortado', 'Double espresso with twice as much microfoamed milk.', '{}', '{vegan_option,vegetarian}'),
  ('flat-white', 'Flat White', 'Double ristretto with silky microfoam.', '{}', '{vegan_option,vegetarian}'),
  ('cappuccino', 'Cappuccino', 'Double espresso with plenty of milk foam.', '{}', '{vegan_option,vegetarian}'),
  ('latte', 'Caffè Latte', 'Double espresso and microfoamed milk.', '{}', '{vegan_option,vegetarian}'),
  ('mocha-ruby', 'Mocha, Ruby Chocolate', 'Double espresso, Belgian ruby chocolate and milk.', '{sut,soya}', '{vegetarian}'),
  ('mocha-caramel', 'Mocha, Caramel Chocolate', 'Double espresso, Belgian caramel chocolate and milk.', '{sut,soya}', '{vegetarian}'),
  ('affogato', 'Affogato', 'Double espresso poured over creamy ice cream.', '{sut,yumurta}', '{vegetarian}'),
  ('iced-americano', 'Iced Americano', 'Double espresso over iced water.', '{}', '{vegan}'),
  ('iced-latte', 'Iced Caffè Latte', 'Double espresso and iced milk.', '{}', '{vegan_option,vegetarian}'),
  ('iced-mocha-white', 'Iced Mocha, White Chocolate', 'Double espresso, Belgian white chocolate and iced milk.', '{sut,soya}', '{vegetarian}'),
  ('iced-mocha-ruby', 'Iced Mocha, Ruby Chocolate', 'Double espresso, Belgian ruby chocolate and iced milk.', '{sut,soya}', '{vegetarian}'),
  ('turk-kahvesi', 'Turkish Coffee', 'Brewed the traditional way.', '{}', '{vegan}'),
  ('cold-brew', 'Cold Brew', 'Brewed slowly with cold water.', '{}', '{vegan}'),
  ('nitro', 'Nitro Cold Brew', 'Velvety cold brew infused with nitrogen.', '{}', '{vegan}'),
  ('frappe', 'Chocolate Frappé', 'Double espresso, milk and ice.', '{sut,soya}', '{vegetarian}'),
  ('cilek', 'Strawberry Frozen', 'Fresh strawberries blended with ice.', '{}', '{vegan}'),
  ('karadut', 'Black Mulberry Frozen', 'Fresh black mulberries blended with ice.', '{}', '{vegan}'),
  ('mango', 'Mango Frozen', 'Fresh mango blended with ice.', '{}', '{vegan}'),
  ('yasemin', 'Jasmine Green Tea', 'Green tea blended with jasmine pearls.', '{}', '{vegan}'),
  ('detoks', 'Detox White Tea', 'White tea, mallow, jasmine flowers and orange.', '{}', '{vegan}'),
  ('ginger-orange', 'Ginger Orange', 'White tea, lemongrass, ginger and dried orange.', '{}', '{vegan}'),
  ('earl-grey', 'Earl Grey', 'Black tea with bergamot and blue cornflowers.', '{}', '{vegan}'),
  ('bergamot', 'Bergamot Tea', 'Black Sea tea with bergamot.', '{}', '{vegan}'),
  ('rooibos', 'Fruity Rooibos', 'Rooibos with tropical dried fruit.', '{}', '{vegan}'),
  ('portakal', 'Fresh Orange Juice', 'Freshly squeezed orange juice.', '{}', '{vegan}'),
  ('limonata', 'Mint Lemonade', 'Homemade, with fresh mint.', '{}', '{vegan}'),
  ('karadut-suyu', 'Black Mulberry Juice', 'Homemade black mulberry juice.', '{}', '{vegan}'),
  ('seftali-gazoz', 'Peach Lavender Soda', 'Bottled, served cold.', '{}', '{vegan}'),
  ('elma-gazoz', 'Apple Plum Soda', 'Bottled, served cold.', '{}', '{vegan}'),
  ('su', 'Water', 'Served cold.', '{}', '{vegan}'),
  ('kruvasan-tereyagli', 'Butter Croissant', 'Laminated layer by layer, fresh every morning.', '{gluten,sut,yumurta}', '{vegetarian}'),
  ('kruvasan-cikolatali', 'Chocolate Croissant', 'Filled with Belgian chocolate.', '{gluten,sut,yumurta,soya}', '{vegetarian}'),
  ('kruvasan-bademli', 'Almond Croissant', 'Almond cream and sliced almonds.', '{gluten,sut,yumurta,kuruyemis}', '{vegetarian}'),
  ('kruvasan-kasarli', 'Cheese Croissant', 'With kashar cheese, served warm.', '{gluten,sut,yumurta}', '{vegetarian}'),
  ('cheesecake', 'San Sebastián Cheesecake', 'Burnt top, creamy centre.', '{gluten,sut,yumurta}', '{vegetarian}'),
  ('tiramisu', 'Tiramisu', 'Espresso-soaked ladyfingers and mascarpone.', '{gluten,sut,yumurta}', '{vegetarian}'),
  ('brownie', 'Brownie', 'Rich chocolate with walnuts.', '{gluten,sut,yumurta,kuruyemis,soya}', '{vegetarian}'),
  ('avokado', 'Avocado Sandwich', 'Sourdough bread with avocado and rocket.', '{gluten}', '{vegetarian}'),
  ('hindi', 'Smoked Turkey Sandwich', 'Smoked turkey and kashar cheese on sourdough.', '{gluten,sut}', '{}')
) v(id, n, d, a, t)
where p.id = v.id;

update public.campaigns c set eyebrow_en = coalesce(c.eyebrow_en, v.e), title_en = coalesce(c.title_en, v.t), body_en = coalesce(c.body_en, v.b)
from (values
  ('second-coffee', 'Applied in the cart', 'Second coffee 50% off', 'The cheaper of every two coffees in your cart is half price.'),
  ('fresh', 'Every morning', 'Croissants fresh from the oven', 'Butter, chocolate, almond.'),
  ('loyalty', 'Coffee card', 'Buy 10 coffees, get 1 free', 'Every coffee you pay for earns a stamp.')) v(id, e, t, b)
where c.id = v.id;

notify pgrst, 'reload schema';
