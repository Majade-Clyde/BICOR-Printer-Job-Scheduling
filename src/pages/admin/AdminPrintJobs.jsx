import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import StatusBadge from '../../components/StatusBadge';
import Loading from '../../components/Loading';
import ErrorMessage from '../../components/ErrorMessage';
import { RefreshCw, Search, FileText, Eye, Paperclip, Trash2, CheckCircle2 } from 'lucide-react';
import { getJobDocuments, deleteJobDocuments, formatFileSize } from '../../lib/storage';
import DocumentViewerModal from '../../components/DocumentViewerModal';

const formatTime = (ts) => {
  if (!ts) return '-';
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) +
    ' (' + d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ')';
};

const AdminPrintJobs = () => {
  const [searchParams] = useSearchParams();
  const urlStatus = searchParams.get('status');
  const [allJobs, setAllJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [successBanner, setSuccessBanner] = useState('');
  const [searchStudent, setSearchStudent] = useState('');
  const [searchDoc, setSearchDoc] = useState('');
  const [statusFilter, setStatusFilter] = useState(urlStatus || 'ALL');
  const [viewingJob, setViewingJob] = useState(null);
  const [deletingJob, setDeletingJob] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    if (urlStatus) {
      setStatusFilter(urlStatus);
    }
  }, [urlStatus]);

  const fetchJobs = useCallback(async (isSilent = false) => {
    if (!isSilent) setRefreshing(true);
    setError('');
    try {
      const { data, error: fetchErr } = await supabase
        .from('print_jobs')
        .select('*')
        .order('submitted_at', { ascending: false });
      if (fetchErr) {
        console.error('Failed to fetch print jobs:', fetchErr);
        throw fetchErr;
      }
      setAllJobs(data || []);
    } catch (err) {
      console.error('AdminPrintJobs fetch error:', err);
      setError('Failed to fetch print jobs.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
    const channel = supabase
      .channel('admin-print-jobs-realtime')
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

      setAllJobs(prev => prev.filter(j => j.id !== deletedJob.id));
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

  const filteredJobs = useMemo(() =>
    allJobs.filter(job => {
      const matchStatus = statusFilter === 'ALL' || job.status === statusFilter;
      const matchStudent = !searchStudent.trim() ||
        (job.student_name?.toLowerCase().includes(searchStudent.toLowerCase())) ||
        (job.email?.toLowerCase().includes(searchStudent.toLowerCase()));
      const matchDoc = !searchDoc.trim() || job.document_name?.toLowerCase().includes(searchDoc.toLowerCase());
      return matchStatus && matchStudent && matchDoc;
    }),
    [allJobs, statusFilter, searchStudent, searchDoc]
  );

  if (loading) return <Loading message="Loading all print jobs..." />;

  return (
    <div className="page-container">
      <div className="page-header flex-between flex-wrap">
        <div>
          <h1 className="page-title">All Print Jobs</h1>
          <p className="page-subtitle">View complete print job history across all users.</p>
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

      <div className="operator-filter-controls">
        <div className="search-field">
          <Search size={16} className="search-icon" />
          <input type="text" className="search-input" placeholder="Search by user name or email..." value={searchStudent} onChange={e => setSearchStudent(e.target.value)} />
          {searchStudent && <button type="button" className="clear-search-btn" onClick={() => setSearchStudent('')}>×</button>}
        </div>
        <div className="search-field">
          <Search size={16} className="search-icon" />
          <input type="text" className="search-input" placeholder="Search by document name..." value={searchDoc} onChange={e => setSearchDoc(e.target.value)} />
          {searchDoc && <button type="button" className="clear-search-btn" onClick={() => setSearchDoc('')}>×</button>}
        </div>
        <div className="status-dropdown-wrapper">
          <select className="filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="ALL">All Statuses ({allJobs.length})</option>
            {['Pending', 'Printing', 'Completed', 'Cancelled'].map(s => (
              <option key={s} value={s}>{s} ({allJobs.filter(j => j.status === s).length})</option>
            ))}
          </select>
        </div>
      </div>

      <div className="card mt-4">
        <div className="table-responsive">
          <table className="print-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Document</th>
                <th>Pages</th>
                <th>Copies</th>
                <th>Paper Size</th>
                <th>Color</th>
                <th>Type</th>
                <th>Notes</th>
                <th>Submitted</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredJobs.length === 0 ? (
                <tr><td colSpan={11} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>No print jobs found.</td></tr>
              ) : filteredJobs.map(job => {
                const docs = getJobDocuments(job);
                const isDeletable = job.status === 'Completed' || job.status === 'Cancelled';
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
                    <td><span className="paper-size-pill">{job.paper_size || 'Short (8.5 × 11 in)'}</span></td>
                    <td><span className={`color-pill ${job.color ? 'is-color' : 'is-bw'}`}>{job.color ? 'Color' : 'B&W'}</span></td>
                    <td><span className="num-pill">{job.print_type || 'standard'}</span></td>
                    <td><span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{job.notes || '-'}</span></td>
                    <td><span className="time-text">{formatTime(job.submitted_at)}</span></td>
                    <td><StatusBadge status={job.status} /></td>
                    <td>
                      {isDeletable ? (
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
                      ) : (
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>-</span>
                      )}
                    </td>
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

      {/* Delete Confirmation Modal */}
      {deletingJob && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-admin-title"
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
                <h2 id="delete-admin-title" className="modal-title">
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

export default AdminPrintJobs;
