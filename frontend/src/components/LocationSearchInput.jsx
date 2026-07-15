import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Loader2 } from 'lucide-react';

export default function LocationSearchInput({ value, onChange, placeholder = "Search location...", className = "" }) {
  const [query, setQuery] = useState(value || '');
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  // Sync internal state when external value changes
  useEffect(() => {
    setQuery(value || '');
  }, [value]);

  useEffect(() => {
    const clickAway = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', clickAway);
    return () => document.removeEventListener('mousedown', clickAway);
  }, []);

  // Fetch from OpenStreetMap Nominatim with debounce
  useEffect(() => {
    if (!query || query.trim().length < 3) {
      setSuggestions([]);
      return;
    }

    // Only search if the query doesn't match the selected value
    if (query === value) {
      return;
    }

    const delay = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&addressdetails=1&limit=6&accept-language=en`,
          {
            headers: {
              'User-Agent': 'ResumeAnalyzer/1.0 (kasinath.anilkumar@outlook.com)'
            }
          }
        );
        const data = await res.json();
        
        const items = data.map((item) => {
          return {
            displayName: item.display_name,
            lat: parseFloat(item.lat),
            lon: parseFloat(item.lon)
          };
        });

        // Deduplicate suggestions
        const seen = new Set();
        const deduped = items.filter((item) => {
          const key = item.displayName.toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        setSuggestions(deduped);
        setOpen(true);
      } catch (err) {
        console.error('Error fetching locations:', err);
      } finally {
        setLoading(false);
      }
    }, 500);

    return () => clearTimeout(delay);
  }, [query, value]);

  const selectItem = (item) => {
    setQuery(item.displayName);
    onChange(item.displayName);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!e.target.value) {
            onChange('');
          }
        }}
        placeholder={placeholder}
        className={className}
        onFocus={() => {
          if (suggestions.length > 0) setOpen(true);
        }}
      />
      {loading && (
        <div className="absolute right-3.5 top-3.5 z-20">
          <Loader2 size={12} className="animate-spin text-[#c5a880]" />
        </div>
      )}
      
      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 w-full left-0 right-0 mt-1 bg-white dark:bg-[#151210] border luxury-border-thin shadow-lg max-h-48 overflow-y-auto text-left rounded-none divide-y divide-slate-100 dark:divide-slate-800/40">
          {suggestions.map((item, idx) => (
            <li key={idx}>
              <button
                type="button"
                onClick={() => selectItem(item)}
                className="w-full px-3 py-2 flex items-start gap-2 hover:bg-slate-50 dark:hover:bg-slate-800/20 text-left transition-colors"
              >
                <MapPin size={11} className="text-[#c5a880] shrink-0 mt-0.5" />
                <span className="text-[10px] text-slate-700 dark:text-slate-300 tracking-wide leading-normal">
                  {item.displayName}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
