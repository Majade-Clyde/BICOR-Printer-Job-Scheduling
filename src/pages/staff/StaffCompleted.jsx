import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import StatusBadge from '../../components/StatusBadge';
import Loading from '../../components/Loading';
import ErrorMessage from '../../components/ErrorMessage';
import DocumentViewerModal from '../../components/DocumentViewerModal';
import { RefreshCw, FileText, CheckCircle2, Eye, Paperclip, Trash2 } from 'lucide-react';
import { getJobDocuments, deleteJobDocuments } from '../../lib/storage';

const formatTime = (ts) => {
  if (!ts) return '-';
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) +
    ' (' + d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ')';
};

const StaffCompleted = () => {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [successBanner, setSuccessBanner] = useState('');
  const [viewingJob, setViewingJob] = useState(null);
  const [deletingJob, setDeletingJob] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const fetchJobs = useCallback(async (isSilent = false) => {
    if (!isSilent) setRefreshing(true);
    setError('');
    try {
      const { data, error: fetchErr } = await supabase
        .from('print_jobs')
        .select('*')
        .in('status', ['Completed', 'Cancelled'])
        .order('submitted_at', { ascending: false });
      if (fetchErr) {
        console.error('Failed to fetch completed jobs:', fetchErr);
        throw fetchErr;
      }
      setJobs(data || []);
    } catch (err) {
      console.error('StaffCompleted fetch error:', err);
      setError('Failed to fetch completed jobs.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
    const channel = supabase
      .channel('staff-completed-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'print_jobs' }, () => fetchJobs(true))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchJobs]);

  const handleDeleteConfirm = async () => {
    if (!deletingJob) return;
    setDeleteLoading(true);
    setDeleteError('');

    try {
      // 1. Delete associated uploaded documents from Supabase Storage
      await deleteJobDocuments(deletingJob);

      // 2. Delete database record
      const { data: deletedJob, error: deleteErr } = await supabase
        .from('print_jobs')
        .delete()
        .eq('id', deletingJob.id)
        .in('status', ['Completed', 'Cancelled'])
        .select('id')
        .maybeSingle();

      if (deleteErr) throw deleteErr;
      if (!deletedJob) {
        throw new Error('This completed job record could not be deleted or is no longer available.');
      }

      setJobs(prev => prev.filter(j => j.id !== deletedJob.id));
      setDeletingJob(null);
      setSuccessBanner('Completed job deleted successfully.');
      setTimeout(() => setSuccessBanner(''), 4000);
      await fetchJobs(true);
    } catch (err) {
      console.error('Failed to delete completed job:', err);
      setDeleteError(err.message || 'Unable to delete completed job. Please try again.');
    } finally {
      setDeleteLoading(false);
    }
  };

  if (loading) return <Loading message="Loading Completed Jobs..." />;

  return (
    <div className="page-container">
      <div className="page-header flex-between flex-wrap">
        <div>
          <h1 className="page-title">Completed Jobs</h1>
          <p className="page-subtitle">History of completed and cancelled print jobs.</p>
        </div>
        <button type="button" className="btn btn-outline" onClick={() => fetchJobs()} disabled={refreshing}>
          <RefreshCw size={16} className={refreshing ? 'icon-spin' : ''} />
          <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
        </button>
      </div>

      <ErrorMessage message={error} onDismiss={() => setError('')} />
      {successBanner && (
        <div className="success-banner" role="status">
          <CheckCircle2 size={20} className="success-icon" />
          <span>{successBanner}</span>
        </div>
      )}

      <div className="card">
        {jobs.length === 0 ? (
          <div className="empty-state-box">
            <CheckCircle2 size={48} className="empty-icon success-icon-tint" />
            <h4 className="empty-title">No completed jobs yet.</h4>
            <p className="empty-desc">Completed, rejected, and cancelled jobs will appear here.</p>
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
                  <th>Color</th>
                  <th>Submitted</th>
                  <th>Completed At</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map(job => {
                  const docs = getJobDocuments(job);
                  return (
                    <tr key={job.id} className="table-row">
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
                      <td><span className={`color-pill ${job.color ? 'is-color' : 'is-bw'}`}>{job.color ? 'Color' : 'B&W'}</span></td>
                      <td><span className="time-text">{formatTime(job.submitted_at)}</span></td>
                      <td><span className="time-text">{formatTime(job.updated_at || job.submitted_at)}</span></td>
                      <td><StatusBadge status={job.status} /></td>
                      <td>
                        <div className="action-buttons-group">
                          <button
                            type="button"
                            className="btn btn-action btn-cancel"
                            onClick={() => {
                              setDeleteError('');
                              setDeletingJob(job);
                            }}
                            title="Delete completed print job record"
                            aria-label="Delete completed print job"
                          >
                            <Trash2 size={13} />
                            <span>Delete</span>
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

      {/* Delete Confirmation Modal */}
      {deletingJob && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-completed-title"
          onClick={(e) => {
            if (e.target === e.currentTarget && !deleteLoading) setDeletingJob(null);
          }}
        >
          <div className="modal-box modal-box-sm">
            <div className="delete-confirm-header">
              <div className="delete-confirm-icon">
                <Trash2 size={20} />
              </div>
              <div>
                <h2 id="delete-completed-title" className="modal-title">
                  Delete Completed Job?
                </h2>
                <p className="modal-subtitle">
                  This action cannot be undone.
                </p>
              </div>
            </div>
            <p className="delete-confirm-body">
              Are you sure you want to delete this completed print job for <strong>{deletingJob.document_name}</strong>?
            </p>
            {deleteError && (
              <div className="modal-error-banner" role="alert">
                {deleteError}
              </div>
            )}
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setDeletingJob(null)}
                disabled={deleteLoading}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleDeleteConfirm}
                disabled={deleteLoading}
              >
                <Trash2 size={15} />
                <span>{deleteLoading ? 'Deleting...' : 'Delete Job'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StaffCompleted;
