import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import PrintJobTable from '../components/PrintJobTable';
import EditPrintJobModal from '../components/EditPrintJobModal';
import Loading from '../components/Loading';
import ErrorMessage from '../components/ErrorMessage';
import {
  FilePlus, RefreshCw, Filter, Clock, Search,
  AlertTriangle, CheckCircle, Trash2
} from 'lucide-react';

const MyJobs = () => {
  const { user } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [pendingQueueMap, setPendingQueueMap] = useState({});
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [processingJobId, setProcessingJobId] = useState(null);

  // --- Edit modal state ---
  const [editingJob, setEditingJob] = useState(null); // null = modal closed

  // --- Delete confirm state ---
  const [deletingJob, setDeletingJob] = useState(null); // null = dialog closed
  const [deleteLoading, setDeleteLoading] = useState(false);

  // --- Toast notifications ---
  const [toast, setToast] = useState(null); // { type: 'success'|'error', message: string }

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchJobs = useCallback(async (isSilent = false) => {
    if (!user) return;
    if (!isSilent) setRefreshing(true);
    setError('');

    try {
      // 1. Fetch pending jobs for dynamic queue numbering
      const { data: allPending, error: pendingErr } = await supabase
        .from('print_jobs')
        .select('id, submitted_at')
        .eq('status', 'Pending')
        .order('submitted_at', { ascending: true });

      if (pendingErr) throw pendingErr;

      const queueMap = {};
      (allPending || []).forEach((job, index) => {
        queueMap[job.id] = index + 1;
      });
      setPendingQueueMap(queueMap);

      // 2. Fetch current student's jobs
      const { data: studentJobs, error: jobsErr } = await supabase
        .from('print_jobs')
        .select('*')
        .eq('user_id', user.id)
        .order('submitted_at', { ascending: false });

      if (jobsErr) throw jobsErr;

      setJobs(studentJobs || []);
    } catch (err) {
      console.error('Error fetching jobs:', err);
      setError('Unable to load your print jobs. Please verify your connection.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    fetchJobs();

    const channel = supabase
      .channel('student-jobs-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'print_jobs' },
        () => { fetchJobs(true); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchJobs]);

  // -----------------------------------------------------------------------
  // EDIT HANDLERS
  // -----------------------------------------------------------------------
  const handleEditJob = (job) => {
    setEditingJob(job);
  };

  const handleEditClose = () => {
    setEditingJob(null);
  };

  const handleEditSaved = (updatedJob) => {
    // Optimistically patch the local list without a full refetch
    setJobs((prev) =>
      prev.map((j) => (j.id === updatedJob.id ? updatedJob : j))
    );
    setEditingJob(null);
    showToast('success', 'Print request updated successfully.');
  };

  // -----------------------------------------------------------------------
  // DELETE HANDLERS
  // -----------------------------------------------------------------------
  const handleDeleteJob = (job) => {
    setDeletingJob(job);
  };

  const handleDeleteCancel = () => {
    setDeletingJob(null);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingJob || !user) return;
    setDeleteLoading(true);

    try {
      const { error: deleteError } = await supabase
        .from('print_jobs')
        .delete()
        // Client-side defence-in-depth (RLS is the real enforcement on the server)
        .eq('id',      deletingJob.id)
        .eq('user_id', user.id)
        .eq('status',  'Pending');

      if (deleteError) throw deleteError;

      // Optimistically remove from local list
      setJobs((prev) => prev.filter((j) => j.id !== deletingJob.id));
      setDeletingJob(null);
      showToast('success', 'Print request deleted successfully.');
    } catch (err) {
      console.error('Failed to delete job:', err);
      setDeletingJob(null);
      showToast('error', err.message || 'Unable to delete print request. Please try again.');
    } finally {
      setDeleteLoading(false);
    }
  };

  // -----------------------------------------------------------------------
  // CANCEL HANDLER (legacy — kept for safety)
  // -----------------------------------------------------------------------
  const handleCancelJob = async (jobId) => {
    setProcessingJobId(jobId);
    setError('');

    try {
      const { error: cancelError } = await supabase
        .from('print_jobs')
        .update({ status: 'Cancelled' })
        .eq('id', jobId)
        .eq('status', 'Pending')
        .eq('user_id', user.id);

      if (cancelError) throw cancelError;

      await fetchJobs(true);
    } catch (err) {
      console.error('Failed to cancel job:', err);
      setError(err.message || 'Cannot cancel this job. It may already be in progress.');
    } finally {
      setProcessingJobId(null);
    }
  };

  // Filter jobs
  const filteredJobs = jobs.filter((job) => {
    const matchesStatus = statusFilter === 'ALL' || job.status === statusFilter;
    const matchesSearch = !searchQuery.trim() ||
      job.document_name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  if (loading) {
    return <Loading message="Loading your submitted jobs..." />;
  }

  return (
    <div className="page-container">
      {/* Toast notification */}
      {toast && (
        <div className={`toast-notification toast-${toast.type}`} role="status" aria-live="polite">
          {toast.type === 'success'
            ? <CheckCircle size={16} />
            : <AlertTriangle size={16} />}
          <span>{toast.message}</span>
        </div>
      )}

      <div className="page-header flex-between flex-wrap">
        <div>
          <h1 className="page-title">My Print Jobs</h1>
          <p className="page-subtitle">
            View status, live queue positions, and manage your print submissions.
          </p>
        </div>

        <div className="page-actions">
          <Link to="/student/submit" className="btn btn-primary">
            <FilePlus size={18} />
            <span>Submit New Job</span>
          </Link>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => fetchJobs()}
            disabled={refreshing}
            title="Refresh jobs"
          >
            <RefreshCw size={16} className={refreshing ? 'icon-spin' : ''} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      <ErrorMessage message={error} onDismiss={() => setError('')} />

      {/* Filter and Search Bar */}
      <div className="filter-bar">
        <div className="search-input-wrapper">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="Search by document name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="clear-search-btn"
              onClick={() => setSearchQuery('')}
            >
              ×
            </button>
          )}
        </div>

        <div className="status-filter-pills">
          {['ALL', 'Pending', 'Printing', 'Completed', 'Cancelled'].map((s) => (
            <button
              key={s}
              type="button"
              className={`filter-pill ${statusFilter === s ? 'active' : ''}`}
              onClick={() => setStatusFilter(s)}
            >
              {s === 'ALL'
                ? `All (${jobs.length})`
                : `${s} (${jobs.filter(j => j.status === s).length})`}
            </button>
          ))}
        </div>
      </div>

      {/* Jobs Table */}
      <div className="card">
        <PrintJobTable
          jobs={filteredJobs}
          isOperator={false}
          pendingQueueMap={pendingQueueMap}
          onCancelJob={handleCancelJob}
          onEditJob={handleEditJob}
          onDeleteJob={handleDeleteJob}
          processingJobId={processingJobId}
        />
      </div>

      {/* Edit Modal */}
      {editingJob && (
        <EditPrintJobModal
          job={editingJob}
          onClose={handleEditClose}
          onSaved={handleEditSaved}
        />
      )}

      {/* Delete Confirmation Dialog */}
      {deletingJob && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-confirm-title"
          onClick={(e) => { if (e.target === e.currentTarget) handleDeleteCancel(); }}
        >
          <div className="modal-box modal-box-sm">
            <div className="delete-confirm-header">
              <div className="delete-confirm-icon">
                <Trash2 size={22} />
              </div>
              <div>
                <h2 id="delete-confirm-title" className="modal-title">Delete Print Request?</h2>
                <p className="modal-subtitle">This action cannot be undone.</p>
              </div>
            </div>

            <div className="delete-confirm-body">
              <p>Are you sure you want to delete the print request for:</p>
              <p className="delete-confirm-docname">
                &ldquo;{deletingJob.document_name}&rdquo;
              </p>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-outline"
                onClick={handleDeleteCancel}
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
                {deleteLoading ? (
                  <span className="btn-loading">Deleting...</span>
                ) : (
                  <>
                    <Trash2 size={15} />
                    <span>Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MyJobs;
