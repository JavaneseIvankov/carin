import { describe, expect, it } from 'vitest';
import { resolveDevelopmentApiUrl as resolveApiUrl } from './api-url';

describe('development API URL normalization', () => {
  it('keeps localhost unchanged when no dev host is available', () => {
    expect(resolveApiUrl('http://localhost:3000', null)).toBe('http://localhost:3000');
  });

  it('replaces localhost with dev host when available in development', () => {
    expect(resolveApiUrl('http://localhost:3000', '192.168.1.50')).toBe('http://192.168.1.50:3000');
  });

  it('preserves custom non-localhost URLs even when dev host is given', () => {
    expect(resolveApiUrl('https://api.carin.app/', '192.168.1.50')).toBe('https://api.carin.app');
    expect(resolveApiUrl('http://noir:3000/', '192.168.1.50')).toBe('http://noir:3000');
  });

  it('strips trailing slashes cleanly', () => {
    expect(resolveApiUrl('http://192.168.1.10:3000///')).toBe('http://192.168.1.10:3000');
  });
});
