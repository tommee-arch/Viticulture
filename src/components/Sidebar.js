import React, { useState } from 'react';

export default function Sidebar({ activeTab, setActiveTab, fieldsData, selectedField, setSelectedField }) {
  const [isDecisionSupportOpen, setIsDecisionSupportOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredFields = fieldsData.filter(f => 
    f.FieldName?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h1>IRRIGUIDE</h1>
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
            <span className="chevron">{isDecisionSupportOpen ? '▼' : '▶'}</span>
          </button>
          
          {isDecisionSupportOpen && (
            <div className="accordion-content">
              <button className={activeTab === 'Irrigation Manager' ? 'active' : ''} onClick={() => setActiveTab('Irrigation Manager')}>Irrigation Manager</button>
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
            placeholder="Find a field..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <ul className="field-list">
          {filteredFields.map((field, idx) => (
            <li 
              key={idx} 
              className={selectedField?.FieldName === field.FieldName ? 'selected' : ''}
              onClick={() => {
                setSelectedField(field);
                if (activeTab !== 'Fields' && activeTab !== 'Irrigation Manager') {
                  setActiveTab('Fields');
                }
              }}
            >
              <span className="field-name">{field.FieldName}</span>
              <span className="field-size">{field.AreaHA} ha</span>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}