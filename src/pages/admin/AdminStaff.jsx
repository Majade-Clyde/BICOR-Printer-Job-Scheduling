import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import Loading from '../../components/Loading';
import ErrorMessage from '../../components/ErrorMessage';
import {
  Search, RefreshCw, UserCheck, UserX, UserPlus, Plus,
  UserCog, Edit2, X, Save, Eye, EyeOff, Mail, Lock, User,
  AlertCircle, ShieldCheck, Trash2, ShieldAlert
} from 'lucide-react';

const AdminStaff = () => {
  const { user: currentUser, createStaffAccount } = useAuth();
  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [processingId, setProcessingId] = useState(null);

  // Create staff modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [newStaffPassword, setNewStaffPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [creating, setCreating] = useState(false);
  const [modalError, setModalError] = useState('');

  // Edit modal state
  const [editingStaff, setEditingStaff] = useState(null);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);
  const [editModalError, setEditModalError] = useState('');

  // Delete staff modal state
  const [deletingStaff, setDeletingStaff] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteModalError, setDeleteModalError] = useState('');

  const fetchStaff = useCallback(async (isSilent = false) => {
    if (!isSilent) setRefreshing(true);
    setError('');
    try {
      const { data, error: fetchErr } = await supabase
        .from('profiles')
        .select('*')
        .in('role', ['staff', 'operator'])
        .order('created_at', { ascending: false });
      if (fetchErr) throw fetchErr;
      setStaffList(data || []);
    } catch (err) {
      console.error('Failed to fetch staff list:', err);
      setError('Failed to fetch staff list.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchStaff();
  }, [fetchStaff]);

  // Escape key handler for open modals
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (showCreateModal && !creating) {
          setShowCreateModal(false);
        }
        if (editingStaff && !saving) {
          setEditingStaff(null);
        }
        if (deletingStaff && !deleteLoading) {
          setDeletingStaff(null);
          setDeleteModalError('');
        }
      }
    };

    if (showCreateModal || editingStaff || deletingStaff) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [showCreateModal, editingStaff, deletingStaff, creating, saving, deleteLoading]);

  const handleOpenCreateModal = () => {
    setNewStaffName('');
    setNewStaffEmail('');
    setNewStaffPassword('');
    setConfirmPassword('');
    setShowPassword(false);
    setShowConfirmPassword(false);
    setModalError('');
    setShowCreateModal(true);
  };

  const handleCloseCreateModal = () => {
    if (creating) return;
    setShowCreateModal(false);
    setModalError('');
  };

  const toggleStatus = async (staff) => {
    setProcessingId(staff.id);
    setError('');
    const newStatus = staff.status === 'active' ? 'inactive' : 'active';
    try {
      const { error: updateErr } = await supabase
        .from('profiles')
        .update({ status: newStatus })
        .eq('id', staff.id);
      if (updateErr) throw updateErr;
      setSuccessMsg(`${staff.full_name} has been ${newStatus === 'active' ? 'activated' : 'deactivated'}.`);
      setTimeout(() => setSuccessMsg(''), 4000);
      await fetchStaff(true);
    } catch (err) {
      console.error('Error toggling staff status:', err);
      setError(err.message || 'Failed to update status.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleRemoveStaff = async (staff) => {
    if (!window.confirm(`Are you sure you want to remove staff privileges from ${staff.full_name}? This will return their account to a regular User role without deleting their account.`)) return;
    setProcessingId(staff.id);
    setError('');
    try {
      let updated = false;

      // 1. Try RPC function demote_staff_to_user
      try {
        const { data: rpcData, error: rpcErr } = await supabase.rpc('demote_staff_to_user', {
          target_user_id: staff.id
        });
        if (!rpcErr && rpcData) {
          updated = true;
        }
      } catch (rpcEx) {
        console.warn('RPC demote exception:', rpcEx);
      }

      // 2. Direct table update fallback
      if (!updated) {
        const { data: updateData, error: updateErr } = await supabase
          .from('profiles')
          .update({ role: 'student' })
          .eq('id', staff.id)
          .select();

        if (updateErr) throw updateErr;
        if (updateData && updateData.length > 0) {
          updated = true;
        }
      }

      if (!updated) {
        throw new Error('Could not update staff role. Please check your admin privileges.');
      }

      setSuccessMsg(`${staff.full_name} has been removed from Staff and returned to regular User role.`);
      setTimeout(() => setSuccessMsg(''), 4000);
      await fetchStaff(true);
    } catch (err) {
      console.error('Failed to remove staff privileges:', err);
      setError(err.message || 'Failed to remove staff privileges.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleOpenDeleteModal = (staff) => {
    if (!staff?.id) return;
    if (staff.id === currentUser?.id) {
      setError('You cannot delete your own administrator account.');
      return;
    }
    if (staff.role === 'admin') {
      setError('Administrator accounts cannot be deleted.');
      return;
    }
    setDeletingStaff(staff);
    setDeleteModalError('');
  };

  const handleCloseDeleteModal = () => {
    if (deleteLoading) return;
    setDeletingStaff(null);
    setDeleteModalError('');
  };

  const handleConfirmDelete = async () => {
    if (!deletingStaff?.id) return;

    if (deletingStaff.id === currentUser?.id) {
      setDeleteModalError('You cannot delete your own administrator account.');
      return;
    }

    if (deletingStaff.role === 'admin') {
      setDeleteModalError('Administrator accounts cannot be deleted.');
      return;
    }

    setDeleteLoading(true);
    setDeleteModalError('');

    try {
      let deleted = false;
      let rpcErrorDetail = '';

      try {
        const { data: rpcData, error: rpcErr } = await supabase.rpc('admin_delete_user_account', {
          target_user_id: deletingStaff.id
        });

        if (!rpcErr && (rpcData?.success || rpcData === true)) {
          deleted = true;
        } else if (rpcErr) {
          rpcErrorDetail = rpcErr.message || String(rpcErr);
          console.warn('RPC account deletion notice:', rpcErr);
        }
      } catch (rpcEx) {
        rpcErrorDetail = rpcEx.message || String(rpcEx);
        console.warn('RPC account deletion exception:', rpcEx);
      }

      if (!deleted) {
        if (
          rpcErrorDetail &&
          (rpcErrorDetail.toLowerCase().includes('access denied') ||
           rpcErrorDetail.toLowerCase().includes('administrators cannot') ||
           rpcErrorDetail.toLowerCase().includes('cannot delete administrator'))
        ) {
          throw new Error(rpcErrorDetail);
        }

        throw new Error(
          rpcErrorDetail ||
          'Server-side account deletion function not found. Please run the "supabase-admin-delete-user.sql" migration in your Supabase SQL Editor to enable secure server-side account deletion.'
        );
      }

      const targetName = deletingStaff.full_name || deletingStaff.email;
      setDeletingStaff(null);
      setDeleteModalError('');
      setSuccessMsg(`Staff account for "${targetName}" has been successfully deleted.`);
      setTimeout(() => setSuccessMsg(''), 5000);
      await fetchStaff(true);
    } catch (err) {
      console.error('Staff account deletion failed:', err);
      setDeleteModalError(err.message || 'Failed to delete staff account. Please verify your administrative permissions.');
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleCreateStaff = async (e) => {
    e.preventDefault();
    setModalError('');

    const trimmedName = newStaffName.trim();
    const trimmedEmail = newStaffEmail.trim().toLowerCase();

    // 1. Required fields validation
    if (!trimmedName || !trimmedEmail || !newStaffPassword || !confirmPassword) {
      setModalError('All fields are required to create a staff account.');
      return;
    }

    // 2. Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      setModalError('Please enter a valid email address.');
      return;
    }

    // 3. Password length validation
    if (newStaffPassword.length < 6) {
      setModalError('Password must be at least 6 characters long.');
      return;
    }

    // 4. Password confirmation match validation
    if (newStaffPassword !== confirmPassword) {
      setModalError('Passwords do not match. Please ensure both passwords are identical.');
      return;
    }

    setCreating(true);

    try {
      await createStaffAccount(trimmedEmail, newStaffPassword, trimmedName);
      setSuccessMsg(`Staff account for ${trimmedName} created successfully!`);
      setTimeout(() => setSuccessMsg(''), 5000);
      setShowCreateModal(false);
      setNewStaffName('');
      setNewStaffEmail('');
      setNewStaffPassword('');
      setConfirmPassword('');
      await fetchStaff(true);
    } catch (err) {
      console.error('Create staff error:', err);
      const errMsg = err.message || '';

      // If the email is already registered (e.g. from an earlier user registration),
      // offer to promote the existing profile's role to 'staff'
      if (errMsg.toLowerCase().includes('already registered') || errMsg.toLowerCase().includes('already been registered')) {
        try {
          const { data: existingProfiles } = await supabase
            .from('profiles')
            .select('*')
            .eq('email', trimmedEmail);

          if (existingProfiles && existingProfiles.length > 0) {
            const { error: promoteErr } = await supabase
              .from('profiles')
              .update({ role: 'staff', full_name: trimmedName, status: 'active' })
              .eq('id', existingProfiles[0].id);

            if (!promoteErr) {
              setSuccessMsg(`Existing account (${trimmedEmail}) was successfully assigned the Staff role!`);
              setTimeout(() => setSuccessMsg(''), 5000);
              setShowCreateModal(false);
              setNewStaffName('');
              setNewStaffEmail('');
              setNewStaffPassword('');
              setConfirmPassword('');
              await fetchStaff(true);
              return;
            }
          }
        } catch (promoteEx) {
          console.error('Failed to promote existing profile:', promoteEx);
        }
      }

      setModalError(errMsg || 'Failed to create staff account. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  const handleEditSave = async (e) => {
    e.preventDefault();
    setEditModalError('');
    if (!editName.trim()) {
      setEditModalError('Name is required.');
      return;
    }

    setSaving(true);
    try {
      const { error: updateErr } = await supabase
        .from('profiles')
        .update({ full_name: editName.trim() })
        .eq('id', editingStaff.id);

      if (updateErr) throw updateErr;

      setSuccessMsg('Staff member updated successfully!');
      setTimeout(() => setSuccessMsg(''), 4000);
      setEditingStaff(null);
      await fetchStaff(true);
    } catch (err) {
      console.error('Edit staff error:', err);
      setEditModalError(err.message || 'Failed to update staff member.');
    } finally {
      setSaving(false);
    }
  };

  const filteredStaff = staffList.filter(s =>
    s.status !== 'deleted' && (
      !searchQuery.trim() ||
      s.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.email?.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  if (loading) return <Loading message="Loading staff list..." />;

  return (
    <div className="page-container">
      {/* Page Header */}
      <div className="page-header flex-between flex-wrap">
        <div>
          <h1 className="page-title">Manage Staff</h1>
          <p className="page-subtitle">Create, view, edit, and manage staff accounts.</p>
        </div>
        <div className="page-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleOpenCreateModal}
          >
            <Plus size={18} />
            <span>Add Staff</span>
          </button>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => fetchStaff()}
            disabled={refreshing}
          >
            <RefreshCw size={16} className={refreshing ? 'icon-spin' : ''} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      <ErrorMessage message={error} onDismiss={() => setError('')} />

      {successMsg && (
        <div className="success-banner" role="status">
          <UserCheck size={20} className="success-icon" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Filter Bar */}
      <div className="filter-bar">
        <div className="search-input-wrapper">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="clear-search-btn"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
          <UserCog size={16} />
          <span>{filteredStaff.length} staff member{filteredStaff.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Staff Table */}
      <div className="card">
        {filteredStaff.length === 0 ? (
          <div className="empty-state-box">
            <UserCog size={48} className="empty-icon" />
            <h4 className="empty-title">No staff accounts found.</h4>
            <p className="empty-desc">Click "Add Staff" above to create a new staff account.</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="print-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Date Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredStaff.map(staff => (
                  <tr key={staff.id} className="table-row">
                    <td><span className="student-name">{staff.full_name}</span></td>
                    <td><span className="student-email">{staff.email}</span></td>
                    <td><span className="sidebar-role-pill role-staff">Staff</span></td>
                    <td>
                      <span className={`status-badge ${staff.status === 'active' ? 'status-completed' : 'status-cancelled'}`}>
                        {staff.status === 'active' ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td><span className="time-text">{new Date(staff.created_at).toLocaleDateString()}</span></td>
                    <td>
                      <div className="action-buttons-group">
                        <button
                          type="button"
                          className="btn btn-action btn-start-print"
                          onClick={() => {
                            setEditingStaff(staff);
                            setEditName(staff.full_name);
                            setEditModalError('');
                          }}
                          title="Edit staff member"
                        >
                          <Edit2 size={14} />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          className={`btn btn-action ${staff.status === 'active' ? 'btn-cancel' : 'btn-complete'}`}
                          onClick={() => toggleStatus(staff)}
                          disabled={processingId === staff.id}
                          title={staff.status === 'active' ? 'Deactivate staff account' : 'Activate staff account'}
                        >
                          {staff.status === 'active' ? (
                            <>
                              <UserX size={14} />
                              <span>Deactivate</span>
                            </>
                          ) : (
                            <>
                              <UserCheck size={14} />
                              <span>Activate</span>
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          className="btn btn-action btn-cancel"
                          onClick={() => handleRemoveStaff(staff)}
                          disabled={processingId === staff.id || deleteLoading}
                          title="Remove Staff Privileges (Return to User role)"
                        >
                          <UserX size={14} />
                          <span>Remove Staff</span>
                        </button>
                        <button
                          type="button"
                          className="btn btn-action btn-cancel"
                          onClick={() => handleOpenDeleteModal(staff)}
                          disabled={processingId === staff.id || deleteLoading}
                          title="Permanently Delete Staff Account"
                          style={{ borderColor: '#fca5a5', color: '#dc2626' }}
                        >
                          <Trash2 size={14} />
                          <span>Delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* =========================================================================
          CREATE STAFF ACCOUNT MODAL
          ========================================================================= */}
      {showCreateModal && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleCloseCreateModal();
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-staff-title"
        >
          <div className="modal-box" style={{ maxWidth: '520px' }}>
            {/* Modal Header */}
            <div className="modal-header">
              <div className="modal-header-left">
                <div className="modal-icon-wrap">
                  <UserPlus size={20} />
                </div>
                <div>
                  <h2 id="create-staff-title" className="modal-title">
                    Create Staff Account
                  </h2>
                  <p className="modal-subtitle">
                    Add a new administrator-authorized staff member to the system.
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={handleCloseCreateModal}
                disabled={creating}
                aria-label="Close modal"
                title="Close (Esc)"
              >
                <X size={18} />
              </button>
            </div>

            {/* Staff Role Notice */}
            <div className="staff-modal-notice">
              <ShieldCheck size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
              <span>
                Staff accounts are created by administrators. New registrations are automatically assigned the User role.
              </span>
            </div>

            {/* Error Banner */}
            {modalError && (
              <div className="modal-error-banner" role="alert">
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>{modalError}</span>
              </div>
            )}

            {/* Create Staff Form */}
            <form onSubmit={handleCreateStaff} className="modal-form">
              {/* Full Name */}
              <div className="form-group">
                <label className="form-label" htmlFor="newStaffName">
                  <User size={15} />
                  <span>Full Name</span>
                  <span className="required-star">*</span>
                </label>
                <input
                  id="newStaffName"
                  type="text"
                  className="form-input"
                  placeholder="e.g. Juan Dela Cruz"
                  value={newStaffName}
                  onChange={(e) => setNewStaffName(e.target.value)}
                  disabled={creating}
                  required
                  autoFocus
                />
              </div>

              {/* Email Address */}
              <div className="form-group">
                <label className="form-label" htmlFor="newStaffEmail">
                  <Mail size={15} />
                  <span>Email Address</span>
                  <span className="required-star">*</span>
                </label>
                <input
                  id="newStaffEmail"
                  type="email"
                  className="form-input"
                  placeholder="Enter staff email address"
                  value={newStaffEmail}
                  onChange={(e) => setNewStaffEmail(e.target.value)}
                  disabled={creating}
                  required
                  autoComplete="email"
                />
              </div>

              {/* Password */}
              <div className="form-group">
                <label className="form-label" htmlFor="newStaffPassword">
                  <Lock size={15} />
                  <span>Password</span>
                  <span className="required-star">*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="newStaffPassword"
                    type={showPassword ? 'text' : 'password'}
                    className="form-input"
                    placeholder="Min. 6 characters"
                    value={newStaffPassword}
                    onChange={(e) => setNewStaffPassword(e.target.value)}
                    disabled={creating}
                    required
                    autoComplete="new-password"
                    style={{ paddingRight: '2.75rem' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    style={{
                      position: 'absolute',
                      right: '0.75rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--text-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '4px'
                    }}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div className="form-group">
                <label className="form-label" htmlFor="newStaffConfirmPassword">
                  <Lock size={15} />
                  <span>Confirm Password</span>
                  <span className="required-star">*</span>
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="newStaffConfirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    className="form-input"
                    placeholder="Re-enter password to confirm"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={creating}
                    required
                    autoComplete="new-password"
                    style={{ paddingRight: '2.75rem' }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    style={{
                      position: 'absolute',
                      right: '0.75rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--text-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '4px'
                    }}
                    aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                  >
                    {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Modal Actions */}
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={handleCloseCreateModal}
                  disabled={creating}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={creating}
                >
                  {creating ? (
                    <span className="btn-loading">Creating Staff Account...</span>
                  ) : (
                    <>
                      <UserPlus size={16} />
                      <span>Create Staff Account</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          EDIT STAFF MEMBER MODAL
          ========================================================================= */}
      {editingStaff && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget && !saving) setEditingStaff(null);
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-staff-title"
        >
          <div className="modal-box" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <div className="modal-header-left">
                <div className="modal-icon-wrap">
                  <Edit2 size={20} />
                </div>
                <div>
                  <h2 id="edit-staff-title" className="modal-title">
                    Edit Staff Member
                  </h2>
                  <p className="modal-subtitle">
                    Update profile details for {editingStaff.full_name}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setEditingStaff(null)}
                disabled={saving}
                aria-label="Close modal"
                title="Close (Esc)"
              >
                <X size={18} />
              </button>
            </div>

            {editModalError && (
              <div className="modal-error-banner" role="alert">
                <AlertCircle size={16} style={{ flexShrink: 0 }} />
                <span>{editModalError}</span>
              </div>
            )}

            <form onSubmit={handleEditSave} className="modal-form">
              <div className="form-group">
                <label className="form-label" htmlFor="editStaffName">
                  <User size={15} />
                  <span>Full Name</span>
                  <span className="required-star">*</span>
                </label>
                <input
                  id="editStaffName"
                  type="text"
                  className="form-input"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  disabled={saving}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="editStaffEmail">
                  <Mail size={15} />
                  <span>Email Address</span>
                </label>
                <input
                  id="editStaffEmail"
                  type="email"
                  className="form-input"
                  value={editingStaff.email}
                  disabled
                  style={{ opacity: 0.7, background: '#f8fafc', cursor: 'not-allowed' }}
                />
                <small style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: '0.25rem', display: 'block' }}>
                  Email address cannot be changed from this view.
                </small>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setEditingStaff(null)}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving}
                >
                  {saving ? (
                    <span className="btn-loading">Saving...</span>
                  ) : (
                    <>
                      <Save size={16} />
                      <span>Save Changes</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          DELETE STAFF ACCOUNT CONFIRMATION MODAL
          ========================================================================= */}
      {deletingStaff && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-staff-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !deleteLoading) {
              handleCloseDeleteModal();
            }
          }}
        >
          <div className="modal-box modal-box-sm">
            <div className="delete-confirm-header" style={{ display: 'flex', gap: '0.875rem', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <div
                className="delete-confirm-icon"
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '50%',
                  background: '#fef2f2',
                  color: '#dc2626',
                  border: '1px solid #fecaca',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                <Trash2 size={22} />
              </div>
              <div>
                <h2 id="delete-staff-title" className="modal-title" style={{ margin: '0 0 0.25rem 0', fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>
                  Delete Staff Account?
                </h2>
                <p className="modal-subtitle" style={{ margin: 0, fontSize: '0.875rem', color: '#64748b' }}>
                  This action permanently removes the staff account from Supabase Auth.
                </p>
              </div>
            </div>

            {/* Account Details Box */}
            <div
              className="delete-account-details-box"
              style={{
                background: '#f8fafc',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                padding: '0.875rem 1rem',
                margin: '1rem 0'
              }}
            >
              <div style={{ display: 'grid', gap: '0.5rem', fontSize: '0.875rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#64748b', fontWeight: 500 }}>Name:</span>
                  <strong style={{ color: '#0f172a' }}>{deletingStaff.full_name || 'N/A'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#64748b', fontWeight: 500 }}>Email:</span>
                  <strong style={{ color: '#0f172a' }}>{deletingStaff.email}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#64748b', fontWeight: 500 }}>Role:</span>
                  <span className="sidebar-role-pill role-staff" style={{ margin: 0 }}>
                    Staff
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#64748b', fontWeight: 500 }}>Status:</span>
                  <span className={`status-badge ${deletingStaff.status === 'active' ? 'status-completed' : 'status-cancelled'}`}>
                    {deletingStaff.status === 'active' ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
            </div>

            {/* Data Retention Notice */}
            <div
              style={{
                fontSize: '0.8125rem',
                color: '#15803d',
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                borderRadius: '6px',
                padding: '0.625rem 0.75rem',
                marginBottom: '1rem',
                display: 'flex',
                gap: '0.5rem',
                alignItems: 'flex-start'
              }}
            >
              <ShieldAlert size={16} style={{ color: '#16a34a', flexShrink: 0, marginTop: '2px' }} />
              <span>
                <strong>Data Retention:</strong> Print jobs and queue records handled by this staff member will be preserved safely.
              </span>
            </div>

            {deleteModalError && (
              <div className="modal-error-banner" role="alert" style={{ marginBottom: '1rem' }}>
                <AlertCircle size={16} />
                <span>{deleteModalError}</span>
              </div>
            )}

            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={handleCloseDeleteModal}
                disabled={deleteLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleConfirmDelete}
                disabled={deleteLoading}
                style={{
                  background: '#dc2626',
                  borderColor: '#dc2626',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                <Trash2 size={15} />
                <span>{deleteLoading ? 'Deleting Account...' : 'Confirm Delete'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminStaff;
