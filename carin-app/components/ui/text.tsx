import { cn } from '@/lib/utils';
import { Slot } from '@rn-primitives/slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { Platform, Text as RNText, type Role } from 'react-native';

const textVariants = cva(
  cn(
    'text-sm leading-5 text-foreground',
    Platform.select({
      web: 'select-text',
    })
  ),
  {
    variants: {
      variant: {
        default: '',
        h1: cn(
          'text-[24px] font-bold leading-[30px] tracking-tight',
          Platform.select({ web: 'text-balance' })
        ),
        h2: cn('text-lg font-bold leading-6', Platform.select({ web: 'text-balance' })),
        h3: 'text-base font-semibold leading-[22px]',
        h4: 'text-sm font-semibold leading-5',
        p: 'mt-3 text-sm leading-5',
        blockquote: cn(
          'mt-4 border-l-2 border-border pl-3 italic',
          Platform.select({ web: 'sm:pl-6' })
        ),
        code: 'relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold',
        lead: 'text-base font-medium leading-[22px]',
        large: 'text-base font-semibold leading-[22px]',
        small: 'text-xs font-semibold leading-4',
        muted: 'text-sm leading-5 text-muted-foreground',
        metric: 'text-[26px] font-extrabold leading-8 tracking-tight',
        emphasis: 'text-base font-semibold leading-[22px]',
        label: 'text-xs font-semibold leading-4',
        caption: 'text-xs leading-4',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

type TextVariantProps = VariantProps<typeof textVariants>;

type TextVariant = NonNullable<TextVariantProps['variant']>;

const ROLE: Partial<Record<TextVariant, Role>> = {
  h1: 'heading',
  h2: 'heading',
  h3: 'heading',
  h4: 'heading',
  blockquote: Platform.select({ web: 'blockquote' as Role }),
  code: Platform.select({ web: 'code' as Role }),
};

const ARIA_LEVEL: Partial<Record<TextVariant, string>> = {
  h1: '1',
  h2: '2',
  h3: '3',
  h4: '4',
};

const TextClassContext = React.createContext<string | undefined>(undefined);

function Text({
  className,
  asChild = false,
  variant = 'default',
  ...props
}: React.ComponentProps<typeof RNText> &
  React.RefAttributes<typeof RNText> &
  TextVariantProps & {
    asChild?: boolean;
  }) {
  const textClass = React.useContext(TextClassContext);
  const Component = asChild ? Slot : RNText;
  return (
    <Component
      className={cn(textVariants({ variant }), textClass, className)}
      role={variant ? ROLE[variant] : undefined}
      aria-level={variant ? ARIA_LEVEL[variant] : undefined}
      {...props}
    />
  );
}

export { Text, TextClassContext };
