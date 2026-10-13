import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import StatCard from '../../components/StatCard';
import Loading from '../../components/Loading';
import ErrorMessage from '../../components/ErrorMessage';
import { Clock, Printer, CheckCircle2, XCircle, RefreshCw, UserCog, Sparkles } from 'lucide-react';

const StaffDashboard = () => {
  const { user, profile } = useAuth();
  const [allJobs, setAllJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const fetchJobs = useCallback(async (isSilent = false) => {
    if (!isSilent) setRefreshing(true);
    setError('');
    try {
      const { data, error: fetchErr } = await supabase
        .from('print_jobs')
        .select('*')
        .order('submitted_at', { ascending: true });
      if (fetchErr) {
        console.error('Failed to fetch print jobs (StaffDashboard):', fetchErr);
        throw fetchErr;
      }
      setAllJobs(data || []);
    } catch (err) {
      console.error('StaffDashboard fetch error:', err);
      setError('Failed to fetch print jobs. Ensure staff RLS permissions are active.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
    const channel = supabase
      .channel('staff-dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'print_jobs' }, () => fetchJobs(true))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchJobs]);

  const stats = useMemo(() => ({
    pending: allJobs.filter(j => j.status === 'Pending').length,
    printing: allJobs.filter(j => j.status === 'Printing').length,
    completed: allJobs.filter(j => j.status === 'Completed').length,
    cancelled: allJobs.filter(j => j.status === 'Cancelled').length,
  }), [allJobs]);

  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'Staff';

  if (loading) return <Loading message="Loading Staff Dashboard..." />;

  return (
    <div className="page-container">
      <div className="dashboard-hero operator-hero">
        <div className="hero-content">
          <div className="hero-badge">
            <span>STAFF CONTROL CENTER • FCFS ACTIVE</span>
          </div>
          <h1 className="hero-title">
            Welcome back, <span className="hero-name-highlight">{displayName}!</span>
          </h1>
          <p className="hero-subtitle">
            Processing jobs in First-Come, First-Served order.
          </p>
          <div className="hero-actions">
            <button type="button" className="btn btn-hero-refresh" onClick={() => fetchJobs()} disabled={refreshing}>
              <RefreshCw size={16} className={refreshing ? 'icon-spin' : ''} />
              <span>{refreshing ? 'Refreshing...' : 'Refresh Queue'}</span>
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

      <div className="stats-grid stats-grid-4">
        <StatCard title="Pending Requests" value={stats.pending} icon={Clock} variant="yellow" description="Waiting to print" to="/staff/queue" />
        <StatCard title="Now Printing" value={stats.printing} icon={Printer} variant="blue" description="Printer active" to="/staff/queue" />
        <StatCard title="Completed" value={stats.completed} icon={CheckCircle2} variant="green" description="Successfully printed" to="/staff/completed" />
        <StatCard title="Cancelled" value={stats.cancelled} icon={XCircle} variant="red" description="Cancelled jobs" to="/staff/print-requests?status=Cancelled" />
      </div>

      {/* Next in Queue */}
      <div className="card mt-6">
        <div className="card-header">
          <div className="section-title-with-badge">
            <h3 className="card-title">Next in Queue</h3>
            <span className="queue-count-badge">{stats.pending} Waiting</span>
          </div>
          <p className="card-subtitle">The next pending job to process (FCFS order)</p>
        </div>
        {allJobs.filter(j => j.status === 'Pending').length === 0 ? (
          <div className="empty-state-box">
            <CheckCircle2 size={48} className="empty-icon success-icon-tint" />
            <h4 className="empty-title">Queue is clear!</h4>
            <p className="empty-desc">No pending requests. Ready for incoming user submissions.</p>
          </div>
        ) : (
          <div className="next-queue-item">
            {(() => {
              const next = allJobs.filter(j => j.status === 'Pending').sort((a, b) => new Date(a.submitted_at) - new Date(b.submitted_at))[0];
              return (
                <div className="active-print-item">
                  <div className="active-print-details">
                    <div className="active-print-doc">
                      <strong>{next.document_name}</strong>
                    </div>
                    <div className="active-print-meta">
                      <span>User: <strong>{next.student_name}</strong></span>
                      <span>• Pages: <strong>{next.pages}</strong></span>
                      <span>• Copies: <strong>{next.copies}</strong></span>
                      <span>• Mode: <strong>{next.color ? 'Color' : 'B&W'}</strong></span>
                    </div>
                  </div>
                  <div className="fcfs-badge">
                    <Sparkles size={14} />
                    <span>#1 in Queue</span>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
};

export default StaffDashboard;
