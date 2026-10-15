import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react-native';
import * as React from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';

export type DrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  contentContainerClassName?: string;
  className?: string;
  showCloseButton?: boolean;
  maxHeightRatio?: number; // 0.1 to 0.95, default 0.88
};

export function Drawer({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  contentContainerClassName,
  className,
  showCloseButton = true,
  maxHeightRatio = 0.88,
}: DrawerProps) {
  const { height } = useWindowDimensions();
  const maxHeight = Math.round(height * maxHeightRatio);
  const slideDistance = height > 0 ? height : 600;

  // Controls whether the native modal stays mounted during open & exit animations
  const [isMounted, setIsMounted] = React.useState(isOpen);

  // Animated values for smooth in-place backdrop fade and sheet slide
  const [backdropOpacity] = React.useState(() => new Animated.Value(isOpen ? 1 : 0));
  const [translateY] = React.useState(() => new Animated.Value(isOpen ? 0 : slideDistance));

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
        Animated.timing(translateY, {
          toValue: 0,
          duration: 220,
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
      // Animate sheet sliding DOWN and backdrop fading OUT before unmounting
      const closeAnim = Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 180,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(translateY, {
          toValue: slideDistance,
          duration: 200,
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
  }, [isOpen, isMounted, slideDistance, backdropOpacity, translateY]);

  if (!isMounted) {
    return null;
  }

  return (
    <Modal
      visible={isMounted}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent>
      <View className="flex-1 justify-end">
        {/* 1. Backdrop: Fades in and out in-place (does NOT slide from bottom) */}
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              opacity: backdropOpacity,
              backgroundColor: 'rgba(0, 0, 0, 0.55)',
            },
          ]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Tutup dialog"
          />
        </Animated.View>

        {/* 2. KeyboardAvoidingView wrapping the sheet */}
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          pointerEvents="box-none"
          className="justify-end">
          {/* 3. Animated Sheet: Slides UP on open, and truly slides DOWN on close */}
          <Animated.View
            style={[
              {
                maxHeight,
                transform: [{ translateY }],
              },
            ]}>
            {/* Opaque container styled by NativeWind with bg-card */}
            <View
              style={{ maxHeight }}
              className={cn(
                'w-full rounded-t-[28px] border-t border-border bg-card shadow-2xl',
                className
              )}>
              {/* Grab handle */}
              <View className="items-center pt-3 pb-1">
                <View className="h-1.5 w-12 rounded-full bg-muted-foreground/25" />
              </View>

              {/* Header */}
              {(title || showCloseButton) && (
                <View className="flex-row items-center justify-between px-5 pt-2 pb-3 border-b border-border/40">
                  <View className="flex-1 pr-3">
                    {title && <Text variant="h3">{title}</Text>}
                    {description && (
                      <Text variant="caption" className="text-muted-foreground mt-0.5">
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

              {/* Scrollable content */}
              <ScrollView
                className="flex-1 bg-card"
                contentContainerClassName={cn('p-5', contentContainerClassName)}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}>
                {children}
              </ScrollView>

              {/* Optional sticky footer */}
              {footer && (
                <View className="border-t border-border/50 bg-card px-5 py-4 pb-6">
                  {footer}
                </View>
              )}
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
