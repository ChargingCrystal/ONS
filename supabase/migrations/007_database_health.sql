create function public.database_health()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select true;
$$;

revoke all on function public.database_health() from public, anon, authenticated;
grant execute on function public.database_health() to anon;
