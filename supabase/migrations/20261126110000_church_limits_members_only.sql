-- church_limits answered for any church id, and viewers could read the Stripe
-- ids in church_subscriptions. Now:
--   * church_limits answers members of the church and platform admins only (and
--     the server, which has no signed-in person). The plain calculation moves to
--     church_limits_internal, which only other database functions and the server
--     call.
--   * the plan columns are readable by members; the Stripe ids are not.
-- A table grant is wider than a column grant, so the table grant goes first.

create or replace function public.church_limits_internal(target uuid)
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
revoke execute on function public.church_limits_internal(uuid) from public, anon, authenticated;
grant execute on function public.church_limits_internal(uuid) to service_role;

create or replace function public.church_limits(target uuid)
returns table (plan text, max_members integer, max_songs integer, media_bytes bigint, ai_requests integer)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
    select l.plan, l.max_members, l.max_songs, l.media_bytes, l.ai_requests
    from public.church_limits_internal(target) l
    where (select auth.uid()) is null
       or public.has_church_role(target, array['owner', 'admin', 'editor', 'viewer'])
       or public.is_platform_admin()
$$;
revoke execute on function public.church_limits(uuid) from public, anon;
grant execute on function public.church_limits(uuid) to authenticated, service_role;

revoke select on public.church_subscriptions from authenticated;
grant select (church_id, plan, status, current_period_end, updated_at) on public.church_subscriptions to authenticated;
