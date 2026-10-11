-- Çeşme Kahve — core schema
-- Money is stored in kuruş (integer, 1 TL = 100 kuruş). All prices and totals are computed on the
-- server; the app never sends a price. Customers can only read their own data (row level security)
-- and can only change orders, stamps and rewards through the functions in the next migration.

-- ---------------------------------------------------------------- types
create type public.order_status as enum (
  'awaiting_payment',  -- card order created, waiting for iyzico
  'placed',            -- paid by card, or "pay at counter"; the branch can see it
  'preparing',
  'ready',
  'collected',
  'cancelled'
);
create type public.payment_method as enum ('card', 'store');
create type public.payment_status as enum ('unpaid', 'paid', 'failed', 'refunded');
create type public.staff_role as enum ('barista', 'manager', 'admin');

-- ---------------------------------------------------------------- settings (one row)
create table public.app_settings (
  id                    boolean primary key default true check (id),
  stamps_per_reward     int  not null default 10  check (stamps_per_reward between 2 and 50),
  reward_valid_days     int  not null default 90  check (reward_valid_days between 7 and 730),
  own_cup_discount      int  not null default 1000 check (own_cup_discount >= 0),      -- kuruş
  second_coffee_pct     int  not null default 50  check (second_coffee_pct between 0 and 100),
  second_coffee_active  boolean not null default true,
  max_counter_stamps    int  not null default 10  check (max_counter_stamps between 1 and 50),
  max_open_orders       int  not null default 3   check (max_open_orders between 1 and 20),
  payment_timeout_min   int  not null default 30  check (payment_timeout_min between 5 and 240),
  support_email         text,
  support_phone         text,
  updated_at            timestamptz not null default now()
);
insert into public.app_settings default values;

-- ---------------------------------------------------------------- branches & menu
create table public.branches (
  id              text primary key check (id ~ '^[a-z0-9-]{2,40}$'),
  name            text not null,
  district        text not null,
  city            text not null,
  address         text,
  prep_minutes    int  not null default 6 check (prep_minutes between 1 and 90),
  status          text not null default 'open' check (status in ('open', 'closed', 'coming_soon')),
  accepts_orders  boolean not null default true,
  sort            int  not null default 0,
  created_at      timestamptz not null default now()
);

create table public.menu_categories (
  id         text primary key check (id ~ '^[a-z0-9-]{2,40}$'),
  name       text not null,
  blurb      text,
  is_drink   boolean not null default false,
  is_active  boolean not null default true,
  sort       int not null default 0
);

create table public.products (
  id                text primary key check (id ~ '^[a-z0-9-]{2,60}$'),
  category_id       text not null references public.menu_categories on update cascade,
  name              text not null,
  description       text,
  price             int  not null check (price > 0),           -- kuruş
  is_coffee         boolean not null default false,             -- earns stamps, can be a free coffee
  has_milk_options  boolean not null default false,
  image_path        text,                                       -- path inside the public "menu" storage bucket
  badge             text check (badge in ('fresh')),
  is_active         boolean not null default true,
  sort              int not null default 0
);
create index products_category_idx on public.products (category_id, sort);

create table public.milk_options (
  id           text primary key check (id ~ '^[a-z0-9-]{2,40}$'),
  label        text not null,
  extra_price  int  not null default 0 check (extra_price >= 0),   -- kuruş
  is_plant     boolean not null default false,
  is_default   boolean not null default false,
  is_active    boolean not null default true,
  sort         int not null default 0
);
create unique index milk_one_default on public.milk_options (is_default) where is_default;

-- Per-branch "sold out" switch the baristas control.
create table public.product_availability (
  branch_id   text not null references public.branches on delete cascade,
  product_id  text not null references public.products on delete cascade,
  sold_out    boolean not null default true,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users on delete set null,
  primary key (branch_id, product_id)
);

create table public.campaigns (
  id         text primary key,
  tone       text not null default 'surface' check (tone in ('primary', 'eco', 'copper', 'surface')),
  eyebrow    text,
  title      text not null,
  body       text,
  starts_at  timestamptz,
  ends_at    timestamptz,
  is_active  boolean not null default true,
  sort       int not null default 0
);

