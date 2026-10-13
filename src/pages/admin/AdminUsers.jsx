import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import Loading from '../../components/Loading';
import ErrorMessage from '../../components/ErrorMessage';
import { Search, RefreshCw, UserCheck, UserX, Users, UserCog } from 'lucide-react';

const AdminUsers = () => {
  const [usersList, setUsersList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [processingId, setProcessingId] = useState(null);

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
      setTimeout(() => setSuccessMsg(''), 3000);
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

  const filteredUsers = usersList.filter(u =>
    !searchQuery.trim() ||
    u.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.email?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) return <Loading message="Loading users..." />;

  return (
    <div className="page-container">
      <div className="page-header flex-between flex-wrap">
        <div>
          <h1 className="page-title">Manage Users</h1>
          <p className="page-subtitle">View and manage all registered user accounts.</p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-outline" onClick={() => fetchUsers()} disabled={refreshing}>
            <RefreshCw size={16} className={refreshing ? 'icon-spin' : ''} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      <ErrorMessage message={error} onDismiss={() => setError('')} />
      {successMsg && <div className="success-banner"><UserCheck size={20} className="success-icon" /><span>{successMsg}</span></div>}

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
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
          <Users size={16} />
          <span>{filteredUsers.length} user{filteredUsers.length !== 1 ? 's' : ''}</span>
        </div>
      </div>

      <div className="card">
        {filteredUsers.length === 0 ? (
          <div className="empty-state-box">
            <Users size={48} className="empty-icon" />
            <h4 className="empty-title">No users found.</h4>
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
                          {userItem.status === 'active' ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td><span className="time-text">{new Date(userItem.created_at).toLocaleDateString()}</span></td>
                      <td>
                        <div className="action-buttons-group">
                          {!isStaff ? (
                            <button
                              type="button"
                              className="btn btn-action btn-start-print"
                              onClick={() => promoteToStaff(userItem)}
                              disabled={processingId === userItem.id}
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
                            disabled={processingId === userItem.id}
                          >
                            {userItem.status === 'active' ? <><UserX size={14} /><span>Deactivate</span></> : <><UserCheck size={14} /><span>Activate</span></>}
                          </button>
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
    </div>
  );
};

export default AdminUsers;
