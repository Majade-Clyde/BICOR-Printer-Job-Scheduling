import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import StatusBadge from '../../components/StatusBadge';
import Loading from '../../components/Loading';
import ErrorMessage from '../../components/ErrorMessage';
import DocumentViewerModal from '../../components/DocumentViewerModal';
import { RefreshCw, FileText, Sparkles, ListOrdered, Eye, Paperclip } from 'lucide-react';
import { getJobDocuments, formatFileSize } from '../../lib/storage';

const formatTime = (ts) => {
  if (!ts) return '-';
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) +
    ' (' + d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ')';
};

const AdminQueue = () => {
  const [allJobs, setAllJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [viewingJob, setViewingJob] = useState(null);

  const fetchJobs = useCallback(async (isSilent = false) => {
    if (!isSilent) setRefreshing(true);
    setError('');
    try {
      const { data, error: fetchErr } = await supabase
        .from('print_jobs')
        .select('*')
        .in('status', ['Pending', 'Printing'])
        .order('submitted_at', { ascending: true });
      if (fetchErr) {
        console.error('Failed to fetch print queue:', fetchErr);
        throw fetchErr;
      }
      setAllJobs(data || []);
    } catch (err) {
      console.error('AdminQueue fetch error:', err);
      setError('Failed to fetch print queue.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
    const channel = supabase
      .channel('admin-queue-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'print_jobs' }, () => fetchJobs(true))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchJobs]);

  const pendingJobs = useMemo(() => allJobs.filter(j => j.status === 'Pending'), [allJobs]);
  const printingJobs = useMemo(() => allJobs.filter(j => j.status === 'Printing'), [allJobs]);

  if (loading) return <Loading message="Loading Print Queue..." />;

  return (
    <div className="page-container">
      <div className="dashboard-hero operator-hero">
        <div className="hero-content">
          <div className="hero-badge badge-operator-pill">
            <ListOrdered size={14} />
            <span>Admin View • Read Only</span>
          </div>
          <h1 className="hero-title">Print Queue Monitor</h1>
          <p className="hero-subtitle">Monitor the print queue in real-time. Jobs ordered by FCFS (First-Come, First-Served).</p>
        </div>
        <div className="hero-actions">
          <button type="button" className="btn btn-outline" onClick={() => fetchJobs()} disabled={refreshing}>
            <RefreshCw size={16} className={refreshing ? 'icon-spin' : ''} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh Queue'}</span>
          </button>
        </div>
      </div>

      <ErrorMessage message={error} onDismiss={() => setError('')} />

      {/* Currently Printing */}
      {printingJobs.length > 0 && (
        <div className="card currently-printing-card mt-6">
          <div className="currently-printing-header">
            <div className="pulse-indicator">
              <span className="pulse-dot"></span>
              <h4>Now Printing ({printingJobs.length})</h4>
            </div>
          </div>
          <div className="table-responsive">
            <table className="print-table">
              <thead><tr><th>User</th><th>Document</th><th>Pages</th><th>Copies</th><th>Paper Size</th><th>Color</th><th>Submitted</th><th>Status</th></tr></thead>
              <tbody>
                {printingJobs.map(job => {
                  const docs = getJobDocuments(job);
                  return (
                    <tr key={job.id} className="table-row row-printing">
                      <td><div className="student-cell"><div className="student-name">{job.student_name}</div><div className="student-email">{job.email}</div></div></td>
                      <td>
                        <div className="doc-cell">
                          <FileText size={16} className="doc-icon" />
                          <span className="doc-name">{job.document_name}</span>
                          {docs.length > 0 ? (
                            <button
                              type="button"
                              className="btn-view-doc"
                              onClick={() => setViewingJob(job)}
                              title={`View ${docs.length} attached document(s)`}
                            >
                              {docs.length > 1 ? <Paperclip size={12} /> : <Eye size={12} />}
                              <span>{docs.length > 1 ? `View (${docs.length} Docs)` : 'View'}</span>
                            </button>
                          ) : job.file_path ? (
                            <button
                              type="button"
                              className="btn-view-doc"
                              onClick={() => setViewingJob(job)}
                              title="View attached document"
                            >
                              <Eye size={12} />
                              <span>View</span>
                            </button>
                          ) : null}
                        </div>
                      </td>
                      <td><span className="num-pill">{job.pages}</span></td>
                      <td><span className="num-pill">{job.copies}</span></td>
                      <td><span className="paper-size-pill">{job.paper_size || 'Short (8.5 × 11 in)'}</span></td>
                      <td><span className={`color-pill ${job.color ? 'is-color' : 'is-bw'}`}>{job.color ? 'Color' : 'B&W'}</span></td>
                      <td><span className="time-text">{formatTime(job.submitted_at)}</span></td>
                      <td><StatusBadge status={job.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pending Queue */}
      <div className="card queue-card mt-6">
        <div className="card-header flex-between">
          <div>
            <div className="section-title-with-badge">
              <h3 className="card-title">Pending – Awaiting Print</h3>
              <span className="queue-count-badge">{pendingJobs.length} Jobs Waiting</span>
            </div>
          </div>
          <span className="fcfs-rule-pill"><Sparkles size={14} />Next: <strong>{pendingJobs[0]?.document_name || 'Queue Empty'}</strong></span>
        </div>
        <div className="table-responsive">
          <table className="print-table">
            <thead><tr><th>#</th><th>User</th><th>Document</th><th>Pages</th><th>Copies</th><th>Paper Size</th><th>Submitted</th><th>Status</th></tr></thead>
            <tbody>
              {pendingJobs.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>No pending requests.</td></tr>
              ) : pendingJobs.map((job, idx) => {
                const docs = getJobDocuments(job);
                return (
                  <tr key={job.id} className={`table-row ${idx === 0 ? 'row-next-up' : ''}`}>
                    <td><span className={`queue-badge ${idx === 0 ? 'queue-first' : ''}`}>#{idx + 1}</span></td>
                    <td><div className="student-cell"><div className="student-name">{job.student_name}</div><div className="student-email">{job.email}</div></div></td>
                    <td>
                      <div className="doc-cell">
                        <FileText size={16} className="doc-icon" />
                        <span className="doc-name">{job.document_name}</span>
                        {docs.length > 0 ? (
                          <button
                            type="button"
                            className="btn-view-doc"
                            onClick={() => setViewingJob(job)}
                            title={`View ${docs.length} attached document(s)`}
                          >
                            {docs.length > 1 ? <Paperclip size={12} /> : <Eye size={12} />}
                            <span>{docs.length > 1 ? `View (${docs.length} Docs)` : 'View'}</span>
                          </button>
                        ) : job.file_path ? (
                          <button
                            type="button"
                            className="btn-view-doc"
                            onClick={() => setViewingJob(job)}
                            title="View attached document"
                          >
                            <Eye size={12} />
                            <span>View</span>
                          </button>
                        ) : null}
                      </div>
                    </td>
                    <td><span className="num-pill">{job.pages}</span></td>
                    <td><span className="num-pill">{job.copies}</span></td>
                    <td><span className="paper-size-pill">{job.paper_size || 'Short (8.5 × 11 in)'}</span></td>
                    <td><span className="time-text">{formatTime(job.submitted_at)}</span></td>
                    <td><StatusBadge status={job.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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

export default AdminQueue;
