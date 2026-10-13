import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import StatCard from '../../components/StatCard';
import Loading from '../../components/Loading';
import ErrorMessage from '../../components/ErrorMessage';
import DocumentViewerModal from '../../components/DocumentViewerModal';
import { Users, UserCog, Clock, Printer, CheckCircle2, RefreshCw, Shield, Sparkles, AlertTriangle, FileText, Eye, Paperclip } from 'lucide-react';
import { getJobDocuments } from '../../lib/storage';

const AdminDashboard = () => {
  const { user, profile } = useAuth();
  const [allProfiles, setAllProfiles] = useState([]);
  const [allJobs, setAllJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [rlsNotice, setRlsNotice] = useState(false);
  const [viewingJob, setViewingJob] = useState(null);

  const fetchData = useCallback(async (isSilent = false) => {
    if (!isSilent) setRefreshing(true);
    setError('');
    setRlsNotice(false);

    try {
      // 1. Fetch registered users from 'profiles' table
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('*');

      if (profilesError) {
        console.error('Failed to fetch profiles:', profilesError);
        setError(prev => prev ? `${prev} | Profiles Error: ${profilesError.message}` : `Profiles Error: ${profilesError.message}`);
      } else {
        setAllProfiles(profilesData || []);
      }

      // 2. Fetch printing jobs from 'print_jobs' table
      const { data: jobsData, error: jobsError } = await supabase
        .from('print_jobs')
        .select('*')
        .order('submitted_at', { ascending: false });

      if (jobsError) {
        console.error('Failed to fetch printing jobs:', jobsError);
        setError(prev => prev ? `${prev} | Print Jobs Error: ${jobsError.message}` : `Print Jobs Error: ${jobsError.message}`);
      } else {
        // Ensure in-memory sorting by submitted_at DESC as fallback
        const sortedJobs = [...(jobsData || [])].sort((a, b) => {
          const timeA = a.submitted_at ? new Date(a.submitted_at).getTime() : 0;
          const timeB = b.submitted_at ? new Date(b.submitted_at).getTime() : 0;
          return timeB - timeA;
        });
        setAllJobs(sortedJobs);
      }

      // Symptom check for Supabase Row Level Security (RLS) policies:
      // If the admin only received their own 1 profile row and 0 jobs were retrieved,
      // it indicates the database RLS policies are restricting admin access.
      if (
        !profilesError &&
        !jobsError &&
        profilesData &&
        profilesData.length === 1 &&
        profilesData[0]?.id === user?.id &&
        (!jobsData || jobsData.length === 0)
      ) {
        console.warn(
          'Supabase RLS notice: Only your own admin profile was returned and 0 print jobs were retrieved. ' +
          'This indicates the database RLS policies are restricting admin access. ' +
          'Please ensure the updated supabase-schema-v2.sql has been run in your Supabase SQL Editor.'
        );
        setRlsNotice(true);
      }
    } catch (err) {
      console.error('Unexpected error in AdminDashboard fetchData:', err);
      setError(err.message || 'An unexpected error occurred while fetching dashboard data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchData();
    const channel = supabase
      .channel('admin-dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'print_jobs' }, () => fetchData(true))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => fetchData(true))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  const stats = useMemo(() => ({
    totalStudents: allProfiles.filter(p => ['student', 'user'].includes(p.role?.toLowerCase())).length,
    totalStaff: allProfiles.filter(p => ['staff', 'operator'].includes(p.role?.toLowerCase())).length,
    pending: allJobs.filter(j => j.status?.toLowerCase() === 'pending').length,
    printing: allJobs.filter(j => j.status?.toLowerCase() === 'printing').length,
    completed: allJobs.filter(j => j.status?.toLowerCase() === 'completed').length,
  }), [allProfiles, allJobs]);

  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'Admin';

  const recentJobs = allJobs.slice(0, 5);

  if (loading) return <Loading message="Loading Admin Dashboard..." />;

  return (
    <div className="page-container">
      <div className="dashboard-hero admin-hero">
        <div className="hero-content">
          <div className="hero-badge">
            <span>SYSTEM ADMINISTRATOR • FULL ACCESS</span>
          </div>
          <h1 className="hero-title">
            Welcome back, <span className="hero-name-highlight">{displayName}!</span>
          </h1>
          <p className="hero-subtitle">
            Monitor and manage users, staff, printers, and system-wide print queues.
          </p>
          <div className="hero-actions">
            <button type="button" className="btn btn-hero-refresh" onClick={() => fetchData()} disabled={refreshing}>
              <RefreshCw size={16} className={refreshing ? 'icon-spin' : ''} />
              <span>{refreshing ? 'Refreshing...' : 'Refresh Data'}</span>
            </button>
          </div>
        </div>
        <div className="hero-artwork">
          <img
            src="/jaguar-hero.png"
            alt="BICOR Jaguar"
            className="hero-jaguar-img"
          />
        </div>
      </div>

      <ErrorMessage message={error} onDismiss={() => setError('')} />

      {rlsNotice && (
        <div className="info-callout" style={{ borderLeftColor: '#f59e0b', marginBottom: '1.5rem', background: 'rgba(245, 158, 11, 0.08)' }}>
          <div className="info-callout-icon" style={{ color: '#f59e0b' }}>
            <AlertTriangle size={20} />
          </div>
          <div className="info-callout-content">
            <h4 style={{ margin: '0 0 0.25rem 0', color: '#b45309' }}>Supabase RLS Policy Configuration Notice</h4>
            <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--text-main, #333)' }}>
              Only your admin profile was returned and 0 print jobs were retrieved. If student registrations and print jobs exist in Supabase, your database Row Level Security (RLS) policies need to be updated so the <strong>admin</strong> role can read all records. Run <code>supabase-schema-v2.sql</code> in your Supabase SQL Editor to grant admin access.
            </p>
          </div>
        </div>
      )}

      <div className="stats-grid stats-grid-5">
        <StatCard title="Total Users" value={stats.totalStudents} icon={Users} variant="blue" description="Registered users" to="/admin/users" />
        <StatCard title="Total Staff" value={stats.totalStaff} icon={UserCog} variant="blue" description="Active staff members" to="/admin/staff" />
        <StatCard title="Pending Jobs" value={stats.pending} icon={Clock} variant="yellow" description="Awaiting processing" to="/admin/queue" />
        <StatCard title="Now Printing" value={stats.printing} icon={Printer} variant="blue" description="Printer active" to="/admin/queue" />
        <StatCard title="Completed" value={stats.completed} icon={CheckCircle2} variant="green" description="Successfully printed" to="/admin/print-jobs?status=Completed" />
      </div>

      {/* Recent Activity */}
      <div className="card mt-6">
        <div className="card-header">
          <div className="section-title-with-badge">
            <h3 className="card-title">Recent Print Activity</h3>
            <span className="queue-count-badge">{allJobs.length} Total Jobs</span>
          </div>
          <p className="card-subtitle">Latest print requests across all users</p>
        </div>
        {recentJobs.length === 0 ? (
          <div className="empty-state-box">
            <Sparkles size={48} className="empty-icon" />
            <p className="empty-desc">No print jobs submitted yet.</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="print-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Document</th>
                  <th>Pages</th>
                  <th>Copies</th>
                  <th>Submitted</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recentJobs.map(job => {
                  const statusColors = {
                    Pending: 'status-badge status-pending',
                    Printing: 'status-badge status-printing',
                    Completed: 'status-badge status-completed',
                    Cancelled: 'status-badge status-cancelled',
                  };
                  const studentProfile = allProfiles.find(p => p.id === job.user_id);
                  const studentName = job.student_name || studentProfile?.full_name || 'User';
                  const studentEmail = job.email || studentProfile?.email || '-';
                  const formattedDate = job.submitted_at
                    ? new Date(job.submitted_at).toLocaleDateString()
                    : '-';

                  return (
                    <tr key={job.id} className="table-row">
                      <td>
                        <div className="student-cell">
                          <div className="student-name">{studentName}</div>
                          <div className="student-email">{studentEmail}</div>
                        </div>
                      </td>
                      <td>
                        <div className="doc-cell">
                          <FileText size={16} className="doc-icon" />
                          <span className="doc-name">{job.document_name || 'Untitled Document'}</span>
                          {(() => {
                            const docs = getJobDocuments(job);
                            if (docs.length > 0) {
                              return (
                                <button
                                  type="button"
                                  className="btn-view-doc"
                                  onClick={() => setViewingJob(job)}
                                  title={`View ${docs.length} attached document(s)`}
                                >
                                  {docs.length > 1 ? <Paperclip size={12} /> : <Eye size={12} />}
                                  <span>{docs.length > 1 ? `View (${docs.length} Docs)` : 'View'}</span>
                                </button>
                              );
                            }
                            if (job.file_path) {
                              return (
                                <button
                                  type="button"
                                  className="btn-view-doc"
                                  onClick={() => setViewingJob(job)}
                                  title="View attached document"
                                >
                                  <Eye size={12} />
                                  <span>View</span>
                                </button>
                              );
                            }
                            return null;
                          })()}
                        </div>
                      </td>
                      <td><span className="num-pill">{job.pages ?? 0}</span></td>
                      <td><span className="num-pill">{job.copies ?? 0}</span></td>
                      <td><span className="time-text">{formattedDate}</span></td>
                      <td><span className={statusColors[job.status] || 'status-badge status-pending'}>{job.status || 'Pending'}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {viewingJob && (
        <DocumentViewerModal
          job={viewingJob}
          onClose={() => setViewingJob(null)}
        />
      )}
    </div>
  );
};

export default AdminDashboard;

