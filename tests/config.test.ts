import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, mergeSettings, validateSettings } from '../server/config.js';

describe('validateSettings', () => {
  it('accepts the defaults', () => {
    const result = validateSettings(DEFAULT_SETTINGS);
    expect(result.ok).toBe(true);
  });

  it('merges a partial patch onto current settings', () => {
    const merged = mergeSettings(DEFAULT_SETTINGS, { units: 'metric', location: { latitude: 40 } });
    const result = validateSettings(merged);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.units).toBe('metric');
      expect(result.value.location.latitude).toBe(40);
      expect(result.value.location.name).toBe(DEFAULT_SETTINGS.location.name);
    }
  });

  it('rejects out-of-range coordinates', () => {
    const result = validateSettings(mergeSettings(DEFAULT_SETTINGS, { location: { latitude: 123 } }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(' ')).toMatch(/latitude/);
  });

  it('rejects unknown units and radar sources', () => {
    const result = validateSettings(
      mergeSettings(DEFAULT_SETTINGS, { units: 'kelvin', radarSource: 'satellite' }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toHaveLength(2);
  });

  it('rejects a contact string with control characters (it goes into a header)', () => {
    const result = validateSettings(mergeSettings(DEFAULT_SETTINGS, { contact: 'a\r\nb' }));
    expect(result.ok).toBe(false);
  });

  it('rejects non-https NOAA URLs', () => {
    const result = validateSettings(
      mergeSettings(DEFAULT_SETTINGS, { noaa: { wmsUrl: 'http://example.com/wms' } }),
    );
    expect(result.ok).toBe(false);
  });

  it('rejects non-object input', () => {
    expect(validateSettings('nope').ok).toBe(false);
    expect(validateSettings(null).ok).toBe(false);
  });
});
