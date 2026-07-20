import React, { useEffect, useRef, useState } from 'react';
import './UploadDataPopup.css';

// Same Flask backend as the Gemini advisor (see backend/README.md).
const ADVISOR_API_URL = process.env.REACT_APP_ADVISOR_API_URL || 'http://localhost:5000';

// fetch() has no built-in timeout - without this, a dropped/stalled
// connection (e.g. a Render proxy hiccup) leaves the request hanging
// forever with no error, and the button just says "Working..." indefinitely
// with no way to tell it apart from genuinely still processing.
const UPLOAD_TIMEOUT_MS = 120000;

// Form-field keys the backend expects, each a single-band raster of
// already-computed values (zonal-averaged per block) - except
// "Sentinel imagery", a raw 4-band raster (B4, B3, B2, B8) the backend
// computes NDWI from itself.
const UPLOAD_FIELDS = ['ETa', 'ETo', 'Kc', 'NDVI', 'Sentinel imagery'];
const FIELD_LABELS = {
  'ETa': 'ETa',
  'ETo': 'ETo',
  'Kc': 'Kc',
  'NDVI': 'NDVI',
  'Sentinel imagery': 'Sentinel imagery (for NDWI - bands B4, B3, B2, B8)'
};

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
      <label className="upload-dropzone-label">{FIELD_LABELS[label] || label}</label>
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

// Upload Daily Data modal - drops ETa/ETo/Kc/NDVI/Sentinel-2 rasters here
// plus manually-entered Precipitation and Ks, then "Calculate" or "Upload"
// sends it all to the backend, which computes Pheno_Net_mm and Volume_m3
// and turns everything into per-block/per-date rows in Full_final_deduped.json.
export default function UploadDataPopup({ isOpen, onClose }) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [files, setFiles] = useState({});
  const [precipMm, setPrecipMm] = useState('');
  const [ks, setKs] = useState('');
  const [status, setStatus] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef(null);

  // Ticks once a second while a request is in flight, so "Working..." shows
  // a live elapsed time instead of sitting static with no way to tell
  // "still going" from "actually stuck".
  useEffect(() => {
    if (!isSubmitting) return undefined;
    setElapsedSeconds(0);
    timerRef.current = setInterval(() => setElapsedSeconds(s => s + 1), 1000);
    return () => clearInterval(timerRef.current);
  }, [isSubmitting]);

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
    if (!UPLOAD_FIELDS.some(label => files[label]) && !precipMm && !ks) {
      setStatus({ type: 'error', message: 'Add at least one file, or a Precipitation/Ks value, first.' });
      return;
    }

    setIsSubmitting(true);
    setStatus(null);
    try {
      const formData = new FormData();
      formData.append('mode', mode);
      formData.append('date', date);
      if (precipMm !== '') formData.append('precip_mm', precipMm);
      if (ks !== '') formData.append('ks', ks);
      UPLOAD_FIELDS.forEach(label => {
        if (files[label]) formData.append(label, files[label]);
      });

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

      let res;
      try {
        res = await fetch(`${ADVISOR_API_URL}/api/upload-daily-data`, {
          method: 'POST',
          body: formData,
          signal: controller.signal
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (!res.ok) {
        const errBody = await res.json().catch(() => null);
        throw new Error(errBody?.error || `Server returned ${res.status}`);
      }
      const data = await res.json();
      setStatus({
        type: 'success',
        message: mode === 'upload'
          ? `Saved ${data.blocks_updated} block(s) for ${date} to Full_final_deduped.json.`
          : `Calculated ${data.blocks_updated} block(s) for ${date} (not saved).`
      });
    } catch (err) {
      console.error('Daily data upload failed:', err);
      const message = err.name === 'AbortError'
        ? `Timed out after ${UPLOAD_TIMEOUT_MS / 1000}s - the file may be too large, or the server is unreachable. Check backend/README.md's raster size guidance, or try a smaller/cropped file.`
        : (err.message || 'Something went wrong.');
      setStatus({ type: 'error', message });
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

        <div className="upload-dropzone-row">
          <label className="upload-dropzone-label" htmlFor="upload-precip">Precipitation (mm)</label>
          <input
            id="upload-precip"
            type="number"
            step="any"
            placeholder="e.g. 5.5"
            value={precipMm}
            onChange={(e) => setPrecipMm(e.target.value)}
            className="upload-date-input"
          />
        </div>

        <div className="upload-dropzone-row">
          <label className="upload-dropzone-label" htmlFor="upload-ks">Ks coefficient</label>
          <input
            id="upload-ks"
            type="number"
            step="any"
            placeholder="e.g. 0.75"
            value={ks}
            onChange={(e) => setKs(e.target.value)}
            className="upload-date-input"
          />
        </div>

        {status && <div className={`upload-status ${status.type}`}>{status.message}</div>}

        <div className="upload-modal-actions">
          <button type="button" onClick={() => handleAction('calculate')} disabled={isSubmitting}>
            {isSubmitting ? `Working... (${elapsedSeconds}s)` : 'Calculate'}
          </button>
          <button type="button" onClick={() => handleAction('upload')} disabled={isSubmitting}>
            {isSubmitting ? `Working... (${elapsedSeconds}s)` : 'Upload'}
          </button>
        </div>
        {isSubmitting && (
          <p style={{ fontSize: '0.8em', color: '#666', textAlign: 'center', marginTop: '8px' }}>
            Will time out automatically after {UPLOAD_TIMEOUT_MS / 1000}s if the server doesn't respond.
          </p>
        )}
      </div>
    </div>
  );
}
