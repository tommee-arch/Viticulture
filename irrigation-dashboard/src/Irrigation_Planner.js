import React, { useState } from 'react';
import './IrrigationPlanner.css';
// import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet'; // Uncomment when ready

const mockTableData = [
  { id: 1, block: 'K11', cultivar: 'CabFranc', stage: 'Flowering', deficit: 0.87, volume: 118, priority: 'Critical', color: '#e74c3c' },
  { id: 2, block: 'K7', cultivar: 'CabSauv', stage: 'Flowering', deficit: 0.71, volume: 96, priority: 'High', color: '#f39c12' },
  { id: 3, block: 'M1', cultivar: 'Merlot', stage: 'Budbreak', deficit: 0.38, volume: 28, priority: 'Medium', color: '#27ae60' },
  { id: 4, block: 'A2', cultivar: 'Shiraz', stage: 'Veraison', deficit: 0.15, volume: 0, priority: 'Low', color: '#bdc3c7' },
];

const IrrigationPlanner = () => {
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState([
    { sender: 'gemini', text: 'Hello! I am your IRRIGUIDE assistant. Select a block or ask me a question about your irrigation scheduling.' }
  ]);

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!chatInput.trim()) return;
    
    // Add user message
    const newHistory = [...chatHistory, { sender: 'user', text: chatInput }];
    setChatHistory(newHistory);
    setChatInput('');

    // Mock Gemini Response (Replace with actual API call later)
    setTimeout(() => {
      setChatHistory(prev => [...prev, { 
        sender: 'gemini', 
        text: `Based on current ETc rates, applying 118m³ to block K11 today is recommended to prevent severe water stress during the flowering stage.` 
      }]);
    }, 1000);
  };

  return (
    <div className="planner-container">
      
      {/* Header & Controls */}
      <div className="planner-header">
        <div className="header-tabs">
          <button className="tab active">Irrigation priority</button>
          <button className="tab">All stages</button>
        </div>
        <div className="header-filters">
          <select className="sort-dropdown">
            <option>Sort: PWDI</option>
            <option>Sort: Volume</option>
            <option>Sort: Priority</option>
          </select>
        </div>
      </div>

      {/* Priority Table */}
      <div className="table-card">
        <table className="priority-table">
          <thead>
            <tr>
              <th>Block</th>
              <th>Cultivar</th>
              <th>Stage</th>
              <th>Water Deficit</th>
              <th>Volume</th>
              <th>Priority</th>
            </tr>
          </thead>
          <tbody>
            {mockTableData.map((row) => (
              <tr key={row.id}>
                <td><strong>{row.block}</strong></td>
                <td>{row.cultivar}</td>
                <td>{row.stage}</td>
                <td className="bar-cell">
                  <span className="deficit-value">{row.deficit.toFixed(2)}</span>
                  <div className="progress-track">
                    <div 
                      className="progress-fill" 
                      style={{ width: `${row.deficit * 100}%`, backgroundColor: row.color }}
                    ></div>
                  </div>
                </td>
                <td><strong>{row.volume} m³</strong></td>
                <td>
                  <span className={`priority-badge ${row.priority.toLowerCase()}`}>
                    {row.priority}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Bottom Dashboard Grid */}
      <div className="dashboard-grid">
        
        {/* 1. Map Widget */}
        <div className="widget-card map-widget">
          <h3>Field View</h3>
          <div className="map-placeholder">
            {/* Copy your MapContainer from the Fields tab here */}
            <p>React-Leaflet Map Component Goes Here</p>
            <span className="mock-zoom-text">Zoomed to K11</span>
          </div>
        </div>

        {/* 2. Graph Widget */}
        <div className="widget-card graph-widget">
          <h3>Soil Moisture Trend (7 Days)</h3>
          <div className="mock-graph-container">
            {/* A pure CSS mock graph for rapid prototyping */}
            <div className="mock-bar" style={{height: '40%'}}></div>
            <div className="mock-bar" style={{height: '50%'}}></div>
            <div className="mock-bar" style={{height: '65%'}}></div>
            <div className="mock-bar" style={{height: '80%'}}></div>
            <div className="mock-bar" style={{height: '90%', backgroundColor: '#e74c3c'}}></div>
          </div>
          <p className="graph-caption">Depletion nearing critical threshold</p>
        </div>

        {/* 3. Gemini AI Widget */}
        <div className="widget-card ai-widget">
          <div className="ai-header">
            <span className="ai-icon">✨</span> 
            <h3>Gemini Assistant</h3>
          </div>
          <div className="chat-window">
            {chatHistory.map((msg, index) => (
              <div key={index} className={`chat-bubble ${msg.sender}`}>
                {msg.text}
              </div>
            ))}
          </div>
          <form className="chat-input-area" onSubmit={handleSendMessage}>
            <input 
              type="text" 
              placeholder="Ask about irrigation..." 
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
            />
            <button type="submit">Send</button>
          </form>
        </div>

      </div>
    </div>
  );
};

export default IrrigationPlanner;