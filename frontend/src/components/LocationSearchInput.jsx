import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Loader2 } from 'lucide-react';

export default function LocationSearchInput({ value, onChange, placeholder = "Search location...", className = "", required = false }) {
  const [query, setQuery] = useState(value || '');
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  // True only while the user is actually typing. Gates the lookup so it fires on
  // real input but not when the field is prefilled from the parent or filled in
  // by picking a suggestion — both of which would otherwise trigger a pointless
  // search for text the user just accepted.
  const typingRef = useRef(false);

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

    // Only look up what the user typed. (This used to compare query against
    // `value`; now that every keystroke is published upward they are always
    // equal, so that check would suppress every search.)
    if (!typingRef.current) {
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
  }, [query]);

  const selectItem = (item) => {
    typingRef.current = false; // accepted a suggestion — don't re-search it
    setQuery(item.displayName);
    onChange(item.displayName);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        type="text"
        required={required}
        value={query}
        onChange={(e) => {
          // Publish EVERY keystroke to the parent. Previously only picking a
          // suggestion did this, so a typed-but-unselected city was silently
          // dropped on save — and on the apply form, which now requires a
          // location, it read as empty while visibly containing text.
          typingRef.current = true;
          setQuery(e.target.value);
          onChange(e.target.value);
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
