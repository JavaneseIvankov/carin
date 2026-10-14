import { afterEach, describe, expect, it, vi } from 'vitest';
import { startAnalysisPolling } from './analysis-polling';

describe('analysis polling loop', () => {
  afterEach(() => vi.useRealTimers());

  it('continues after identical queued responses and switches to five seconds after 30 seconds', async () => {
    vi.useFakeTimers();
    const start = Date.now();
    const refetch = vi.fn(async () => 'queued' as const);
    const stop = startAnalysisPolling({
      initialStatus: 'queued',
      getElapsedMs: () => Date.now() - start,
      shouldPoll: () => true,
      refetch,
    });

    await vi.advanceTimersByTimeAsync(30_000);
    expect(refetch).toHaveBeenCalledTimes(15);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(refetch).toHaveBeenCalledTimes(15);
    await vi.advanceTimersByTimeAsync(1);
    expect(refetch).toHaveBeenCalledTimes(16);
    stop();
  });

  it('stops after a terminal status or when backgrounded', async () => {
    vi.useFakeTimers();
    const terminalRefetch = vi.fn(async () => 'completed' as const);
    startAnalysisPolling({
      initialStatus: 'processing',
      getElapsedMs: () => 0,
      shouldPoll: () => true,
      refetch: terminalRefetch,
    });
    await vi.advanceTimersByTimeAsync(2_000);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(terminalRefetch).toHaveBeenCalledTimes(1);

    let foreground = true;
    const backgroundRefetch = vi.fn(async () => 'processing' as const);
    startAnalysisPolling({
      initialStatus: 'processing',
      getElapsedMs: () => 0,
      shouldPoll: () => foreground,
      refetch: backgroundRefetch,
    });
    foreground = false;
    await vi.advanceTimersByTimeAsync(2_000);
    expect(backgroundRefetch).not.toHaveBeenCalled();
  });
});
