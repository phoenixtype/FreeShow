-- Scriptural AI is counted by the server only. use_ai_request was callable by any
-- member, so a viewer could loop the RPC and use up the church's month. ai-complete
-- now calls use_ai_request_for with the caller it verified, and each person is held
-- to 20 requests a minute.

revoke execute on function public.use_ai_request(uuid) from public, anon, authenticated;
drop function if exists public.use_ai_request(uuid);

create table public.ai_user_minute (
    church_id uuid not null references public.churches(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    minute timestamptz not null,
    requests integer not null default 0,
    primary key (church_id, user_id, minute)
);
create index ai_user_minute_user on public.ai_user_minute (user_id);
alter table public.ai_user_minute enable row level security;
-- no policies: only the server reads or writes it
revoke all on public.ai_user_minute from public, anon, authenticated;
grant all on public.ai_user_minute to service_role;

-- 'ok', 'rate_limited' (over 20 this minute), 'used_up' (month's allowance or budget
-- spent) or 'not_allowed' (not an owner, admin or editor of this church).
create or replace function public.use_ai_request_for(target uuid, person uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    allowance integer;
    budget bigint;
    this_minute timestamptz := date_trunc('minute', now());
    per_minute integer;
    usage_row public.ai_usage%rowtype;
begin
    if not exists (
        select 1 from public.church_members m
        where m.church_id = target and m.user_id = person and m.role in ('owner', 'admin', 'editor')
    ) then
        return 'not_allowed';
    end if;

    insert into public.ai_user_minute as u (church_id, user_id, minute, requests)
    values (target, person, this_minute, 1)
    on conflict (church_id, user_id, minute) do update set requests = u.requests + 1
    returning u.requests into per_minute;
    delete from public.ai_user_minute u where u.user_id = person and u.minute < this_minute - interval '1 hour';
    if per_minute > 20 then
        return 'rate_limited';
    end if;

    select l.ai_requests, public.ai_budget_micros(l.plan) into allowance, budget from public.church_limits(target) l;
    insert into public.ai_usage as u (church_id, month, requests)
    values (target, date_trunc('month', now())::date, 1)
    on conflict (church_id, month) do update set requests = u.requests + 1
    returning * into usage_row;
    if usage_row.requests > allowance or usage_row.cost_micros >= budget then
        update public.ai_usage u set requests = u.requests - 1 where u.church_id = target and u.month = date_trunc('month', now())::date;
        return 'used_up';
    end if;
    return 'ok';
end;
$$;
revoke execute on function public.use_ai_request_for(uuid, uuid) from public, anon, authenticated;
grant execute on function public.use_ai_request_for(uuid, uuid) to service_role;
