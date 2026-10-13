import { supabase } from './supabase.js';

export const STORAGE_BUCKET = 'print-documents';
export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

export const ALLOWED_EXTENSIONS = [
  'pdf',
  'doc',
  'docx',
  'ppt',
  'pptx',
  'xls',
  'xlsx',
  'txt',
  'jpg',
  'jpeg',
  'png',
];

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/x-pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'image/jpeg',
  'image/jpg',
  'image/pjpeg',
  'image/png',
];

export const MIME_MAP = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
};

/**
 * Normalizes mobile and browser MIME type aliases to canonical Supabase-compatible MIME types
 */
export const normalizeMimeType = (mimeType, fileName = '') => {
  const rawType = (mimeType || '').toLowerCase().trim();
  const ext = (fileName || '').split('.').pop()?.toLowerCase() || '';

  // Canonicalize JPG aliases to image/jpeg
  if (rawType === 'image/jpg' || rawType === 'image/pjpeg' || ext === 'jpg' || ext === 'jpeg') {
    return 'image/jpeg';
  }
  if (rawType === 'image/png' || ext === 'png') {
    return 'image/png';
  }
  if (rawType === 'application/pdf' || rawType === 'application/x-pdf' || ext === 'pdf') {
    return 'application/pdf';
  }
  if (ext && MIME_MAP[ext]) {
    return MIME_MAP[ext];
  }
  return rawType || 'application/octet-stream';
};

/**
 * Validates file format and size
 */
export const validateDocumentFile = (file) => {
  if (!file) {
    return { valid: false, error: 'No file selected.' };
  }

  // Check file size (max 20 MB)
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `File size (${formatFileSize(file.size)}) exceeds the maximum allowed limit of 20 MB.`,
    };
  }

  // Check file extension
  let extension = file.name?.split('.').pop()?.toLowerCase();

  // If file has no extension (can happen on some mobile camera captures), infer from MIME type
  if (!extension || extension === file.name?.toLowerCase()) {
    const rawType = (file.type || '').toLowerCase();
    if (rawType.includes('jpeg') || rawType.includes('jpg')) extension = 'jpg';
    else if (rawType.includes('png')) extension = 'png';
    else if (rawType.includes('pdf')) extension = 'pdf';
  }

  if (!extension || !ALLOWED_EXTENSIONS.includes(extension)) {
    return {
      valid: false,
      error: `Unsupported file type (.${extension || 'unknown'}). Supported formats: PDF, Word (.doc/.docx), PowerPoint (.ppt/.pptx), Excel (.xls/.xlsx), TXT, and Images (.jpg/.png).`,
    };
  }

  return { valid: true, extension };
};

/**
 * Formats byte counts into human readable strings
 */
