create table public.photos (
  id uuid primary key,
  space_id uuid not null references public.spaces on delete cascade,
  path text not null unique check (path = space_id::text || '/' || id::text),
  mime text not null check (mime in ('image/jpeg', 'image/png', 'image/webp')),
  size integer not null check (size between 1 and 5242880),
  uploaded_by uuid references auth.users on delete set null,
  created_at timestamptz not null default now()
);
create index photos_space_order on public.photos (space_id, created_at desc, id);

create table public.photo_upload_reservations (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces on delete cascade,
  uploaded_by uuid references auth.users on delete set null,
  mime text not null,
  size integer not null,
  sign_before timestamptz not null,
  hold_until timestamptz not null,
  closed boolean not null default false
);
create index photo_reservations_space on public.photo_upload_reservations (space_id, hold_until);

alter table public.photos enable row level security;
alter table public.photo_upload_reservations enable row level security;
revoke all on public.photos, public.photo_upload_reservations from public, anon, authenticated;
grant select (id, space_id, path, mime, size, uploaded_by, created_at) on public.photos to authenticated;
create policy read_space_photos on public.photos for select to authenticated
using (space_id = public.my_space());

create function public.gallery_object_size(metadata jsonb) returns bigint language sql immutable
set search_path = '' as $$
  select case when metadata->>'size' ~ '^[0-9]{1,12}$' then (metadata->>'size')::bigint end
$$;
revoke all on function public.gallery_object_size(jsonb) from public, anon, authenticated;

-- Keep compatible legacy objects visible without modifying Storage's metadata tables.
with legacy as (
  select object.*, regexp_match(object.name,
    '^([0-9a-f-]{36})/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$') as parts
  from storage.objects as object where object.bucket_id = 'gallery'
)
insert into public.photos (id, space_id, path, mime, size, uploaded_by, created_at)
select legacy.parts[2]::uuid, space.id, legacy.name, legacy.metadata->>'mimetype',
  public.gallery_object_size(legacy.metadata), uploader.id, legacy.created_at
from legacy
join public.spaces as space on space.id::text = legacy.parts[1]
left join auth.users as uploader on uploader.id::text = legacy.owner_id
where public.gallery_object_size(legacy.metadata) between 1 and 5242880
  and legacy.metadata->>'mimetype' in ('image/jpeg', 'image/png', 'image/webp');

create function public.reserve_photo_upload(upload_mime text, upload_size integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  room uuid;
  reserved_id uuid;
  held_bytes bigint;
  stored_bytes bigint;
  requested_at timestamptz;
begin
  if upload_size is null or upload_size not between 1 and 5242880
    or upload_mime is null or upload_mime not in ('image/jpeg', 'image/png', 'image/webp') then
    raise exception 'Unsupported photo metadata' using errcode = 'PT400';
  end if;

  select id into room from public.spaces where id = public.my_space() for update;
  if room is null or public.my_space() is distinct from room then
    raise exception 'No space' using errcode = 'PT403';
  end if;
  requested_at := clock_timestamp();

  -- A live token can upload up to the bucket limit, regardless of the declared file size.
  select count(*) * 5242880 into held_bytes from public.photo_upload_reservations
  where space_id = room and hold_until > requested_at;
  select coalesce(sum(coalesce(public.gallery_object_size(object.metadata), 5242880)), 0)
    into stored_bytes
  from storage.objects as object
  where object.bucket_id = 'gallery' and (storage.foldername(object.name))[1] = room::text
    and not exists (
      select 1 from public.photo_upload_reservations as reservation
      where reservation.space_id = room and reservation.hold_until > requested_at
        and object.name = room::text || '/' || reservation.id::text
    );
  if held_bytes + stored_bytes + 5242880 > 52428800 then
    raise exception 'Photo quota exceeded' using errcode = 'PT409';
  end if;

  -- Allow signing for one minute, then cover the two-hour token and a transfer grace period.
  insert into public.photo_upload_reservations (space_id, uploaded_by, mime, size, sign_before, hold_until)
  values (room, auth.uid(), upload_mime, upload_size, requested_at + interval '1 minute',
    requested_at + interval '2 hours 16 minutes')
  returning id into reserved_id;
  return jsonb_build_object('uploadId', reserved_id, 'path', room::text || '/' || reserved_id::text);
end
$$;

create function public.may_upload_gallery_object(object_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.photo_upload_reservations as reservation
    where reservation.space_id = public.my_space()
      and reservation.uploaded_by = auth.uid()
      and not reservation.closed
      and reservation.sign_before > statement_timestamp()
      and object_path = reservation.space_id::text || '/' || reservation.id::text
  )
$$;

drop policy gallery_upload on storage.objects;
create policy gallery_upload on storage.objects for insert to authenticated
with check (bucket_id = 'gallery' and public.may_upload_gallery_object(name));

create function public.confirm_photo(photo_upload_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  room uuid;
  reservation public.photo_upload_reservations%rowtype;
  photo public.photos%rowtype;
  object_path text;
  object_size bigint;
  object_mime text;
begin
  select id into room from public.spaces where id = public.my_space() for update;
  if room is null or public.my_space() is distinct from room then
    raise exception 'No space' using errcode = 'PT403';
  end if;
  select * into reservation from public.photo_upload_reservations
  where id = photo_upload_id and space_id = room and uploaded_by = auth.uid() and not closed;
  if not found then
    raise exception 'Upload not found' using errcode = 'PT404';
  end if;

  object_path := room::text || '/' || photo_upload_id::text;
  select public.gallery_object_size(metadata), metadata->>'mimetype' into object_size, object_mime
  from storage.objects where bucket_id = 'gallery' and name = object_path;
  if not found then
    raise exception 'Photo not found' using errcode = 'PT404';
  end if;
  if object_size is distinct from reservation.size or object_mime is distinct from reservation.mime then
    raise exception 'Uploaded photo does not match its reservation' using errcode = 'PT400';
  end if;

  insert into public.photos (id, space_id, path, mime, size, uploaded_by)
  values (photo_upload_id, room, object_path, object_mime, object_size, auth.uid())
  on conflict (id) do nothing;
  select * into photo from public.photos where id = photo_upload_id and space_id = room;
  return to_jsonb(photo);
end
$$;

create function public.forget_photo(photo_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  room uuid;
  object_path text;
begin
  select id into room from public.spaces where id = public.my_space() for update;
  select path into object_path from public.photos where id = photo_id and space_id = room;
  if object_path is null or public.my_space() is distinct from room then
    raise exception 'Photo not found' using errcode = 'PT404';
  end if;
  if exists (select 1 from storage.objects where bucket_id = 'gallery' and name = object_path) then
    raise exception 'Photo object still exists';
  end if;
  delete from public.photos where id = photo_id and space_id = room;
  -- A previously issued token stays accounted for until the hold ends.
  update public.photo_upload_reservations set closed = true where id = photo_id and space_id = room;
end
$$;

revoke all on function public.reserve_photo_upload(text, integer), public.may_upload_gallery_object(text),
  public.confirm_photo(uuid), public.forget_photo(uuid) from public, anon;
grant execute on function public.reserve_photo_upload(text, integer), public.may_upload_gallery_object(text),
  public.confirm_photo(uuid), public.forget_photo(uuid) to authenticated;
