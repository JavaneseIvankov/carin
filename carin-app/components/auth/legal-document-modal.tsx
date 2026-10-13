import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import {
  parseLegalMarkdown,
  type LegalBlock,
  type LegalInline,
} from '@/lib/auth/legal-presentation';
import type { LegalDocument } from '@/lib/auth/legal';
import { Linking, Modal, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

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

export function LegalDocumentModal({
  document,
  onClose,
}: {
  document: LegalDocument | null;
  onClose: () => void;
}) {
  const blocks = document ? parseLegalMarkdown(document.contentMarkdown) : [];

  return (
    <Modal visible={document !== null} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-background" accessibilityViewIsModal>
        <View className="flex-row items-start justify-between gap-4 border-b border-border px-5 py-4">
          <View className="flex-1 gap-1">
            <Text variant="h4">{document?.title ?? 'Dokumen'}</Text>
            {document ? <Text variant="muted">Versi {document.version}</Text> : null}
          </View>
          <Button variant="outline" size="sm" onPress={onClose} accessibilityLabel="Tutup dokumen">
            <Text>Tutup</Text>
          </Button>
        </View>
        {document ? (
          <ScrollView
            accessibilityLabel={`${document.title}, versi ${document.version}`}
            className="flex-1"
            contentContainerClassName="gap-4 px-5 py-5">
            {blocks.map((block, index) => (
              <LegalBlockView key={`${block.type}-${index}`} block={block} index={index} />
            ))}
          </ScrollView>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}
