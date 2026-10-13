import React, { useEffect, useState, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import PrintJobTable from '../../components/PrintJobTable';
import EditPrintJobModal from '../../components/EditPrintJobModal';
import Loading from '../../components/Loading';
import ErrorMessage from '../../components/ErrorMessage';
import { FilePlus, RefreshCw, Search, Trash2 } from 'lucide-react';
import { deleteJobDocuments } from '../../lib/storage';

const MyRequests = () => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const urlStatus = searchParams.get('status');
  const [jobs, setJobs] = useState([]);
  const [pendingQueueMap, setPendingQueueMap] = useState({});
  const [statusFilter, setStatusFilter] = useState(urlStatus || 'ALL');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (urlStatus) {
      setStatusFilter(urlStatus);
    }
  }, [urlStatus]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [editingJob, setEditingJob] = useState(null);
  const [deletingJob, setDeletingJob] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const fetchJobs = useCallback(async (isSilent = false) => {
    if (!user) return;
    if (!isSilent) setRefreshing(true);
    setError('');

    try {
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

      const { data: studentJobs, error: jobsErr } = await supabase
        .from('print_jobs')
        .select('*')
        .eq('user_id', user.id)
        .order('submitted_at', { ascending: false });

      if (jobsErr) throw jobsErr;
      setJobs(studentJobs || []);
    } catch (err) {
      console.error('Error fetching jobs:', err);
      setError('Unable to load your print requests. Please verify your connection.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    fetchJobs();
    const channel = supabase
      .channel('student-my-requests-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'print_jobs' }, () => {
        fetchJobs(true);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchJobs]);

  const handleEditSaved = (updatedJob) => {
    setJobs((currentJobs) => currentJobs.map((job) => (
      job.id === updatedJob.id ? updatedJob : job
    )));
    setEditingJob(null);
    setSuccessMessage('Print request updated successfully.');
    setTimeout(() => setSuccessMessage(''), 4000);
    fetchJobs(true);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingJob || !user) return;
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
        .eq('user_id', user.id)
        .in('status', ['Pending', 'Completed', 'Cancelled'])
        .select('id')
        .maybeSingle();

      if (deleteErr) throw deleteErr;
      if (!deletedJob) throw new Error('The request is no longer eligible for deletion.');

      setJobs((currentJobs) => currentJobs.filter((job) => job.id !== deletedJob.id));
      setDeletingJob(null);
      setSuccessMessage('Print request deleted successfully.');
      setTimeout(() => setSuccessMessage(''), 4000);
      await fetchJobs(true);
    } catch (deleteErr) {
      console.error('Failed to delete print request:', deleteErr);
      setDeleteError(deleteErr.message || 'Unable to delete print request. Please try again.');
    } finally {
      setDeleteLoading(false);
    }
  };

  const filteredJobs = jobs.filter((job) => {
    const matchesStatus = statusFilter === 'ALL' || job.status === statusFilter;
    const matchesSearch = !searchQuery.trim() ||
      job.document_name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  if (loading) return <Loading message="Loading your submitted requests..." />;

  return (
    <div className="page-container">
      <div className="page-header flex-between flex-wrap">
        <div>
          <h1 className="page-title">My Print Requests</h1>
          <p className="page-subtitle">
            View status, live queue positions, and manage your print submissions.
          </p>
        </div>
        <div className="page-actions">
          <Link to="/student/submit" className="btn btn-primary">
            <FilePlus size={18} />
            <span>Submit New Request</span>
          </Link>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => fetchJobs()}
            disabled={refreshing}
          >
            <RefreshCw size={16} className={refreshing ? 'icon-spin' : ''} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      <ErrorMessage message={error} onDismiss={() => setError('')} />
      {successMessage && (
        <div className="success-banner" role="status" aria-live="polite">
          <span>{successMessage}</span>
        </div>
      )}

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
            <button type="button" className="clear-search-btn" onClick={() => setSearchQuery('')}>×</button>
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
              {s === 'ALL' ? `All (${jobs.length})` : `${s} (${jobs.filter(j => j.status === s).length})`}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <PrintJobTable
          jobs={filteredJobs}
          isOperator={false}
          pendingQueueMap={pendingQueueMap}
          onEditJob={setEditingJob}
          onDeleteJob={(job) => {
            setDeleteError('');
            setDeletingJob(job);
          }}
        />
      </div>

      {editingJob && (
        <EditPrintJobModal
          job={editingJob}
          onClose={() => setEditingJob(null)}
          onSaved={handleEditSaved}
        />
      )}

      {deletingJob && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-request-title"
          onClick={(event) => {
            if (event.target === event.currentTarget && !deleteLoading) setDeletingJob(null);
          }}
        >
          <div className="modal-box modal-box-sm">
            <div className="delete-confirm-header">
              <div className="delete-confirm-icon"><Trash2 size={20} /></div>
              <div>
                <h2 id="delete-request-title" className="modal-title">
                  {deletingJob.status === 'Pending' ? 'Delete Print Request?' : 'Delete Completed Job?'}
                </h2>
                <p className="modal-subtitle">This action cannot be undone.</p>
              </div>
            </div>
            <p className="delete-confirm-body">
              Are you sure you want to delete {deletingJob.status === 'Pending' ? 'the print request' : 'this completed print job'} for <strong>{deletingJob.document_name}</strong>?
            </p>
            {deleteError && <div className="modal-error-banner" role="alert">{deleteError}</div>}
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

export default MyRequests;
