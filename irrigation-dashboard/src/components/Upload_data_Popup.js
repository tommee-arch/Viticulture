import React, { useState } from 'react';
import './UploadDataPopup.css';

// Same Flask backend as the Gemini advisor (see backend/README.md).
const ADVISOR_API_URL = process.env.REACT_APP_ADVISOR_API_URL || 'http://localhost:5000';

const UPLOAD_FIELDS = ['ETa', 'ETo', 'Kc', 'NDVI', 'Sentinel imagery'];

function DropZone({ label, file, onFileSelected }) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) onFileSelected(label, dropped);
  };

  const handlePick = (e) => {
    const picked = e.target.files?.[0];
    if (picked) onFileSelected(label, picked);
  };

  return (
    <div className="upload-dropzone-row">
      <label className="upload-dropzone-label">{label}</label>
      <label
        className={`upload-dropzone ${isDragging ? 'dragging' : ''} ${file ? 'has-file' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <input type="file" onChange={handlePick} style={{ display: 'none' }} />
        <span>{file ? file.name : 'Drag and drop file here, or click to browse'}</span>
      </label>
    </div>
  );
}

// Upload Daily Data modal - drops ETa/ETo/Kc/NDVI/Sentinel-2 files here, then
// "Calculate" or "Upload" sends them to the backend to be turned into
// per-block/per-date rows appended to Daily_Statistics.json.
export default function UploadDataPopup({ isOpen, onClose }) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [files, setFiles] = useState({});
  const [status, setStatus] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleFileSelected = (label, file) => {
    setFiles(prev => ({ ...prev, [label]: file }));
    setStatus(null);
  };

  const handleAction = async (mode) => {
    if (!date) {
      setStatus({ type: 'error', message: 'Pick which date these files are for.' });
      return;
    }
    if (!UPLOAD_FIELDS.some(label => files[label])) {
      setStatus({ type: 'error', message: 'Add at least one file first.' });
      return;
    }

    setIsSubmitting(true);
    setStatus(null);
    try {
      const formData = new FormData();
      formData.append('mode', mode);
      formData.append('date', date);
      UPLOAD_FIELDS.forEach(label => {
        if (files[label]) formData.append(label, files[label]);
      });

      const res = await fetch(`${ADVISOR_API_URL}/api/upload-daily-data`, {
        method: 'POST',
        body: formData
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody?.error || `Server returned ${res.status}`);
      }
      const data = await res.json();
      setStatus({
        type: 'success',
        message: mode === 'upload'
          ? `Saved ${data.blocks_updated} block(s) for ${date} to Daily_Statistics.json.`
          : `Calculated ${data.blocks_updated} block(s) for ${date} (not saved).`
      });
    } catch (err) {
      console.error('Daily data upload failed:', err);
      setStatus({ type: 'error', message: err.message || 'Something went wrong.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="upload-modal-backdrop" onClick={onClose}>
      <div className="upload-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="upload-modal-close" onClick={onClose}>✕</button>
        <h2>Upload Daily Data</h2>

        <div className="upload-dropzone-row">
          <label className="upload-dropzone-label" htmlFor="upload-date">Date these files are for</label>
          <input
            id="upload-date"
            type="date"
            value={date}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setDate(e.target.value)}
            className="upload-date-input"
          />
        </div>

        {UPLOAD_FIELDS.map(label => (
          <DropZone key={label} label={label} file={files[label]} onFileSelected={handleFileSelected} />
        ))}

        {status && <div className={`upload-status ${status.type}`}>{status.message}</div>}

        <div className="upload-modal-actions">
          <button type="button" onClick={() => handleAction('calculate')} disabled={isSubmitting}>
            {isSubmitting ? 'Working...' : 'Calculate'}
          </button>
          <button type="button" onClick={() => handleAction('upload')} disabled={isSubmitting}>
            {isSubmitting ? 'Working...' : 'Upload'}
          </button>
        </div>
      </div>
    </div>
  );
}
