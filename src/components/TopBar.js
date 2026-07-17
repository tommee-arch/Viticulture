import React from 'react';

export default function TopBar({ timeframe, setTimeframe, sidebarCollapsed, onToggleSidebar }) {
  const handlePrint = () => {
    window.print();
  };

  return (
    <header className="top-bar">
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <button
          className="sidebar-toggle-btn"
          onClick={onToggleSidebar}
          title={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
        >
          {sidebarCollapsed ? '☰' : '⟨'}
        </button>
        <div className="timeframe-controls">
          <button
            className={timeframe === 'Now' ? 'active' : ''}
            onClick={() => setTimeframe('Now')}
          >
            Current Week
          </button>
          <button
            className={timeframe === 'Predictive' ? 'active' : ''}
            onClick={() => setTimeframe('Predictive')}
          >
            Next Week Forecast
          </button>
        </div>
      </div>

      <button className="print-btn" onClick={handlePrint}>
        Generate Report
      </button>
    </header>
  );
}