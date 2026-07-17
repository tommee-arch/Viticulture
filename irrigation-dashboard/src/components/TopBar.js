import React from 'react';

export default function TopBar({ timeframe, setTimeframe }) {
  const handlePrint = () => {
    window.print();
  };

  return (
    <header className="top-bar">
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
      
      <button className="print-btn" onClick={handlePrint}>
        Generate Report
      </button>
    </header>
  );
}