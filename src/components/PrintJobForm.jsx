import React, { useState, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import {
  FileText,
  Copy,
  Layers,
  Palette,
  Send,
  StickyNote,
  CheckCircle,
  UploadCloud,
  FileCheck,
  Image as ImageIcon,
  Trash2,
  AlertCircle,
  Plus,
  RefreshCw,
  Files
} from 'lucide-react';
import ErrorMessage from './ErrorMessage';
import {
  validateDocumentFile,
  formatFileSize,
  getFileCategory,
  uploadMultipleDocuments,
  ALLOWED_EXTENSIONS
} from '../lib/storage';

const PRINT_TYPES = [
  { value: 'standard', label: 'Standard' },
  { value: 'photo', label: 'Photo Print' },
  { value: 'thick', label: 'Thick Paper' },
  { value: 'legal', label: 'Legal Size' },
];

const PrintJobForm = ({ redirectTo = '/student/my-requests' }) => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [documentName, setDocumentName] = useState('');
  const [pages, setPages] = useState('1');
  const [copies, setCopies] = useState('1');
  const [printType, setPrintType] = useState('standard');
  const [isColor, setIsColor] = useState(false);
  const [notes, setNotes] = useState('');

  // Multi-File Upload State: array of { id, file, name, size, type, status: 'ready'|'uploading'|'completed'|'failed', error: null }
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [fileError, setFileError] = useState('');

  const [loading, setLoading] = useState(false);
  const [uploadProgressText, setUploadProgressText] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Total combined size across all selected files
  const totalFilesSize = useMemo(() => {
    return selectedFiles.reduce((acc, f) => acc + (f.size || 0), 0);
  }, [selectedFiles]);

  // Trigger native file picker
  const handleTriggerUpload = () => {
    setFileError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = ''; // Reset input so re-selecting triggers onChange
      fileInputRef.current.click();
    }
  };

  // Handle multiple file selection from input
  const handleFileChange = (e) => {
    const rawFiles = Array.from(e.target.files || []);
    if (rawFiles.length === 0) return;

    setFileError('');
    const newValidItems = [];
    const errors = [];
    let skippedDuplicates = 0;

    rawFiles.forEach((file) => {
      // 1. Validate file format and size (max 20 MB)
      const validation = validateDocumentFile(file);
      if (!validation.valid) {
        errors.push(`${file.name}: ${validation.error}`);
        return;
      }

      // 2. Prevent duplicate files (same name and size)
      const isDuplicate = selectedFiles.some(
        (existing) => existing.name === file.name && existing.size === file.size
      ) || newValidItems.some(
        (item) => item.name === file.name && item.size === file.size
      );

      if (isDuplicate) {
        skippedDuplicates++;
        return;
      }

      newValidItems.push({
        id: `${Date.now()}_${Math.random().toString(36).substring(2, 9)}_${file.name}`,
        file,
        name: file.name,
        size: file.size,
        type: file.type || `application/${file.name.split('.').pop()}`,
        status: 'ready', // 'ready', 'uploading', 'completed', 'failed'
        error: null,
      });
    });

    if (errors.length > 0) {
      setFileError(errors.join(' | '));
    } else if (skippedDuplicates > 0 && newValidItems.length === 0) {
      setFileError('Selected file(s) are already added.');
    }

    if (newValidItems.length > 0) {
      const updatedList = [...selectedFiles, ...newValidItems];
      setSelectedFiles(updatedList);

      // Auto-populate document name if empty or single file
      if (!documentName.trim()) {
        if (updatedList.length === 1) {
          setDocumentName(updatedList[0].name);
        } else {
          setDocumentName(`${updatedList[0].name} (+${updatedList.length - 1} more)`);
        }
      } else if (selectedFiles.length === 0 && updatedList.length > 1) {
        setDocumentName(`${updatedList[0].name} (+${updatedList.length - 1} more)`);
      }
    }
  };

  // Remove individual file
  const handleRemoveFile = (idToRemove) => {
    const updated = selectedFiles.filter(f => f.id !== idToRemove);
    setSelectedFiles(updated);
    setFileError('');

    if (updated.length === 0) {
      if (fileInputRef.current) fileInputRef.current.value = '';
    } else if (updated.length === 1) {
      // If user had auto-generated title, simplify to single file name
      if (documentName.includes('(+')) {
        setDocumentName(updated[0].name);
      }
    }
  };

  // Clear all selected files with confirmation
  const handleClearAllFiles = () => {
    if (selectedFiles.length > 0) {
      if (!window.confirm(`Remove all ${selectedFiles.length} selected document(s)?`)) {
        return;
      }
    }
    setSelectedFiles([]);
    setFileError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setFileError('');
    setSuccessMessage('');

    const trimmedDocName = documentName.trim();
    if (!trimmedDocName) {
      setError('Document / File Name is required.');
      return;
    }

    const parsedPages = parseInt(pages, 10);
    if (isNaN(parsedPages) || parsedPages <= 0) {
      setError('Number of Pages is required and must be greater than 0.');
      return;
    }

    const parsedCopies = parseInt(copies, 10);
    if (isNaN(parsedCopies) || parsedCopies <= 0) {
      setError('Number of Copies is required and must be greater than 0.');
      return;
    }

    if (!user) {
      setError('You must be logged in to submit a print request.');
      return;
    }

    setLoading(true);

    try {
      let uploadedDocuments = [];

      // 1. Upload all selected files to Supabase Storage
      if (selectedFiles.length > 0) {
        setUploadProgressText(`Uploading ${selectedFiles.length} document(s) to secure storage...`);

        // Track per-file upload progress
        uploadedDocuments = await uploadMultipleDocuments(
          selectedFiles,
          user.id,
          (index, status, errorMsg) => {
            setSelectedFiles((prev) =>
              prev.map((item, i) =>
                i === index
                  ? { ...item, status, error: errorMsg || null }
                  : item
              )
            );
            if (status === 'uploading') {
              setUploadProgressText(`Uploading (${index + 1}/${selectedFiles.length}): ${selectedFiles[index]?.name}`);
            }
          }
        );
      }

      setUploadProgressText('Creating print job request...');

      const studentName = profile?.full_name || user?.user_metadata?.full_name || user.email.split('@')[0];
      const studentEmail = user.email;

      // Primary file fallback for backwards compatibility
      const primaryDoc = uploadedDocuments[0] || null;

      const jobPayload = {
        user_id: user.id,
        student_name: studentName,
        email: studentEmail,
        document_name: trimmedDocName,
        pages: parsedPages,
        copies: parsedCopies,
        print_type: printType,
        color: Boolean(isColor),
        notes: notes.trim(),
        status: 'Pending',
        submitted_at: new Date().toISOString(),
        // Multi-file documents array
        documents: uploadedDocuments,
        // Legacy single-file columns
        file_path: primaryDoc?.file_path || null,
        file_size: primaryDoc?.file_size || null,
        file_type: primaryDoc?.file_type || null,
        file_url: primaryDoc?.file_url || null,
      };

      const { error: insertError } = await supabase
        .from('print_jobs')
        .insert([jobPayload]);

      if (insertError) throw insertError;

      setSuccessMessage(`Print request with ${uploadedDocuments.length || 1} document(s) submitted successfully! Redirecting...`);
      setDocumentName('');
      setSelectedFiles([]);
      setPages('1');
      setCopies('1');
      setPrintType('standard');
      setIsColor(false);
      setNotes('');

      setTimeout(() => {
        navigate(redirectTo);
      }, 1200);
    } catch (err) {
      console.error('Submission error:', err);
      setError(err.message || 'Failed to submit print request. Please check your connection and try again.');
    } finally {
      setLoading(false);
      setUploadProgressText('');
    }
  };

  // Helper to render file icon based on file category
  const renderPreviewFileIcon = (fileItem) => {
    const category = getFileCategory(fileItem.name, fileItem.type);
    if (category === 'image') return <ImageIcon size={22} className="text-purple" />;
    if (category === 'pdf') return <FileCheck size={22} className="text-purple" />;
    return <FileText size={22} className="text-purple" />;
  };

  return (
    <div className="card form-card">
      <div className="card-header">
        <h3 className="card-title">New Print Request</h3>
        <p className="card-subtitle">Jobs are queued strictly by arrival time (First-Come, First-Served).</p>
      </div>

      <ErrorMessage message={error} onDismiss={() => setError('')} />

      {successMessage && (
        <div className="success-banner" role="status">
          <CheckCircle size={20} className="success-icon" />
          <span>{successMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="print-form">
        {/* Native Multi-File Input */}
        <input
          ref={fileInputRef}
          type="file"
          id="realDocumentUploadInput"
          multiple
          accept={ALLOWED_EXTENSIONS.map(ext => `.${ext}`).join(',')}
          onChange={handleFileChange}
          style={{ display: 'none' }}
          disabled={loading}
        />

        {/* Document / File Name Row with Upload Document Button */}
        <div className="form-group">
          <label htmlFor="documentName" className="form-label">
            <FileText size={16} />
            <span>Document / File Name</span>
            <span className="required-star">*</span>
          </label>

          <div className="doc-input-row">
            <input
              id="documentName"
              type="text"
              className="form-input doc-name-input"
              placeholder="e.g. Thesis_Chapter1.pdf or Project Portfolio"
              value={documentName}
              onChange={(e) => setDocumentName(e.target.value)}
              disabled={loading}
              required
            />
            <button
              type="button"
              className="btn btn-primary btn-upload-doc"
              onClick={handleTriggerUpload}
              disabled={loading}
              title="Upload document(s) from your device"
            >
              <UploadCloud size={18} />
              <span>Upload Document</span>
            </button>
          </div>

          <div className="form-help-container">
            <small className="form-help">
              Select one or multiple files (PDF, Word, PPT, Excel, TXT, or Image up to 20 MB per file).
            </small>
          </div>

          {/* File selection error alert */}
          {fileError && (
            <div className="file-error-alert" role="alert">
              <AlertCircle size={16} />
              <span>{fileError}</span>
            </div>
          )}

          {/* Multiple Selected Files List & Summary */}
          {selectedFiles.length > 0 && (
            <div className="files-list-container">
              {/* Summary Header */}
              <div className="files-list-header">
                <div className="files-list-summary">
                  <Files size={16} className="text-purple" />
                  <span className="files-list-count">
                    <strong>{selectedFiles.length}</strong> {selectedFiles.length === 1 ? 'file' : 'files'} selected
                  </span>
                  <span className="files-list-dot">•</span>
                  <span className="files-list-total-size">{formatFileSize(totalFilesSize)} total</span>
                </div>

                <div className="files-list-header-actions">
                  <button
                    type="button"
                    className="btn-add-more-files"
                    onClick={handleTriggerUpload}
                    disabled={loading}
                    title="Select more documents to add"
                  >
                    <Plus size={14} />
                    <span>Add More Files</span>
                  </button>
                  <button
                    type="button"
                    className="btn-clear-all-files"
                    onClick={handleClearAllFiles}
                    disabled={loading}
                    title="Remove all selected files"
                  >
                    <span>Clear All</span>
                  </button>
                </div>
              </div>

              {/* Itemized File Cards */}
              <div className="files-list-items">
                {selectedFiles.map((item, idx) => {
                  const ext = item.name.split('.').pop()?.toUpperCase() || '';
                  return (
                    <div key={item.id || idx} className={`selected-file-item ${item.status === 'failed' ? 'file-item-failed' : ''}`}>
                      <div className="file-item-left">
                        <div className="file-item-icon-wrapper">
                          {renderPreviewFileIcon(item)}
                        </div>
                        <div className="file-item-info">
                          <div className="file-item-name-row">
                            <span className="file-item-name" title={item.name}>
                              {item.name}
                            </span>
                            {ext && <span className="file-ext-badge">{ext}</span>}
                          </div>
                          <div className="file-item-meta-row">
                            <span className="file-item-size">{formatFileSize(item.size)}</span>
                            <span className="file-meta-dot">•</span>
                            {item.status === 'uploading' ? (
                              <span className="file-status-pill status-uploading">
                                <RefreshCw size={11} className="icon-spin" /> Uploading...
                              </span>
                            ) : item.status === 'completed' ? (
                              <span className="file-status-pill status-completed">
                                <CheckCircle size={11} /> Uploaded
                              </span>
                            ) : item.status === 'failed' ? (
                              <span className="file-status-pill status-failed" title={item.error}>
                                <AlertCircle size={11} /> Failed
                              </span>
                            ) : (
                              <span className="file-status-pill status-ready">Ready to upload</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="file-item-actions">
                        <button
                          type="button"
                          className="btn-remove-file-item"
                          onClick={() => handleRemoveFile(item.id)}
                          disabled={loading}
                          title={`Remove ${item.name}`}
                          aria-label={`Remove ${item.name}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="form-row-2">
          <div className="form-group">
            <label htmlFor="pages" className="form-label">
              <Layers size={16} />
              <span>Number of Pages</span>
              <span className="required-star">*</span>
            </label>
            <input
              id="pages"
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
            <label htmlFor="copies" className="form-label">
              <Copy size={16} />
              <span>Number of Copies</span>
              <span className="required-star">*</span>
            </label>
            <input
              id="copies"
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

        <div className="form-group">
          <label htmlFor="printType" className="form-label">
            <FileText size={16} />
            <span>Print Type</span>
          </label>
          <select
            id="printType"
            className="form-input"
            value={printType}
            onChange={(e) => setPrintType(e.target.value)}
            disabled={loading}
          >
            {PRINT_TYPES.map(pt => (
              <option key={pt.value} value={pt.value}>{pt.label}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label">
            <Palette size={16} />
            <span>Color Mode</span>
          </label>
          <div className="color-options-grid">
            <label className={`color-option-card ${!isColor ? 'selected' : ''}`}>
              <input
                type="radio"
                name="colorMode"
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
                name="colorMode"
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

        <div className="form-group">
          <label htmlFor="notes" className="form-label">
            <StickyNote size={16} />
            <span>Notes (Optional)</span>
          </label>
          <textarea
            id="notes"
            className="form-input form-textarea"
            placeholder="Any special instructions for the staff..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={loading}
            rows={3}
          />
        </div>

        <div className="form-summary-pill">
          <span>Estimated Total Pages: <strong>{(parseInt(pages, 10) || 0) * (parseInt(copies, 10) || 0)} pages</strong></span>
          <span>Color: <strong>{isColor ? 'Yes' : 'No'}</strong></span>
          {selectedFiles.length > 0 && (
            <span>Attached: <strong>{selectedFiles.length} {selectedFiles.length === 1 ? 'file' : 'files'} ({formatFileSize(totalFilesSize)})</strong></span>
          )}
        </div>

        <div className="form-actions">
          <button type="submit" className="btn btn-primary btn-block submit-job-btn" disabled={loading}>
            {loading ? (
              <span className="btn-loading">
                {uploadProgressText || 'Submitting Request...'}
              </span>
            ) : (
              <>
                <Send size={18} />
                <span>Submit Print Request</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

export default PrintJobForm;
