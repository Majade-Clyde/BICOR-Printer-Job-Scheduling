import React, { useState, useEffect } from 'react';
import {
  X,
  FileText,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileCheck,
  Image as ImageIcon,
  Paperclip,
  CheckCircle2,
  AlertCircle,
  Clock,
  Layers,
  Palette,
  User,
  RefreshCw
} from 'lucide-react';
import {
  getJobDocuments,
  getDocumentViewUrl,
  formatFileSize,
  getFileCategory
} from '../lib/storage';
import StatusBadge from './StatusBadge';

const formatTime = (ts) => {
  if (!ts) return '-';
  try {
    const d = new Date(ts);
    return (
      d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) +
      ' (' +
      d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) +
      ')'
    );
  } catch {
    return ts;
  }
};

const DocumentViewerModal = ({ job, onClose }) => {
  const [documents, setDocuments] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [currentUrl, setCurrentUrl] = useState(null);
  const [loadingUrl, setLoadingUrl] = useState(false);
  const [urlError, setUrlError] = useState('');

  // Extract all attached documents safely
  useEffect(() => {
    if (job) {
      const docs = getJobDocuments(job);
      setDocuments(docs);
      setSelectedIndex(0);
    } else {
      setDocuments([]);
      setSelectedIndex(0);
    }
  }, [job]);

  const activeDoc = documents[selectedIndex] || null;

  // Retrieve secure access URL for the active document
  useEffect(() => {
    let isCancelled = false;

    const fetchUrl = async () => {
      if (!activeDoc || !activeDoc.file_path) {
        setCurrentUrl(activeDoc?.file_url || null);
        setLoadingUrl(false);
        return;
      }

      setLoadingUrl(true);
      setUrlError('');

      try {
        const url = await getDocumentViewUrl(activeDoc.file_path);
        if (!isCancelled) {
          if (url) {
            setCurrentUrl(url);
          } else if (activeDoc.file_url) {
            setCurrentUrl(activeDoc.file_url);
          } else {
            setUrlError('Unable to generate secure preview link for this document.');
          }
        }
      } catch (err) {
        if (!isCancelled) {
          console.error('Error getting document preview URL:', err);
          setUrlError(err.message || 'Failed to load document preview.');
        }
      } finally {
        if (!isCancelled) {
          setLoadingUrl(false);
        }
      }
    };

    fetchUrl();

    return () => {
      isCancelled = true;
    };
  }, [activeDoc]);

  // Keyboard navigation & Escape key listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft') {
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
      } else if (e.key === 'ArrowRight') {
        setSelectedIndex((prev) => (prev < documents.length - 1 ? prev + 1 : prev));
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [documents.length, onClose]);

  if (!job) return null;

  const renderDocIcon = (doc, size = 18) => {
    const category = getFileCategory(doc?.name || '', doc?.file_type || '');
    if (category === 'image') return <ImageIcon size={size} className="text-purple" />;
    if (category === 'pdf') return <FileCheck size={size} className="text-purple" />;
    return <FileText size={size} className="text-purple" />;
  };

  const activeCategory = activeDoc ? getFileCategory(activeDoc.name, activeDoc.file_type) : 'document';
  const activeExt = activeDoc?.name ? activeDoc.name.split('.').pop()?.toUpperCase() : '';

  return (
    <div
      className="modal-backdrop doc-viewer-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="doc-viewer-title"
    >
      <div className="modal-box doc-viewer-modal-box">
        {/* Modal Header */}
        <div className="doc-viewer-header">
          <div className="doc-viewer-header-left">
            <div className="doc-viewer-icon-badge">
              <FileText size={22} />
            </div>
            <div className="doc-viewer-title-group">
              <div className="doc-viewer-title-row">
                <h2 id="doc-viewer-title" className="doc-viewer-title">
                  {job.document_name}
                </h2>
                <StatusBadge status={job.status} />
              </div>
              <div className="doc-viewer-meta-row">
                <span className="doc-viewer-user">
                  <User size={13} />
                  <strong>{job.student_name || 'User'}</strong> ({job.email})
                </span>
                <span className="doc-viewer-dot">•</span>
                <span className="doc-viewer-time">
                  <Clock size={13} />
                  {formatTime(job.submitted_at)}
                </span>
                <span className="doc-viewer-dot">•</span>
                <span className="doc-viewer-print-specs">
                  {job.pages} pgs • {job.copies} {job.copies === 1 ? 'copy' : 'copies'} • {job.paper_size || 'Short (8.5 × 11 inches)'} • {job.color ? 'Color' : 'B&W'}
                </span>
              </div>
            </div>
          </div>

          <div className="doc-viewer-header-actions">
            <span className="doc-count-pill">
              <Paperclip size={13} />
              {documents.length} {documents.length === 1 ? 'Document' : 'Documents'}
            </span>
            <button
              type="button"
              className="modal-close-btn"
              onClick={onClose}
              aria-label="Close Document Viewer"
              title="Close (Esc)"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Main Body */}
        {documents.length === 0 ? (
          <div className="doc-viewer-empty-state">
            <AlertCircle size={44} className="empty-icon" />
            <h4>No Documents Attached</h4>
            <p>This print request was submitted without an attached digital file.</p>
            <button type="button" className="btn btn-outline mt-3" onClick={onClose}>
              Close Viewer
            </button>
          </div>
        ) : (
          <div className="doc-viewer-layout">
            {/* Left Sidebar: Document List Tabs */}
            <aside className="doc-viewer-sidebar">
              <div className="doc-viewer-sidebar-title">
                <span>Attached Files ({documents.length})</span>
              </div>
              <div className="doc-viewer-file-list">
                {documents.map((doc, idx) => {
                  const isSelected = idx === selectedIndex;
                  const ext = doc.name ? doc.name.split('.').pop()?.toUpperCase() : '';
                  return (
                    <div
                      key={idx}
                      className={`doc-viewer-file-item ${isSelected ? 'active' : ''}`}
                      onClick={() => setSelectedIndex(idx)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedIndex(idx);
                        }
                      }}
                    >
                      <div className="doc-item-num">{idx + 1}</div>
                      <div className="doc-item-icon">{renderDocIcon(doc, 18)}</div>
                      <div className="doc-item-details">
                        <span className="doc-item-name" title={doc.name}>
                          {doc.name}
                        </span>
                        <div className="doc-item-sub">
                          {ext && <span className="doc-ext-pill">{ext}</span>}
                          <span className="doc-item-size">
                            {doc.file_size ? formatFileSize(doc.file_size) : 'File'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </aside>

            {/* Right: Active Document Preview Canvas */}
            <section className="doc-viewer-preview-pane">
              {/* Preview Action Toolbar */}
              <div className="doc-preview-toolbar">
                <div className="doc-preview-file-title">
                  {renderDocIcon(activeDoc, 20)}
                  <span className="active-file-title-text" title={activeDoc?.name}>
                    {activeDoc?.name}
                  </span>
                  {activeExt && <span className="active-file-ext-tag">{activeExt}</span>}
                  {activeDoc?.file_size && (
                    <span className="active-file-size-tag">
                      {formatFileSize(activeDoc.file_size)}
                    </span>
                  )}
                </div>

                <div className="doc-preview-nav-group">
                  {documents.length > 1 && (
                    <div className="doc-nav-pagination">
                      <button
                        type="button"
                        className="btn-doc-nav"
                        onClick={() => setSelectedIndex((prev) => Math.max(0, prev - 1))}
                        disabled={selectedIndex === 0}
                        title="Previous Document (Left Arrow)"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <span className="doc-nav-indicator">
                        {selectedIndex + 1} of {documents.length}
                      </span>
                      <button
                        type="button"
                        className="btn-doc-nav"
                        onClick={() => setSelectedIndex((prev) => Math.min(documents.length - 1, prev + 1))}
                        disabled={selectedIndex === documents.length - 1}
                        title="Next Document (Right Arrow)"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  )}

                  {currentUrl && (
                    <a
                      href={currentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-outline btn-sm doc-action-btn"
                      title="Open in new browser tab"
                    >
                      <ExternalLink size={14} />
                      <span>Open in Tab</span>
                    </a>
                  )}
                </div>
              </div>

              {/* Preview Content Area */}
              <div className="doc-preview-canvas">
                {loadingUrl ? (
                  <div className="doc-preview-loading">
                    <RefreshCw size={28} className="icon-spin text-purple" />
                    <span>Preparing secure document preview...</span>
                  </div>
                ) : urlError ? (
                  <div className="doc-preview-error-state">
                    <AlertCircle size={36} className="text-danger" />
                    <p>{urlError}</p>
                  </div>
                ) : activeCategory === 'pdf' && currentUrl ? (
                  <div className="doc-pdf-wrapper">
                    <iframe
                      src={`${currentUrl}#toolbar=1&navpanes=0`}
                      title={activeDoc?.name || 'PDF Document'}
                      className="doc-pdf-iframe"
                    />
                  </div>
                ) : activeCategory === 'image' && currentUrl ? (
                  <div className="doc-image-wrapper">
                    <img
                      src={currentUrl}
                      alt={activeDoc?.name || 'Attached Image'}
                      className="doc-preview-image"
                    />
                  </div>
                ) : (
                  /* Non-PDF / Non-Image files: Word, PowerPoint, Excel, TXT, etc. */
                  <div className="doc-generic-file-card">
                    <div className="generic-file-icon-box">
                      {renderDocIcon(activeDoc, 48)}
                    </div>
                    <h3 className="generic-file-name">{activeDoc?.name}</h3>
                    <p className="generic-file-desc">
                      {activeCategory === 'word'
                        ? 'Microsoft Word Document'
                        : activeCategory === 'powerpoint'
                        ? 'Microsoft PowerPoint Presentation'
                        : activeCategory === 'excel'
                        ? 'Microsoft Excel Spreadsheet'
                        : `${activeExt || 'Document'} File`}
                      {activeDoc?.file_size ? ` • ${formatFileSize(activeDoc.file_size)}` : ''}
                    </p>
                    <p className="generic-file-hint">
                      This file format cannot be rendered directly inside the canvas.
                    </p>
                    {currentUrl && (
                      <div className="generic-file-actions">
                        <a
                          href={currentUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-primary"
                        >
                          <ExternalLink size={16} />
                          <span>Open Document</span>
                        </a>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        {/* Modal Footer */}
        <div className="doc-viewer-footer">
          <div className="doc-viewer-footer-info">
            {job.notes && (
              <span className="doc-notes-text">
                <strong>Notes:</strong> {job.notes}
              </span>
            )}
          </div>
          <div className="doc-viewer-footer-buttons">
            <button type="button" className="btn btn-outline" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DocumentViewerModal;
