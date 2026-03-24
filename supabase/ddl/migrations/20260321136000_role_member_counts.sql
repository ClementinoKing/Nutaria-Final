create or replace function public.get_role_member_counts()
returns jsonb
language sql
security definer
set search_path = public
as $$
  with role_counts as (
    select
      ur.role_id,
      count(distinct ur.user_id)::integer as member_count
    from public.user_roles ur
    join public.user_profiles up
      on up.auth_user_id = ur.user_id
     and up.deleted_at is null
    group by role_id
  )
  select coalesce(jsonb_object_agg(role_id::text, member_count), '{}'::jsonb)
  from role_counts;
$$;

grant execute on function public.get_role_member_counts() to anon, authenticated, service_role;
