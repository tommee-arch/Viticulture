import React from 'react';
import HelpTip from './HelpTip';

export default function TopBar({ timeframe, setTimeframe, sidebarCollapsed, onToggleSidebar }) {
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
        <div className="timeframe-controls">
          <HelpTip text="View this block's most recently recorded data.">
            <button
              className={timeframe === 'Now' ? 'active' : ''}
              onClick={() => setTimeframe('Now')}
            >
              Current Week
            </button>
          </HelpTip>
          <HelpTip text="View a live 7-day irrigation forecast for this block.">
            <button
              className={timeframe === 'Predictive' ? 'active' : ''}
              onClick={() => setTimeframe('Predictive')}
            >
              Next Week Forecast
            </button>
          </HelpTip>
        </div>
      </div>

      <HelpTip text="Print or save a PDF of what's currently on screen.">
        <button className="print-btn" onClick={handlePrint}>
          Generate Report
        </button>
      </HelpTip>
    </header>
  );
}