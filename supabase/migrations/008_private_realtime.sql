create policy ons_receive_own_broadcasts on realtime.messages
for select to authenticated
using (
  extension = 'broadcast'
  and topic = (select realtime.topic())
  and topic = 'ons:user:' || (select auth.uid())::text
);

create function public.broadcast_space_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  previous_space uuid;
  current_space uuid;
  recipient uuid;
begin
  -- Prevent callers from reusing this privileged trigger on another table.
  if tg_relid not in ('public.dates'::regclass, 'public.photos'::regclass, 'public.locations'::regclass) then
    raise exception 'Invalid table for space notifications' using errcode = '42501';
  end if;

  if tg_op <> 'INSERT' then
    previous_space := old.space_id;
  end if;
  if tg_op <> 'DELETE' then
    current_space := new.space_id;
  end if;

  -- Resolve recipients for each change so a cached channel join cannot retain access to a space.
  for recipient in
    select user_id from public.members where space_id in (previous_space, current_space)
  loop
    perform realtime.send('{}'::jsonb, tg_table_name || '.changed', 'ons:user:' || recipient::text, true);
  end loop;

  return null;
end
$$;

revoke all on function public.broadcast_space_change() from public, anon, authenticated;
grant execute on function public.broadcast_space_change() to authenticated;

create trigger broadcast_space_change
after insert or update or delete on public.dates
for each row execute function public.broadcast_space_change();

create trigger broadcast_space_change
after insert or update or delete on public.photos
for each row execute function public.broadcast_space_change();

create trigger broadcast_space_change
after insert or update or delete on public.locations
for each row execute function public.broadcast_space_change();
