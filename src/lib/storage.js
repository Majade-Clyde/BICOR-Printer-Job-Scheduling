import { supabase } from './supabase';

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
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'image/jpeg',
  'image/png',
];

/**
 * Validates file format and size
 */
export const validateDocumentFile = (file) => {
  if (!file) {
    return { valid: false, error: 'No file selected.' };
  }

  // Check file size
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `File size (${formatFileSize(file.size)}) exceeds the maximum allowed limit of 20 MB.`,
    };
  }

  // Check file extension
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!extension || !ALLOWED_EXTENSIONS.includes(extension)) {
    return {
      valid: false,
      error: `Unsupported file type (.${extension || 'unknown'}). Supported formats: PDF, Word (.doc/.docx), PowerPoint (.ppt/.pptx), Excel (.xls/.xlsx), TXT, and Images (.jpg/.png).`,
    };
  }

  return { valid: true };
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

  // Sanitize filename: alphanumeric, dashes, underscores, dots
  const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const uniquePath = `${userId}/${Date.now()}_${cleanName}`;

  // Upload to Supabase Storage
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(uniquePath, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (error) {
    console.error('Supabase storage upload error:', error);
    // Provide friendly error message for common issues
    if (error.message?.includes('Bucket not found') || error.statusCode === '404') {
      throw new Error(
        "Storage bucket 'print-documents' does not exist in Supabase. Please run the migration script 'supabase-storage-setup.sql' in your Supabase SQL Editor."
      );
    }
    throw new Error(`File upload failed: ${error.message || 'Unknown error'}`);
  }

  // Get public / storage URL reference
  const { data: publicUrlData } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(data.path);

  return {
    filePath: data.path,
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type || `application/${file.name.split('.').pop()}`,
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
