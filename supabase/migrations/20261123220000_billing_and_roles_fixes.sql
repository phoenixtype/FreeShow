-- 1. An admin could demote the owner (the update policy checked only the new
--    role), after which the delete policy let them remove the owner. Owners'
--    rows are now out of reach of updates, and only the role column can change.
drop policy "admins change roles" on public.church_members;
create policy "admins change roles" on public.church_members for update to authenticated
    using (public.has_church_role(church_id, array['owner', 'admin']) and role <> 'owner')
    with check (public.has_church_role(church_id, array['owner', 'admin']) and role <> 'owner');
revoke update on public.church_members from authenticated;
grant update (role) on public.church_members to authenticated;

-- 2. Gives back an AI request neither model answered (ai-complete calls it).
create or replace function public.refund_ai_request(target uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
    update public.ai_usage
    set requests = greatest(requests - 1, 0)
    where church_id = target
      and month = date_trunc('month', now())::date
      and public.has_church_role(target, array['owner', 'admin', 'editor', 'viewer'])
$$;
revoke execute on function public.refund_ai_request(uuid) from public, anon;
grant execute on function public.refund_ai_request(uuid) to authenticated;
