import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import DocumentViewerModal from './DocumentViewerModal';
import {
  X,
  FileText,
  Layers,
  Copy,
  Palette,
  StickyNote,
  Save,
  AlertCircle,
  Eye,
  Paperclip
} from 'lucide-react';
import { getJobDocuments, formatFileSize } from '../lib/storage';

const PRINT_TYPES = [
  { value: 'standard', label: 'Standard' },
  { value: 'photo', label: 'Photo Print' },
  { value: 'thick', label: 'Thick Paper' },
  { value: 'legal', label: 'Legal Size' },
];

/**
 * EditPrintJobModal
 *
 * Props:
 *   job     - The print_jobs row to edit (must have status === 'Pending')
 *   onClose - Called to dismiss the modal
 *   onSaved - Called with the updated job row after a successful save
 */
const EditPrintJobModal = ({ job, onClose, onSaved }) => {
  const { user } = useAuth();

  const [documentName, setDocumentName] = useState(job?.document_name ?? '');
  const [pages, setPages] = useState(String(job?.pages ?? 1));
  const [copies, setCopies] = useState(String(job?.copies ?? 1));
  const [printType, setPrintType] = useState(job?.print_type ?? 'standard');
  const [isColor, setIsColor] = useState(Boolean(job?.color));
  const [notes, setNotes] = useState(job?.notes ?? '');

  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [showDocViewer, setShowDocViewer] = useState(false);
  const docs = getJobDocuments(job);

  const modalRef = useRef(null);

  // Sync form state if job prop changes
  useEffect(() => {
    if (job) {
      setDocumentName(job.document_name ?? '');
      setPages(String(job.pages ?? 1));
      setCopies(String(job.copies ?? 1));
      setPrintType(job.print_type ?? 'standard');
      setIsColor(Boolean(job.color));
      setNotes(job.notes ?? '');
      setFormError('');
    }
  }, [job]);

  // Close on Escape key
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Prevent background scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  if (!job || job.status !== 'Pending') return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    const trimmedDoc = documentName.trim();
    if (!trimmedDoc) {
      setFormError('Document / File Name is required.');
      return;
    }

    const parsedPages = Number(pages);
    if (!Number.isInteger(parsedPages) || parsedPages <= 0) {
      setFormError('Number of Pages must be a positive whole number greater than 0.');
      return;
    }

    const parsedCopies = Number(copies);
    if (!Number.isInteger(parsedCopies) || parsedCopies <= 0) {
      setFormError('Number of Copies must be a positive whole number greater than 0.');
      return;
    }

    const validPrintTypes = ['standard', 'photo', 'thick', 'legal'];
    const safePrintType = validPrintTypes.includes(printType) ? printType : 'standard';

    if (!user) {
      setFormError('You must be logged in to update a print request.');
      return;
    }

    setLoading(true);

    // Only update student-editable fields.
    // NEVER touch: status, user_id, submitted_at, assigned_staff_id, etc.
    // Status must remain strictly 'Pending'.
    const updateData = {
      document_name: trimmedDoc,
      pages: parsedPages,
      copies: parsedCopies,
      print_type: safePrintType,
      color: Boolean(isColor),
      notes: notes.trim(),
      updated_at: new Date().toISOString(),
    };

    try {
      const { data, error: updateError } = await supabase
        .from('print_jobs')
        .update(updateData)
        // Ensure student can only update their own Pending job
        .eq('id', job.id)
        .eq('user_id', user.id)
        .eq('status', 'Pending')
        .select()
        .maybeSingle();

      if (updateError) {
        console.error('UPDATE PRINT JOB ERROR:', updateError);
        console.error('Update data:', updateData);
        console.error('Error details:', {
          message: updateError.message,
          details: updateError.details,
          hint: updateError.hint,
          code: updateError.code,
        });
        throw updateError;
      }

      if (!data) {
        throw new Error('The request is no longer eligible for editing or does not exist.');
      }

      onSaved(data);
    } catch (err) {
      console.error('Failed to update print job:', err);
      const displayMsg = err?.message
        ? `Unable to update print request: ${err.message}`
        : 'Unable to update print request. Please try again.';
      setFormError(displayMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="modal-backdrop"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-modal-title"
    >
      <div className="modal-box" ref={modalRef}>
        {/* Header */}
        <div className="modal-header">
          <div className="modal-header-left">
            <div className="modal-icon-wrap">
              <FileText size={20} />
            </div>
            <div>
              <h2 id="edit-modal-title" className="modal-title">Edit Print Request</h2>
              <p className="modal-subtitle">Only Pending jobs can be modified.</p>
            </div>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            disabled={loading}
            aria-label="Close"
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {formError && (
          <div className="modal-error-banner" role="alert">
            <AlertCircle size={15} />
            <span>{formError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="modal-form" noValidate>
          {/* Document Name */}
          <div className="form-group">
            <label htmlFor="edit-documentName" className="form-label">
              <FileText size={15} />
              <span>Document / File Name</span>
              <span className="required-star">*</span>
            </label>
            <input
              id="edit-documentName"
              type="text"
              className="form-input"
              placeholder="e.g. Thesis_Chapter1.pdf"
              value={documentName}
              onChange={(e) => setDocumentName(e.target.value)}
              disabled={loading}
              required
            />
            {docs.length > 0 ? (
              <div style={{ marginTop: '0.45rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span className="doc-attached-badge">
                  <Paperclip size={12} />
                  {docs.length} Attached {docs.length === 1 ? 'Document' : 'Documents'}
                </span>
                <button
                  type="button"
                  className="btn-view-doc"
                  onClick={() => setShowDocViewer(true)}
                >
                  <Eye size={12} />
                  <span>{docs.length > 1 ? `View All (${docs.length} Files)` : 'View Document'}</span>
                </button>
              </div>
            ) : job.file_path ? (
              <div style={{ marginTop: '0.45rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span className="doc-attached-badge">
                  <Paperclip size={12} />
                  Attached ({job.file_size ? formatFileSize(job.file_size) : 'File'})
                </span>
                <button
                  type="button"
                  className="btn-view-doc"
                  onClick={() => setShowDocViewer(true)}
                >
                  <Eye size={12} />
                  <span>View Document</span>
                </button>
              </div>
            ) : null}
          </div>

          {/* Pages + Copies */}
          <div className="form-row-2">
            <div className="form-group">
              <label htmlFor="edit-pages" className="form-label">
                <Layers size={15} />
                <span>Pages</span>
                <span className="required-star">*</span>
              </label>
              <input
                id="edit-pages"
                type="number"
                min="1"
                step="1"
                className="form-input"
                value={pages}
                onChange={(e) => setPages(e.target.value)}
                disabled={loading}
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="edit-copies" className="form-label">
                <Copy size={15} />
                <span>Copies</span>
                <span className="required-star">*</span>
              </label>
              <input
                id="edit-copies"
                type="number"
                min="1"
                step="1"
                className="form-input"
                value={copies}
                onChange={(e) => setCopies(e.target.value)}
                disabled={loading}
                required
              />
            </div>
          </div>

          {/* Print Type */}
          <div className="form-group">
            <label htmlFor="edit-printType" className="form-label">
              <FileText size={15} />
              <span>Print Type</span>
            </label>
            <select
              id="edit-printType"
              className="form-input"
              value={printType}
              onChange={(e) => setPrintType(e.target.value)}
              disabled={loading}
            >
              {PRINT_TYPES.map((pt) => (
                <option key={pt.value} value={pt.value}>{pt.label}</option>
              ))}
            </select>
          </div>

          {/* Color Mode */}
          <div className="form-group">
            <label className="form-label">
              <Palette size={15} />
              <span>Color Mode</span>
            </label>
            <div className="color-options-grid">
              <label className={`color-option-card ${!isColor ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="edit-colorMode"
                  checked={!isColor}
                  onChange={() => setIsColor(false)}
                  disabled={loading}
                />
                <div className="color-option-info">
                  <span className="color-title">Black &amp; White</span>
                  <span className="color-desc">Standard laser printing</span>
                </div>
              </label>
              <label className={`color-option-card ${isColor ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="edit-colorMode"
                  checked={isColor}
                  onChange={() => setIsColor(true)}
                  disabled={loading}
                />
                <div className="color-option-info">
                  <span className="color-title">Color (High Quality)</span>
                  <span className="color-desc">For graphs, diagrams, and photos</span>
                </div>
              </label>
            </div>
          </div>

          {/* Notes */}
          <div className="form-group">
            <label htmlFor="edit-notes" className="form-label">
              <StickyNote size={15} />
              <span>Notes (Optional)</span>
            </label>
            <textarea
              id="edit-notes"
              className="form-input form-textarea"
              placeholder="Any special instructions for the staff..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={loading}
              rows={3}
            />
          </div>

          {/* Summary */}
          <div className="form-summary-pill">
            <span>
              Est. Total Pages:{' '}
              <strong>{(parseInt(pages, 10) || 0) * (parseInt(copies, 10) || 0)} pages</strong>
            </span>
            <span>Color: <strong>{isColor ? 'Yes' : 'No'}</strong></span>
          </div>

          {/* Footer */}
          <div className="modal-footer">
            <button type="button" className="btn btn-outline" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? (
                <span className="btn-loading">Saving...</span>
              ) : (
                <>
                  <Save size={16} />
                  <span>Save Changes</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {showDocViewer && (
        <DocumentViewerModal
          job={job}
          onClose={() => setShowDocViewer(false)}
        />
      )}
    </div>
  );
};

export default EditPrintJobModal;
