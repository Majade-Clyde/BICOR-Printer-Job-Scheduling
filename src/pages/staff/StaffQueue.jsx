import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import StatCard from '../../components/StatCard';
import StatusBadge from '../../components/StatusBadge';
import Loading from '../../components/Loading';
import ErrorMessage from '../../components/ErrorMessage';
import DocumentViewerModal from '../../components/DocumentViewerModal';
import {
  Clock, Printer, CheckCircle2, XCircle, RefreshCw,
  FileText, Sparkles, Play, Check, X, Eye, Paperclip
} from 'lucide-react';
import { getJobDocuments, formatFileSize } from '../../lib/storage';

const formatTime = (ts) => {
  if (!ts) return '-';
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) +
    ' (' + d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ')';
};

const StaffQueue = () => {
  const [allJobs, setAllJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [successBanner, setSuccessBanner] = useState('');
  const [processingJobId, setProcessingJobId] = useState(null);
  const [viewingJob, setViewingJob] = useState(null);

  const fetchJobs = useCallback(async (isSilent = false) => {
    if (!isSilent) setRefreshing(true);
    setError('');
    try {
      const { data, error: fetchErr } = await supabase
        .from('print_jobs')
        .select('*')
        .order('submitted_at', { ascending: true });
      if (fetchErr) {
        console.error('Failed to fetch print queue (StaffQueue):', fetchErr);
        throw fetchErr;
      }
      setAllJobs(data || []);
    } catch (err) {
      console.error('StaffQueue fetch error:', err);
      setError('Failed to fetch print queue.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
    const channel = supabase
      .channel('staff-queue-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'print_jobs' }, () => fetchJobs(true))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchJobs]);

  // Jobs waiting in queue (FCFS order)
  const pendingJobsQueue = useMemo(() =>
    allJobs.filter(j => j.status === 'Pending').sort((a, b) => new Date(a.submitted_at) - new Date(b.submitted_at)),
    [allJobs]
  );

  // Currently printing
  const currentlyPrinting = useMemo(() => allJobs.filter(j => j.status === 'Printing'), [allJobs]);

  // Valid transitions (aligned with DB CHECK constraint):
  // Pending → Printing or Cancelled
  // Printing → Completed or Cancelled
  const handleStatusUpdate = async (jobId, newStatus) => {
    const currentJob = allJobs.find(j => j.id === jobId);
    if (!currentJob) return;

    const valid =
      (currentJob.status === 'Pending' && ['Printing', 'Cancelled'].includes(newStatus)) ||
      (currentJob.status === 'Printing' && ['Completed', 'Cancelled'].includes(newStatus));

    if (!valid) {
      setError(`Invalid status transition from "${currentJob.status}" to "${newStatus}".`);
      return;
    }

    setProcessingJobId(jobId);
    setError('');
    setSuccessBanner('');
    try {
      const { error: updateErr } = await supabase
        .from('print_jobs')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', jobId);
      if (updateErr) throw updateErr;
      setSuccessBanner(`Job "${currentJob.document_name}" updated to "${newStatus}".`);
      setTimeout(() => setSuccessBanner(''), 4000);
      await fetchJobs(true);
    } catch (err) {
      setError(err.message || 'Failed to update job status.');
    } finally {
      setProcessingJobId(null);
    }
  };

  if (loading) return <Loading message="Loading Print Queue..." />;

  return (
    <div className="page-container">
      <div className="dashboard-hero operator-hero">
        <div className="hero-content">
          <h1 className="hero-title">Print Queue</h1>
          <p className="hero-subtitle">
            Pending jobs ordered by arrival time (FCFS). Top job is next to process.
          </p>
        </div>
        <div className="hero-actions">
          <button type="button" className="btn btn-outline" onClick={() => fetchJobs()} disabled={refreshing}>
            <RefreshCw size={16} className={refreshing ? 'icon-spin' : ''} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh Queue'}</span>
          </button>
        </div>
      </div>

      <ErrorMessage message={error} onDismiss={() => setError('')} />
      {successBanner && (
        <div className="success-banner">
          <CheckCircle2 size={20} className="success-icon" />
          <span>{successBanner}</span>
        </div>
      )}

      {/* Currently Printing */}
      {currentlyPrinting.length > 0 && (
        <div className="card currently-printing-card mt-6">
          <div className="currently-printing-header">
            <div className="pulse-indicator">
              <span className="pulse-dot"></span>
              <Printer size={20} />
              <h4>Currently Printing ({currentlyPrinting.length})</h4>
            </div>
            <span className="printing-badge-tag">Hardware Active</span>
          </div>
          <div className="currently-printing-list">
            {currentlyPrinting.map(pJob => {
              const pDocs = getJobDocuments(pJob);
              return (
                <div key={pJob.id} className="active-print-item">
                  <div className="active-print-details">
                    <div className="active-print-doc">
                      <FileText size={18} />
                      <strong>{pJob.document_name}</strong>
                      {pDocs.length > 0 ? (
                        <button
                          type="button"
                          className="btn-view-doc"
                          style={{ marginLeft: '0.65rem' }}
                          onClick={() => setViewingJob(pJob)}
                          title={`View ${pDocs.length} attached document(s)`}
                        >
                          {pDocs.length > 1 ? <Paperclip size={12} /> : <Eye size={12} />}
                          <span>{pDocs.length > 1 ? `View (${pDocs.length} Docs)` : 'View Document'}</span>
                        </button>
                      ) : pJob.file_path ? (
                        <button
                          type="button"
                          className="btn-view-doc"
                          style={{ marginLeft: '0.65rem' }}
                          onClick={() => setViewingJob(pJob)}
                          title="View attached document"
                        >
                          <Eye size={12} />
                          <span>View Document</span>
                        </button>
                      ) : null}
                    </div>
                    <div className="active-print-meta">
                      <span>User: <strong>{pJob.student_name}</strong></span>
                      <span>• Pages: <strong>{pJob.pages}</strong></span>
                      <span>• Copies: <strong>{pJob.copies}</strong></span>
                      <span>• Paper Size: <strong>{pJob.paper_size || 'Short (8.5 × 11 in)'}</strong></span>
                      <span>• Mode: <strong>{pJob.color ? 'Color' : 'B&W'}</strong></span>
                    </div>
                  </div>
                  <div className="active-print-actions">
                    <button
                      type="button"
                      className="btn btn-action btn-complete"
                      onClick={() => handleStatusUpdate(pJob.id, 'Completed')}
                      disabled={processingJobId === pJob.id}
                    >
                      <Check size={16} /><span>Complete Job</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn-action btn-cancel"
                      onClick={() => handleStatusUpdate(pJob.id, 'Cancelled')}
                      disabled={processingJobId === pJob.id}
                    >
                      <X size={16} /><span>Cancel</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pending Queue */}
      <div className="card queue-card mt-6">
        <div className="card-header flex-between flex-wrap">
          <div>
            <div className="section-title-with-badge">
              <h3 className="card-title">Pending Queue</h3>
              <span className="queue-count-badge">{pendingJobsQueue.length} Jobs Waiting</span>
            </div>
            <p className="card-subtitle">Jobs waiting to be printed (FCFS order). Start printing the top job.</p>
          </div>
          <span className="fcfs-rule-pill">
            <Sparkles size={14} />
            Next: <strong>{pendingJobsQueue[0]?.document_name || 'Queue Empty'}</strong>
          </span>
        </div>
        {pendingJobsQueue.length === 0 ? (
          <div className="empty-state-box">
            <CheckCircle2 size={48} className="empty-icon success-icon-tint" />
            <p className="empty-desc">No pending requests. Queue is clear.</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="print-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>User</th>
                  <th>Document</th>
                  <th>Pages</th>
                  <th>Copies</th>
                  <th>Paper Size</th>
                  <th>Color</th>
                  <th>Type</th>
                  <th>Submitted</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingJobsQueue.map((job, idx) => {
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
                      <td><span className={`color-pill ${job.color ? 'is-color' : 'is-bw'}`}>{job.color ? 'Color' : 'B&W'}</span></td>
                      <td><span className="num-pill">{job.print_type || 'standard'}</span></td>
                      <td><span className="time-text">{formatTime(job.submitted_at)}</span></td>
                      <td><StatusBadge status={job.status} /></td>
                      <td>
                        <div className="action-buttons-group">
                          <button
                            type="button"
                            className="btn btn-action btn-start-print"
                            onClick={() => handleStatusUpdate(job.id, 'Printing')}
                            disabled={processingJobId === job.id}
                          >
                            <Play size={14} /><span>Start Printing</span>
                          </button>
                          <button
                            type="button"
                            className="btn btn-action btn-cancel"
                            onClick={() => handleStatusUpdate(job.id, 'Cancelled')}
                            disabled={processingJobId === job.id}
                          >
                            <X size={14} /><span>Cancel</span>
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

      {viewingJob && (
        <DocumentViewerModal
          job={viewingJob}
          onClose={() => setViewingJob(null)}
        />
      )}
    </div>
  );
};

export default StaffQueue;
