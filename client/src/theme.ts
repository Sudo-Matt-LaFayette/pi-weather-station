export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'weather-theme';

/** Saved choice, or dark by default (the plan's instrument-panel look). */
export function initialTheme(): Theme {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // Storage can be blocked. Fall back to the default.
  }
  return 'dark';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Not saved, but the theme still applies for this session.
  }
}
