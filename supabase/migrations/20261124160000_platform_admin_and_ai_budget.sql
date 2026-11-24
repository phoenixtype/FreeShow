-- The platform owner's dashboard (project.scriptural.online/admin), and a dollar
-- cap on Scriptural AI.

-- AI BUDGET --
-- A request allowance alone does not bound what a church can cost: one request can be
-- the size of a book. What Claude charged is added up here, and a plan stops at its budget.

alter table public.ai_usage add column if not exists cost_micros bigint not null default 0;

create or replace function public.ai_budget_micros(plan text)
returns bigint language sql immutable set search_path = public, pg_temp
as $$ select case plan when 'multi_campus' then 25000000 when 'church' then 6000000 else 0 end::bigint $$;
revoke execute on function public.ai_budget_micros(text) from public, anon, authenticated;

create or replace function public.use_ai_request(target uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    allowance integer;
    budget bigint;
    usage_row public.ai_usage%rowtype;
begin
    if not public.has_church_role(target, array['owner', 'admin', 'editor', 'viewer']) then
        raise exception 'Not a member of this church' using errcode = '42501';
    end if;
    select l.ai_requests, public.ai_budget_micros(l.plan) into allowance, budget from public.church_limits(target) l;
    insert into public.ai_usage as u (church_id, month, requests)
    values (target, date_trunc('month', now())::date, 1)
    on conflict (church_id, month) do update set requests = u.requests + 1
    returning * into usage_row;
    if usage_row.requests > allowance or usage_row.cost_micros >= budget then
        update public.ai_usage set requests = requests - 1 where church_id = target and month = date_trunc('month', now())::date;
        return false;
    end if;
    return true;
end;
$$;

-- Server only. Any member could call the old one and hand back their own requests.
drop function if exists public.refund_ai_request(uuid);
create or replace function public.settle_ai_request(target uuid, cost bigint, answered boolean)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
    update public.ai_usage
    set requests = case when answered then requests else greatest(requests - 1, 0) end,
        cost_micros = cost_micros + greatest(cost, 0)
    where church_id = target and month = date_trunc('month', now())::date
$$;
revoke execute on function public.settle_ai_request(uuid, bigint, boolean) from public, anon, authenticated;
grant execute on function public.settle_ai_request(uuid, bigint, boolean) to service_role;

-- DASHBOARD --

create table public.platform_admin_log (
    id bigint generated always as identity primary key,
    admin_id uuid references auth.users (id) on delete set null,
    action text not null,
    target_church uuid,
    target_user uuid,
    detail jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);
alter table public.platform_admin_log enable row level security;
revoke all on public.platform_admin_log from public, anon, authenticated;
grant all on public.platform_admin_log to service_role;

create or replace function public.require_platform_admin()
returns void language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
    if not public.is_platform_admin() then
        raise exception 'Platform admins only' using errcode = '42501';
    end if;
end;
$$;

create or replace function public.platform_overview()
returns jsonb language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
    perform public.require_platform_admin();
    return jsonb_build_object(
        'users', (select count(*) from auth.users),
        'new_users', (select count(*) from auth.users where created_at > now() - interval '30 days'),
        'active_users', (select count(*) from auth.users where last_sign_in_at > now() - interval '30 days'),
        'churches', (select count(*) from public.churches),
        'paying', (select count(*) from public.church_subscriptions where plan <> 'free' and status in ('active', 'trialing', 'past_due') and stripe_subscription_id is not null),
        'comped', (select count(*) from public.church_subscriptions where plan <> 'free' and status in ('active', 'trialing', 'past_due') and stripe_subscription_id is null),
        'past_due', (select count(*) from public.church_subscriptions where status = 'past_due'),
        'songs', (select count(*) from public.songs where deleted_at is null),
        'ai_requests', (select coalesce(sum(requests), 0) from public.ai_usage where month = date_trunc('month', now())::date),
        'ai_cost_micros', (select coalesce(sum(cost_micros), 0) from public.ai_usage where month = date_trunc('month', now())::date),
        'bible_requests', (select count(*) from public.bible_access_requests where status = 'pending')
    );
end;
$$;

create or replace function public.platform_users(search text default '', page_size integer default 50, page_offset integer default 0)
returns table (id uuid, email text, provider text, created_at timestamptz, last_sign_in_at timestamptz, suspended boolean, is_admin boolean, churches jsonb, total bigint)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
    wanted text := lower(trim(coalesce(search, '')));
begin
    perform public.require_platform_admin();
    return query
        select u.id, u.email::text, coalesce(u.raw_app_meta_data ->> 'provider', 'email'), u.created_at, u.last_sign_in_at,
               coalesce(u.banned_until > now(), false),
               exists (select 1 from public.platform_admins a where a.user_id = u.id),
               coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'role', m.role) order by c.name)
                         from public.church_members m join public.churches c on c.id = m.church_id where m.user_id = u.id), '[]'::jsonb),
               count(*) over ()
        from auth.users u
        where wanted = '' or strpos(lower(coalesce(u.email, '')), wanted) > 0
           or exists (select 1 from public.church_members m join public.churches c on c.id = m.church_id where m.user_id = u.id and strpos(lower(c.name), wanted) > 0)
        order by u.created_at desc
        limit least(greatest(page_size, 1), 200) offset greatest(page_offset, 0);
end;
$$;

create or replace function public.platform_churches(search text default '', page_size integer default 50, page_offset integer default 0)
returns table (id uuid, name text, created_at timestamptz, owner text, members bigint, songs bigint, plan text, status text, billed boolean, auto_grant boolean, ai_requests integer, ai_cost_micros bigint, total bigint)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare
    wanted text := lower(trim(coalesce(search, '')));
