create table public.profiles (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  display_name text not null check (
    char_length(display_name) between 1 and 60
    and display_name !~ '^[[:space:]]|[[:space:]]$'
  )
);

alter table public.profiles enable row level security;
revoke all on public.profiles from public, anon, authenticated;
grant select (user_id, display_name), insert (display_name), update (display_name)
  on public.profiles to authenticated;

create policy read_own_or_partner_profile on public.profiles for select to authenticated
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.members as member
    where member.user_id = profiles.user_id and member.space_id = public.my_space()
  )
);
create policy insert_own_profile on public.profiles for insert to authenticated
with check (user_id = auth.uid());
create policy update_own_profile on public.profiles for update to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

create function public.my_profile() returns jsonb language sql stable security invoker
set search_path = '' as $$
  select jsonb_build_object('display_name', (
    select display_name from public.profiles where user_id = auth.uid()
  ))
$$;

create function public.space_details() returns jsonb language sql stable security invoker
set search_path = '' as $$
  select jsonb_build_object(
    'id', space.id,
    'invite', space.invite,
    'members', (
      select jsonb_agg(jsonb_build_object(
        'user_id', member.user_id,
        'slot', member.slot,
        'display_name', profile.display_name
      ) order by member.slot)
      from public.members as member
      left join public.profiles as profile on profile.user_id = member.user_id
      where member.space_id = space.id
    )
  )
  from public.spaces as space
  where space.id = public.my_space()
$$;

grant delete on public.locations to authenticated;
create policy delete_own_location on public.locations for delete to authenticated
using (space_id = public.my_space() and user_id = auth.uid());

create function public.delete_my_location() returns void language sql security invoker
set search_path = '' as $$
  delete from public.locations where user_id = auth.uid()
$$;

create function public.leave_space() returns void language plpgsql security definer
set search_path = '' as $$
declare room uuid;
begin
  select id into room from public.spaces where id = public.my_space() for update;
  if room is null then return; end if;

  -- The member foreign key also removes the caller's saved location.
  delete from public.members where user_id = auth.uid() and space_id = room;
  if found then
    update public.spaces set invite = null where id = room;
  end if;
end
$$;

create function public.regenerate_invite() returns text language plpgsql security definer
set search_path = '' as $$
declare
  room uuid;
  new_invite text;
begin
  -- Share the space row lock with joins and departures.
  select id into room from public.spaces where id = public.my_space() for update;
  if room is null or not exists (
    select 1 from public.members where space_id = room and user_id = auth.uid()
  ) then
    raise exception 'No space' using errcode = 'PT403';
  end if;
  if exists (select 1 from public.members where space_id = room and user_id <> auth.uid()) then
    raise exception 'Space already has two members' using errcode = 'PT409';
  end if;

  new_invite := replace(gen_random_uuid()::text, '-', '');
  update public.spaces set invite = new_invite where id = room;
  return new_invite;
end
$$;

create or replace function public.join_space(code text) returns uuid language plpgsql security definer
set search_path = '' as $$
declare
  room uuid;
  occupied_slot smallint;
begin
  select id into room from public.spaces where invite = code for update;
  -- Refuse stale invites after operator deletion and fill whichever slot is free.
  select min(slot) into occupied_slot from public.members
  where space_id = room
  having count(*) = 1;
  if occupied_slot is null then
    raise exception 'Invalid or used invitation' using errcode = '22023';
  end if;

  insert into public.members(user_id, space_id, slot) values (auth.uid(), room, 3 - occupied_slot);
  update public.spaces set invite = null where id = room;
  return room;
end
$$;

revoke all on function public.my_profile(), public.space_details(), public.delete_my_location(),
  public.leave_space(), public.regenerate_invite(), public.join_space(text) from public, anon;
grant execute on function public.my_profile(), public.space_details(), public.delete_my_location(),
  public.leave_space(), public.regenerate_invite(), public.join_space(text) to authenticated;
