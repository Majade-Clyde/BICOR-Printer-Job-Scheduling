import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import StatCard from '../components/StatCard';
import PrintJobTable from '../components/PrintJobTable';
import Loading from '../components/Loading';
import ErrorMessage from '../components/ErrorMessage';
import {
  FileText,
  Clock,
  CheckCircle,
  FilePlus,
  RefreshCw,
  Printer,
  Sparkles,
  ArrowRight
} from 'lucide-react';

const StudentDashboard = () => {
  const { user, profile } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [pendingQueueMap, setPendingQueueMap] = useState({});
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    completed: 0,
    printing: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [processingJobId, setProcessingJobId] = useState(null);

  const fetchStudentData = useCallback(async (isSilent = false) => {
    if (!user) return;
    if (!isSilent) setRefreshing(true);
    setError('');

    try {
      // 1. Fetch all pending jobs across the school to calculate global FCFS queue positions
      const { data: allPending, error: pendingErr } = await supabase
        .from('print_jobs')
        .select('id, submitted_at')
        .eq('status', 'Pending')
        .order('submitted_at', { ascending: true });

      if (pendingErr) throw pendingErr;

      const queueMap = {};
      (allPending || []).forEach((job, index) => {
        queueMap[job.id] = index + 1; // 1-indexed queue position
      });
      setPendingQueueMap(queueMap);

      // 2. Fetch student's own print jobs
      const { data: studentJobs, error: jobsErr } = await supabase
        .from('print_jobs')
        .select('*')
        .eq('user_id', user.id)
        .order('submitted_at', { ascending: false });

      if (jobsErr) throw jobsErr;

      setJobs(studentJobs || []);

      // 3. Compute stats
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

    // Setup Supabase Realtime subscription
    const channel = supabase
      .channel('student-dashboard-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'print_jobs' },
        () => {
          fetchStudentData(true);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchStudentData]);

  // Student cancel handler (Only allowed for Pending jobs)
  const handleCancelJob = async (jobId) => {
    setProcessingJobId(jobId);
    setError('');

    try {
      const { error: cancelError } = await supabase
        .from('print_jobs')
        .update({ status: 'Cancelled' })
        .eq('id', jobId)
        .eq('status', 'Pending') // Double enforce only pending can be cancelled
        .eq('user_id', user.id);

      if (cancelError) throw cancelError;

      // Refresh list
      await fetchStudentData(true);
    } catch (err) {
      console.error('Failed to cancel job:', err);
      setError(err.message || 'Unable to cancel job. It may have already started printing.');
    } finally {
      setProcessingJobId(null);
    }
  };

  const studentName = profile?.full_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User';
  const studentEmail = user?.email || '';

  if (loading) {
    return <Loading message="Loading user dashboard..." />;
  }

  // Slice recent 5 jobs for dashboard preview
  const recentJobs = jobs.slice(0, 5);

  return (
    <div className="page-container">
      {/* Student Welcome Banner */}
      <div className="dashboard-hero">
        <div className="hero-content">
          <div className="hero-badge">
            <Sparkles size={14} />
            <span>Shared Campus Printer • FCFS Active</span>
          </div>
          <h1 className="hero-title">Welcome back, {studentName}!</h1>
          <p className="hero-subtitle">
            Email: <strong>{studentEmail}</strong> • Monitor your print queue status and submit documents below.
          </p>
        </div>

        <div className="hero-actions">
          <Link to="/student/submit" className="btn btn-primary">
            <FilePlus size={18} />
            <span>Submit Print Job</span>
          </Link>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => fetchStudentData()}
            disabled={refreshing}
            title="Refresh Queue"
          >
            <RefreshCw size={16} className={refreshing ? 'icon-spin' : ''} />
            <span>{refreshing ? 'Updating...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      <ErrorMessage message={error} onDismiss={() => setError('')} />

      {/* Statistics Cards */}
      <div className="stats-grid">
        <StatCard
          title="Total Print Jobs"
          value={stats.total}
          icon={FileText}
          variant="blue"
          description="Lifetime print requests submitted"
          to="/student/my-requests"
        />
        <StatCard
          title="Pending Jobs"
          value={stats.pending}
          icon={Clock}
          variant="yellow"
          description="Awaiting processing in FCFS queue"
          to="/student/my-requests?status=Pending"
        />
        <StatCard
          title="Printing Now"
          value={stats.printing}
          icon={Printer}
          variant="blue"
          description="Currently printing at the station"
          to="/student/my-requests?status=Printing"
        />
        <StatCard
          title="Completed Jobs"
          value={stats.completed}
          icon={CheckCircle}
          variant="green"
          description="Printed and ready for pickup"
          to="/student/my-requests?status=Completed"
        />
      </div>

      {/* Recent Print Jobs Section */}
      <div className="card mt-6">
        <div className="card-header flex-between">
          <div>
            <h3 className="card-title">Recent Print Jobs</h3>
            <p className="card-subtitle">Your latest submissions and their dynamic queue positions</p>
          </div>
          {jobs.length > 5 && (
            <Link to="/student/jobs" className="btn btn-link">
              <span>View All ({jobs.length})</span>
              <ArrowRight size={16} />
            </Link>
          )}
        </div>

        <PrintJobTable
          jobs={recentJobs}
          isOperator={false}
          pendingQueueMap={pendingQueueMap}
          onCancelJob={handleCancelJob}
          processingJobId={processingJobId}
        />
      </div>
    </div>
  );
};

export default StudentDashboard;
