import type { Href } from 'expo-router';

export type BackActionResolution = 'disabled' | 'custom' | 'back' | { replace: Href };

export function resolveBackAction({
  disabled,
  onPress,
  canGoBack,
  href,
}: {
  disabled?: boolean;
  onPress?: () => void;
  canGoBack: boolean;
  href?: Href;
}): BackActionResolution {
  if (disabled) return 'disabled';
  if (onPress) return 'custom';
  if (canGoBack) return 'back';
  if (href) return { replace: href };
  return 'back';
}