-- ---------------------------------------------------------------- customers
create table public.profiles (
  id                   uuid primary key references auth.users on delete cascade,
  first_name           text not null check (char_length(first_name) between 1 and 60),
  last_name            text not null check (char_length(last_name) between 1 and 60),
  phone                text check (phone ~ '^5[0-9]{9}$'),          -- Turkish mobile without +90 / 0
  birthday             date check (birthday between date '1900-01-01' and current_date),
  favorite_branch_id   text references public.branches on delete set null,
  marketing_opt_in     boolean not null default false,
  marketing_opt_in_at  timestamptz,
  terms_accepted_at    timestamptz,                                -- null only for staff accounts created by an admin
  privacy_notice_at    timestamptz,
  member_code          text not null unique,                       -- shown as a QR at the counter to collect stamps
  stamps               int  not null default 0 check (stamps >= 0),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table public.staff_members (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users on delete cascade,
  branch_id   text references public.branches on delete cascade,    -- null only for admins (all branches)
  role        public.staff_role not null default 'barista',
  created_at  timestamptz not null default now(),
  unique nulls not distinct (user_id, branch_id),
  check (role = 'admin' or branch_id is not null)
);

-- ---------------------------------------------------------------- orders
create table public.orders (
  id                  uuid primary key default gen_random_uuid(),
  order_no            int  generated by default as identity (start with 1001) unique,
  user_id             uuid references auth.users on delete set null,
  customer_name       text,                                         -- first name for the counter call-out
  branch_id           text not null references public.branches,
  status              public.order_status not null,
  payment_method      public.payment_method not null,
  payment_status      public.payment_status not null default 'unpaid',
  eco_packaging       boolean not null default true,
  own_cup             boolean not null default false,
  subtotal            int not null check (subtotal >= 0),
  reward_discount     int not null default 0 check (reward_discount >= 0),
  campaign_discount   int not null default 0 check (campaign_discount >= 0),
  cup_discount        int not null default 0 check (cup_discount >= 0),
  total               int not null check (total >= 0),
  rewards_used        int not null default 0 check (rewards_used >= 0),
  stamps_earned       int not null default 0 check (stamps_earned >= 0),
  stamps_awarded_at   timestamptz,
  iyzico_token        text unique,
  iyzico_payment_id   text,
  paid_at             timestamptz,
  ready_at            timestamptz,
  collected_at        timestamptz,
  cancelled_at        timestamptz,
  cancel_reason       text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (total = greatest(subtotal - reward_discount - campaign_discount - cup_discount, 0))
);
create index orders_user_idx   on public.orders (user_id, created_at desc);
create index orders_branch_idx on public.orders (branch_id, status, created_at);

create table public.order_items (
  id             bigint generated always as identity primary key,
  order_id       uuid not null references public.orders on delete cascade,
  product_id     text references public.products on delete set null,
  product_name   text not null,                 -- snapshot, so old receipts survive menu changes
  milk_id        text,
  milk_label     text,
  unit_price     int  not null check (unit_price > 0),
  quantity       int  not null check (quantity between 1 and 20),
  free_quantity  int  not null default 0 check (free_quantity between 0 and quantity),
  is_coffee      boolean not null default false
);
create index order_items_order_idx on public.order_items (order_id);

-- ---------------------------------------------------------------- loyalty
create table public.rewards (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users on delete cascade,
  code               text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  earned_at          timestamptz not null default now(),
  expires_at         timestamptz not null,
  source_order_id    uuid references public.orders on delete set null,
  reserved_order_id  uuid references public.orders on delete set null,   -- held by an unpaid order
  used_at            timestamptz,
  used_branch_id     text references public.branches on delete set null,
  used_by            uuid references auth.users on delete set null      -- staff member for counter use
);
create index rewards_user_idx on public.rewards (user_id, expires_at) where used_at is null;

create table public.loyalty_events (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users on delete cascade,
  kind        text not null check (kind in ('stamps_earned', 'counter_stamps', 'reward_earned', 'reward_used', 'reward_released')),
  stamps      int,
  reward_id   uuid,
  order_id    uuid,
  branch_id   text,
  staff_id    uuid,
  created_at  timestamptz not null default now()
);
create index loyalty_events_user_idx on public.loyalty_events (user_id, created_at desc);

-- ---------------------------------------------------------------- push notifications
create table public.push_tokens (
  token       text primary key check (char_length(token) between 10 and 300),
  user_id     uuid not null references auth.users on delete cascade,
  platform    text check (platform in ('ios', 'android')),
  updated_at  timestamptz not null default now()
);
create index push_tokens_user_idx on public.push_tokens (user_id);

-- ---------------------------------------------------------------- updated_at
create function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger orders_touch   before update on public.orders   for each row execute function public.touch_updated_at();

-- Marketing consent is timestamped whenever it changes (İYS / KVKK evidence).
create function public.stamp_marketing_consent() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.marketing_opt_in_at := case when new.marketing_opt_in then now() end;
  elsif new.marketing_opt_in is distinct from old.marketing_opt_in then
    new.marketing_opt_in_at := now();
  end if;
  return new;
end $$;
create trigger profiles_marketing before insert or update of marketing_opt_in on public.profiles
  for each row execute function public.stamp_marketing_consent();