begin
    perform public.require_platform_admin();
    return query
        select c.id, c.name, c.created_at,
               (select u.email::text from public.church_members m join auth.users u on u.id = m.user_id where m.church_id = c.id and m.role = 'owner' order by m.created_at limit 1),
               (select count(*) from public.church_members m where m.church_id = c.id),
               (select count(*) from public.songs s where s.church_id = c.id and s.deleted_at is null),
               coalesce(s.plan, 'free'), coalesce(s.status, 'active'), s.stripe_subscription_id is not null, c.auto_grant_bible,
               coalesce(a.requests, 0), coalesce(a.cost_micros, 0), count(*) over ()
        from public.churches c
        left join public.church_subscriptions s on s.church_id = c.id
        left join public.ai_usage a on a.church_id = c.id and a.month = date_trunc('month', now())::date
        where wanted = '' or strpos(lower(c.name), wanted) > 0
        order by c.created_at desc
        limit least(greatest(page_size, 1), 200) offset greatest(page_offset, 0);
end;
$$;

create or replace function public.platform_log(page_size integer default 50)
returns table (created_at timestamptz, admin text, action text, church text, person text, detail jsonb)
language plpgsql stable security definer set search_path = public, pg_temp
as $$
begin
    perform public.require_platform_admin();
    return query
        select l.created_at, a.email::text, l.action, c.name, u.email::text, l.detail
        from public.platform_admin_log l
        left join auth.users a on a.id = l.admin_id
        left join auth.users u on u.id = l.target_user
        left join public.churches c on c.id = l.target_church
        order by l.id desc limit least(greatest(page_size, 1), 200);
end;
$$;

-- A plan given for free. Stripe owns the plan of a church that pays it.
create or replace function public.platform_set_plan(target uuid, new_plan text)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
begin
    perform public.require_platform_admin();
    if new_plan not in ('free', 'church', 'multi_campus') then
        raise exception 'No such plan' using errcode = '22023';
    end if;
    if exists (select 1 from public.church_subscriptions s where s.church_id = target and s.stripe_subscription_id is not null and s.status in ('active', 'trialing', 'past_due')) then
        raise exception 'This church pays through Stripe. Change its plan there.' using errcode = 'P0001';
    end if;
    insert into public.church_subscriptions (church_id, plan, status) values (target, new_plan, 'active')
    on conflict (church_id) do update set plan = excluded.plan, status = 'active', updated_at = now();
    insert into public.platform_admin_log (admin_id, action, target_church, detail) values ((select auth.uid()), 'set_plan', target, jsonb_build_object('plan', new_plan));
end;
$$;

create or replace function public.platform_set_auto_grant(target uuid, allowed boolean)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
begin
    perform public.require_platform_admin();
    update public.churches set auto_grant_bible = allowed where id = target;
    insert into public.platform_admin_log (admin_id, action, target_church, detail) values ((select auth.uid()), 'set_auto_grant', target, jsonb_build_object('allowed', allowed));
end;
$$;

create or replace function public.platform_set_role(target uuid, person uuid, new_role text)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
begin
    perform public.require_platform_admin();
    if new_role not in ('owner', 'admin', 'editor', 'viewer', 'none') then
        raise exception 'No such role' using errcode = '22023';
    end if;
    -- a church is never left without an owner
    if new_role <> 'owner' and exists (select 1 from public.church_members where church_id = target and user_id = person and role = 'owner')
       and (select count(*) from public.church_members where church_id = target and role = 'owner') < 2 then
        raise exception 'That is the only owner. Make someone else an owner first.' using errcode = 'P0001';
    end if;
    if new_role = 'none' then
        delete from public.church_members where church_id = target and user_id = person;
    else
        update public.church_members set role = new_role where church_id = target and user_id = person;
    end if;
    insert into public.platform_admin_log (admin_id, action, target_church, target_user, detail) values ((select auth.uid()), 'set_role', target, person, jsonb_build_object('role', new_role));
end;
$$;

-- Suspending ends every session and stops new ones; nothing the person made is removed.
create or replace function public.platform_set_suspended(person uuid, suspended boolean)
returns void language plpgsql security definer set search_path = public, pg_temp
as $$
begin
    perform public.require_platform_admin();
    if exists (select 1 from public.platform_admins where user_id = person) then
        raise exception 'A platform admin cannot be suspended' using errcode = 'P0001';
    end if;
    update auth.users set banned_until = case when suspended then now() + interval '100 years' else null end where id = person;
    if suspended then
        delete from auth.sessions where user_id = person;
    end if;
    insert into public.platform_admin_log (admin_id, action, target_user, detail) values ((select auth.uid()), 'set_suspended', person, jsonb_build_object('suspended', suspended));
end;
$$;

do $$
declare
    fn text;
begin
    foreach fn in array array['platform_overview()', 'platform_users(text, integer, integer)', 'platform_churches(text, integer, integer)', 'platform_log(integer)', 'platform_set_plan(uuid, text)', 'platform_set_auto_grant(uuid, boolean)', 'platform_set_role(uuid, uuid, text)', 'platform_set_suspended(uuid, boolean)'] loop
        execute format('revoke execute on function public.%s from public, anon', fn);
        execute format('grant execute on function public.%s to authenticated', fn);
    end loop;
end $$;
revoke execute on function public.require_platform_admin() from public, anon, authenticated;
