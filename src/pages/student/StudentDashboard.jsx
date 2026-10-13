import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import StatCard from '../../components/StatCard';
import PrintJobTable from '../../components/PrintJobTable';
import EditPrintJobModal from '../../components/EditPrintJobModal';
import Loading from '../../components/Loading';
import ErrorMessage from '../../components/ErrorMessage';
import {
  FileText, Clock, CheckCircle, FilePlus, RefreshCw,
  Printer, Sparkles, ArrowRight, Trash2
} from 'lucide-react';
import { deleteJobDocuments } from '../../lib/storage';

const StudentDashboard = () => {
  const { user, profile } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [pendingQueueMap, setPendingQueueMap] = useState({});
  const [stats, setStats] = useState({ total: 0, pending: 0, completed: 0, printing: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [editingJob, setEditingJob] = useState(null);
  const [deletingJob, setDeletingJob] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const fetchStudentData = useCallback(async (isSilent = false) => {
    if (!user) return;
    if (!isSilent) setRefreshing(true);
    setError('');

    try {
      // Fetch all pending jobs for global FCFS queue positions
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

      // Fetch student's own print jobs
      const { data: studentJobs, error: jobsErr } = await supabase
        .from('print_jobs')
        .select('*')
        .eq('user_id', user.id)
        .order('submitted_at', { ascending: false });

      if (jobsErr) throw jobsErr;

      setJobs(studentJobs || []);
      const total = studentJobs?.length || 0;
      const pending = studentJobs?.filter(j => j.status === 'Pending').length || 0;
      const completed = studentJobs?.filter(j => j.status === 'Completed').length || 0;
      const printing = studentJobs?.filter(j => j.status === 'Printing').length || 0;
      setStats({ total, pending, completed, printing });
    } catch (err) {
      console.error('Error fetching student dashboard:', err);
      setError('Unable to load print jobs. Please verify your connection.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    fetchStudentData();
    const channel = supabase
      .channel('student-dashboard-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'print_jobs' }, () => {
        fetchStudentData(true);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchStudentData]);

  const handleEditSaved = (updatedJob) => {
    setJobs((currentJobs) => currentJobs.map((job) => (
      job.id === updatedJob.id ? updatedJob : job
    )));
    setEditingJob(null);
    setSuccessMessage('Print request updated successfully.');
    setTimeout(() => setSuccessMessage(''), 4000);
    fetchStudentData(true);
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
      await fetchStudentData(true);
    } catch (deleteErr) {
      console.error('Failed to delete print request:', deleteErr);
      setDeleteError(deleteErr.message || 'Unable to delete print request. Please try again.');
    } finally {
      setDeleteLoading(false);
    }
  };

  const studentName = profile?.full_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';
  const studentEmail = user?.email || '';

  if (loading) return <Loading message="Loading user dashboard..." />;

  const recentJobs = jobs.slice(0, 5);

  return (
    <div className="page-container">
      <div className="dashboard-hero">
        <div className="hero-content">
          <div className="hero-badge">
            <span>PRINTER JOB SCHEDULING</span>
          </div>
          <h1 className="hero-title">
            Welcome back, <span className="hero-name-highlight">{studentName}!</span>
          </h1>
          <p className="hero-subtitle">
            Monitor your print queue status and submit documents below.
          </p>
          <div className="hero-actions">
            <Link to="/student/submit-request" className="btn btn-hero-cta">
              <FilePlus size={18} />
              <span>Submit Print Request</span>
              <ArrowRight size={16} className="btn-cta-arrow" />
            </Link>
            <button
              type="button"
              className="btn btn-hero-refresh"
              onClick={() => fetchStudentData()}
              disabled={refreshing}
              title="Refresh Queue"
            >
              <RefreshCw size={16} className={refreshing ? 'icon-spin' : ''} />
              <span>{refreshing ? 'Updating...' : 'Refresh'}</span>
            </button>
          </div>
        </div>
        <div className="hero-artwork">
          <img
            src={`${import.meta.env.BASE_URL}jaguar-hero.png`}
            alt="BICOR Jaguar"
            className="hero-jaguar-img"
          />
        </div>
      </div>

      <ErrorMessage message={error} onDismiss={() => setError('')} />
      {successMessage && (
        <div className="success-banner" role="status" aria-live="polite">
          <span>{successMessage}</span>
        </div>
      )}

      <div className="stats-grid">
        <StatCard title="Total Requests" value={stats.total} icon={FileText} variant="purple" description="All submitted requests" to="/student/my-requests" />
        <StatCard title="Pending" value={stats.pending} icon={Clock} variant="yellow" description="Awaiting in FCFS queue" to="/student/my-requests?status=Pending" />
        <StatCard title="Printing Now" value={stats.printing} icon={Printer} variant="purple" description="Currently at the printer" to="/student/my-requests?status=Printing" />
        <StatCard title="Completed" value={stats.completed} icon={CheckCircle} variant="green" description="Printed and ready" to="/student/my-requests?status=Completed" />
      </div>

      <div className="card mt-6">
        <div className="card-header flex-between">
          <div className="card-title-group">
            <div className="card-title-icon-badge">
              <FileText size={20} />
            </div>
            <div>
              <h3 className="card-title">Recent Print Requests</h3>
              <p className="card-subtitle">Your latest submissions and queue positions</p>
            </div>
          </div>
          <Link to="/student/my-requests" className="btn btn-table-view-all">
            <span>View All</span>
            <ArrowRight size={15} />
          </Link>
        </div>
        <PrintJobTable
          jobs={recentJobs}
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

export default StudentDashboard;
