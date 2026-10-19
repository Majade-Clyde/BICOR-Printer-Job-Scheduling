-- ==============================================================================
-- CAMPUS PRINTHUB - SUPABASE DATABASE SCHEMA & POLICIES
-- ==============================================================================
-- Run this complete script in your Supabase SQL Editor (Dashboard -> SQL Editor)

-- 1. Create PROFILES table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('student', 'operator')) DEFAULT 'student',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 2. Create PRINT_JOBS table
CREATE TABLE IF NOT EXISTS public.print_jobs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  student_name TEXT NOT NULL,
  email TEXT NOT NULL,
  document_name TEXT NOT NULL,
  pages INTEGER NOT NULL CHECK (pages > 0),
  copies INTEGER NOT NULL CHECK (copies > 0),
  paper_size TEXT NOT NULL DEFAULT 'Short (8.5 × 11 inches)',
  color BOOLEAN NOT NULL DEFAULT false,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  status TEXT NOT NULL CHECK (status IN ('Pending', 'Printing', 'Completed', 'Cancelled')) DEFAULT 'Pending'
);

-- 3. Indexes for fast FCFS queue ordering and user lookups
CREATE INDEX IF NOT EXISTS idx_print_jobs_queue ON public.print_jobs (status, submitted_at ASC);
CREATE INDEX IF NOT EXISTS idx_print_jobs_user ON public.print_jobs (user_id);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_jobs ENABLE ROW LEVEL SECURITY;

-- 5. Helper security function to safely test if user is an operator without recursion
CREATE OR REPLACE FUNCTION public.is_operator()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'operator'
  );
$$;

-- 6. POLICIES FOR profiles
-- Allow users to view their own profile
CREATE POLICY "Users can read own profile"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Allow operators to view all profiles
CREATE POLICY "Operators can read all profiles"
  ON public.profiles
  FOR SELECT
  USING (public.is_operator());

-- Allow users to insert their initial profile upon registration
CREATE POLICY "Users can insert own profile"
  ON public.profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id AND role = 'student');

-- Allow users to update their own profile (cannot change role directly)
CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 7. POLICIES FOR print_jobs
-- Students can read their own print jobs
CREATE POLICY "Students can read own print jobs"
  ON public.print_jobs
  FOR SELECT
  USING (auth.uid() = user_id);

-- Operators can read all print jobs
CREATE POLICY "Operators can read all print jobs"
  ON public.print_jobs
  FOR SELECT
  USING (public.is_operator());

-- Students can insert their own print jobs
CREATE POLICY "Students can create print jobs"
  ON public.print_jobs
  FOR INSERT
  WITH CHECK (auth.uid() = user_id AND status = 'Pending');

-- Students can cancel their own jobs only when status is Pending
CREATE POLICY "Students can cancel pending print jobs"
  ON public.print_jobs
  FOR UPDATE
  USING (auth.uid() = user_id AND status = 'Pending')
  WITH CHECK (auth.uid() = user_id AND status = 'Cancelled');

-- Operators can update print job statuses
CREATE POLICY "Operators can update print jobs"
  ON public.print_jobs
  FOR UPDATE
  USING (public.is_operator())
  WITH CHECK (public.is_operator());

-- 8. Enable Realtime broadcast on print_jobs for instant queue synchronization
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'print_jobs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.print_jobs;
  END IF;
END $$;

-- 9. Automatic Profile Creation Trigger
-- Whenever a user registers in auth.users, create their profile automatically
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    'student'
  )
  ON CONFLICT (id) DO UPDATE
  SET full_name = EXCLUDED.full_name,
      email = EXCLUDED.email;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

