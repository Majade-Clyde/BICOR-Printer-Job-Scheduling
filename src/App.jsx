import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import ProtectedRoute from './components/ProtectedRoute';
import Loading from './components/Loading';

// Auth Pages
import Login from './pages/Login';
import Register from './pages/Register';

// Student Pages
import StudentDashboard from './pages/student/StudentDashboard';
import SubmitPrintRequest from './pages/student/SubmitPrintRequest';
import MyRequests from './pages/student/MyRequests';
import StudentProfile from './pages/student/StudentProfile';

// Staff Pages
import StaffDashboard from './pages/staff/StaffDashboard';
import StaffQueue from './pages/staff/StaffQueue';
import StaffPrintRequests from './pages/staff/StaffPrintRequests';
import StaffCompleted from './pages/staff/StaffCompleted';
import StaffProfile from './pages/staff/StaffProfile';

// Admin Pages
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminUsers from './pages/admin/AdminUsers';
import AdminStaff from './pages/admin/AdminStaff';
import AdminPrintJobs from './pages/admin/AdminPrintJobs';
import AdminQueue from './pages/admin/AdminQueue';
import AdminProfile from './pages/admin/AdminProfile';

// Layout wrapper for authenticated views
const AppLayout = ({ children }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const { user } = useAuth();
  const location = useLocation();

  const isAuthPage = location.pathname === '/login' || location.pathname === '/register';

  return (
    <div className={`app-shell ${user ? 'app-shell-logged-in' : 'app-shell-guest'}`}>
      {user && (
        <Sidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        />
      )}
      <div className="app-main-column">
        {!isAuthPage && (
          <Navbar
            onToggleSidebar={() => setIsSidebarOpen(prev => !prev)}
            isSidebarOpen={isSidebarOpen}
          />
        )}
        <main className={`app-main ${!user ? 'app-main-auth' : ''} ${isAuthPage ? 'app-main-auth-centered' : ''}`}>
          {children}
        </main>
      </div>
    </div>
  );
};

// Root redirector based on role
const RootRedirect = () => {
  const { user, role, loading } = useAuth();

  if (loading) {
    return <Loading message="Starting Printing Job Scheduler..." />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (role === 'admin') return <Navigate to="/admin/dashboard" replace />;
  if (role === 'staff' || role === 'operator') return <Navigate to="/staff/dashboard" replace />;
  return <Navigate to="/student/dashboard" replace />;
};

function App() {
  return (
    <AuthProvider>
      <Router basename={import.meta.env.BASE_URL}>
        <AppLayout>
          <Routes>
            {/* Public Auth Routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            {/* ========================
                STUDENT ROUTES
            ======================== */}
            <Route
              path="/student/dashboard"
              element={
                <ProtectedRoute allowedRoles={['student']}>
                  <StudentDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/student/submit-request"
              element={
                <ProtectedRoute allowedRoles={['student']}>
                  <SubmitPrintRequest />
                </ProtectedRoute>
              }
            />
            <Route
              path="/student/my-requests"
              element={
                <ProtectedRoute allowedRoles={['student']}>
                  <MyRequests />
                </ProtectedRoute>
              }
            />
            <Route
              path="/student/profile"
              element={
                <ProtectedRoute allowedRoles={['student']}>
                  <StudentProfile />
                </ProtectedRoute>
              }
            />

            {/* ========================
                STAFF ROUTES
            ======================== */}
            <Route
              path="/staff/dashboard"
              element={
                <ProtectedRoute allowedRoles={['staff', 'operator']}>
                  <StaffDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/staff/queue"
              element={
                <ProtectedRoute allowedRoles={['staff', 'operator']}>
                  <StaffQueue />
                </ProtectedRoute>
              }
            />
            <Route
              path="/staff/print-requests"
              element={
                <ProtectedRoute allowedRoles={['staff', 'operator']}>
                  <StaffPrintRequests />
                </ProtectedRoute>
              }
            />
            <Route
              path="/staff/completed"
              element={
                <ProtectedRoute allowedRoles={['staff', 'operator']}>
                  <StaffCompleted />
                </ProtectedRoute>
              }
            />
            <Route
              path="/staff/profile"
              element={
                <ProtectedRoute allowedRoles={['staff', 'operator']}>
                  <StaffProfile />
                </ProtectedRoute>
              }
            />

            {/* ========================
                ADMIN ROUTES
            ======================== */}
            <Route
              path="/admin/dashboard"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/users"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminUsers />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/staff"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminStaff />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/print-jobs"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminPrintJobs />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/queue"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminQueue />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/profile"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminProfile />
                </ProtectedRoute>
              }
            />

            {/* Legacy route redirects */}
            <Route path="/student" element={<Navigate to="/student/dashboard" replace />} />
            <Route path="/student/jobs" element={<Navigate to="/student/my-requests" replace />} />
            <Route path="/student/submit" element={<Navigate to="/student/submit-request" replace />} />
            <Route path="/operator" element={<Navigate to="/staff/dashboard" replace />} />

            {/* Root & Fallback */}
            <Route path="/" element={<RootRedirect />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppLayout>
      </Router>
    </AuthProvider>
  );
}

export default App;
