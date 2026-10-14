import { describe, expect, it } from 'vitest';
import { resolveDevelopmentApiUrl } from './api-url';

describe('development API address', () => {
  it.each(['localhost', '127.0.0.1', '[::1]'])(
    'replaces loopback %s with the Expo host',
    (host) => {
      expect(resolveDevelopmentApiUrl(`http://${host}:3000`, '192.168.1.10:8081')).toBe(
        'http://192.168.1.10:3000'
      );
    }
  );

  it('preserves explicit API hosts and paths', () => {
    expect(resolveDevelopmentApiUrl('https://api.example.test/base', '192.168.1.10:8081')).toBe(
      'https://api.example.test/base'
    );
    expect(resolveDevelopmentApiUrl('http://localhost:3000/base', '192.168.1.10:8081')).toBe(
      'http://192.168.1.10:3000/base'
    );
  });

  it('preserves the configured URL when no Expo host is available', () => {
    expect(resolveDevelopmentApiUrl('http://localhost:3000', null)).toBe('http://localhost:3000');
    expect(resolveDevelopmentApiUrl('', '192.168.1.10:8081')).toBe('');
  });
});
