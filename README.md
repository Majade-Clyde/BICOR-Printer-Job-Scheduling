# 🖨️ BICOR PrintHub - Printer Job Scheduling System

An automated, school-wide **Printer Job Scheduling System** built with **React**, **Vite**, and **Supabase**. The system enables multiple students to queue print jobs to a single shared school printer using strict **First-Come, First-Served (FCFS)** scheduling, while empowering campus print operators to monitor the live queue, process jobs, and maintain print statistics.

---

## 📌 Table of Contents
1. [Project Overview](#project-overview)
2. [Technologies Used](#technologies-used)
3. [System Architecture & Concept](#system-architecture--concept)
4. [Project Directory Structure](#project-directory-structure)
5. [Prerequisites](#prerequisites)
6. [Step-by-Step Setup Guide](#step-by-step-setup-guide)
   - [Step 1: Install Dependencies](#step-1-install-dependencies)
   - [Step 2: Create Supabase Project](#step-2-create-supabase-project)
   - [Step 3: Run Database SQL & Setup RLS](#step-3-run-database-sql--setup-rls)
   - [Step 4: Configure Environment Variables (.env)](#step-4-configure-environment-variables-env)
   - [Step 5: Start the Development Server](#step-5-start-the-development-server)
7. [User Accounts & Authentication Workflow](#user-accounts--authentication-workflow)
   - [Creating a Student Account](#creating-a-student-account)
   - [Creating an Operator Account](#creating-an-operator-account)
8. [First-Come, First-Served (FCFS) Queue Logic](#first-come-first-served-fcfs-queue-logic)
9. [How to Test the System](#how-to-test-the-system)
10. [Troubleshooting & FAQ](#troubleshooting--faq)

---

## 🚀 Project Overview

In busy school environments, students frequently need to print assignments, research papers, and lab reports on shared printers. Without an automated queue, disputes over priority and lost documents are common.

**PrintHub** solves this by:
* Providing a self-service web portal for students to submit print jobs with document specifications (number of pages, copies, and color mode).
* Enforcing strict **First-Come, First-Served (FCFS)** scheduling based on `submitted_at ASC`.
* Calculating dynamic queue positions (`Queue #1`, `Queue #2`, etc.) in real time.
* Giving station operators complete control to progress jobs through valid states: `Pending → Printing → Completed` or `Cancelled`.
* Isolating student data via **Supabase Row Level Security (RLS)** so students only see their own print history while operators manage the entire print room.

---

## 🛠️ Technologies Used

* **Frontend**: [React 18](https://react.dev/)
* **Build Tool & Dev Server**: [Vite](https://vitejs.dev/)
* **Routing**: [React Router DOM v6](https://reactrouter.com/)
* **Backend as a Service**: [Supabase](https://supabase.com/)
  * **Supabase Authentication**: Secure email & password auth with session persistence.
  * **PostgreSQL Database**: Relational schema with foreign keys, constraints, and timestamps.
  * **Row Level Security (RLS)**: Fine-grained access control on database tables.
  * **Supabase Realtime**: Instant synchronization of queue updates without manual polling.
* **Styling**: Pure Vanilla CSS with modern custom design system tokens (responsive across mobile, tablet, and desktop).
* **Icons**: [Lucide React](https://lucide.dev/)

---

## ⚙️ System Architecture & Concept

```
[ Student / Operator Browser ]
             │
             ▼
     [ React + Vite App ]
    ┌────────────────────┐
    │  Auth Context      │  <── Supabase Auth (JWT session)
    │  Role-based Router │
    │  FCFS Queue Engine │
    └─────────┬──────────┘
              │ (HTTPS & WebSocket)
              ▼
      [ Supabase Cloud ]
    ┌──────────────────────────────────────────────┐
    │ PostgreSQL with Row Level Security (RLS)     │
    │ ├── profiles (id, full_name, email, role)    │
    │ └── print_jobs (FCFS queue, status, specs)   │
    │                                              │
    │ Realtime Publication (Postgres Changes)     │
    └──────────────────────────────────────────────┘
```

---

## 📂 Project Directory Structure

```text
printer-job-scheduler/
│
├── public/
│   └── printer-icon.svg             # Application favicon
│
├── src/
│   ├── components/
│   │   ├── Navbar.jsx               # Top header with user badge & logout
│   │   ├── Sidebar.jsx              # Responsive navigation sidebar
│   │   ├── ProtectedRoute.jsx       # Role-based route guard
│   │   ├── StatCard.jsx             # Metric summary card
│   │   ├── StatusBadge.jsx          # Color-coded badges (Pending/Printing/Completed/Cancelled)
│   │   ├── PrintJobTable.jsx        # Dynamic queue table for student & operator
│   │   ├── PrintJobForm.jsx         # Print job submission form with validation
│   │   ├── Loading.jsx              # Loading spinner component
│   │   └── ErrorMessage.jsx         # User-friendly error alert component
│   │
│   ├── context/
│   │   └── AuthContext.jsx          # User state, login, register, and profile manager
│   │
│   ├── lib/
│   │   └── supabase.js              # Supabase client initialization & connection check
│   │
│   ├── pages/
│   │   ├── Login.jsx                # Login page with role-aware redirection
│   │   ├── Register.jsx             # Student sign-up page
│   │   ├── StudentDashboard.jsx     # Student overview, stats, and recent jobs
│   │   ├── SubmitPrintJob.jsx       # Job submission page with guidelines
│   │   ├── MyJobs.jsx               # Full student history with search & filter
│   │   └── OperatorDashboard.jsx    # Live FCFS Queue, print controls & stats
│   │
│   ├── App.jsx                      # App root with router & layout
│   ├── main.jsx                     # Vite React entry point
│   └── index.css                    # Clean school-system styling
│
├── .env                             # Active environment variables (git-ignored)
├── .env.example                     # Environment template
├── package.json                     # Project scripts and dependencies
├── supabase-schema.sql              # Complete PostgreSQL schema & RLS policies
├── vite.config.js                   # Vite configuration
└── README.md                        # Documentation
```

---

## 📋 Prerequisites

* **Node.js**: Version 18.x or newer (check with `node -v`)
* **npm**: Version 9.x or newer (check with `npm -v`)
* A free **[Supabase](https://supabase.com/)** account

---

## 📖 Step-by-Step Setup Guide

### Step 1: Install Dependencies

From the project root folder (`printer-job-scheduler`), run:

```bash
npm install
```

---

### Step 2: Create Supabase Project

1. Log into your [Supabase Dashboard](https://supabase.com/dashboard).
2. Click **"New project"**.
3. Choose an organization, enter a name (e.g., `school-printer-scheduler`), set a database password, and choose a region close to you.
4. Click **"Create new project"** and wait about 1-2 minutes for the database to spin up.
5. In your Supabase dashboard, navigate to **Project Settings** (gear icon at the bottom left) → **API**.
6. Note your:
   * **Project URL** (e.g. `https://xyzcompany.supabase.co`)
   * **anon / public key** (a long string starting with `eyJ...`)

> [!TIP]
> **Disable Email Confirmation for Testing (Recommended)**:
> In the Supabase Dashboard, go to **Authentication** → **Providers** → **Email**, and uncheck **"Confirm email"**. Click **Save**. This allows newly registered student accounts to log in immediately without waiting for an email confirmation link.

---

### Step 3: Run Database SQL & Setup RLS

Open the Supabase **SQL Editor** tab in your dashboard, paste the entire contents of [`supabase-schema.sql`](file:///c:/Users/Clyde/OneDrive/Desktop/printer-job-scheduler/supabase-schema.sql), and click **Run**.

```sql
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
CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Operators can read all profiles"
  ON public.profiles FOR SELECT
  USING (public.is_operator());

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id AND role = 'student');

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 7. POLICIES FOR print_jobs
CREATE POLICY "Students can read own print jobs"
  ON public.print_jobs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Operators can read all print jobs"
  ON public.print_jobs FOR SELECT
  USING (public.is_operator());

CREATE POLICY "Students can create print jobs"
  ON public.print_jobs FOR INSERT
  WITH CHECK (auth.uid() = user_id AND status = 'Pending');

CREATE POLICY "Students can cancel pending print jobs"
  ON public.print_jobs FOR UPDATE
  USING (auth.uid() = user_id AND status = 'Pending')
  WITH CHECK (auth.uid() = user_id AND status = 'Cancelled');

CREATE POLICY "Operators can update print jobs"
  ON public.print_jobs FOR UPDATE
  USING (public.is_operator())
  WITH CHECK (public.is_operator());

-- 8. Enable Realtime broadcast on print_jobs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'print_jobs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.print_jobs;
  END IF;
END $$;
```

---

### Step 4: Configure Environment Variables (.env)

Edit the `.env` file in the project root:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

* Replace `https://your-project-ref.supabase.co` with your Project URL.
* Replace `your-supabase-anon-key` with your anon / public key.

---

### Step 5: Start the Development Server

Start the local server by running:

```bash
npm run dev
```

Open your browser and navigate to:
```text
http://localhost:5173
```

---

## 👥 User Accounts & Authentication Workflow

### Creating a Student Account

1. Open `http://localhost:5173/register`.
2. Fill in:
   * **Full Name**: e.g., `Maria Santos`
   * **School Email**: e.g., `maria.santos@school.edu`
   * **Password**: Minimum 6 characters
   * **Confirm Password**: Matches password
3. Click **"Register"**.
4. The system automatically creates the Supabase auth user, sets their profile role to `student`, and redirects them to the **Student Dashboard** (`/student`).

---

### Creating an Operator Account

For security, the public registration page **only registers student accounts**. It does not allow users to select "Operator" from the client.

To make an account an **Operator**:

1. **Register the user** through `http://localhost:5173/register` (e.g. email `operator@school.edu`, Full Name `Admin Operator`).
2. Log in to your [Supabase Dashboard](https://supabase.com/dashboard).
3. Navigate to the **Table Editor** → select the **`profiles`** table.
4. Locate the row with the user's email (`operator@school.edu`).
5. Double-click on the `role` cell and change its value from `student` to **`operator`**.
6. Save the row.
7. Next time that user logs in at `http://localhost:5173/login`, the system will identify them as an `operator` and automatically route them to the **Operator Dashboard** (`/operator`).

*(Alternatively, run this one-line SQL query in the Supabase SQL Editor)*:
```sql
UPDATE public.profiles
SET role = 'operator'
WHERE email = 'operator@school.edu';
```

---

## ⚡ First-Come, First-Served (FCFS) Queue Logic

The printer uses pure **First-Come, First-Served (FCFS)** scheduling:

1. **Order of Arrival**: When a job is submitted, its `submitted_at` timestamp is recorded.
2. **Pending Queue Sorting**: The operator dashboard and student views fetch and sort pending jobs using:
   ```javascript
   .from('print_jobs')
   .select('*')
   .eq('status', 'Pending')
   .order('submitted_at', { ascending: true })
   ```
3. **Dynamic Queue Numbers**:
   Queue numbers are **never hardcoded** in the database. Instead, they are dynamically assigned (`1, 2, 3...`) based on the current sorted list of pending jobs.
   * Example:
     * Job 1: `Maria - Report.pdf` (8:01 AM) → **Queue #1**
     * Job 2: `Kyle - Project.pdf` (8:03 AM) → **Queue #2**
     * Job 3: `John - Thesis.pdf` (8:05 AM) → **Queue #3**
   * If `Maria`'s job starts printing or is completed, `Kyle` automatically advances to **Queue #1**, and `John` advances to **Queue #2**.
4. **Valid State Transitions**:
   * `Pending → Printing` (Operator clicks "Start Printing")
   * `Pending → Cancelled` (Student or Operator cancels)
   * `Printing → Completed` (Operator clicks "Complete Job")
   * `Printing → Cancelled` (Operator cancels)
   * `Completed` and `Cancelled` are terminal states and cannot be reverted to Pending.

---

## 🧪 How to Test the System

To see the complete workflow in action:

1. **Set Up Two Browser Windows**:
   * Window A (Regular Window): Open `http://localhost:5173/login`
   * Window B (Incognito/Private Window): Open `http://localhost:5173/login`

2. **Register a Student Account** (Window A):
   * Go to `/register` and create `student1@school.edu`.
   * Submit 2 print jobs from `/student/submit`:
     * Job 1: `Assignment_1.pdf`, 5 pages, 1 copy, B&W
     * Job 2: `Research_Poster.pdf`, 2 pages, 3 copies, Color
   * Check `/student/jobs` to see Job 1 as `Queue #1` and Job 2 as `Queue #2`.

3. **Register a Second Student Account** (Window B):
   * Register `student2@school.edu`.
   * Submit a job: `Lab_Report.pdf`, 10 pages, 1 copy, B&W.
   * Notice that `student2`'s job is placed as `Queue #3` in the global campus queue.

4. **Log in as Operator** (In one of the windows):
   * Upgrade an account to `operator` in Supabase (see instructions above).
   * Log into that account.
   * Notice that the **Current Print Queue** shows:
     1. `Assignment_1.pdf` (Student 1) - Next to process
     2. `Research_Poster.pdf` (Student 1)
     3. `Lab_Report.pdf` (Student 2)
   * Click **"Start Printing"** on Job 1. Its status transitions to `Printing`.
   * Observe how Job 2 instantly moves to `Queue #1`.
   * Click **"Complete Job"** on Job 1. Its status transitions to `Completed`.
   * Check Window A/B — the student screens immediately update to reflect the status change.

5. **Test Student Cancellation**:
   * In a student window, find a job that is still `Pending` and click **"Cancel"**.
   * The job transitions to `Cancelled` (red badge).
   * Note that once a job is `Printing` or `Completed`, the student cannot cancel it.

---

## ❓ Troubleshooting & FAQ

* **Issue: "Invalid login credentials"**
  * Verify that you typed the email and password accurately. If email confirmation is enabled in your Supabase project, make sure you confirmed the link sent to your inbox.
* **Issue: Student cannot access `/operator`**
  * This is intended security behavior. The `ProtectedRoute` redirects any non-operator back to `/student`.
* **Issue: Realtime changes not updating automatically**
  * Check that step 8 in the SQL script (`ALTER PUBLICATION supabase_realtime ADD TABLE public.print_jobs;`) was executed in Supabase. You can also click the manual **"Refresh"** button at any time.
#   B I C O R - P r i n t e r - J o b - S c h e d u l i n g  
 