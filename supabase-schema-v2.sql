-- ==============================================================================
-- PRINTING JOB SCHEDULER - SUPABASE SCHEMA v2 (3-ROLE SYSTEM)
-- ==============================================================================
-- Run this in your Supabase SQL Editor (Dashboard -> SQL Editor)
-- This script safely migrates from the old 2-role (student/operator) system
-- to the new 3-role system (admin / staff / student).
-- ==============================================================================

-- 1. Migrate existing 'operator' roles to 'staff' (run before adding constraint)
UPDATE public.profiles SET role = 'staff' WHERE role = 'operator';

-- 2. Update profiles table: expand role check to include 'admin', 'staff', 'student', and legacy 'operator'
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'staff', 'student', 'operator'));

-- Add 'status' column if missing (for activate/deactivate accounts)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_status_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_status_check
  CHECK (status IN ('active', 'inactive'));

-- 3. Update print_jobs table: expand status to include 'Approved' and 'Rejected'
ALTER TABLE public.print_jobs DROP CONSTRAINT IF EXISTS print_jobs_status_check;
ALTER TABLE public.print_jobs
  ADD CONSTRAINT print_jobs_status_check
  CHECK (status IN ('Pending', 'Approved', 'Printing', 'Completed', 'Rejected', 'Cancelled'));

-- Add new columns if missing
ALTER TABLE public.print_jobs ADD COLUMN IF NOT EXISTS assigned_staff_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.print_jobs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
ALTER TABLE public.print_jobs ADD COLUMN IF NOT EXISTS print_type TEXT DEFAULT 'standard';
ALTER TABLE public.print_jobs ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';

-- 4. Drop old helper functions and recreate for new roles
DROP FUNCTION IF EXISTS public.is_operator();
DROP FUNCTION IF EXISTS public.is_admin();
DROP FUNCTION IF EXISTS public.is_staff();
DROP FUNCTION IF EXISTS public.is_staff_or_admin();
DROP FUNCTION IF EXISTS public.get_user_role();

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('staff', 'operator')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_staff_or_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('staff', 'admin', 'operator')
  );
$$;

-- Maintain is_operator for backwards compatibility with any legacy code
CREATE OR REPLACE FUNCTION public.is_operator()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('staff', 'admin', 'operator')
  );
$$;

-- 5. Drop all old RLS policies and recreate for 3-role system

-- profiles policies
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Operators can read all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Staff and Admin can read all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admin can insert any profile" ON public.profiles;
DROP POLICY IF EXISTS "Admin can update any profile" ON public.profiles;
DROP POLICY IF EXISTS "Admin can delete profiles" ON public.profiles;

CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Staff and Admin can read all profiles"
  ON public.profiles FOR SELECT
  USING (public.is_staff_or_admin());

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id AND role = 'student');

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Admin can insert any profile"
  ON public.profiles FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "Admin can update any profile"
  ON public.profiles FOR UPDATE
  USING (public.is_admin());

CREATE POLICY "Admin can delete profiles"
  ON public.profiles FOR DELETE
  USING (public.is_admin());

-- print_jobs policies
DROP POLICY IF EXISTS "Students can read own print jobs" ON public.print_jobs;
DROP POLICY IF EXISTS "Operators can read all print jobs" ON public.print_jobs;
DROP POLICY IF EXISTS "Staff and Admin can read all print jobs" ON public.print_jobs;
DROP POLICY IF EXISTS "Students can create print jobs" ON public.print_jobs;
DROP POLICY IF EXISTS "Students can cancel pending print jobs" ON public.print_jobs;
DROP POLICY IF EXISTS "Operators can update print jobs" ON public.print_jobs;
DROP POLICY IF EXISTS "Staff can update print jobs" ON public.print_jobs;
DROP POLICY IF EXISTS "Admin can update any print job" ON public.print_jobs;
DROP POLICY IF EXISTS "Students can update own pending print jobs" ON public.print_jobs;
DROP POLICY IF EXISTS "Students can delete own pending print jobs" ON public.print_jobs;

CREATE POLICY "Students can read own print jobs"
  ON public.print_jobs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Staff and Admin can read all print jobs"
  ON public.print_jobs FOR SELECT
  USING (public.is_staff_or_admin());

CREATE POLICY "Students can create print jobs"
  ON public.print_jobs FOR INSERT
  WITH CHECK (auth.uid() = user_id AND status = 'Pending');

CREATE POLICY "Students can update own pending print jobs"
  ON public.print_jobs FOR UPDATE
  USING (
    auth.uid() = user_id
    AND status = 'Pending'
    AND public.get_user_role() = 'student'
  )
  WITH CHECK (
    auth.uid() = user_id
    AND status = 'Pending'
    AND public.get_user_role() = 'student'
  );

CREATE POLICY "Students can delete own pending print jobs"
  ON public.print_jobs FOR DELETE
  USING (
    auth.uid() = user_id
    AND status = 'Pending'
    AND public.get_user_role() = 'student'
  );

CREATE POLICY "Staff can update print jobs"
  ON public.print_jobs FOR UPDATE
  USING (public.is_staff())
  WITH CHECK (public.is_staff());

CREATE POLICY "Admin can update any print job"
  ON public.print_jobs FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE OR REPLACE FUNCTION public.protect_student_print_job_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
    AND OLD.user_id = auth.uid()
    AND NOT public.is_staff_or_admin() THEN
    IF public.get_user_role() IS DISTINCT FROM 'student' OR OLD.status <> 'Pending' THEN
      RAISE EXCEPTION 'Only your own pending print requests can be updated.'
        USING ERRCODE = '42501';
    END IF;

    IF (to_jsonb(NEW) - ARRAY['document_name', 'pages', 'copies', 'print_type', 'color', 'notes', 'updated_at'])
      IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['document_name', 'pages', 'copies', 'print_type', 'color', 'notes', 'updated_at']) THEN
      RAISE EXCEPTION 'Students may only edit print request details.'
        USING ERRCODE = '42501';
    END IF;

    NEW.updated_at := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_student_print_job_update ON public.print_jobs;
CREATE TRIGGER protect_student_print_job_update
  BEFORE UPDATE ON public.print_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_student_print_job_update();g

-- 6. Update the handle_new_user trigger
-- Reads role from metadata if provided (e.g. staff created by admin), defaults to 'student'
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role, status)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'role', ''), 'student'),
    'active'
  )
  ON CONFLICT (id) DO UPDATE
  SET full_name = EXCLUDED.full_name,
      email = EXCLUDED.email,
      role = COALESCE(NULLIF(EXCLUDED.role, ''), NULLIF(NEW.raw_user_meta_data->>'role', ''), profiles.role, 'student');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 7. Realtime for print_jobs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'print_jobs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.print_jobs;
  END IF;
END $$;

-- 8. IMPORTANT: To set your first admin account, run:
--    UPDATE public.profiles SET role = 'admin' WHERE email = 'your-admin@email.com';
