import React, { useState } from 'react';
import logo from '../sprinklers.png';
export default function Sidebar({ activeTab, setActiveTab, fieldsData, selectedField, setSelectedField, collapsed }) {
  const [isDecisionSupportOpen, setIsDecisionSupportOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Updated to search by either BLOCK or CULTIVAR
  const filteredFields = fieldsData.filter(f =>
    (f.BLOCK && f.BLOCK.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (f.CULTIVAR && f.CULTIVAR.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div 
        className="sidebar-header" 
        style={{ display: 'flex', alignItems: 'center', gap: '10px' }}
      >
        <img 
          src={logo} 
          alt="Irriguide Logo" 
          style={{ width: '40px', height: '40px', objectFit: 'contain' }} 
        />
        <h1 style={{ margin: 0 }}>Water Chommie</h1>
      </div>

      <nav className="nav-menu">
        <button className={activeTab === 'Home' ? 'active' : ''} onClick={() => setActiveTab('Home')}>Home</button>
        <button className={activeTab === 'Fields' ? 'active' : ''} onClick={() => setActiveTab('Fields')}>Fields</button>
        
        <div className="accordion">
          <button 
            className={`accordion-toggle ${isDecisionSupportOpen ? 'open' : ''}`}
            onClick={() => setIsDecisionSupportOpen(!isDecisionSupportOpen)}
          >
            Decision Support
            <span className="chevron">{isDecisionSupportOpen ? ' ▼' : ' ▶'}</span>
          </button>
          
          {isDecisionSupportOpen && (
            <div className="accordion-content">
              <button className={activeTab === 'Irrigation Planner' ? 'active' : ''} onClick={() => setActiveTab('Irrigation Planner')}>Irrigation Planner</button>
              <button className={activeTab === 'Fertigation Manager' ? 'active' : ''} onClick={() => setActiveTab('Fertigation Manager')}>Fertigation Manager</button>
            </div>
          )}
        </div>
        
        <button className={activeTab === 'Weather' ? 'active' : ''} onClick={() => setActiveTab('Weather')}>Weather</button>
      </nav>

      <div className="field-selector">
        <div className="search-container">
          <input 
            type="text" 
            placeholder="Find a block or cultivar..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <ul className="field-list">
          {filteredFields.map((field, idx) => (
            <li 
              key={idx} 
              // Updated to check matching BLOCK instead of FieldName
              className={selectedField?.BLOCK === field.BLOCK ? 'selected' : ''}
              onClick={() => {
                setSelectedField(field);
                if (activeTab !== 'Fields' && activeTab !== 'Irrigation Planner') {
                  setActiveTab('Fields');
                }
              }}
            >
              {/* Updated to display BLOCK and CULTIVAR */}
              <span className="field-name">{field.BLOCK} - {field.CULTIVAR}</span>
              {/* Updated to display Area from the CSV, rounded to 3 decimal places */}
              <span className="field-size">{Number(field.Area).toFixed(3)} ha</span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}