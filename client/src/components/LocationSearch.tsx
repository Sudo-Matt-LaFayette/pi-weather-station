import { useEffect, useRef, useState } from 'react';
import type { LocationResult } from '../../../shared/types';
import { saveLocation, searchLocations } from '../api';

interface Props {
  currentName: string;
  onClose: () => void;
  onSaved: () => void;
}

const SEARCH_DEBOUNCE_MS = 400;

function labelFor(r: LocationResult): string {
  return [r.name, r.admin1, r.country].filter((part): part is string => Boolean(part)).join(', ');
}

/** Full-screen place search. Choosing a result saves it as the new location. */
export function LocationSearch({ currentName, onClose, onSaved }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LocationResult[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounced search. A newer query cancels the older one.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setStatus(null);
      return;
    }
    let alive = true;
    setStatus('Searching…');
    const id = setTimeout(() => {
      searchLocations(q)
        .then((found) => {
          if (!alive) return;
          setResults(found);
          setStatus(found.length > 0 ? null : 'No matches. Try a city name.');
        })
        .catch(() => {
          if (!alive) return;
          setResults([]);
          setStatus('Search is unavailable right now.');
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [query]);

  async function choose(r: LocationResult): Promise<void> {
    setSaving(true);
    setStatus(`Setting location to ${labelFor(r)}…`);
    try {
      await saveLocation({ name: labelFor(r), latitude: r.latitude, longitude: r.longitude });
      onSaved();
      onClose();
    } catch (err) {
      setStatus(`Could not save: ${err instanceof Error ? err.message : 'unknown error'}`);
      setSaving(false);
    }
  }

  return (
    <div
      className="search-panel"
      role="dialog"
      aria-modal="true"
      aria-label="Choose location"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div className="search-head">
        <h2>Location</h2>
        <button type="button" className="header-btn" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="search-current">Current: {currentName}</div>
      <input
        ref={inputRef}
        className="search-input"
        type="search"
        placeholder="City name, e.g. Asheville"
        aria-label="Search for a city"
        autoComplete="off"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="search-status" role="status">
        {status}
      </div>
      <ul className="search-results">
        {results.map((r) => (
          <li key={`${r.latitude},${r.longitude},${r.name}`}>
            <button type="button" disabled={saving} onClick={() => void choose(r)}>
              {labelFor(r)}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
