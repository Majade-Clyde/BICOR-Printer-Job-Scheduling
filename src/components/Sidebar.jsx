import React, { useState, useEffect, useCallback } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import {
  LayoutDashboard,
  FilePlus,
  Files,
  GraduationCap,
  Shield,
  Users,
  UserCog,
  Printer,
  ClipboardList,
  CheckSquare,
  ListOrdered,
  Sparkles,
  User
} from 'lucide-react';

const Sidebar = ({ isOpen, onClose }) => {
  const { user, profile, role } = useAuth();
  const navigate = useNavigate();
  const [hasPendingRequests, setHasPendingRequests] = useState(false);

  const fetchPendingCount = useCallback(async () => {
    if (!isSupabaseConfigured || (role !== 'admin' && role !== 'staff')) {
      setHasPendingRequests(false);
      return;
    }
    try {
      const { count, error } = await supabase
        .from('print_jobs')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'Pending');

      if (!error) {
        setHasPendingRequests(Boolean(count && count > 0));
      }
    } catch (e) {
      console.warn('Error checking pending print requests:', e);
    }
  }, [role]);

  useEffect(() => {
    fetchPendingCount();

    if (!isSupabaseConfigured || (role !== 'admin' && role !== 'staff')) return;

    // Realtime subscription to print_jobs updates
    const channel = supabase
      .channel('sidebar-pending-requests')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'print_jobs' }, () => {
        fetchPendingCount();
      })
      .subscribe();

    const interval = setInterval(fetchPendingCount, 15000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [fetchPendingCount, role]);

  if (!user) return null;

  const getRoleIcon = () => {
    if (role === 'admin') return <Shield size={24} className="admin-icon" />;
    if (role === 'staff') return <UserCog size={24} className="staff-icon" />;
    return <GraduationCap size={24} className="student-icon" />;
  };

  const getRoleLabel = () => {
    if (role === 'admin') return 'Administrator';
    if (role === 'staff') return 'Staff';
    return 'User';
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && <div className="sidebar-backdrop" onClick={onClose}></div>}

      <aside className={`sidebar ${isOpen ? 'sidebar-open' : ''}`}>
        <div className="sidebar-brand">
          <div className="sidebar-logo-container">
            <img
              src="/bicor-logo.png"
              alt="BICOR Printer Job Scheduling Logo"
              className="sidebar-bicor-logo"
            />
          </div>
          <div className="sidebar-brand-title">PRINTER JOB SCHEDULING</div>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-section-title">Navigation</div>

          {/* ADMIN NAVIGATION */}
          {role === 'admin' && (
            <ul className="sidebar-menu">
              <li>
                <NavLink
                  to="/admin/dashboard"
                  end
                  className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                  onClick={onClose}
                >
                  <LayoutDashboard size={18} />
                  <span>Dashboard</span>
                </NavLink>
              </li>
              <li>
                <NavLink
                  to="/admin/users"
                  className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                  onClick={onClose}
                >
                  <Users size={18} />
                  <span>Manage Users</span>
                </NavLink>
              </li>
              <li>
                <NavLink
                  to="/admin/staff"
                  className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                  onClick={onClose}
                >
                  <UserCog size={18} />
                  <span>Manage Staff</span>
                </NavLink>
              </li>
              <li>
                <NavLink
                  to="/admin/print-jobs"
                  className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                  onClick={onClose}
                >
                  <ClipboardList size={18} />
                  <span>All Print Jobs</span>
                  {hasPendingRequests && <span className="nav-red-dot" title="New unreviewed print requests" />}
                </NavLink>
              </li>
              <li>
                <NavLink
                  to="/admin/queue"
                  className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                  onClick={onClose}
                >
                  <ListOrdered size={18} />
                  <span>Print Queue</span>
                </NavLink>
              </li>
              <li>
                <NavLink
                  to="/admin/profile"
                  className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                  onClick={onClose}
                >
                  <User size={18} />
                  <span>Profile</span>
                </NavLink>
              </li>
            </ul>
          )}

          {/* STAFF NAVIGATION */}
          {role === 'staff' && (
            <ul className="sidebar-menu">
              <li>
                <NavLink
                  to="/staff/dashboard"
                  end
                  className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                  onClick={onClose}
                >
                  <LayoutDashboard size={18} />
                  <span>Dashboard</span>
                </NavLink>
              </li>
              <li>
                <NavLink
                  to="/staff/queue"
                  className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                  onClick={onClose}
                >
                  <ListOrdered size={18} />
                  <span>Print Queue</span>
                </NavLink>
              </li>
              <li>
                <NavLink
                  to="/staff/print-requests"
                  className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                  onClick={onClose}
                >
                  <ClipboardList size={18} />
                  <span>Print Requests</span>
                  {hasPendingRequests && <span className="nav-red-dot" title="New unreviewed print requests" />}
                </NavLink>
              </li>
              <li>
                <NavLink
                  to="/staff/completed"
                  className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                  onClick={onClose}
                >
                  <CheckSquare size={18} />
                  <span>Completed Jobs</span>
                </NavLink>
              </li>
              <li>
                <NavLink
                  to="/staff/profile"
                  className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                  onClick={onClose}
                >
                  <User size={18} />
                  <span>Profile</span>
                </NavLink>
              </li>
            </ul>
          )}

          {/* STUDENT NAVIGATION */}
          {role === 'student' && (
            <ul className="sidebar-menu">
              <li>
                <NavLink
                  to="/student/dashboard"
                  end
                  className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                  onClick={onClose}
                >
                  <LayoutDashboard size={18} />
                  <span>Dashboard</span>
                </NavLink>
              </li>
              <li>
                <NavLink
                  to="/student/submit-request"
                  className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                  onClick={onClose}
                >
                  <FilePlus size={18} />
                  <span>Submit Print Request</span>
                </NavLink>
              </li>
              <li>
                <NavLink
                  to="/student/my-requests"
                  className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                  onClick={onClose}
                >
                  <Files size={18} />
                  <span>My Requests</span>
                </NavLink>
              </li>
              <li>
                <NavLink
                  to="/student/profile"
                  className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
                  onClick={onClose}
                >
                  <User size={18} />
                  <span>Profile</span>
                </NavLink>
              </li>
            </ul>
          )}
        </nav>

        <div className="sidebar-fcfs-info">
          <div className="fcfs-badge">
            <Sparkles size={14} />
            <span>FCFS Algorithm</span>
          </div>
          <p className="fcfs-desc">
            Jobs are scheduled in exact order of arrival (<code>created_at ASC</code>).
          </p>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
