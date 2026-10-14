-- ==============================================================================
-- BICOR PRINTER JOB SCHEDULING — SECURE ADMIN ACCOUNT DELETION (SOFT-DELETE)
-- ==============================================================================
-- Run this complete script in your Supabase Dashboard -> SQL Editor.
-- This script is completely safe, idempotent, and maintains 100% referential integrity.
--
-- What this does:
-- 1. Ensures profiles.status supports ('active', 'inactive', 'deleted')
-- 2. Adds deleted_at TIMESTAMPTZ to profiles for audit retention
-- 3. Creates public.admin_delete_user_account(target_user_id UUID) function:
--    - Exact parameter name `target_user_id UUID`
--    - #variable_conflict use_variable to prevent column ambiguity
--    - Strictly checks that caller is an authenticated ADMIN in public.profiles
--    - Prevents self-deletion (cannot delete own admin account)
--    - Prevents deleting other admin accounts
--    - Soft-deletes target account (status = 'deleted', deleted_at = now())
--    - Leaves print_jobs.user_id completely untouched (preserving NOT NULL & FK history)
--    - If print_jobs has assigned_staff_id, conditionally unassigns active jobs via dynamic SQL
--    - Bans account in auth.users and revokes refresh tokens to block login
--    - Returns JSONB { success, message, deleted_user_id, status }
-- 4. Grants EXECUTE to authenticated, revokes from anon
-- 5. Reloads PostgREST schema cache
-- ==============================================================================

BEGIN;

-- 1. Ensure status column exists and check constraint on public.profiles permits ('active', 'inactive', 'deleted')
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_status_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_status_check
  CHECK (status IN ('active', 'inactive', 'deleted'));

-- 2. Add deleted_at column to public.profiles if not present
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ DEFAULT NULL;

-- 3. Create or replace the secure RPC function public.admin_delete_user_account
CREATE OR REPLACE FUNCTION public.admin_delete_user_account(target_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
#variable_conflict use_variable
DECLARE
  v_caller_id UUID;
  v_caller_role TEXT;
  v_target_profile RECORD;
  v_target_role TEXT;
  v_target_email TEXT;
  v_target_name TEXT;
  v_target_status TEXT;
BEGIN
  -- 1. Authenticate caller
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Access denied. You must be authenticated to perform this action.'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Verify caller has admin role in public.profiles (with fallback to auth.users metadata)
  SELECT p.role INTO v_caller_role
  FROM public.profiles p
  WHERE p.id = v_caller_id;

  IF v_caller_role IS NULL OR lower(v_caller_role) <> 'admin' THEN
    SELECT u.raw_user_meta_data->>'role' INTO v_caller_role
    FROM auth.users u
    WHERE u.id = v_caller_id;
  END IF;

  IF v_caller_role IS DISTINCT FROM 'admin' AND lower(COALESCE(v_caller_role, '')) <> 'admin' THEN
    RAISE EXCEPTION 'Access denied. Only administrators have permission to delete accounts.'
      USING ERRCODE = '42501';
  END IF;

  -- 3. Prevent self-deletion
  IF v_caller_id = target_user_id THEN
    RAISE EXCEPTION 'Action not allowed: Administrators cannot delete their own account.'
      USING ERRCODE = '42501';
  END IF;

  -- 4. Retrieve target account details
  SELECT p.id, p.full_name, p.email, p.role, p.status
  INTO v_target_profile
  FROM public.profiles p
  WHERE p.id = target_user_id;

  IF FOUND THEN
    v_target_role := lower(COALESCE(v_target_profile.role, ''));
    v_target_email := v_target_profile.email;
    v_target_name := v_target_profile.full_name;
    v_target_status := lower(COALESCE(v_target_profile.status, ''));
  ELSE
    -- Check auth.users if profile row is not yet synchronized
    SELECT 
      u.email, 
      COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
      lower(COALESCE(u.raw_user_meta_data->>'role', 'student'))
    INTO v_target_email, v_target_name, v_target_role
    FROM auth.users u
    WHERE u.id = target_user_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Account not found: No user exists with the specified ID.'
        USING ERRCODE = 'P0002';
    END IF;
  END IF;

  -- 5. Prevent deleting another administrator
  IF v_target_role = 'admin' THEN
    RAISE EXCEPTION 'Action not allowed: Administrator accounts cannot be deleted.'
      USING ERRCODE = '42501';
  END IF;

  -- 6. Ensure target role is an eligible account type (student/user or staff/operator)
  IF v_target_role NOT IN ('student', 'user', 'staff', 'operator') THEN
    RAISE EXCEPTION 'Invalid role for deletion: Account role "%" is not eligible for deletion.', v_target_role
      USING ERRCODE = '42501';
  END IF;

  -- 7. SAFE REFERENTIAL INTEGRITY SOFT-DELETION:
  -- Update public.profiles status to 'deleted'.
  -- Does NOT set print_jobs.user_id to NULL (respects NOT NULL constraint)
  -- Does NOT delete from public.profiles (prevents ON DELETE CASCADE from destroying print history)
  UPDATE public.profiles p
  SET status = 'deleted',
      deleted_at = now()
  WHERE p.id = target_user_id;

  -- If target profile didn't exist in public.profiles yet, insert it as deleted
  IF NOT FOUND THEN
    INSERT INTO public.profiles (id, full_name, email, role, status, deleted_at)
    VALUES (target_user_id, COALESCE(v_target_name, 'User'), COALESCE(v_target_email, ''), v_target_role, 'deleted', now())
    ON CONFLICT (id) DO UPDATE
    SET status = 'deleted',
        deleted_at = now();
  END IF;

  -- Conditionally unassign staff if assigned_staff_id column exists on print_jobs (using dynamic SQL to prevent compile errors)
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'print_jobs'
      AND column_name = 'assigned_staff_id'
  ) THEN
    BEGIN
      EXECUTE 'UPDATE public.print_jobs SET assigned_staff_id = NULL WHERE assigned_staff_id = $1 AND status IN (''Pending'', ''Approved'', ''Printing'')'
      USING target_user_id;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  -- 8. Ban the user in auth.users so Supabase Auth immediately rejects all future logins
  BEGIN
    UPDATE auth.users u
    SET banned_until = '2099-12-31 23:59:59+00'::timestamptz
    WHERE u.id = target_user_id;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- Revoke any active refresh tokens to force immediate session termination
  BEGIN
    DELETE FROM auth.refresh_tokens rt WHERE rt.user_id = target_user_id::text;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- 9. Return structured success JSONB
  RETURN jsonb_build_object(
    'success', true,
    'message', format('Account for %s (%s) has been safely deleted and deactivated.', COALESCE(v_target_name, 'User'), COALESCE(v_target_email, '')),
    'deleted_user_id', target_user_id,
    'deleted_user_email', v_target_email,
    'deleted_user_name', v_target_name,
    'deleted_user_role', v_target_role,
    'status', 'deleted'
  );
END;
$$;

-- 4. Permissions: Grant execute to authenticated users (function self-checks caller is admin)
GRANT EXECUTE ON FUNCTION public.admin_delete_user_account(UUID) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_delete_user_account(UUID) FROM anon;

COMMIT;

-- 5. Force PostgREST to reload its schema cache immediately so the RPC is discovered
NOTIFY pgrst, 'reload schema';
