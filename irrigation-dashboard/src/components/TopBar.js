import React, { useState } from 'react';
import HelpTip from './HelpTip';
import UploadDataPopup from './Upload_data_Popup';

export default function TopBar({ sidebarCollapsed, onToggleSidebar }) {
  const [isUploadOpen, setIsUploadOpen] = useState(false);

  const handlePrint = () => {
    window.print();
  };

  return (
    <header className="top-bar">
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <HelpTip text={sidebarCollapsed ? 'Show the block list.' : 'Hide the block list to see more of the screen.'}>
          <button
            className="sidebar-toggle-btn"
            onClick={onToggleSidebar}
          >
            {sidebarCollapsed ? '☰' : '⟨'}
          </button>
        </HelpTip>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <HelpTip text="Upload new ETa, ETo, Kc, NDVI or Sentinel-2 data to update the daily statistics.">
          <button className="print-btn" onClick={() => setIsUploadOpen(true)}>
            Upload Data
          </button>
        </HelpTip>
        <HelpTip text="Print or save a PDF of what's currently on screen.">
          <button className="print-btn" onClick={handlePrint}>
            Generate Report
          </button>
        </HelpTip>
      </div>

      <UploadDataPopup isOpen={isUploadOpen} onClose={() => setIsUploadOpen(false)} />
    </header>
  );
}