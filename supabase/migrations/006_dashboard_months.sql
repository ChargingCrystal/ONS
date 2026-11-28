create or replace function public.dashboard() returns jsonb
language sql stable security invoker set search_path = '' as $$
  with calendar as (
    select generate_series(
      date_trunc('month', now() at time zone 'UTC') - interval '11 months',
      date_trunc('month', now() at time zone 'UTC'),
      interval '1 month'
    ) as month_start
  ),
  monthly_categories as (
    select date_trunc('month', created_at at time zone 'UTC') as month_start,
      category, count(*) as total
    from public.dates
    group by 1, 2
  ),
  monthly_totals as (
    select calendar.month_start, coalesce(sum(monthly_categories.total), 0) as total
    from calendar
    left join monthly_categories using (month_start)
    group by calendar.month_start
  )
  select jsonb_build_object(
    'serverTime', now(),
    'nextMeeting', (
      select to_jsonb(date)
      from public.dates as date
      where date.status = 'planned' and date.meeting_at >= now()
      order by date.meeting_at, date.id
      limit 1
    ),
    'categoriesByMonth', coalesce((
      select jsonb_agg(jsonb_build_object(
        'month', to_char(month_start, 'YYYY-MM'), 'category', category, 'total', total
      ) order by month_start, category)
      from monthly_categories
    ), '[]'::jsonb),
    'datesByMonth', (
      select jsonb_agg(jsonb_build_object(
        'month', to_char(month_start, 'YYYY-MM'), 'total', total
      ) order by month_start)
      from monthly_totals
    )
  )
$$;

revoke all on function public.dashboard() from public, anon;
grant execute on function public.dashboard() to authenticated;
