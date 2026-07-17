import React from 'react';
import NowScreen from '../NowScreen';
import PredictiveScreen from '../PredictiveScreen';

export default function FieldsTab({ timeframe, field }) {
  // Catch edge case where no field is selected yet
  if (!field) {
    return (
      <div className="module-placeholder" style={{ padding: '40px', textAlign: 'center' }}>
        <h2>No Field Selected</h2>
        <p style={{ color: '#64748b' }}>Please select a vineyard block from the sidebar to view its dashboard.</p>
      </div>
    );
  }

  return (
    <div className="fields-tab-container" style={{ height: '100%' }}>
      {timeframe === 'Now' ? (
        <NowScreen field={field} />
      ) : (
        <PredictiveScreen field={field} />
      )}
    </div>
  );
}