-- Three account checks.

-- 1. A suspended account kept working until its token ran out (up to an hour):
--    the ban removes sessions, but a live token still passed the policies. The
--    role check now also asks whether the person is banned.
create or replace function public.has_church_role(target uuid, roles text[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select exists (
        select 1 from public.church_members m
        where m.church_id = target and m.user_id = (select auth.uid()) and m.role = any (roles)
    )
    and not exists (
        select 1 from auth.users u
        where u.id = (select auth.uid()) and u.banned_until is not null and u.banned_until > now()
    )
$$;
revoke execute on function public.has_church_role(uuid, text[]) from public, anon;
grant execute on function public.has_church_role(uuid, text[]) to authenticated;

-- 2. Founder access was granted the moment an account was created, before the
--    address was proven. It now waits for email_confirmed_at: at creation when
--    the sign-in already confirmed it (Google), or on the update that confirms it.
drop trigger if exists on_auth_user_founder_access on auth.users;
create trigger on_auth_user_founder_access_insert
    after insert on auth.users
    for each row when (new.email_confirmed_at is not null)
    execute function public.grant_founder_access();
create trigger on_auth_user_founder_access_confirmed
    after update of email_confirmed_at on auth.users
    for each row when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
    execute function public.grant_founder_access();

-- 3. A platform admin was one email code from full control. Once an admin has a
--    verified authenticator (TOTP) factor, the session must have passed it
--    (aal2). An admin with no factor yet still gets in, so enrolling one can
--    never lock the owner out: enrol first, then the check applies to you.
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select exists (select 1 from public.platform_admins a where a.user_id = (select auth.uid()))
       and (
           coalesce((select auth.jwt()) ->> 'aal', 'aal1') = 'aal2'
           or not exists (
               select 1 from auth.mfa_factors f
               where f.user_id = (select auth.uid()) and f.factor_type = 'totp' and f.status = 'verified'
           )
       );
$$;
revoke execute on function public.is_platform_admin() from public, anon;
grant execute on function public.is_platform_admin() to authenticated;
