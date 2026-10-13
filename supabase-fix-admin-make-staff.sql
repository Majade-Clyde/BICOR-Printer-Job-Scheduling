-- ==============================================================================
-- FIX: ADMIN "MAKE STAFF" RLS POLICIES & HELPER RPC FUNCTION
-- ==============================================================================
-- Run this in your Supabase Dashboard -> SQL Editor
-- This ensures:
-- 1. Check constraint on profiles permits ('admin', 'staff', 'student', 'operator', 'user')
-- 2. Non-recursive is_admin() security definer function
-- 3. Explicit Admin UPDATE policy on public.profiles
-- 4. Secure RPC function `promote_user_to_staff(target_user_id)` with caller verification
-- ==============================================================================

-- 1. Ensure status column exists and update role check constraint
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_status_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_status_check
  CHECK (status IN ('active', 'inactive'));

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'staff', 'student', 'operator', 'user'));

-- 2. Ensure non-recursive is_admin() function
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

-- 3. Ensure non-recursive is_staff_or_admin() function
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

-- 4. Refresh RLS policies on public.profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Staff and Admin can read all profiles" ON public.profiles;
CREATE POLICY "Staff and Admin can read all profiles"
  ON public.profiles FOR SELECT
  USING (public.is_staff_or_admin());

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Admin can update any profile" ON public.profiles;
CREATE POLICY "Admin can update any profile"
  ON public.profiles FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admin can insert any profile" ON public.profiles;
CREATE POLICY "Admin can insert any profile"
  ON public.profiles FOR INSERT
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admin can delete profiles" ON public.profiles;
CREATE POLICY "Admin can delete profiles"
  ON public.profiles FOR DELETE
  USING (public.is_admin());

-- 5. Secure RPC Function: promote_user_to_staff
CREATE OR REPLACE FUNCTION public.promote_user_to_staff(target_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role TEXT;
  updated_record RECORD;
BEGIN
  -- Check if caller is admin in profiles
  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid();
  
  -- Fallback check in auth.users metadata if profiles row was not yet synced
  IF caller_role IS NULL OR caller_role <> 'admin' THEN
    SELECT raw_user_meta_data->>'role' INTO caller_role FROM auth.users WHERE id = auth.uid();
  END IF;

  IF caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Access denied. Only administrators can promote users to staff.'
      USING ERRCODE = '42501';
  END IF;

  -- Update target profile to staff
  UPDATE public.profiles
  SET role = 'staff'
  WHERE id = target_user_id
  RETURNING * INTO updated_record;

  -- If target profile doesn't exist yet, create it
  IF NOT FOUND THEN
    INSERT INTO public.profiles (id, full_name, email, role, status)
    SELECT id, COALESCE(raw_user_meta_data->>'full_name', split_part(email, '@', 1)), email, 'staff', 'active'
    FROM auth.users WHERE id = target_user_id
    RETURNING * INTO updated_record;
  END IF;

  -- Sync user metadata in auth.users
  BEGIN
    UPDATE auth.users
    SET raw_user_meta_data = raw_user_meta_data || jsonb_build_object('role', 'staff')
    WHERE id = target_user_id;
  EXCEPTION WHEN OTHERS THEN
    -- Ignore if auth schema permissions restrict direct update
  END;

  RETURN to_jsonb(updated_record);
END;
$$;

-- Grant execution to authenticated users (function self-checks caller is admin)
GRANT EXECUTE ON FUNCTION public.promote_user_to_staff(UUID) TO authenticated;

-- 6. Secure RPC Function: demote_staff_to_user (Remove Staff)
CREATE OR REPLACE FUNCTION public.demote_staff_to_user(target_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role TEXT;
  updated_record RECORD;
BEGIN
  -- Check if caller is admin in profiles
  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid();
  
  IF caller_role IS NULL OR caller_role <> 'admin' THEN
    SELECT raw_user_meta_data->>'role' INTO caller_role FROM auth.users WHERE id = auth.uid();
  END IF;

  IF caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Access denied. Only administrators can remove staff privileges.'
      USING ERRCODE = '42501';
  END IF;

  -- Update target profile back to student/user
  UPDATE public.profiles
  SET role = 'student'
  WHERE id = target_user_id
  RETURNING * INTO updated_record;

  -- If target profile was deleted previously, recreate it with student role
  IF NOT FOUND THEN
    INSERT INTO public.profiles (id, full_name, email, role, status)
    SELECT id, COALESCE(raw_user_meta_data->>'full_name', split_part(email, '@', 1)), email, 'student', 'active'
    FROM auth.users WHERE id = target_user_id
    RETURNING * INTO updated_record;
  END IF;

  -- Sync user metadata in auth.users
  BEGIN
    UPDATE auth.users
    SET raw_user_meta_data = raw_user_meta_data || jsonb_build_object('role', 'student')
    WHERE id = target_user_id;
  EXCEPTION WHEN OTHERS THEN
    -- Ignore if auth schema permissions restrict direct update
  END;

  RETURN to_jsonb(updated_record);
END;
$$;

GRANT EXECUTE ON FUNCTION public.demote_staff_to_user(UUID) TO authenticated;

-- 7. Restore missing profile records for existing auth users (e.g. Levie)
INSERT INTO public.profiles (id, full_name, email, role, status)
SELECT 
  au.id,
  COALESCE(au.raw_user_meta_data->>'full_name', split_part(au.email, '@', 1), 'User'),
  au.email,
  CASE 
    WHEN au.raw_user_meta_data->>'role' = 'admin' THEN 'admin'
    WHEN au.raw_user_meta_data->>'role' IN ('staff', 'operator') THEN 'staff'
    ELSE 'student'
  END,
  'active'
FROM auth.users au
LEFT JOIN public.profiles p ON p.id = au.id
WHERE p.id IS NULL;

-- 8. Synchronize auth.users metadata with profiles.role for all existing accounts
UPDATE auth.users au
SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('role', p.role)
FROM public.profiles p
WHERE au.id = p.id;

-- ==============================================================================
-- INSTRUCTIONS TO MAKE YOUR ACCOUNT ADMIN:
-- If your current account is not yet admin, replace with your email and run:
-- UPDATE public.profiles SET role = 'admin' WHERE email = 'your-email@example.com';
-- ==============================================================================


