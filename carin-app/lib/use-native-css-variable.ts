import { useUnstableNativeVariable } from 'nativewind';

/**
 * NativeWind's JS token lookup is explicitly unstable. Keep it behind this
 * adapter so the app has one small seam to replace if NativeWind changes it.
 */
export function useNativeCssVariable(name: `--${string}`) {
  return useUnstableNativeVariable(name);
}
