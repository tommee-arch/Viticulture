import React, { useState } from 'react';
import logo from '../sprinklers.png';
import HelpTip from './HelpTip';
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
        <HelpTip text="See the whole vineyard on one map, coloured by whichever metric you pick." className="help-tip-block">
          <button className={activeTab === 'Home' ? 'active' : ''} onClick={() => setActiveTab('Home')}>Home</button>
        </HelpTip>
        <HelpTip text="Drill into a single block's water, weather and health data." className="help-tip-block">
          <button className={activeTab === 'Fields' ? 'active' : ''} onClick={() => setActiveTab('Fields')}>Fields</button>
        </HelpTip>

        <div className="accordion">
          <HelpTip text="Tools that help you decide where irrigation is needed most." className="help-tip-block">
            <button
              className={`accordion-toggle ${isDecisionSupportOpen ? 'open' : ''}`}
              onClick={() => setIsDecisionSupportOpen(!isDecisionSupportOpen)}
            >
              Decision Support
              <span className="chevron">{isDecisionSupportOpen ? ' ▼' : ' ▶'}</span>
            </button>
          </HelpTip>

          {isDecisionSupportOpen && (
            <div className="accordion-content">
              <HelpTip text="See every block ranked by irrigation priority, with a live map, chart and AI assistant." className="help-tip-block">
                <button className={activeTab === 'Irrigation Planner' ? 'active' : ''} onClick={() => setActiveTab('Irrigation Planner')}>Irrigation Planner</button>
              </HelpTip>
            </div>
          )}
        </div>

        <HelpTip text="Regional weather radar (coming soon)." className="help-tip-block">
          <button className={activeTab === 'Weather' ? 'active' : ''} onClick={() => setActiveTab('Weather')}>Weather</button>
        </HelpTip>
      </nav>

      <div className="field-selector">
        <div className="search-container">
          <HelpTip text="Type a block name or grape variety to filter the list below." className="help-tip-block">
            <input
              type="text"
              placeholder="Find a block or cultivar..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </HelpTip>
        </div>
        <ul className="field-list">
          {filteredFields.map((field, idx) => (
            <li 
              key={idx} 
              // Updated to check matching BLOCK instead of FieldName
              className={selectedField?.BLOCK === field.BLOCK ? 'selected' : ''}
              onClick={() => {
                setSelectedField(field);
                // Home and Irrigation Planner both show the selected block right
                // there on their own map - only jump to Fields from tabs that don't.
                if (activeTab !== 'Fields' && activeTab !== 'Irrigation Planner' && activeTab !== 'Home') {
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