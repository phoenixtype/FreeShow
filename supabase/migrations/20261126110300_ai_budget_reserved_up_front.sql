-- The AI budget was checked before the spend and only added to afterwards, so
-- requests sent at the same moment all passed the check. Each request now holds
-- 80,000 micros ($0.08, about the most one answer costs) when it is accepted, and
-- settle_ai_request swaps the hold for what it really cost.
--
-- Same names and arguments as before, so ai-complete may be deployed before or
-- after this file; deploy this file first.

create or replace function public.ai_hold_micros()
returns bigint language sql immutable set search_path = public, pg_temp
as $$ select 80000::bigint $$;
revoke execute on function public.ai_hold_micros() from public, anon, authenticated;

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

    select l.ai_requests, public.ai_budget_micros(l.plan) into allowance, budget from public.church_limits_internal(target) l;
    -- the upsert locks the month's row, so requests at once are counted one by one
    insert into public.ai_usage as u (church_id, month, requests, cost_micros)
    values (target, date_trunc('month', now())::date, 1, public.ai_hold_micros())
    on conflict (church_id, month) do update set requests = u.requests + 1, cost_micros = u.cost_micros + public.ai_hold_micros()
    returning * into usage_row;
    -- refused when what was already spent or held reaches the budget
    if usage_row.requests > allowance or usage_row.cost_micros - public.ai_hold_micros() >= budget then
        update public.ai_usage u set requests = u.requests - 1, cost_micros = u.cost_micros - public.ai_hold_micros()
        where u.church_id = target and u.month = date_trunc('month', now())::date;
        return 'used_up';
    end if;
    return 'ok';
end;
$$;
revoke execute on function public.use_ai_request_for(uuid, uuid) from public, anon, authenticated;
grant execute on function public.use_ai_request_for(uuid, uuid) to service_role;

create or replace function public.settle_ai_request(target uuid, cost bigint, answered boolean)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
    update public.ai_usage u
    set requests = case when answered then u.requests else greatest(u.requests - 1, 0) end,
        cost_micros = greatest(u.cost_micros - public.ai_hold_micros() + greatest(cost, 0), 0)
    where u.church_id = target and u.month = date_trunc('month', now())::date
$$;
revoke execute on function public.settle_ai_request(uuid, bigint, boolean) from public, anon, authenticated;
grant execute on function public.settle_ai_request(uuid, bigint, boolean) to service_role;
