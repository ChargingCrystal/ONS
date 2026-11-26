-- Guard new writes while existing rows are normalized.
alter table public.dates
  add constraint dates_category_key_check
  check (category in ('dinner', 'movie', 'walk', 'trip', 'video_call', 'game', 'other'))
  not valid;

with mapped as (
  select id, case lower(regexp_replace(category, '^[[:space:]]+|[[:space:]]+$', '', 'g'))
    when 'dinner' then 'dinner'
    when 'abendessen' then 'dinner'
    when 'avondeten' then 'dinner'
    when 'movie' then 'movie'
    when 'film' then 'movie'
    when 'cinema' then 'movie'
    when 'kino' then 'movie'
    when 'bioscoop' then 'movie'
    when 'walk' then 'walk'
    when 'spaziergang' then 'walk'
    when 'wandeling' then 'walk'
    when 'trip' then 'trip'
    when 'ausflug' then 'trip'
    when 'uitstapje' then 'trip'
    when 'video_call' then 'video_call'
    when 'video call' then 'video_call'
    when 'videoanruf' then 'video_call'
    when 'videobellen' then 'video_call'
    when 'game' then 'game'
    when 'spiel' then 'game'
    when 'spel' then 'game'
    else 'other'
  end as category
  from public.dates
)
update public.dates as dates
set category = mapped.category
from mapped
where dates.id = mapped.id
  and dates.category is distinct from mapped.category;

alter table public.dates validate constraint dates_category_key_check;
