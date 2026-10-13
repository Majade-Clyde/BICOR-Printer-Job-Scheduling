import React, { useState, useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Loading from './Loading';

/**
 * ProtectedRoute – guards routes by role.
 * allowedRoles: string[] – e.g. ['admin'], ['staff'], ['student'], ['admin','staff']
 */
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { user, profile, role, loading, refreshProfile, logout } = useAuth();
  const location = useLocation();
  const [timedOut, setTimedOut] = useState(false);

  // Safety timeout: prevent infinite spinner if database role lookup stalls
  useEffect(() => {
    if (loading || (!role && user)) {
      const timer = setTimeout(() => {
        setTimedOut(true);
      }, 5000);
      return () => clearTimeout(timer);
    } else {
      setTimedOut(false);
    }
  }, [loading, role, user]);

  if (loading && !timedOut) {
    return <Loading message="Verifying authentication & permissions..." />;
  }

  // Not authenticated → go to login
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Check if account is deactivated
  if (profile?.status === 'inactive' && role !== 'admin') {
    return (
      <div className="page-container" style={{ maxWidth: '520px', margin: '4rem auto', textAlign: 'center' }}>
        <div className="card" style={{ padding: '2.5rem 2rem' }}>
          <div style={{ width: '56px', height: '56px', borderRadius: '50%', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
            <span style={{ fontSize: '28px', fontWeight: 'bold' }}>✕</span>
          </div>
          <h3 className="card-title" style={{ marginBottom: '0.75rem', color: '#b91c1c' }}>Account Deactivated</h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.75rem', fontSize: '0.925rem', lineHeight: '1.5' }}>
            Your account has been deactivated by an administrator. You cannot submit or manage print jobs while deactivated.
          </p>
          <button type="button" className="btn btn-primary btn-block" onClick={logout}>
            Log Out
          </button>
        </div>
      </div>
    );
  }

  // Timeout recovery UI
  if (timedOut && !role) {
    return (
      <div className="page-container" style={{ maxWidth: '500px', margin: '4rem auto', textAlign: 'center' }}>
        <div className="card" style={{ padding: '2rem' }}>
          <h3 className="card-title" style={{ marginBottom: '0.75rem' }}>Verifying Account Permissions</h3>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
            We're taking longer than usual to retrieve your account role from the database.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setTimedOut(false);
                refreshProfile?.();
              }}
            >
              Retry Connection
            </button>
            <button type="button" className="btn btn-outline" onClick={logout}>
              Log Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Robust role fallback
  const effectiveRole = role || user?.user_metadata?.role || 'student';
  const normalizedRole = effectiveRole === 'operator' ? 'staff' : (effectiveRole === 'user' ? 'student' : effectiveRole);

  // Check if current role is allowed
  const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
  if (!roles.includes(normalizedRole)) {
    // Redirect to the user's own dashboard
    if (normalizedRole === 'admin') return <Navigate to="/admin/dashboard" replace />;
    if (normalizedRole === 'staff') return <Navigate to="/staff/dashboard" replace />;
    return <Navigate to="/student/dashboard" replace />;
  }

  return children;
};

export default ProtectedRoute;
