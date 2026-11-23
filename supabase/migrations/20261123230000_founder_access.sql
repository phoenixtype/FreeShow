-- Founder access: an account whose email is listed in founder_access becomes
-- the owner of its church and the church moves to the top plan. The grant
-- runs when the account is created, so it takes effect at the first sign-in,
-- by code or by Google.
--
-- The list is data, not code: the addresses are inserted into the database
-- directly, so no personal address lives in this public repository.
-- Nothing is granted to an address that is not listed, and a failure here is
-- logged as a warning and never stops a sign-up.

create table public.founder_access (
    email text primary key check (email = lower(email)),
    church_id uuid not null references public.churches (id) on delete cascade
);

-- Service role only: no policy grants anything to the app's own roles.
alter table public.founder_access enable row level security;
revoke all on public.founder_access from public, anon, authenticated;
grant all on public.founder_access to service_role;

create or replace function public.grant_founder_access()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    grant_row public.founder_access%rowtype;
begin
    select * into grant_row from public.founder_access where email = lower(new.email);
    if not found then
        return new;
    end if;

    -- The top plan, comped: no Stripe ids, so the webhook never changes it.
    insert into public.church_subscriptions (church_id, plan, status)
    values (grant_row.church_id, 'multi_campus', 'active')
    on conflict (church_id) do update set plan = 'multi_campus', status = 'active', updated_at = now();

    insert into public.church_members (church_id, user_id, role)
    values (grant_row.church_id, new.id, 'owner')
    on conflict (church_id, user_id) do update set role = 'owner';

    return new;
exception when others then
    raise warning 'founder access was not granted: %', sqlerrm;
    return new;
end;
$$;
revoke execute on function public.grant_founder_access() from public, anon, authenticated;

create trigger on_auth_user_founder_access
    after insert on auth.users
    for each row execute function public.grant_founder_access();
