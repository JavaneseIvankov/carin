import { TextClassContext } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  type ColorValue,
  type PressableStateCallbackType,
} from 'react-native';
import { cssColorToNativeColor } from '@/lib/css-color';
import { useNativeCssVariable } from '@/lib/use-native-css-variable';

const buttonVariants = cva(
  cn(
    'group shrink-0 flex-row items-center justify-center gap-2 rounded-control',
    Platform.select({
      web: "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive outline-none transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
    })
  ),
  {
    variants: {
      variant: {
        default: cn(
          'bg-primary active:bg-primary/90',
          Platform.select({ web: 'hover:bg-primary/90' })
        ),
        destructive: cn(
          'bg-destructive active:bg-destructive/90',
          Platform.select({
            web: 'hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40',
          })
        ),
        outline: cn(
          'rounded-[20px] border-b-4 border-border bg-muted active:bg-muted active:opacity-95 dark:border-background',
          Platform.select({
            web: 'hover:bg-muted hover:opacity-95',
          })
        ),
        secondary: cn(
          'bg-secondary active:bg-secondary/90',
          Platform.select({ web: 'hover:bg-secondary/90' })
        ),
        ghost: cn(
          'active:bg-accent dark:active:bg-accent/50',
          Platform.select({ web: 'hover:bg-accent dark:hover:bg-accent/50' })
        ),
        link: '',
        tactile: cn(
          'rounded-[20px] border-b-4 border-[#33451f] bg-primary active:opacity-95 dark:border-[#151d0c]',
          Platform.select({ web: 'transition-transform hover:bg-primary/95' })
        ),
        'tactile-secondary': cn(
          'rounded-[20px] border-b-4 border-[#e2b899] bg-secondary active:opacity-95 dark:border-[#241b14]',
          Platform.select({ web: 'transition-transform hover:bg-secondary/95' })
        ),
      },
      size: {
        default: cn('min-h-12 px-4 py-2.5', Platform.select({ web: 'has-[>svg]:px-3' })),
        sm: cn('min-h-11 gap-1.5 px-3 py-2', Platform.select({ web: 'has-[>svg]:px-2.5' })),
        lg: cn('min-h-12 px-6 py-2.5', Platform.select({ web: 'has-[>svg]:px-4' })),
        icon: 'h-11 w-11',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

const buttonTextVariants = cva(
  cn(
    'shrink text-center text-base font-semibold leading-[22px] text-foreground',
    Platform.select({ web: 'pointer-events-none transition-colors' })
  ),
  {
    variants: {
      variant: {
        default: 'text-primary-foreground',
        destructive: 'text-destructive-foreground',
        outline: cn(
          'group-active:text-accent-foreground',
          Platform.select({ web: 'group-hover:text-accent-foreground' })
        ),
        secondary: 'text-secondary-foreground',
        ghost: 'group-active:text-accent-foreground',
        link: cn(
          'text-primary group-active:underline',
          Platform.select({ web: 'underline-offset-4 hover:underline group-hover:underline' })
        ),
        tactile: 'text-primary-foreground',
        'tactile-secondary': 'text-secondary-foreground',
      },
      size: {
        default: '',
        sm: 'text-sm leading-5',
        lg: '',
        icon: '',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

type ButtonProps = Omit<React.ComponentProps<typeof Pressable>, 'accessibilityState'> &
  React.RefAttributes<typeof Pressable> &
  VariantProps<typeof buttonVariants> & {
    accessibilityState?: React.ComponentProps<typeof Pressable>['accessibilityState'];
    loading?: boolean;
    tactile?: boolean;
  };

const SPINNER_TOKEN_BY_VARIANT = {
  default: 'primary-foreground',
  destructive: 'destructive-foreground',
  outline: 'foreground',
  secondary: 'secondary-foreground',
  ghost: 'foreground',
  link: 'primary',
  tactile: 'primary-foreground',
  'tactile-secondary': 'secondary-foreground',
} as const;

function NativeButtonSpinner({ token }: { token: string }) {
  const cssColor = useNativeCssVariable(`--${token}`);
  return (
    <ActivityIndicator size="small" color={cssColorToNativeColor(cssColor)} accessible={false} />
  );
}

function WebButtonSpinner({ token }: { token: string }) {
  return (
    <ActivityIndicator
      size="small"
      color={`hsl(var(--${token}))` as ColorValue}
      accessible={false}
    />
  );
}

function ButtonSpinner({ variant }: { variant: NonNullable<ButtonProps['variant']> }) {
  const token = SPINNER_TOKEN_BY_VARIANT[variant];
  return Platform.OS === 'web' ? (
    <WebButtonSpinner token={token} />
  ) : (
    <NativeButtonSpinner token={token} />
  );
}

function Button({
  className,
  variant,
  size,
  loading = false,
  disabled = false,
  tactile = false,
  accessibilityState,
  onPress,
  onHoverIn,
  onHoverOut,
  children,
  style,
  ...props
}: ButtonProps) {
  const [hovered, setHovered] = React.useState(false);
  const unavailable = disabled || loading;
  const effectiveVariant = variant ?? (tactile ? 'tactile' : 'default');
  const resolvedVariant =
    tactile && effectiveVariant === 'secondary'
      ? 'tactile-secondary'
      : tactile && effectiveVariant === 'default'
        ? 'tactile'
        : effectiveVariant;
  const isTactile =
    resolvedVariant === 'tactile' ||
    resolvedVariant === 'tactile-secondary' ||
    resolvedVariant === 'outline';

  return (
    <TextClassContext.Provider value={buttonTextVariants({ variant: resolvedVariant, size })}>
      <Pressable
        className={cn(
          disabled && !loading && 'opacity-50',
          buttonVariants({ variant: resolvedVariant, size }),
          isTactile &&
            Platform.OS === 'web' &&
            'transition-transform duration-150 motion-reduce:transition-none',
          className
        )}
        role="button"
        disabled={unavailable}
        accessibilityState={{
          ...accessibilityState,
          disabled: unavailable,
          busy: loading,
        }}
        onPress={loading ? undefined : onPress}
        onHoverIn={(event) => {
          if (!unavailable) setHovered(true);
          onHoverIn?.(event);
        }}
        onHoverOut={(event) => {
          setHovered(false);
          onHoverOut?.(event);
        }}
        style={(state: PressableStateCallbackType) => {
          const userStyle = typeof style === 'function' ? style(state) : style;
          if (isTactile && !unavailable && (state.pressed || hovered)) {
            const baseTransform = StyleSheet.flatten(userStyle)?.transform;
            const translateY = state.pressed ? 3 : -2;
            const scale = state.pressed ? 0.98 : 1.01;
            return [
              userStyle,
              {
                transform:
                  typeof baseTransform === 'string'
                    ? `${baseTransform} translateY(${translateY}px) scale(${scale})`
                    : [...(baseTransform ?? []), { translateY }, { scale }],
              },
            ];
          }
          return userStyle;
        }}
        {...props}>
        {(state: PressableStateCallbackType) => (
          <>
            {typeof children === 'function' ? children(state) : children}
            {loading ? <ButtonSpinner variant={resolvedVariant ?? 'default'} /> : null}
          </>
        )}
      </Pressable>
    </TextClassContext.Provider>
  );
}

export { Button, buttonTextVariants, buttonVariants };
export type { ButtonProps };
