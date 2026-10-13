import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import StatCard from '../components/StatCard';
import StatusBadge from '../components/StatusBadge';
import PrintJobTable from '../components/PrintJobTable';
import Loading from '../components/Loading';
import ErrorMessage from '../components/ErrorMessage';
import {
  FileText,
  Clock,
  Printer,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Search,
  Filter,
  Play,
  Check,
  X,
  Sparkles,
  Layers,
  SlidersHorizontal,
  ShieldCheck,
  AlertTriangle
} from 'lucide-react';

const formatTime = (ts) => {
  if (!ts) return '-';
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) +
      ' (' + d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ')';
  } catch {
    return ts;
  }
};

const OperatorDashboard = () => {
  const { user, profile } = useAuth();

  const [allJobs, setAllJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [successBanner, setSuccessBanner] = useState('');
  const [processingJobId, setProcessingJobId] = useState(null);

  // Search & Filter controls
  const [searchStudent, setSearchStudent] = useState('');
  const [searchDocument, setSearchDocument] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Fetch all jobs ordered by submitted_at ASC (FCFS baseline)
  const fetchOperatorJobs = useCallback(async (isSilent = false) => {
    if (!isSilent) setRefreshing(true);
    setError('');

    try {
      const { data, error: fetchErr } = await supabase
        .from('print_jobs')
        .select('*')
        .order('submitted_at', { ascending: true }); // FCFS order

      if (fetchErr) throw fetchErr;

      setAllJobs(data || []);
    } catch (err) {
      console.error('Operator fetch error:', err);
      setError('Failed to fetch print jobs from Supabase. Ensure operator RLS permissions are active.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchOperatorJobs();

    // Supabase Realtime subscription for live operator synchronization
    const channel = supabase
      .channel('operator-realtime-print-jobs')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'print_jobs' },
        () => {
          fetchOperatorJobs(true);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchOperatorJobs]);

  // Compute Statistics
  const stats = useMemo(() => {
    const total = allJobs.length;
    const pending = allJobs.filter((j) => j.status === 'Pending').length;
    const printing = allJobs.filter((j) => j.status === 'Printing').length;
    const completed = allJobs.filter((j) => j.status === 'Completed').length;
    const cancelled = allJobs.filter((j) => j.status === 'Cancelled').length;

    return { total, pending, printing, completed, cancelled };
  }, [allJobs]);

  // Extract Active FCFS Queue: Pending jobs sorted by submitted_at ASC
  const pendingJobsQueue = useMemo(() => {
    return allJobs
      .filter((j) => j.status === 'Pending')
      .sort((a, b) => new Date(a.submitted_at) - new Date(b.submitted_at));
  }, [allJobs]);

  // Dynamic Queue Number map for all pending jobs
  const pendingQueueMap = useMemo(() => {
    const map = {};
    pendingJobsQueue.forEach((job, index) => {
      map[job.id] = index + 1; // 1, 2, 3...
    });
    return map;
  }, [pendingJobsQueue]);

  // Filtered list for "All Print Jobs" tab/view
  const filteredAllJobs = useMemo(() => {
    return allJobs.filter((job) => {
      const matchesStatus = statusFilter === 'ALL' || job.status === statusFilter;
      const matchesStudent = !searchStudent.trim() ||
        (job.student_name && job.student_name.toLowerCase().includes(searchStudent.toLowerCase())) ||
        (job.email && job.email.toLowerCase().includes(searchStudent.toLowerCase()));
      const matchesDoc = !searchDocument.trim() ||
        (job.document_name && job.document_name.toLowerCase().includes(searchDocument.toLowerCase()));

      return matchesStatus && matchesStudent && matchesDoc;
    });
  }, [allJobs, statusFilter, searchStudent, searchDocument]);

  // Status Transition Handler with FCFS Enforcement
  const handleStatusUpdate = async (jobId, newStatus) => {
    const currentJob = allJobs.find((j) => j.id === jobId);
    if (!currentJob) return;

    // Validate Status Transitions:
    // Valid:
    // Pending -> Printing
    // Pending -> Cancelled
    // Printing -> Completed
    // Printing -> Cancelled
    const valid =
      (currentJob.status === 'Pending' && (newStatus === 'Printing' || newStatus === 'Cancelled')) ||
      (currentJob.status === 'Printing' && (newStatus === 'Completed' || newStatus === 'Cancelled'));

    if (!valid) {
      setError(`Invalid status transition from "${currentJob.status}" to "${newStatus}". Completed or Cancelled jobs cannot be altered.`);
      return;
    }

    setProcessingJobId(jobId);
    setError('');
    setSuccessBanner('');

    try {
      const { error: updateErr } = await supabase
        .from('print_jobs')
        .update({ status: newStatus })
        .eq('id', jobId);

      if (updateErr) throw updateErr;

      setSuccessBanner(`Job for "${currentJob.student_name}" updated to "${newStatus}".`);
      setTimeout(() => setSuccessBanner(''), 4000);

      // Refresh list
      await fetchOperatorJobs(true);
    } catch (err) {
      console.error('Status transition error:', err);
      setError(err.message || 'Failed to update job status.');
    } finally {
      setProcessingJobId(null);
    }
  };

  // Currently printing job (if any)
  const currentlyPrintingJobs = allJobs.filter((j) => j.status === 'Printing');

  if (loading) {
    return <Loading message="Loading Operator Station & Print Queue..." />;
  }

  return (
    <div className="page-container">
      {/* Operator Header */}
      <div className="dashboard-hero operator-hero">
        <div className="hero-content">
          <div className="hero-badge badge-operator-pill">
            <ShieldCheck size={14} />
            <span>Operator Control Center • Station Active</span>
          </div>
          <h1 className="hero-title">Station Print Queue Management</h1>
          <p className="hero-subtitle">
            Processing jobs in First-Come, First-Served order. Oldest pending job holds top priority.
          </p>
        </div>

        <div className="hero-actions">
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => fetchOperatorJobs()}
            disabled={refreshing}
            title="Reload from Supabase"
          >
            <RefreshCw size={16} className={refreshing ? 'icon-spin' : ''} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh Queue'}</span>
          </button>
        </div>
      </div>

      <ErrorMessage message={error} onDismiss={() => setError('')} />

      {successBanner && (
        <div className="success-banner" role="status">
          <CheckCircle2 size={20} className="success-icon" />
          <span>{successBanner}</span>
        </div>
      )}

      {/* Operator Statistics Cards */}
      <div className="stats-grid stats-grid-5">
        <StatCard
          title="Total Jobs"
          value={stats.total}
          icon={Layers}
          variant="blue"
          description="All submissions"
          to="/staff/print-requests"
        />
        <StatCard
          title="Pending Queue"
          value={stats.pending}
          icon={Clock}
          variant="yellow"
          description="In FCFS waitlist"
          to="/staff/queue"
        />
        <StatCard
          title="Now Printing"
          value={stats.printing}
          icon={Printer}
          variant="blue"
          description="Printer active"
          to="/staff/queue"
        />
        <StatCard
          title="Completed"
          value={stats.completed}
          icon={CheckCircle2}
          variant="green"
          description="Successfully printed"
          to="/staff/completed"
        />
        <StatCard
          title="Cancelled"
          value={stats.cancelled}
          icon={XCircle}
          variant="red"
          description="Withdrawn/cancelled"
          to="/staff/print-requests?status=Cancelled"
        />
      </div>

      {/* Currently Printing Spotlight (if any jobs are in Printing state) */}
      {currentlyPrintingJobs.length > 0 && (
        <div className="card currently-printing-card mt-6">
          <div className="currently-printing-header">
            <div className="pulse-indicator">
              <span className="pulse-dot"></span>
              <Printer size={20} />
              <h4>Currently Printing at Station ({currentlyPrintingJobs.length})</h4>
            </div>
            <span className="printing-badge-tag">Hardware Active</span>
          </div>

          <div className="currently-printing-list">
            {currentlyPrintingJobs.map((pJob) => (
              <div key={pJob.id} className="active-print-item">
                <div className="active-print-details">
                  <div className="active-print-doc">
                    <FileText size={18} />
                    <strong>{pJob.document_name}</strong>
                  </div>
                  <div className="active-print-meta">
                    <span>User: <strong>{pJob.student_name}</strong> ({pJob.email})</span>
                    <span>• Pages: <strong>{pJob.pages}</strong></span>
                    <span>• Copies: <strong>{pJob.copies}</strong></span>
                    <span>• Mode: <strong>{pJob.color ? 'Color' : 'B&W'}</strong></span>
                    <span>• Submitted: <strong>{formatTime(pJob.submitted_at)}</strong></span>
                  </div>
                </div>

                <div className="active-print-actions">
                  <button
                    type="button"
                    className="btn btn-action btn-complete"
                    onClick={() => handleStatusUpdate(pJob.id, 'Completed')}
                    disabled={processingJobId === pJob.id}
                  >
                    <Check size={16} />
                    <span>Complete Job</span>
                  </button>
                  <button
                    type="button"
                    className="btn btn-action btn-cancel"
                    onClick={() => handleStatusUpdate(pJob.id, 'Cancelled')}
                    disabled={processingJobId === pJob.id}
                  >
                    <X size={16} />
                    <span>Cancel</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECTION: Current Print Queue (FCFS Active Queue) */}
      <div className="card queue-card mt-6">
        <div className="card-header flex-between flex-wrap">
          <div>
            <div className="section-title-with-badge">
              <h3 className="card-title">Current Print Queue</h3>
              <span className="queue-count-badge">
                {pendingJobsQueue.length} {pendingJobsQueue.length === 1 ? 'Job' : 'Jobs'} Waiting
              </span>
            </div>
            <p className="card-subtitle">
              Pending jobs ordered by arrival time (<code>submitted_at ASC</code>). The top job is next up to print.
            </p>
          </div>

          <div className="queue-quick-info">
            <span className="fcfs-rule-pill">
              <Sparkles size={14} />
              Next to Process: <strong>{pendingJobsQueue[0] ? pendingJobsQueue[0].document_name : 'Queue Empty'}</strong>
            </span>
          </div>
        </div>

        {pendingJobsQueue.length === 0 ? (
          <div className="empty-state-box">
            <CheckCircle2 size={48} className="empty-icon success-icon-tint" />
            <h4 className="empty-title">Queue is clear!</h4>
            <p className="empty-desc">No pending jobs waiting. Ready for incoming user requests.</p>
          </div>
        ) : (
          <PrintJobTable
            jobs={pendingJobsQueue}
            isOperator={true}
            pendingQueueMap={pendingQueueMap}
            onStatusUpdate={handleStatusUpdate}
            processingJobId={processingJobId}
          />
        )}
      </div>

      {/* SECTION: All Print Jobs (with Search & Filters) */}
      <div className="card mt-6">
        <div className="card-header flex-between flex-wrap">
          <div>
            <h3 className="card-title">All Print Records</h3>
            <p className="card-subtitle">
              Filter by user name, document title, or status across entire history.
            </p>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="operator-filter-controls">
          <div className="search-field">
            <Search size={16} className="search-icon" />
            <input
              type="text"
              className="search-input"
              placeholder="Search by user name or email..."
              value={searchStudent}
              onChange={(e) => setSearchStudent(e.target.value)}
            />
            {searchStudent && (
              <button
                type="button"
                className="clear-search-btn"
                onClick={() => setSearchStudent('')}
              >
                ×
              </button>
            )}
          </div>

          <div className="search-field">
            <Search size={16} className="search-icon" />
            <input
              type="text"
              className="search-input"
              placeholder="Search by document name..."
              value={searchDocument}
              onChange={(e) => setSearchDocument(e.target.value)}
            />
            {searchDocument && (
              <button
                type="button"
                className="clear-search-btn"
                onClick={() => setSearchDocument('')}
              >
                ×
              </button>
            )}
          </div>

          <div className="status-dropdown-wrapper">
            <select
              className="filter-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="ALL">All Statuses ({allJobs.length})</option>
              <option value="Pending">Pending ({stats.pending})</option>
              <option value="Printing">Printing ({stats.printing})</option>
              <option value="Completed">Completed ({stats.completed})</option>
              <option value="Cancelled">Cancelled ({stats.cancelled})</option>
            </select>
          </div>
        </div>

        {/* Filtered Jobs Table */}
        <PrintJobTable
          jobs={filteredAllJobs}
          isOperator={true}
          pendingQueueMap={pendingQueueMap}
          onStatusUpdate={handleStatusUpdate}
          processingJobId={processingJobId}
        />
      </div>
    </div>
  );
};

export default OperatorDashboard;
