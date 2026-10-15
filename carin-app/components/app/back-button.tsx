import * as React from 'react';
import { useRouter, type Href } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { resolveBackAction } from '@/lib/navigation/back-action';

export type BackButtonProps = {
  label?: string;
  href?: Href;
  onPress?: () => void;
  disabled?: boolean;
  className?: string;
};

export function BackButton({
  label = 'Kembali',
  href,
  onPress,
  disabled = false,
  className,
}: BackButtonProps) {
  const router = useRouter();

  const handlePress = () => {
    const action = resolveBackAction({
      disabled,
      onPress,
      canGoBack: router.canGoBack(),
      href,
    });
    if (action === 'disabled') return;
    if (action === 'custom') {
      onPress?.();
      return;
    }
    if (action === 'back') {
      router.back();
      return;
    }
    router.replace(action.replace);
  };

  return (
    <Button
      variant="ghost"
      className={cn('min-h-11 self-start px-0 -ml-1 flex-row items-center gap-1.5', className)}
      disabled={disabled}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={label}>
      <Icon as={ArrowLeft} size={20} className="text-foreground" />
      <Text>{label}</Text>
    </Button>
  );
}
