-- Admins may rename their church, nothing else. The table-wide update grant let an
-- admin PATCH auto_grant_bible (and plan columns) on their own row. A column grant
-- adds to a table grant, so the table grant goes first.
revoke update on public.churches from authenticated;
grant update (name) on public.churches to authenticated;
