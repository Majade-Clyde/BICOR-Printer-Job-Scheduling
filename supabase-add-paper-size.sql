-- ==============================================================================
-- BICOR PRINTER JOB SCHEDULER - ADD PAPER SIZE COLUMN TO PRINT_JOBS TABLE
-- ==============================================================================
-- Run this script in your Supabase SQL Editor (Dashboard -> SQL Editor)
--
-- Supported paper size options:
--   1. Long (8.5 × 13 inches)
--   2. Short (8.5 × 11 inches)
--   3. A4 (210 × 297 mm)
-- ==============================================================================

-- 1. Add paper_size column to public.print_jobs if it does not already exist
ALTER TABLE public.print_jobs
  ADD COLUMN IF NOT EXISTS paper_size TEXT DEFAULT 'Short (8.5 × 11 inches)';

-- 2. Backfill existing records that may have NULL paper_size
UPDATE public.print_jobs
SET paper_size = 'Short (8.5 × 11 inches)'
WHERE paper_size IS NULL;

-- 3. Verify the column is present
DO $$
BEGIN
  RAISE NOTICE 'paper_size column successfully verified on public.print_jobs table.';
END $$;
