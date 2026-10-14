import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import Loading from '../../components/Loading';
import ErrorMessage from '../../components/ErrorMessage';
import {
  Search, RefreshCw, UserCheck, UserX, Users, UserCog,
  Trash2, AlertCircle, ShieldAlert, CheckCircle2, Shield
} from 'lucide-react';

const AdminUsers = () => {
  const { user: currentUser } = useAuth();
  const [usersList, setUsersList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all'); // 'all' | 'user' | 'staff'
  const [processingId, setProcessingId] = useState(null);

  // Delete modal state
  const [deletingAccount, setDeletingAccount] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteModalError, setDeleteModalError] = useState('');

  const fetchUsers = useCallback(async (isSilent = false) => {
    if (!isSilent) setRefreshing(true);
    setError('');
    try {
      const { data, error: fetchErr } = await supabase
        .from('profiles')
        .select('*')
        .neq('role', 'admin')
        .order('created_at', { ascending: false });
      if (fetchErr) {
        console.error('Failed to fetch users:', fetchErr);
        throw fetchErr;
      }
      setUsersList(data || []);
    } catch (err) {
      console.error('AdminUsers fetch error:', err);
      setError('Failed to fetch users.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  // Escape key handler for delete modal
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && deletingAccount && !deleteLoading) {
        setDeletingAccount(null);
        setDeleteModalError('');
      }
    };

    if (deletingAccount) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [deletingAccount, deleteLoading]);

  const toggleStatus = async (userItem) => {
    if (!userItem?.id) return;
    setProcessingId(userItem.id);
    setError('');
    const newStatus = userItem.status === 'active' ? 'inactive' : 'active';
    try {
      const { data, error: updateErr } = await supabase
        .from('profiles')
        .update({ status: newStatus })
        .eq('id', userItem.id)
        .select();

      if (updateErr) throw updateErr;

      if (!data || data.length === 0) {
        throw new Error('Could not update user status. Please check your administrative privileges.');
      }

      setSuccessMsg(`${userItem.full_name || userItem.email} has been ${newStatus === 'active' ? 'activated' : 'deactivated'}.`);
      setTimeout(() => setSuccessMsg(''), 4000);
      await fetchUsers(true);
    } catch (err) {
      console.error('Failed to update user status:', err);
      setError(err.message || 'Failed to update status.');
    } finally {
      setProcessingId(null);
    }
  };

  const promoteToStaff = async (userItem) => {
    if (!userItem?.id) return;
    if (userItem.role === 'staff' || userItem.role === 'operator') return;
    if (!window.confirm(`Are you sure you want to promote ${userItem.full_name || userItem.email} from User to Staff?`)) return;
    setProcessingId(userItem.id);
    setError('');
    try {
      let updated = false;

      // 1. First attempt: call secure RPC function promote_user_to_staff (runs as SECURITY DEFINER)
      try {
        const { data: rpcData, error: rpcErr } = await supabase.rpc('promote_user_to_staff', {
          target_user_id: userItem.id
        });
        if (!rpcErr && rpcData) {
          updated = true;
        } else if (rpcErr && !rpcErr.message?.includes('function') && !rpcErr.message?.includes('not found')) {
          console.warn('RPC promote notice:', rpcErr);
        }
      } catch (rpcEx) {
        console.warn('RPC promote exception:', rpcEx);
      }

      // 2. Second attempt: Direct table UPDATE if RPC was not configured
      if (!updated) {
        const { data: updateData, error: updateErr } = await supabase
          .from('profiles')
          .update({ role: 'staff' })
          .eq('id', userItem.id)
          .select();

        if (updateErr) {
          throw updateErr;
        }

        if (updateData && updateData.length > 0) {
          updated = true;
        }
      }

      if (!updated) {
        throw new Error(
          'No record was updated. Please run "supabase-fix-admin-make-staff.sql" in your Supabase SQL Editor and ensure your account has role="admin".'
        );
      }

      setSuccessMsg(`Success! ${userItem.full_name || userItem.email} has been promoted to Staff.`);
      setTimeout(() => setSuccessMsg(''), 4000);
      await fetchUsers(true);
    } catch (err) {
      console.error('Failed to promote user to staff:', err);
      setError(err.message || 'Failed to update user role to staff.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleOpenDeleteModal = (account) => {
    if (!account?.id) return;
    if (account.id === currentUser?.id) {
      setError('You cannot delete your own administrator account.');
      return;
    }
    if (account.role === 'admin') {
      setError('Administrator accounts cannot be deleted.');
      return;
    }
    setDeletingAccount(account);
    setDeleteModalError('');
  };

  const handleCloseDeleteModal = () => {
    if (deleteLoading) return;
    setDeletingAccount(null);
    setDeleteModalError('');
  };

  const handleConfirmDelete = async () => {
    if (!deletingAccount?.id) return;

    if (deletingAccount.id === currentUser?.id) {
      setDeleteModalError('You cannot delete your own administrator account.');
      return;
    }

    if (deletingAccount.role === 'admin') {
      setDeleteModalError('Administrator accounts cannot be deleted.');
      return;
    }

    setDeleteLoading(true);
    setDeleteModalError('');

    try {
      let deleted = false;
      let rpcErrorDetail = '';

      // 1. Primary method: Call secure server-side RPC function `admin_delete_user_account`
      try {
        const { data: rpcData, error: rpcErr } = await supabase.rpc('admin_delete_user_account', {
          target_user_id: deletingAccount.id
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

      // 2. If RPC function was not created yet or threw an error:
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

      // Success
      const targetName = deletingAccount.full_name || deletingAccount.email;
      setDeletingAccount(null);
      setDeleteModalError('');
      setSuccessMsg(`Account for "${targetName}" has been successfully deleted.`);
      setTimeout(() => setSuccessMsg(''), 5000);
      await fetchUsers(true);
    } catch (err) {
      console.error('Account deletion failed:', err);
      setDeleteModalError(err.message || 'Failed to delete account. Please verify your administrative permissions.');
    } finally {
      setDeleteLoading(false);
    }
  };

  const filteredUsers = usersList.filter(u => {
    const isStaff = u.role === 'staff' || u.role === 'operator';
    const isDeleted = u.status === 'deleted';

    if (roleFilter === 'deleted') {
      if (!isDeleted) return false;
    } else {
      if (isDeleted) return false;
      if (roleFilter === 'user' && isStaff) return false;
      if (roleFilter === 'staff' && !isStaff) return false;
    }

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      u.full_name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q)
    );
  });

  const activeUsersList = usersList.filter(u => u.status !== 'deleted');
  const totalUserCount = activeUsersList.filter(u => u.role !== 'staff' && u.role !== 'operator').length;
  const totalStaffCount = activeUsersList.filter(u => u.role === 'staff' || u.role === 'operator').length;
  const totalDeletedCount = usersList.filter(u => u.status === 'deleted').length;

  if (loading) return <Loading message="Loading users..." />;

  return (
    <div className="page-container">
      <div className="page-header flex-between flex-wrap">
        <div>
          <h1 className="page-title">Manage Users</h1>
          <p className="page-subtitle">View and manage registered student and staff accounts.</p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-outline" onClick={() => fetchUsers()} disabled={refreshing}>
            <RefreshCw size={16} className={refreshing ? 'icon-spin' : ''} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      <ErrorMessage message={error} onDismiss={() => setError('')} />
      {successMsg && (
        <div className="success-banner">
          <CheckCircle2 size={20} className="success-icon" />
          <span>{successMsg}</span>
        </div>
      )}

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
          {searchQuery && <button type="button" className="clear-search-btn" onClick={() => setSearchQuery('')}>×</button>}
        </div>

        {/* Role Filter Tabs */}
        <div className="filter-tabs" style={{ display: 'flex', gap: '0.375rem', alignItems: 'center' }}>
          <button
            type="button"
            className={`btn btn-sm ${roleFilter === 'all' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setRoleFilter('all')}
          >
            All ({activeUsersList.length})
          </button>
          <button
            type="button"
            className={`btn btn-sm ${roleFilter === 'user' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setRoleFilter('user')}
          >
            Users ({totalUserCount})
          </button>
          <button
            type="button"
            className={`btn btn-sm ${roleFilter === 'staff' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setRoleFilter('staff')}
          >
            Staff ({totalStaffCount})
          </button>
          {totalDeletedCount > 0 && (
            <button
              type="button"
              className={`btn btn-sm ${roleFilter === 'deleted' ? 'btn-danger' : 'btn-outline'}`}
              onClick={() => setRoleFilter('deleted')}
              style={roleFilter !== 'deleted' ? { borderColor: '#fca5a5', color: '#dc2626' } : {}}
            >
              Deleted ({totalDeletedCount})
            </button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.875rem', marginLeft: 'auto' }}>
          <Users size={16} />
          <span>{filteredUsers.length} shown</span>
        </div>
      </div>

      <div className="card">
        {filteredUsers.length === 0 ? (
          <div className="empty-state-box">
            <Users size={48} className="empty-icon" />
            <h4 className="empty-title">No accounts found.</h4>
            <p className="empty-desc">
              {searchQuery ? 'Try adjusting your search query or role filter.' : 'No registered users match the selected filter.'}
            </p>
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
                {filteredUsers.map(userItem => {
                  const isStaff = userItem.role === 'staff' || userItem.role === 'operator';
                  return (
                    <tr key={userItem.id} className="table-row">
                      <td><span className="student-name">{userItem.full_name}</span></td>
                      <td><span className="student-email">{userItem.email}</span></td>
                      <td>
                        <span className={`sidebar-role-pill ${isStaff ? 'role-staff' : 'role-student'}`}>
                          {isStaff ? 'Staff' : 'User'}
                        </span>
                      </td>
                      <td>
                        <span className={`status-badge ${userItem.status === 'active' ? 'status-completed' : 'status-cancelled'}`}>
                          {userItem.status === 'active' ? 'Active' : (userItem.status === 'deleted' ? 'Deleted' : 'Inactive')}
                        </span>
                      </td>
                      <td><span className="time-text">{new Date(userItem.created_at).toLocaleDateString()}</span></td>
                      <td>
                        <div className="action-buttons-group">
                          {userItem.status === 'deleted' ? (
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem', fontStyle: 'italic' }}>
                              Account Deleted
                            </span>
                          ) : (
                            <>
                              {!isStaff ? (
                                <button
                                  type="button"
                                  className="btn btn-action btn-start-print"
                                  onClick={() => promoteToStaff(userItem)}
                                  disabled={processingId === userItem.id || deleteLoading}
                                  title="Promote to Staff"
                                >
                                  <UserCog size={14} />
                                  <span>{processingId === userItem.id ? 'Updating...' : 'Make Staff'}</span>
                                </button>
                              ) : (
                                <span className="sidebar-role-pill role-staff" style={{ margin: 0 }}>
                                  <UserCheck size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                                  Staff
                                </span>
                              )}
                              <button
                                type="button"
                                className={`btn btn-action ${userItem.status === 'active' ? 'btn-cancel' : 'btn-complete'}`}
                                onClick={() => toggleStatus(userItem)}
                                disabled={processingId === userItem.id || deleteLoading}
                                title={userItem.status === 'active' ? 'Deactivate account' : 'Activate account'}
                              >
                                {userItem.status === 'active' ? <><UserX size={14} /><span>Deactivate</span></> : <><UserCheck size={14} /><span>Activate</span></>}
                              </button>
                              <button
                                type="button"
                                className="btn btn-action btn-cancel"
                                onClick={() => handleOpenDeleteModal(userItem)}
                                disabled={processingId === userItem.id || deleteLoading}
                                title="Delete Account"
                                style={{ borderColor: '#fca5a5', color: '#dc2626' }}
                              >
                                <Trash2 size={14} />
                                <span>Delete</span>
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Account Deletion Confirmation Modal */}
      {deletingAccount && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-account-title"
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
                <h2 id="delete-account-title" className="modal-title" style={{ margin: '0 0 0.25rem 0', fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>
                  Delete Account?
                </h2>
                <p className="modal-subtitle" style={{ margin: 0, fontSize: '0.875rem', color: '#64748b' }}>
                  This action permanently removes the user's login and account access.
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
                  <strong style={{ color: '#0f172a' }}>{deletingAccount.full_name || 'N/A'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#64748b', fontWeight: 500 }}>Email:</span>
                  <strong style={{ color: '#0f172a' }}>{deletingAccount.email}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#64748b', fontWeight: 500 }}>Role:</span>
                  <span className={`sidebar-role-pill ${['staff', 'operator'].includes(deletingAccount.role) ? 'role-staff' : 'role-student'}`} style={{ margin: 0 }}>
                    {['staff', 'operator'].includes(deletingAccount.role) ? 'Staff' : 'User'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#64748b', fontWeight: 500 }}>Status:</span>
                  <span className={`status-badge ${deletingAccount.status === 'active' ? 'status-completed' : 'status-cancelled'}`}>
                    {deletingAccount.status === 'active' ? 'Active' : 'Inactive'}
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
                <strong>Data Retention:</strong> Print jobs, documents, and historical logs associated with this email will be preserved safely in the database for auditing and records.
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

export default AdminUsers;
