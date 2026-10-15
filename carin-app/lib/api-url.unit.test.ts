import { describe, expect, it } from 'vitest';
import { resolveDevelopmentApiUrl, resolveDevelopmentMediaUrl } from './api-url';

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

describe('development signed media address', () => {
  it('uses the resolved API origin for loopback signed photo URLs', () => {
    expect(
      resolveDevelopmentMediaUrl(
        'http://localhost:3000/media/photos/photo-1?token=signed',
        'http://10.177.46.88:3100',
        'development'
      )
    ).toBe('http://10.177.46.88:3100/media/photos/photo-1?token=signed');
  });

  it('preserves explicit media hosts and production URLs', () => {
    expect(
      resolveDevelopmentMediaUrl(
        'https://cdn.example.test/media/photo?token=signed',
        'http://10.177.46.88:3100',
        'development'
      )
    ).toBe('https://cdn.example.test/media/photo?token=signed');
    expect(
      resolveDevelopmentMediaUrl(
        'http://localhost:3000/media/photo?token=signed',
        'https://api.example.test',
        'production'
      )
    ).toBe('http://localhost:3000/media/photo?token=signed');
  });
});
