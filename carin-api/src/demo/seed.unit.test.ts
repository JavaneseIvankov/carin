import { describe, expect, it } from 'vitest';
import { assertRealAnalysisResult, nextPollDelayMs, parseDemoSeedOptions } from './seed.js';

describe('demo seed options', () => {
  it('runs real photo analysis by default and can skip it explicitly', () => {
    expect(parseDemoSeedOptions([])).toEqual({ analyzePhotos: true });
    expect(parseDemoSeedOptions(['--skip-photo-analysis'])).toEqual({ analyzePhotos: false });
  });

  it('rejects unsupported command-line options', () => {
    expect(() => parseDemoSeedOptions(['--unknown'])).toThrow('DEMO_SEED_ARGUMENT_INVALID');
  });
});

describe('real analysis gate', () => {
  it('accepts real model output and preserves its unrecognized support status', () => {
    expect(() => assertRealAnalysisResult({
      dataMode: 'real',
      supportStatus: 'unrecognized',
      sources: [{ id: 'provider', kind: 'model_estimate' }],
      limitations: [{ code: 'catalog_unavailable' }],
    })).not.toThrow();
  });

  it('rejects synthetic mode and synthetic provenance', () => {
    expect(() => assertRealAnalysisResult({
      dataMode: 'synthetic',
      sources: [{ id: 'fixture', kind: 'synthetic' }],
    })).toThrow('DEMO_ANALYSIS_NOT_REAL');
    expect(() => assertRealAnalysisResult({
      dataMode: 'real',
      sources: [{ id: 'fixture', kind: 'synthetic' }],
    })).toThrow('DEMO_ANALYSIS_NOT_REAL');
  });

  it('uses bounded exponential polling and honors a valid Retry-After value', () => {
    expect(nextPollDelayMs(0)).toBe(1_000);
    expect(nextPollDelayMs(3)).toBe(8_000);
    expect(nextPollDelayMs(9)).toBe(15_000);
    expect(nextPollDelayMs(0, '4')).toBe(4_000);
    expect(nextPollDelayMs(0, 'not-a-delay')).toBe(1_000);
  });
});
