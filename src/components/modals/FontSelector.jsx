/**
 * FontSelector.jsx
 * Feature 4: Font Manager with 20+ fonts and live preview
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Check, Type, Search } from 'lucide-react';
import './FontSelector.css';

const FONTS = [
  { id: 'default', name: 'Default', family: 'inherit', category: 'system' },
  { id: 'inter', name: 'Inter', family: '"Inter", sans-serif', category: 'sans-serif', import: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap' },
  { id: 'roboto', name: 'Roboto', family: '"Roboto", sans-serif', category: 'sans-serif', import: 'https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap' },
  { id: 'poppins', name: 'Poppins', family: '"Poppins", sans-serif', category: 'sans-serif', import: 'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap' },
  { id: 'montserrat', name: 'Montserrat', family: '"Montserrat", sans-serif', category: 'sans-serif', import: 'https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700&display=swap' },
  { id: 'opensans', name: 'Open Sans', family: '"Open Sans", sans-serif', category: 'sans-serif', import: 'https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;500;600;700&display=swap' },
  { id: 'lato', name: 'Lato', family: '"Lato", sans-serif', category: 'sans-serif', import: 'https://fonts.googleapis.com/css2?family=Lato:wght@400;700&display=swap' },
  { id: 'nunito', name: 'Nunito', family: '"Nunito", sans-serif', category: 'sans-serif', import: 'https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700&display=swap' },
  { id: 'work-sans', name: 'Work Sans', family: '"Work Sans", sans-serif', category: 'sans-serif', import: 'https://fonts.googleapis.com/css2?family=Work+Sans:wght@400;500;600;700&display=swap' },
  { id: 'manrope', name: 'Manrope', family: '"Manrope", sans-serif', category: 'sans-serif', import: 'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&display=swap' },
  { id: 'merriweather', name: 'Merriweather', family: '"Merriweather", serif', category: 'serif', import: 'https://fonts.googleapis.com/css2?family=Merriweather:wght@400;700&display=swap' },
  { id: 'playfair', name: 'Playfair Display', family: '"Playfair Display", serif', category: 'serif', import: 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&display=swap' },
  { id: 'lora', name: 'Lora', family: '"Lora", serif', category: 'serif', import: 'https://fonts.googleapis.com/css2?family=Lora:wght@400;500;600;700&display=swap' },
  { id: 'jetbrains', name: 'JetBrains Mono', family: '"JetBrains Mono", monospace', category: 'monospace', import: 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap' },
  { id: 'fira-code', name: 'Fira Code', family: '"Fira Code", monospace', category: 'monospace', import: 'https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600&display=swap' },
  { id: 'space-mono', name: 'Space Mono', family: '"Space Mono", monospace', category: 'monospace', import: 'https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap' },
  { id: 'dm-sans', name: 'DM Sans', family: '"DM Sans", sans-serif', category: 'sans-serif', import: 'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap' },
  { id: 'quicksand', name: 'Quicksand', family: '"Quicksand", sans-serif', category: 'sans-serif', import: 'https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700&display=swap' },
  { id: 'outfit', name: 'Outfit', family: '"Outfit", sans-serif', category: 'sans-serif', import: 'https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap' },
  { id: 'plus-jakarta', name: 'Plus Jakarta Sans', family: '"Plus Jakarta Sans", sans-serif', category: 'sans-serif', import: 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap' },
  { id: 'cabin', name: 'Cabin', family: '"Cabin", sans-serif', category: 'sans-serif', import: 'https://fonts.googleapis.com/css2?family=Cabin:wght@400;500;600;700&display=swap' },
  { id: 'urbanist', name: 'Urbanist', family: '"Urbanist", sans-serif', category: 'sans-serif', import: 'https://fonts.googleapis.com/css2?family=Urbanist:wght@400;500;600;700&display=swap' },
];

const CATEGORIES = [
  { id: 'all', name: 'All Fonts' },
  { id: 'sans-serif', name: 'Sans Serif' },
  { id: 'serif', name: 'Serif' },
  { id: 'monospace', name: 'Monospace' },
  { id: 'system', name: 'System' },
];

const PREVIEW_TEXT = "The quick brown fox jumps over the lazy dog. 1234567890";

const FontSelector = ({ selected, onSelect }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('all');
  const [previewSize, setPreviewSize] = useState(16);
  const [previewWeight, setPreviewWeight] = useState('regular');

  const filteredFonts = useMemo(() => FONTS.filter(font => {
    const matchesSearch = font.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = activeCategory === 'all' || font.category === activeCategory;
    return matchesSearch && matchesCategory;
  }), [activeCategory, searchQuery]);

  const selectedFont = useMemo(
    () => FONTS.find((font) => font.id === selected) || FONTS[0],
    [selected]
  );

  const previewWeightValue = useMemo(() => ({
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700
  }[previewWeight] || 400), [previewWeight]);

  const loadFont = (font) => {
    if (font.import && !document.querySelector(`link[href="${font.import}"]`)) {
      const link = document.createElement('link');
      link.href = font.import;
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }
  };

  const handleSelect = (font) => {
    loadFont(font);
    onSelect(font.id);
  };

  useEffect(() => {
    if (selectedFont) {
      loadFont(selectedFont);
    }
  }, [selectedFont]);

  return (
    <div className="font-selector">
      <div className="font-hero">
        <div className="font-hero-copy">
          <span className="font-hero-label">Current interface font</span>
          <strong style={{ fontFamily: selectedFont.family }}>{selectedFont.name}</strong>
          <p style={{ fontFamily: selectedFont.family }}>
            The quick brown fox jumps over the lazy dog.
          </p>
        </div>
        <div className="font-hero-stats">
          <span>{filteredFonts.length} results</span>
          <span>{activeCategory === 'all' ? 'All categories' : activeCategory}</span>
        </div>
      </div>

      {/* Search and Filter */}
      <div className="font-selector-header">
        <div className="font-search">
          <Search size={16} />
          <input
            type="text"
            placeholder="Search fonts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="font-categories">
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              className={`category-btn ${activeCategory === cat.id ? 'active' : ''}`}
              onClick={() => setActiveCategory(cat.id)}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      {/* Preview Controls */}
      <div className="font-preview-controls">
        <div className="preview-control">
          <label>Size</label>
          <input
            type="range"
            min="12"
            max="32"
            value={previewSize}
            onChange={(e) => setPreviewSize(parseInt(e.target.value))}
          />
          <span>{previewSize}px</span>
        </div>
        <div className="preview-control">
          <label>Weight</label>
          <select value={previewWeight} onChange={(e) => setPreviewWeight(e.target.value)}>
            <option value="regular">Regular</option>
            <option value="medium">Medium</option>
            <option value="semibold">Semibold</option>
            <option value="bold">Bold</option>
          </select>
        </div>
      </div>

      {/* Font Grid */}
      <div className="font-grid-head">
        <span>Pick a font family</span>
        <span>{filteredFonts.length} visible</span>
      </div>
      <div className="font-grid">
        {filteredFonts.map(font => (
          <button
            key={font.id}
            className={`font-card ${selected === font.id ? 'active' : ''}`}
            onClick={() => handleSelect(font)}
            onMouseEnter={() => loadFont(font)}
            style={{ fontFamily: font.family }}
          >
            <div className="font-preview-text" style={{ fontSize: previewSize, fontWeight: previewWeightValue }}>
              {PREVIEW_TEXT}
            </div>
            <div className="font-info">
              <span className="font-name">{font.name}</span>
              <span className="font-category">{font.category}</span>
            </div>
            {selected === font.id && (
              <div className="font-selected">
                <Check size={16} />
              </div>
            )}
          </button>
        ))}
      </div>

      {filteredFonts.length === 0 && (
        <div className="font-empty">
          <Type size={32} />
          <p>No fonts found matching your search</p>
        </div>
      )}
    </div>
  );
};

export default FontSelector;
export { FONTS };
