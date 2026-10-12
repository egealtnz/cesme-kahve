-- Çeşme Kahve — branch managers manage their own team from the app.
--
-- Roles (public.staff_role):
--   admin    whole company (branch_id null): every branch, can add/remove managers and baristas
--   manager  one branch: everything a barista does, plus adding/removing that branch's baristas
--   barista  one branch: order queue, QR, sold-out items
--
-- Adding someone by email works whether or not they already have an account:
--   - account exists and email is confirmed → they become staff immediately
--   - otherwise an invite is kept, and they become staff the moment they confirm that email address
--     (so nobody can claim an invite with an email they don't own)

create table public.staff_invites (
  id          bigint generated always as identity primary key,
  email       text not null check (email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  branch_id   text not null references public.branches on delete cascade,
  role        public.staff_role not null default 'barista' check (role in ('barista', 'manager')),
  invited_by  uuid references auth.users on delete set null,
  created_at  timestamptz not null default now(),
  unique (email, branch_id)
);
-- Only reachable through the functions below.
alter table public.staff_invites enable row level security;
revoke all on public.staff_invites from anon, authenticated;

-- ---------------------------------------------------------------- permission helpers
create function public._is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.staff_members s where s.user_id = auth.uid() and s.role = 'admin');
$$;

/** Admins manage every branch; a manager manages their own branch. */
create function public.can_manage_branch(p_branch text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.staff_members s
    where s.user_id = auth.uid() and (s.role = 'admin' or (s.role = 'manager' and s.branch_id = p_branch))
  );
$$;

-- ---------------------------------------------------------------- team of a branch
create function public.branch_team(p_branch text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.can_manage_branch(p_branch) then raise exception 'not_allowed'; end if;
  return jsonb_build_object(
    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
               'user_id', s.user_id, 'email', u.email, 'first_name', p.first_name, 'last_name', p.last_name,
               'role', s.role, 'since', s.created_at, 'is_me', s.user_id = auth.uid())
             order by (s.role = 'manager') desc, p.first_name, u.email)
      from public.staff_members s
      join auth.users u on u.id = s.user_id
      left join public.profiles p on p.id = s.user_id
      where s.branch_id = p_branch), '[]'::jsonb),
    'invites', coalesce((
      select jsonb_agg(jsonb_build_object('email', i.email, 'role', i.role, 'since', i.created_at)
             order by i.created_at desc)
      from public.staff_invites i where i.branch_id = p_branch), '[]'::jsonb));
end $$;

/** Adds a barista (managers and admins) or a manager (admins only) by email. Returns {status: added|invited}. */
create function public.branch_add_staff(p_branch text, p_email text, p_role public.staff_role default 'barista')
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_user uuid;
  v_current public.staff_role;
begin
  if not public.can_manage_branch(p_branch) then raise exception 'not_allowed'; end if;
  if p_role not in ('barista', 'manager') then raise exception 'invalid_role'; end if;
  if p_role = 'manager' and not public._is_admin() then raise exception 'not_allowed'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'invalid_email'; end if;
  if not exists (select 1 from public.branches b where b.id = p_branch) then raise exception 'branch_not_found'; end if;

  select u.id into v_user from auth.users u
  where lower(u.email) = v_email and u.email_confirmed_at is not null and u.deleted_at is null
  limit 1;

  if v_user is null then
    insert into public.staff_invites (email, branch_id, role, invited_by)
    values (v_email, p_branch, p_role, auth.uid())
    on conflict (email, branch_id) do update set role = excluded.role, invited_by = excluded.invited_by, created_at = now();
    return jsonb_build_object('status', 'invited');
  end if;

  select s.role into v_current from public.staff_members s where s.user_id = v_user and s.branch_id = p_branch;
  if found then
    if v_current = p_role then raise exception 'already_staff'; end if;
    -- changing someone's role (barista ↔ manager) is an admin decision; the check above already
    -- stopped managers from granting 'manager', this stops them demoting one.
    if not public._is_admin() then raise exception 'not_allowed'; end if;
    update public.staff_members set role = p_role where user_id = v_user and branch_id = p_branch;
    return jsonb_build_object('status', 'updated');
  end if;
  if exists (select 1 from public.staff_members s where s.user_id = v_user and s.role = 'admin') then
    raise exception 'already_staff';   -- admins already see every branch
  end if;

  insert into public.staff_members (user_id, branch_id, role) values (v_user, p_branch, p_role);
  return jsonb_build_object('status', 'added');
end $$;

/** Removes someone from a branch. Managers can remove baristas; admins can remove anyone. Nobody removes themselves. */
create function public.branch_remove_staff(p_branch text, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_role public.staff_role;
begin
  if not public.can_manage_branch(p_branch) then raise exception 'not_allowed'; end if;
  if p_user = auth.uid() then raise exception 'cannot_remove_self'; end if;
  select s.role into v_role from public.staff_members s where s.user_id = p_user and s.branch_id = p_branch;
  if not found then raise exception 'not_found'; end if;
  if v_role <> 'barista' and not public._is_admin() then raise exception 'not_allowed'; end if;
  delete from public.staff_members where user_id = p_user and branch_id = p_branch;
end $$;

create function public.branch_cancel_invite(p_branch text, p_email text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_role public.staff_role;
begin
  if not public.can_manage_branch(p_branch) then raise exception 'not_allowed'; end if;
  select i.role into v_role from public.staff_invites i where i.branch_id = p_branch and i.email = lower(btrim(p_email));
  if not found then raise exception 'not_found'; end if;
  if v_role <> 'barista' and not public._is_admin() then raise exception 'not_allowed'; end if;
  delete from public.staff_invites where branch_id = p_branch and email = lower(btrim(p_email));
end $$;

-- ---------------------------------------------------------------- invites become staff on email confirmation
create function public._claim_staff_invites() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email is null then return new; end if;
  insert into public.staff_members (user_id, branch_id, role)
  select new.id, i.branch_id, i.role from public.staff_invites i where i.email = lower(new.email)
  on conflict (user_id, branch_id) do nothing;
  delete from public.staff_invites where email = lower(new.email);
  return new;
end $$;

create trigger on_auth_user_created_claim_invites
  after insert on auth.users
  for each row when (new.email_confirmed_at is not null)
  execute function public._claim_staff_invites();

create trigger on_auth_user_confirmed_claim_invites
  after update of email_confirmed_at on auth.users
  for each row when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public._claim_staff_invites();

-- ---------------------------------------------------------------- access
revoke execute on function public._is_admin(), public._claim_staff_invites() from public, anon, authenticated;
revoke execute on function public.can_manage_branch(text), public.branch_team(text),
  public.branch_add_staff(text, text, public.staff_role), public.branch_remove_staff(text, uuid),
  public.branch_cancel_invite(text, text) from public, anon;
grant execute on function public.can_manage_branch(text), public.branch_team(text),
  public.branch_add_staff(text, text, public.staff_role), public.branch_remove_staff(text, uuid),
  public.branch_cancel_invite(text, text) to authenticated;

notify pgrst, 'reload schema';
