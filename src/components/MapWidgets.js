import React from 'react';

export default function MapWidgets() {
  return (
    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1000 }}>
      
      {/* Top Left: Analysis Layer Dropdown */}
      <div style={{ 
        position: 'absolute', top: '20px', left: '20px', 
        pointerEvents: 'auto', backgroundColor: 'white', 
        padding: '10px', borderRadius: '4px', boxShadow: '0 2px 5px rgba(0,0,0,0.2)' 
      }}>
        <select style={{ padding: '8px', border: '1px solid #ccc', borderRadius: '4px', width: '220px', outline: 'none' }}>
          <option>Evapotranspiration deficit</option>
          <option>Biomass</option>
          <option>Biomass accumulated</option>
          <option>NDVI</option>
          <option>Water Use Efficiency</option>
        </select>
      </div>

      {/* Bottom Right: Interactive Legend */}
      <div style={{ 
        position: 'absolute', bottom: '30px', right: '30px', 
        pointerEvents: 'auto', backgroundColor: 'white', 
        padding: '15px', borderRadius: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.2)', width: '250px' 
      }}>
        <h4 style={{ textAlign: 'center', marginBottom: '10px', borderBottom: '1px solid #eee', paddingBottom: '5px' }}>LEGEND</h4>
        
        {/* Gradient Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#666', marginBottom: '2px' }}>
          <span>0.05</span><span>0.21</span><span>0.37</span><span>0.54</span><span>0.70</span>
        </div>
        <div style={{ height: '15px', background: 'linear-gradient(to right, #ef4444, #f59e0b, #3b82f6, #10b981)', borderRadius: '10px', marginBottom: '15px' }}></div>
        
        {/* Toggles */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem', marginBottom: '10px', fontWeight: '500' }}>
          <span>Zones</span>
          <input type="range" min="1" max="5" defaultValue="3" style={{ width: '100px' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '10px', fontWeight: '500' }}>
          <span>Smoothing</span>
          <input type="checkbox" defaultChecked />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '10px', fontWeight: '500' }}>
          <span>Absolute ColorMap</span>
          <input type="checkbox" defaultChecked />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: '500' }}>
          <span>Zoning by number of plants</span>
          <input type="checkbox" defaultChecked />
        </div>
      </div>

    </div>
  );
}