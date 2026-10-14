import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react-native';
import * as React from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal as RNModal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

export type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  showCloseButton?: boolean;
  dismissible?: boolean;
};

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  className,
  showCloseButton = true,
  dismissible = true,
}: ModalProps) {
  // Controls whether the native modal stays mounted during open & exit animations
  const [isMounted, setIsMounted] = React.useState(isOpen);

  // Animated values for smooth in-place backdrop fade and card scale
  const [backdropOpacity] = React.useState(() => new Animated.Value(isOpen ? 1 : 0));
  const [scale] = React.useState(() => new Animated.Value(isOpen ? 1 : 0.94));

  // Sync isMounted during render when isOpen becomes true (React 19 pattern: avoids setState in effect)
  const [prevIsOpen, setPrevIsOpen] = React.useState(isOpen);
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen && !isMounted) {
      setIsMounted(true);
    }
  }

  React.useEffect(() => {
    let active = true;

    if (isOpen) {
      const openAnim = Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 200,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 200,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]);

      openAnim.start();

      return () => {
        active = false;
        openAnim.stop();
      };
    } else if (isMounted) {
      const closeAnim = Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 150,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(scale, {
          toValue: 0.94,
          duration: 150,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]);

      closeAnim.start(({ finished }) => {
        if (active && finished) {
          setIsMounted(false);
        }
      });

      return () => {
        active = false;
        closeAnim.stop();
      };
    }
  }, [isOpen, isMounted, backdropOpacity, scale]);

  if (!isMounted) {
    return null;
  }

  return (
    <RNModal
      visible={isMounted}
      transparent
      animationType="none"
      onRequestClose={dismissible ? onClose : undefined}
      statusBarTranslucent>
      <View className="flex-1 items-center justify-center p-4">
        {/* Backdrop with fade-in and fade-out opacity in-place */}
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              opacity: backdropOpacity,
              backgroundColor: 'rgba(0, 0, 0, 0.55)',
            },
          ]}>
          {dismissible && (
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Tutup dialog"
            />
          )}
        </Animated.View>

        {/* Centered Modal Card with scale */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          pointerEvents="box-none"
          className="w-full max-w-md items-center justify-center">
          <Animated.View
            style={[
              {
                transform: [{ scale }],
              },
            ]}>
            {/* Opaque container styled by NativeWind with bg-card */}
            <View
              className={cn(
                'w-full rounded-summary border border-border bg-card p-6 shadow-2xl',
                className
              )}>
              {/* Header */}
              {(title || showCloseButton) && (
                <View className="mb-4 flex-row items-start justify-between gap-3">
                  <View className="flex-1">
                    {title && <Text variant="h3">{title}</Text>}
                    {description && (
                      <Text variant="caption" className="text-muted-foreground mt-1">
                        {description}
                      </Text>
                    )}
                  </View>
                  {showCloseButton && (
                    <Pressable
                      onPress={onClose}
                      hitSlop={12}
                      accessibilityRole="button"
                      accessibilityLabel="Tutup"
                      className="h-8 w-8 items-center justify-center rounded-full bg-muted/40 active:bg-muted/70">
                      <Icon as={X} size={16} className="text-muted-foreground" />
                    </Pressable>
                  )}
                </View>
              )}

              {/* Content */}
              <View className="gap-4">{children}</View>

              {/* Optional footer */}
              {footer && <View className="mt-6 gap-2.5">{footer}</View>}
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </RNModal>
  );
}
