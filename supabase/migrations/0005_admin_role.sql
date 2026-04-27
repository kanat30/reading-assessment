-- Add admin role to teachers table
-- Admins can manage all teachers across all schools

-- Add role column with default 'teacher'
alter table teachers add column role text not null default 'teacher'
  check (role in ('teacher', 'admin'));

-- Create index for role lookups
create index teachers_role_idx on teachers(role);

-- ============================================
-- Helper function: check if current user is admin
-- ============================================
create or replace function is_admin()
returns boolean
language sql
stable
security definer
as $$
  select exists (
    select 1 from teachers
    where auth_provider_id = auth.uid()
    and role = 'admin'
  )
$$;

-- ============================================
-- RLS Policies for admin access
-- ============================================

-- Admins can read all schools
create policy "admins can read all schools"
  on schools for select
  using (is_admin());

-- Admins can read all teachers
create policy "admins can read all teachers"
  on teachers for select
  using (is_admin());

-- Admins can insert teachers (for creating accounts)
create policy "admins can insert teachers"
  on teachers for insert
  with check (is_admin());

-- Admins can update teachers
create policy "admins can update teachers"
  on teachers for update
  using (is_admin());

-- Admins can delete teachers
create policy "admins can delete teachers"
  on teachers for delete
  using (is_admin());

-- Admins can insert schools (for creating new schools)
create policy "admins can insert schools"
  on schools for insert
  with check (is_admin());
