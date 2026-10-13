-- ==============================================================================
-- SUPABASE STORAGE & PRINT_JOBS FILE UPLOAD MIGRATION
-- ==============================================================================
-- Run this in your Supabase Dashboard -> SQL Editor
-- This adds file attachment columns to print_jobs and configures the 'print-documents' bucket.
-- ==============================================================================

-- 1. Ensure file metadata columns exist on public.print_jobs
ALTER TABLE public.print_jobs ADD COLUMN IF NOT EXISTS file_path TEXT DEFAULT NULL;
ALTER TABLE public.print_jobs ADD COLUMN IF NOT EXISTS file_size BIGINT DEFAULT NULL;
ALTER TABLE public.print_jobs ADD COLUMN IF NOT EXISTS file_type TEXT DEFAULT NULL;
ALTER TABLE public.print_jobs ADD COLUMN IF NOT EXISTS file_url TEXT DEFAULT NULL;

-- 2. Create the storage bucket 'print-documents' (20MB limit, print-ready document formats)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'print-documents',
  'print-documents',
  true,
  20971520, -- 20 MB in bytes
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'image/jpeg',
    'image/png'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 20971520;

-- 3. Storage Policies (RLS on storage.objects)
DROP POLICY IF EXISTS "Users can upload own print documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users and staff can view print documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own print documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated uploads to print-documents" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated access to print-documents" ON storage.objects;

-- Policy: Allow authenticated users to upload files to print-documents bucket
CREATE POLICY "Users can upload own print documents"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'print-documents');

-- Policy: Allow authenticated users, staff, and admin to read print documents
CREATE POLICY "Authenticated users and staff can view print documents"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'print-documents');

-- Policy: Allow authenticated users to delete their own uploaded documents
CREATE POLICY "Users can delete own print documents"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'print-documents');
