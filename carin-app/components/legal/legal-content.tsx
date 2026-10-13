import { Text } from '@/components/ui/text';
import type { LegalDocument } from '@/lib/auth/legal';
import {
  parseLegalMarkdown,
  type LegalBlock,
  type LegalInline,
} from '@/lib/auth/legal-presentation';
import { Linking, View } from 'react-native';

function InlineContent({ tokens }: { tokens: LegalInline[] }) {
  return (
    <Text className="leading-6">
      {tokens.map((inline, index) => {
        if (inline.type === 'link') {
          return (
            <Text
              key={`${inline.text}-${index}`}
              className="text-primary underline"
              accessibilityRole="link"
              onPress={() => void Linking.openURL(inline.href).catch(() => undefined)}>
              {inline.text}
            </Text>
          );
        }
        if (inline.type === 'strong') {
          return (
            <Text key={`${inline.text}-${index}`} className="font-bold">
              {inline.text}
            </Text>
          );
        }
        if (inline.type === 'emphasis') {
          return (
            <Text key={`${inline.text}-${index}`} className="italic">
              {inline.text}
            </Text>
          );
        }
        return <Text key={`${inline.text}-${index}`}>{inline.text}</Text>;
      })}
    </Text>
  );
}

function LegalBlockView({ block, index }: { block: LegalBlock; index: number }) {
  if (block.type === 'heading') {
    const variant = block.level === 1 ? 'h3' : 'h4';
    return (
      <Text key={`heading-${index}`} variant={variant} className="mt-4">
        <InlineContent tokens={block.children} />
      </Text>
    );
  }
  if (block.type === 'quote') {
    return (
      <View
        key={`quote-${index}`}
        className="border-l-4 border-destructive bg-destructive/10 px-3 py-3">
        <InlineContent tokens={block.children} />
      </View>
    );
  }
  if (block.type === 'list') {
    return (
      <View key={`list-${index}`} className="gap-2">
        {block.items.map((item, itemIndex) => (
          <View key={`item-${itemIndex}`} className="flex-row gap-2">
            <Text className="w-6 text-right text-muted-foreground">
              {block.ordered ? `${itemIndex + 1}.` : '•'}
            </Text>
            <View className="flex-1">
              <InlineContent tokens={item} />
            </View>
          </View>
        ))}
      </View>
    );
  }
  return <InlineContent key={`paragraph-${index}`} tokens={block.children} />;
}

export function LegalContent({ document }: { document: LegalDocument }) {
  return (
    <>
      {parseLegalMarkdown(document.contentMarkdown).map((block, index) => (
        <LegalBlockView key={`${block.type}-${index}`} block={block} index={index} />
      ))}
    </>
  );
}
