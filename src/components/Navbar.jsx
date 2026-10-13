import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LogOut, Menu, X, ChevronDown, User as UserIcon
} from 'lucide-react';

const Navbar = ({ onToggleSidebar, isSidebarOpen }) => {
  const { user, profile, role, logout, avatarUrl } = useAuth();
  const navigate = useNavigate();
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setProfileDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const displayName = profile?.full_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';

  const getRoleLabel = () => {
    if (role === 'admin') return 'ADMIN';
    if (role === 'staff' || role === 'operator') return 'STAFF';
    return 'USER';
  };

  const getProfileLink = () => {
    if (role === 'admin') return '/admin/profile';
    if (role === 'staff' || role === 'operator') return '/staff/profile';
    return '/student/profile';
  };

  const getDashboardLink = () => {
    if (role === 'admin') return '/admin/dashboard';
    if (role === 'staff' || role === 'operator') return '/staff/dashboard';
    return '/student/dashboard';
  };

  return (
    <header className="navbar">
      <div className="navbar-left">
        {user && (
          <button
            type="button"
            className="sidebar-toggle-btn"
            onClick={onToggleSidebar}
            aria-label="Toggle Navigation Menu"
          >
            {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        )}

        {!user && (
          <Link to={getDashboardLink()} className="navbar-brand">
            <img
              src="/bicor-logo.png"
              alt="BICOR Logo"
              className="navbar-brand-logo"
            />
            <div className="brand-text">
              <span className="brand-title">BICOR</span>
              <span className="brand-subtitle">Job Scheduler</span>
            </div>
          </Link>
        )}
      </div>

      <div className="navbar-right">
        {user ? (
          <div className="topbar-actions">
            {/* Profile Dropdown Area */}
            <div className="topbar-profile-container" ref={dropdownRef}>
              <button
                type="button"
                className="topbar-profile-btn"
                onClick={() => setProfileDropdownOpen(prev => !prev)}
                aria-expanded={profileDropdownOpen}
                aria-haspopup="true"
              >
                <div className="topbar-avatar">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={displayName} className="topbar-avatar-img" />
                  ) : (
                    <UserIcon size={18} />
                  )}
                </div>
                <div className="topbar-user-info">
                  <span className="topbar-user-name">{displayName}</span>
                  <span className="topbar-role-tag">{getRoleLabel()}</span>
                </div>
                <ChevronDown size={15} className={`topbar-chevron ${profileDropdownOpen ? 'rotate' : ''}`} />
              </button>

              {profileDropdownOpen && (
                <div className="topbar-dropdown-menu">
                  <div className="dropdown-user-header">
                    <p className="dropdown-user-name">{displayName}</p>
                    <p className="dropdown-user-email">{user?.email}</p>
                    <span className="dropdown-role-badge">{getRoleLabel()}</span>
                  </div>
                  <div className="dropdown-divider" />
                  <Link
                    to={getProfileLink()}
                    className="dropdown-item"
                    onClick={() => setProfileDropdownOpen(false)}
                  >
                    <UserIcon size={15} />
                    <span>My Profile</span>
                  </Link>
                  <button
                    type="button"
                    className="dropdown-item dropdown-logout-item"
                    onClick={handleLogout}
                  >
                    <LogOut size={15} />
                    <span>Logout</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="auth-nav-links">
            <Link to="/login" className="btn btn-outline btn-sm">
              Log In
            </Link>
            <Link to="/register" className="btn btn-primary btn-sm">
              Register
            </Link>
          </div>
        )}
      </div>
    </header>
  );
};

export default Navbar;
