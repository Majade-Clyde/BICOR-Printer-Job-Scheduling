import React, { useState } from 'react';
import StatusBadge from './StatusBadge';
import { Play, Check, X, FileText, User, Clock, Layers, Palette, Pencil, Trash2, MoreVertical, Eye, Paperclip } from 'lucide-react';
import { getJobDocuments, formatFileSize } from '../lib/storage';
import DocumentViewerModal from './DocumentViewerModal';

const formatDateTime = (timestamp) => {
  if (!timestamp) return '-';
  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) +
      ' (' + date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ')';
  } catch {
    return timestamp;
  }
};

const PrintJobTable = ({
  jobs = [],
  isOperator = false,
  pendingQueueMap = {}, // Map of jobId -> dynamic queue number (1, 2, 3...)
  onStatusUpdate,       // (jobId, newStatus) => Promise<void>
  onEditJob,            // (job) => void  — student: open edit modal
  onDeleteJob,          // (job) => void  — student: open delete confirm
  processingJobId = null
}) => {
  const [viewingJob, setViewingJob] = useState(null);

  if (!jobs || jobs.length === 0) {
    return (
      <div className="empty-state-box">
        <FileText size={48} className="empty-icon" />
        <h4 className="empty-title">No print jobs found.</h4>
        <p className="empty-desc">
          {isOperator
            ? 'There are currently no print jobs matching your criteria.'
            : 'You haven’t submitted any print jobs yet.'}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="table-responsive">
        <table className="print-table">
          <thead>
            <tr>
              <th className="th-queue">Queue #</th>
              {isOperator && <th className="th-student">User</th>}
              <th className="th-doc">Document</th>
              <th className="th-pages">Pages</th>
              <th className="th-copies">Copies</th>
              <th className="th-color">Color</th>
              <th className="th-time">Submitted Time</th>
              <th className="th-status">Status</th>
              <th className="th-actions">Action</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => {
              const queueNum = pendingQueueMap[job.id];
              const isPending = job.status === 'Pending';
              const isPrinting = job.status === 'Printing';
              const isCompleted = job.status === 'Completed';
              const isCancelled = job.status === 'Cancelled';
              const isProcessing = processingJobId === job.id;
              const docs = getJobDocuments(job);

              return (
                <tr
                  key={job.id}
                  className={`table-row ${isPrinting ? 'row-printing' : ''} ${isPending && queueNum === 1 ? 'row-next-up' : ''}`}
                >
                  {/* Dynamically calculated queue position for pending jobs */}
                  <td className="td-queue">
                    {isPending && queueNum ? (
                      <span className={`queue-badge ${queueNum === 1 ? 'queue-first' : ''}`}>
                        #{queueNum}
                      </span>
                    ) : isPrinting ? (
                      <span className="queue-badge-printing">Printing</span>
                    ) : (
                      <span className="queue-badge-none">-</span>
                    )}
                  </td>

                  {/* Operator view includes student details */}
                  {isOperator && (
                    <td className="td-student">
                      <div className="student-cell">
                        <div className="student-name">{job.student_name || 'Anonymous User'}</div>
                        <div className="student-email">{job.email}</div>
                      </div>
                    </td>
                  )}

                  <td className="td-doc">
                    <div className="doc-cell" title={job.document_name}>
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

                  <td className="td-pages">
                    <span className="num-pill">{job.pages}</span>
                  </td>

                  <td className="td-copies">
                    <span className="num-pill">{job.copies}</span>
                  </td>

                  <td className="td-color">
                    <span className={`color-pill ${job.color ? 'is-color' : 'is-bw'}`}>
                      {job.color ? 'Yes (Color)' : 'No (B&W)'}
                    </span>
                  </td>

                  <td className="td-time">
                    <span className="time-text">{formatDateTime(job.submitted_at)}</span>
                  </td>

                  <td className="td-status">
                    <StatusBadge status={job.status} />
                  </td>

                  <td className="td-actions">
                    <div className="action-buttons-group">
                      {/* Operator Workflow Controls */}
                      {isOperator ? (
                        <>
                          {isPending && (
                            <>
                              <button
                                type="button"
                                className="btn btn-action btn-start-print"
                                onClick={() => onStatusUpdate(job.id, 'Printing')}
                                disabled={isProcessing}
                                title="Start Printing (FCFS Queue)"
                              >
                                <Play size={14} />
                                <span>Start Printing</span>
                              </button>
                              <button
                                type="button"
                                className="btn btn-action btn-cancel"
                                onClick={() => onStatusUpdate(job.id, 'Cancelled')}
                                disabled={isProcessing}
                                title="Cancel Job"
                              >
                                <X size={14} />
                                <span>Cancel</span>
                              </button>
                            </>
                          )}

                          {isPrinting && (
                            <>
                              <button
                                type="button"
                                className="btn btn-action btn-complete"
                                onClick={() => onStatusUpdate(job.id, 'Completed')}
                                disabled={isProcessing}
                                title="Mark as Completed"
                              >
                                <Check size={14} />
                                <span>Complete Job</span>
                              </button>
                              <button
                                type="button"
                                className="btn btn-action btn-cancel"
                                onClick={() => onStatusUpdate(job.id, 'Cancelled')}
                                disabled={isProcessing}
                                title="Cancel Printing Job"
                              >
                                <X size={14} />
                                <span>Cancel</span>
                              </button>
                            </>
                          )}

                          {(isCompleted || isCancelled) && (
                            <span className="action-completed-label">
                              {isCompleted ? 'Finished' : 'Cancelled'}
                            </span>
                          )}
                        </>
                      ) : (
                        /* Student Workflow Controls */
                        <>
                          {isPending ? (
                            <>
                              {/* Edit button — only for Pending */}
                              {onEditJob && (
                                <button
                                  type="button"
                                  className="btn btn-action btn-student-edit"
                                  onClick={() => onEditJob(job)}
                                  disabled={isProcessing}
                                  title="Edit Print Request"
                                  aria-label="Edit print request"
                                >
                                  <Pencil size={14} />
                                </button>
                              )}
                              {/* Delete button — for Pending */}
                              {onDeleteJob && (
                                <button
                                  type="button"
                                  className="btn btn-action btn-student-delete"
                                  onClick={() => onDeleteJob(job)}
                                  disabled={isProcessing}
                                  title="Delete Print Request"
                                  aria-label="Delete print request"
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                              {!onEditJob && !onDeleteJob && (
                                <button
                                  type="button"
                                  className="btn-action-dots"
                                  onClick={() => setViewingJob(job)}
                                  title="View Documents"
                                  aria-label="View Documents"
                                >
                                  <Eye size={16} />
                                </button>
                              )}
                            </>
                          ) : (isCompleted || isCancelled) ? (
                            <>
                              {/* Delete button — for Completed or Cancelled */}
                              {onDeleteJob ? (
                                <button
                                  type="button"
                                  className="btn btn-action btn-student-delete"
                                  onClick={() => onDeleteJob(job)}
                                  disabled={isProcessing}
                                  title="Delete Completed Job"
                                  aria-label="Delete completed print job"
                                >
                                  <Trash2 size={14} />
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="btn-action-dots"
                                  onClick={() => setViewingJob(job)}
                                  title="View Documents"
                                  aria-label="View Documents"
                                >
                                  <Eye size={16} />
                                </button>
                              )}
                            </>
                          ) : (
                            <button
                              type="button"
                              className="btn-action-dots"
                              onClick={() => setViewingJob(job)}
                              title="View Documents"
                              aria-label="View Documents"
                            >
                              <Eye size={16} />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {viewingJob && (
        <DocumentViewerModal
          job={viewingJob}
          onClose={() => setViewingJob(null)}
        />
      )}
    </>
  );
};

export default PrintJobTable;
