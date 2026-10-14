import * as React from 'react';
// The app installs react-dom for Expo web but omits its separate type package.
// @ts-expect-error react-dom/server has no declarations in this workspace.
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { AppDataProvider, useAppData } from './provider';
import type { DataScope } from './scope';

const asyncStorage = vi.hoisted(() => ({
  getItem: vi.fn(async () => null),
  setItem: vi.fn(async () => {}),
  removeItem: vi.fn(async () => {}),
  getAllKeys: vi.fn(async () => [] as string[]),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({ default: asyncStorage }));
vi.mock('@react-native-community/netinfo', () => ({
  default: { addEventListener: () => () => {} },
}));

const bob: DataScope = { environment: 'development', userId: 'bob' };
const alice: DataScope = { environment: 'development', userId: 'alice' };

describe('AppDataProvider session scope transitions', () => {
  it('does not reinstall a pending account after clearSession invalidates it', async () => {
    asyncStorage.getAllKeys.mockReset();
    asyncStorage.getAllKeys.mockResolvedValue([]);
    let data!: ReturnType<typeof useAppData>;
    function CaptureDataContext() {
      data = useAppData();
      return null;
    }
    renderToString(
      React.createElement(AppDataProvider, null, React.createElement(CaptureDataContext))
    );

    await data.setSessionUser('bob');
    expect(data.isCurrentScope(bob)).toBe(true);
    await data.setSessionUser('bob');
    expect(asyncStorage.getAllKeys).not.toHaveBeenCalled();

    let releaseCleanup!: (keys: string[]) => void;
    let cleanupStarted!: () => void;
    const cleanup = new Promise<string[]>((resolve) => {
      releaseCleanup = resolve;
    });
    const started = new Promise<void>((resolve) => {
      cleanupStarted = resolve;
    });
    asyncStorage.getAllKeys.mockImplementation(() => {
      cleanupStarted();
      return cleanup;
    });

    const installAlice = data.setSessionUser('alice');
    await started;
    const logout = data.clearSession();
    releaseCleanup([]);
    await Promise.all([installAlice, logout]);

    expect(data.isCurrentScope(bob)).toBe(false);
    expect(data.isCurrentScope(alice)).toBe(false);
  });
});
