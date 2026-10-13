-- ==============================================================================
-- FIX STUDENT EDIT & DELETE RLS POLICIES FOR PRINT_JOBS
-- ==============================================================================
-- Run this script in your Supabase Dashboard -> SQL Editor (or migrations).
--
-- ROOT CAUSE OF "Unable to update print request":
-- The table "print_jobs" only had an UPDATE policy for students named:
--   "Students can cancel pending print jobs"
-- with:
--   USING (auth.uid() = user_id AND status = 'Pending')
--   WITH CHECK (auth.uid() = user_id AND status = 'Cancelled');
--
-- When a student clicked "Save Changes" in the Edit Print Request modal,
-- the status remained 'Pending'. Postgres evaluated the WITH CHECK clause,
-- found that status <> 'Cancelled', and rejected the transaction with:
--   Postgres error 42501: "new row violates row-level security policy for table 'print_jobs'".
--
-- In addition, no DELETE policy existed for students to delete their own pending jobs.
-- ==============================================================================

-- 1. Ensure required columns exist on public.print_jobs
ALTER TABLE public.print_jobs ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now());
ALTER TABLE public.print_jobs ADD COLUMN IF NOT EXISTS print_type TEXT DEFAULT 'standard';
ALTER TABLE public.print_jobs ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';

-- 2. Drop any previous conflicting versions of student update/delete policies
DROP POLICY IF EXISTS "Students can edit own pending print jobs" ON public.print_jobs;
DROP POLICY IF EXISTS "Students can update own pending print jobs" ON public.print_jobs;
DROP POLICY IF EXISTS "Students can cancel pending print jobs" ON public.print_jobs;
DROP POLICY IF EXISTS "Students can delete own pending print jobs" ON public.print_jobs;

-- 3. Policy: Students can EDIT their own pending print requests
--    Enforces that the user is the owner, the job is 'Pending', and the status remains 'Pending'
CREATE POLICY "Students can edit own pending print jobs"
  ON public.print_jobs
  FOR UPDATE
  USING (
    auth.uid() = user_id
    AND status = 'Pending'
  )
  WITH CHECK (
    auth.uid() = user_id
    AND status = 'Pending'
  );

-- 4. Policy: Students can CANCEL their own pending print requests (sets status to 'Cancelled')
CREATE POLICY "Students can cancel pending print jobs"
  ON public.print_jobs
  FOR UPDATE
  USING (
    auth.uid() = user_id
    AND status = 'Pending'
  )
  WITH CHECK (
    auth.uid() = user_id
    AND status = 'Cancelled'
  );

-- 5. Policy: Students can DELETE their own pending print requests
CREATE POLICY "Students can delete own pending print jobs"
  ON public.print_jobs
  FOR DELETE
  USING (
    auth.uid() = user_id
    AND status = 'Pending'
  );

-- 6. Trigger to automatically refresh updated_at on print_jobs update
CREATE OR REPLACE FUNCTION public.handle_print_job_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_print_jobs_updated_at ON public.print_jobs;
CREATE TRIGGER trigger_print_jobs_updated_at
  BEFORE UPDATE ON public.print_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_print_job_updated_at();