export const formatFileSize = (bytes) => {
  const num = Number(bytes);
  if (!num || isNaN(num) || num <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(num) / Math.log(k)), sizes.length - 1);
  if (i < 0) return '0 B';
  return `${parseFloat((num / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

/**
 * Identifies high-level category for icon rendering
 */
export const getFileCategory = (fileName = '', fileType = '') => {
  const nameStr = typeof fileName === 'string' ? fileName : '';
  const typeStr = typeof fileType === 'string' ? fileType : '';
  const ext = nameStr.split('.').pop()?.toLowerCase() || '';
  if (ext === 'pdf' || typeStr.includes('pdf')) return 'pdf';
  if (['doc', 'docx'].includes(ext) || typeStr.includes('word')) return 'word';
  if (['ppt', 'pptx'].includes(ext) || typeStr.includes('presentation') || typeStr.includes('powerpoint')) return 'powerpoint';
  if (['xls', 'xlsx'].includes(ext) || typeStr.includes('spreadsheet') || typeStr.includes('excel')) return 'excel';
  if (['jpg', 'jpeg', 'png'].includes(ext) || typeStr.startsWith('image/')) return 'image';
  if (ext === 'txt' || typeStr.includes('text')) return 'text';
  return 'document';
};

/**
 * Uploads a document to Supabase Storage in the 'print-documents' bucket
 */
export const uploadPrintDocument = async (file, userId) => {
  const validation = validateDocumentFile(file);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  if (!userId) {
    throw new Error('User ID is required for document storage.');
  }

  // Clean and safe storage filename (alphanumeric, dashes, underscores)
  const ext = (file.name.split('.').pop() || validation.extension || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
  const rawBase = file.name.includes('.') ? file.name.substring(0, file.name.lastIndexOf('.')) : file.name;
  const safeBase = rawBase.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').substring(0, 60) || 'document';
  const cleanStorageFileName = `${safeBase}.${ext}`;
  const uniquePath = `${userId}/${Date.now()}_${Math.random().toString(36).substring(2, 7)}_${cleanStorageFileName}`;

  // Canonicalize MIME type (e.g. image/jpg -> image/jpeg)
  const canonicalMimeType = normalizeMimeType(file.type, file.name);

  // Ensure file payload carries the canonical MIME type for multipart upload on mobile
  let uploadPayload = file;
  if (file.type !== canonicalMimeType) {
    try {
      uploadPayload = new File([file], cleanStorageFileName, { type: canonicalMimeType });
    } catch {
      uploadPayload = new Blob([file], { type: canonicalMimeType });
    }
  }

  // Upload to Supabase Storage with explicit contentType
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(uniquePath, uploadPayload, {
      contentType: canonicalMimeType,
      cacheControl: '3600',
      upsert: false,
    });

  if (error) {
    console.error('Supabase storage upload error:', error);

    const errorMsg = error.message || '';
    const errorDetails = error.error || '';
    const statusCode = String(error.statusCode || error.status || '');

    if (errorMsg.includes('Bucket not found') || statusCode === '404' || error.code === 'NoSuchBucket') {
      throw new Error(
        "Storage bucket 'print-documents' does not exist in Supabase. Please run the migration script 'supabase-storage-setup.sql' in your Supabase SQL Editor."
      );
    }

    if (errorMsg.includes('violates row-level security policy') || statusCode === '403' || error.code === 'AccessDenied') {
      throw new Error(
        "Storage permission denied. Ensure you are signed in and have run the storage policies migration in 'supabase-storage-setup.sql'."
      );
    }

    if (errorMsg.includes('mime') || errorDetails.includes('mime') || statusCode === '415' || error.code === 'InvalidMimeType') {
      throw new Error(
        `File format rejected by storage (${errorMsg || 'MIME type not allowed'}). Supported formats: PDF, Word, Excel, PPT, TXT, and JPG/PNG images.`
      );
    }

    if (errorMsg.includes('exceeded') || errorMsg.includes('too large') || statusCode === '413') {
      throw new Error(
        `File size exceeds storage bucket limit (maximum 20 MB).`
      );
    }

    const friendlyMsg = errorMsg && errorMsg !== 'HTTP 400 error'
      ? errorMsg
      : (errorDetails || 'Storage server rejected the file (HTTP 400). Please check format and size.');

    throw new Error(`File upload failed: ${friendlyMsg}`);
  }

  // Get public / storage URL reference
  const { data: publicUrlData } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(data.path);

  return {
    filePath: data.path,
    fileName: file.name,
    fileSize: file.size,
    fileType: canonicalMimeType,
    fileUrl: publicUrlData?.publicUrl || null,
  };
};

/**
 * Generates a signed or public download/view URL for a stored document
 */
export const getDocumentViewUrl = async (filePath) => {
  if (!filePath) return null;

  try {
    // 1. Attempt to create a signed URL (valid for 1 hour)
    const { data: signedData, error: signedErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(filePath, 3600);

    if (!signedErr && signedData?.signedUrl) {
      return signedData.signedUrl;
    }

    // 2. Fallback to public URL
    const { data: publicData } = supabase.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(filePath);

    return publicData?.publicUrl || null;
  } catch (err) {
    console.warn('Error obtaining document view URL:', err);
    return null;
  }
};

/**
 * Triggers document opening or download in browser
 */
export const openOrDownloadDocument = async (filePath, fileName = 'document') => {
  if (!filePath) {
    alert('No document file is attached to this print request.');
    return;
  }

  try {
    const url = await getDocumentViewUrl(filePath);
    if (!url) {
      throw new Error('Unable to generate secure download link for this document.');
    }

    // Open in new tab or download
    const win = window.open(url, '_blank');
    if (!win) {
      // In case popup blocker blocked window.open, trigger anchor download
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  } catch (err) {
    console.error('Error downloading document:', err);
    alert(`Could not open document: ${err.message}`);
  }
};

/**
 * Normalizes attached documents from a job record (supports multiple files & legacy single file)
 */
export const getJobDocuments = (job) => {
  if (!job) return [];
  let docs = job.documents;
  if (typeof docs === 'string') {
    try {
      docs = JSON.parse(docs);
    } catch (e) {
      docs = null;
    }
  }
  if (Array.isArray(docs) && docs.length > 0) {
    return docs;
  }
  if (job.file_path) {
    return [
      {
        name: job.document_name || 'Attached Document',
        file_path: job.file_path,
        file_size: job.file_size,
        file_type: job.file_type,
        file_url: job.file_url,
      },
    ];
  }
  return [];
};

/**
 * Uploads multiple files sequentially and reports progress
 */
export const uploadMultipleDocuments = async (filesList, userId, onProgress) => {
  const uploadedResults = [];

  for (let i = 0; i < filesList.length; i++) {
    const item = filesList[i];
    const fileObj = item.file || item;

    if (onProgress) {
      onProgress(i, 'uploading');
    }

    try {
      const result = await uploadPrintDocument(fileObj, userId);
      const meta = {
        name: fileObj.name,
        file_path: result.filePath,
        file_size: result.fileSize,
        file_type: result.fileType,
        file_url: result.fileUrl,
      };
      uploadedResults.push(meta);

      if (onProgress) {
        onProgress(i, 'completed', null, meta);
      }
    } catch (err) {
      console.error(`Failed to upload ${fileObj.name}:`, err);
      if (onProgress) {
        onProgress(i, 'failed', err.message);
      }
      throw new Error(`Failed to upload "${fileObj.name}": ${err.message}`);
    }
  }

  return uploadedResults;
};

/**
 * Safely removes uploaded documents associated with a deleted print job from storage
 */
export const deleteJobDocuments = async (job) => {
  if (!job) return;
  try {
    const docs = getJobDocuments(job);
    const paths = docs.map((d) => d.file_path).filter(Boolean);
    if (paths.length > 0) {
      const { error } = await supabase.storage.from(STORAGE_BUCKET).remove(paths);
      if (error) {
        console.warn('Storage cleanup notice:', error);
      }
    }
  } catch (err) {
    console.warn('Storage cleanup warning during job deletion:', err);
  }
};
