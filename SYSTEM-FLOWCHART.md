# Printer Job Scheduler — System Flow Chart

```mermaid
flowchart TD
    Visitor([Visitor]) --> App[React application]
    App --> Auth{Authenticated?}
    Auth -- No --> Login[Login or register]
    Login --> SupabaseAuth[Supabase Auth]
    SupabaseAuth --> Profile[Load or create profile]
    Profile --> Active{Account active?}
    Active -- No --> Blocked[Sign out and show account status message]
    Active -- Yes --> Role{Profile role}
    Auth -- Yes --> Role

    Role -- Student --> Student[Student dashboard]
    Role -- Staff or operator --> Staff[Staff dashboard]
    Role -- Admin --> Admin[Admin dashboard]

    Student --> Request[Submit print request]
    Request --> Validate{Request details valid?}
    Validate -- No --> RequestError[Show validation error]
    RequestError --> Request
    Validate -- Yes --> HasFiles{Documents selected?}
    HasFiles -- Yes --> FileCheck[Validate file type and size]
    FileCheck --> FileValid{Files valid?}
    FileValid -- No --> UploadError[Show file error]
    UploadError --> Request
    FileValid -- Yes --> Upload[Upload documents to Supabase Storage]
    HasFiles -- No --> JobData
    Upload --> UploadOK{Upload successful?}
    UploadOK -- No --> SubmitError[Show submission error]
    UploadOK -- Yes --> JobData[Build print job details]
    JobData --> Insert[Insert print_jobs row with Pending status]
    Insert --> InsertOK{Database insert successful?}
    InsertOK -- No --> SubmitError
    InsertOK -- Yes --> StudentJobs[Student views or manages own requests]

    Insert --> Queue[Print job queue in Supabase]
    Queue --> FCFS[Sort pending jobs by submitted_at]
    FCFS --> StaffQueue[Staff queue]
    Queue --> AdminQueue[Admin queue monitor: read-only]
    Queue -. Realtime database changes .-> StaffQueue
    Queue -. Realtime database changes .-> AdminQueue

    Staff --> StaffQueue
    StaffQueue --> NextJob[Staff selects next pending job]
    NextJob --> Start[Set status to Printing]
    Start --> PrintWork[Print job]
    PrintWork --> Finished{Printing finished?}
    Finished -- Yes --> Complete[Set status to Completed]
    Finished -- No --> Cancel[Set status to Cancelled]
    Complete --> Queue
    Cancel --> Queue
    StaffQueue --> CancelPending[Cancel pending job]
    CancelPending --> Cancel

    Admin --> AdminTools[Manage users, staff, jobs, and queue]
    AdminTools --> Queue

    SupabaseAuth -. Session and identity .-> Policies[Supabase row-level security]
    Profile -. Role and ownership .-> Policies
    StudentJobs -. Own jobs only .-> Policies
    StaffQueue -. Staff job access .-> Policies
    AdminTools -. Admin access .-> Policies
    Policies --> Database[(Supabase PostgreSQL)]
    Insert --> Database
    Start --> Database
    Complete --> Database
    Cancel --> Database
    Upload --> Storage[(Supabase Storage: print-documents)]
```

## Key behavior

- Unauthenticated visitors are sent to login. After authentication, the profile role determines the dashboard; inactive or deleted non-admin accounts are signed out.
- Students submit print details and may attach documents. Files are validated and uploaded before a `Pending` job is inserted.
- Pending jobs are ordered by submission time (first-come, first-served). Staff can move jobs from `Pending` to `Printing` or `Cancelled`, then from `Printing` to `Completed` or `Cancelled`.
- Staff and admin queue screens refresh from Supabase Realtime changes. Admin queue monitoring is read-only; admin tools also support user, staff, and job management.
- Supabase Auth, PostgreSQL row-level security, and Storage provide identity, role/ownership-based data access, and document storage.
