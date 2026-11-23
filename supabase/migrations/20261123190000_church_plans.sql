-- Plans and usage. Everything that runs on the computer is free (the app is
-- GPL); a plan pays for the hosted service: the church library's size and
-- people, media storage, and Scriptural AI without bringing your own key.
--
--   free           3 people,  500 songs,   1 GB media,     0 AI requests a month
--   church        10 people,  unlimited, 25 GB media,  1,000 AI requests a month
--   multi_campus  50 people,  unlimited, 100 GB media, 5,000 AI requests a month
--
-- Stripe is the source of truth for what was paid; its webhook writes
-- church_subscriptions and nothing else does (service role only).

create table public.church_subscriptions (
    church_id uuid primary key references public.churches (id) on delete cascade,
    plan text not null default 'free' check (plan in ('free', 'church', 'multi_campus')),
    status text not null default 'active',
    stripe_customer_id text unique,
    stripe_subscription_id text unique,
    current_period_end timestamptz,
    updated_at timestamptz not null default now()
);

create table public.stripe_events (
    id text primary key,
    type text not null,
    received_at timestamptz not null default now()
);

create table public.ai_usage (
    church_id uuid not null references public.churches (id) on delete cascade,
    month date not null,
    requests integer not null default 0,
    primary key (church_id, month)
);

-- The limits of the plan a church is on now. A lapsed paid plan is free.
create or replace function public.church_limits(target uuid)
returns table (plan text, max_members integer, max_songs integer, media_bytes bigint, ai_requests integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    with current_plan as (
        select case
            when s.plan <> 'free' and s.status in ('active', 'trialing', 'past_due') then s.plan
            else 'free'
        end as plan
        from (select target as church_id) c
        left join public.church_subscriptions s on s.church_id = c.church_id
    )
    select p.plan,
           case p.plan when 'multi_campus' then 50 when 'church' then 10 else 3 end,
           case p.plan when 'free' then 500 else null end,
           case p.plan when 'multi_campus' then 107374182400 when 'church' then 26843545600 else 1073741824 end,
           case p.plan when 'multi_campus' then 5000 when 'church' then 1000 else 0 end
    from current_plan p
$$;
revoke execute on function public.church_limits(uuid) from public, anon;
grant execute on function public.church_limits(uuid) to authenticated, service_role;

-- Songs past the plan's limit are refused, with a message the app can show.
create or replace function public.enforce_song_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    cap integer;
begin
    select max_songs into cap from public.church_limits(new.church_id);
    if cap is not null and (select count(*) from public.songs s where s.church_id = new.church_id and s.deleted_at is null) >= cap then
        raise exception 'The free plan holds % songs. Upgrade to add more.', cap using errcode = 'P0001';
    end if;
    return new;
end;
$$;
create trigger songs_limit before insert on public.songs for each row execute function public.enforce_song_limit();

create or replace function public.enforce_member_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    cap integer;
begin
    select max_members into cap from public.church_limits(new.church_id);
    if (select count(*) from public.church_members m where m.church_id = new.church_id) >= cap then
        raise exception 'This plan has room for % people. Upgrade to add more.', cap using errcode = 'P0001';
    end if;
    return new;
end;
$$;
create trigger members_limit before insert on public.church_members for each row execute function public.enforce_member_limit();

-- Counts one AI request against this month's allowance; false when it is used up.
create or replace function public.use_ai_request(target uuid)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    allowance integer;
    used integer;
begin
    if not public.has_church_role(target, array['owner', 'admin', 'editor', 'viewer']) then
        raise exception 'Not a member of this church' using errcode = '42501';
    end if;
    select ai_requests into allowance from public.church_limits(target);
    insert into public.ai_usage as u (church_id, month, requests)
    values (target, date_trunc('month', now())::date, 1)
    on conflict (church_id, month) do update set requests = u.requests + 1
    returning requests into used;
    if used > allowance then
        update public.ai_usage set requests = requests - 1 where church_id = target and month = date_trunc('month', now())::date;
        return false;
    end if;
    return true;
end;
$$;
revoke execute on function public.use_ai_request(uuid) from public, anon;
grant execute on function public.use_ai_request(uuid) to authenticated;

alter table public.church_subscriptions enable row level security;
alter table public.stripe_events enable row level security;
alter table public.ai_usage enable row level security;

create policy "members see their plan" on public.church_subscriptions for select to authenticated
    using (public.has_church_role(church_id, array['owner', 'admin', 'editor', 'viewer']));
create policy "members see AI usage" on public.ai_usage for select to authenticated
    using (public.has_church_role(church_id, array['owner', 'admin', 'editor', 'viewer']));

revoke all on public.church_subscriptions, public.stripe_events, public.ai_usage from anon;
grant select on public.church_subscriptions, public.ai_usage to authenticated;
grant all on public.church_subscriptions, public.stripe_events, public.ai_usage to service_role;
