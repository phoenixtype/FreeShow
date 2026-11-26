-- A trigger function, not an RPC: nobody calls it directly.
revoke execute on function public.enforce_member_limit() from public, anon, authenticated;
