-- ==============================================================================
-- ALLOW ADMIN, STAFF, AND USERS TO DELETE COMPLETED & CANCELLED PRINT JOBS
-- ==============================================================================
-- Instructions: Copy and run ALL lines of this script in Supabase Dashboard -> SQL Editor.
-- (Make sure not to highlight only a portion of the text so all helper functions are created).
-- ==============================================================================

-- 1. Helper function: Check if current user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND lower(role) = 'admin'
  );
$$;

-- 2. Helper function: Check if current user is staff
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND lower(role) IN ('staff', 'operator')
  );
$$;

-- 3. Helper function: Check if current user is staff or admin
CREATE OR REPLACE FUNCTION public.is_staff_or_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND lower(role) IN ('admin', 'staff', 'operator')
  );
$$;

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_staff_or_admin() TO authenticated, anon;

-- 4. Drop any existing DELETE policies on print_jobs to avoid conflicts
DROP POLICY IF EXISTS "Students can delete own pending print jobs" ON public.print_jobs;
DROP POLICY IF EXISTS "Students can delete own print jobs" ON public.print_jobs;
DROP POLICY IF EXISTS "Staff can delete completed print jobs" ON public.print_jobs;
DROP POLICY IF EXISTS "Admin can delete any print job" ON public.print_jobs;
DROP POLICY IF EXISTS "Users can delete own completed print jobs" ON public.print_jobs;
DROP POLICY IF EXISTS "Staff and Admin can delete completed print jobs" ON public.print_jobs;

-- 5. Policy: Admin can delete any print job
CREATE POLICY "Admin can delete any print job"
  ON public.print_jobs
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND lower(role) = 'admin'
    )
  );

-- 6. Policy: Staff can delete completed and cancelled print jobs
CREATE POLICY "Staff can delete completed print jobs"
  ON public.print_jobs
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND lower(role) IN ('staff', 'operator', 'admin')
    )
    AND status IN ('Completed', 'Cancelled')
  );

-- 7. Policy: Students / Users can delete their own pending, completed, and cancelled print jobs
CREATE POLICY "Students can delete own print jobs"
  ON public.print_jobs
  FOR DELETE
  TO authenticated
  USING (
    auth.uid() = user_id
    AND status IN ('Pending', 'Completed', 'Cancelled')
  );

-- 8. Storage Policy: Allow users to delete own uploads, and staff/admins to delete print documents
DROP POLICY IF EXISTS "Users can delete own print documents" ON storage.objects;
DROP POLICY IF EXISTS "Staff and Admin can delete print documents" ON storage.objects;

CREATE POLICY "Users and Staff can delete print documents"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'print-documents'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND lower(role) IN ('admin', 'staff', 'operator')
      )
    )
  );
