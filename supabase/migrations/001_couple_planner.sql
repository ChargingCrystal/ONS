create table public.spaces (
  id uuid primary key default gen_random_uuid(),
  invite text unique default replace(gen_random_uuid()::text, '-', '')
);
create table public.members (
  user_id uuid primary key references auth.users on delete cascade,
  space_id uuid not null references public.spaces on delete cascade,
  slot smallint not null check (slot in (1,2)),
  unique(space_id, slot)
);
create function public.my_space() returns uuid language sql stable security definer
set search_path = '' as $$
  select space_id from public.members where user_id = auth.uid()
$$;
create function public.create_space() returns uuid language plpgsql security definer
set search_path = '' as $$
declare room uuid;
begin
  insert into public.spaces default values returning id into room;
  insert into public.members values(auth.uid(),room,1);
  return room;
end $$;
create function public.join_space(code text) returns uuid language plpgsql security definer
set search_path = '' as $$
declare room uuid;
begin
  update public.spaces set invite = null where invite = code returning id into room;
  if room is null then raise exception 'Invalid or used invitation' using errcode='22023'; end if;
  insert into public.members values(auth.uid(),room,2);
  return room;
end $$;
revoke all on function public.my_space(),public.create_space(),public.join_space(text) from public, anon;
grant execute on function public.my_space(),public.create_space(),public.join_space(text) to authenticated;

create table public.dates (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null default public.my_space() references public.spaces on delete cascade,
  title text not null check(length(trim(title)) between 1 and 160),
  category text not null check(length(trim(category)) between 1 and 60),
  status text not null default 'planned' check(status in ('planned','done')),
  meeting_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.dates(space_id, meeting_at);
create table public.locations (
  user_id uuid primary key default auth.uid() references public.members(user_id) on delete cascade,
  space_id uuid not null default public.my_space() references public.spaces on delete cascade,
  lat double precision not null check(lat between -90 and 90),
  lon double precision not null check(lon between -180 and 180)
);
alter table public.spaces enable row level security;
alter table public.members enable row level security;
alter table public.dates enable row level security;
alter table public.locations enable row level security;
revoke all on public.spaces, public.members, public.dates, public.locations from public, anon, authenticated;
grant select on public.spaces, public.members, public.dates, public.locations to authenticated;
grant insert(title,category,status,meeting_at), update(title,category,status,meeting_at), delete on public.dates to authenticated;
grant insert(user_id,lat,lon), update(user_id,lat,lon) on public.locations to authenticated;
create policy read_space on public.spaces for select to authenticated using(id=public.my_space());
create policy read_members on public.members for select to authenticated using(space_id=public.my_space());
create policy shared_dates on public.dates for all to authenticated using(space_id=public.my_space()) with check(space_id=public.my_space());
create policy read_locations on public.locations for select to authenticated using(space_id=public.my_space());
create policy insert_location on public.locations for insert to authenticated with check(space_id=public.my_space() and user_id=auth.uid());
create policy update_location on public.locations for update to authenticated using(space_id=public.my_space() and user_id=auth.uid()) with check(space_id=public.my_space() and user_id=auth.uid());

create function public.dashboard() returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object(
    'serverTime', now(),
    'nextMeeting', (select to_jsonb(d) from public.dates d where status='planned' and meeting_at>=now() order by meeting_at,id limit 1),
    'categoriesByMonth', coalesce((select jsonb_agg(to_jsonb(t) order by month,category) from
      (select to_char(created_at at time zone 'UTC','YYYY-MM') as month,category,count(*) as total
       from public.dates group by 1,2) t),'[]'::jsonb)
  )
$$;
revoke all on function public.dashboard() from public, anon;
grant execute on function public.dashboard() to authenticated;
