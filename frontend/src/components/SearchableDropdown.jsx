import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, Search } from 'lucide-react';

const isCountryCode = (code) => {
  const normalized = String(code || '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(normalized);
};

export default function SearchableDropdown({ options, placeholder, value, onChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);

  const safeOptions = options || [];

  // Find the currently selected option
  const selectedOption = safeOptions.find(opt => opt.code === value);

  // Close the dropdown when clicking outside of it
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Safe search input focus when dropdown opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      const timer = setTimeout(() => {
        searchInputRef.current.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Handle keyboard events (Escape key to close)
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  // Filter options based on typed input
  const filteredOptions = safeOptions.filter(opt =>
    opt.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const renderOptionLabel = (option, flagClassName = 'dropdown-header-flag') => {
    const normalizedCode = String(option?.code || '').trim().toLowerCase();
    const shouldRenderFlagImage = isCountryCode(option?.code);
    return (
      <>
        {shouldRenderFlagImage ? (
          <img
            src={`https://flagcdn.com/w40/${normalizedCode}.png`}
            srcSet={`https://flagcdn.com/w80/${normalizedCode}.png 2x`}
            alt=""
            className={flagClassName}
            loading="lazy"
            style={{
              width: '24px',
              height: '18px',
              objectFit: 'cover',
              borderRadius: '2px',
              marginRight: '12px',
              flexShrink: 0,
              boxShadow: '0 0 0 1px rgba(15, 23, 42, 0.12)'
            }}
          />
        ) : option?.flag ? (
          <span className={flagClassName} style={{ marginRight: '10px', fontSize: '18px', lineHeight: 1, verticalAlign: 'middle' }}>
            {option.flag}
          </span>
        ) : (
          <span style={{ width: '24px', marginRight: '12px', flexShrink: 0 }} />
        )}
        <span>{option?.name}</span>
      </>
    );
  };

  const handleSelect = (code) => {
    onChange(code);
    setIsOpen(false);
    setSearchTerm('');
  };

  return (
    <div ref={dropdownRef} className="dropdown-container">
      {/* Selection Box Header */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className={`dropdown-header ${isOpen ? 'open' : ''}`}
      >
        <span className="dropdown-header-content">
          {selectedOption ? (
            <span className="dropdown-header-text">{renderOptionLabel(selectedOption)}</span>
          ) : (
            <span className="dropdown-header-placeholder">{placeholder}</span>
          )}
        </span>
        <ChevronDown 
          size={18} 
          style={{ 
            color: '#64748b', 
            transition: 'transform 0.2s', 
            transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' 
          }} 
        />
      </div>

      {/* Dropdown Options List */}
      {isOpen && (
        <div className="dropdown-menu-list">
          {/* Search Input Bar */}
          <div className="dropdown-search-container">
            <Search size={16} style={{ color: '#94a3b8', marginRight: '8px' }} />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Type to search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onClick={(e) => e.stopPropagation()} // Prevent clicking search from closing dropdown
              className="dropdown-search-input"
            />
          </div>

          {/* Filtered Country Items */}
          <div className="dropdown-options-container">
            {filteredOptions.length === 0 ? (
              <div className="dropdown-no-results">
                No matching options found
              </div>
            ) : (
              filteredOptions.map(opt => (
                <div
                  key={opt.code}
                  onClick={() => handleSelect(opt.code)}
                  className={`dropdown-item ${value === opt.code ? 'selected' : ''}`}
                >
                  {renderOptionLabel(opt)}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
