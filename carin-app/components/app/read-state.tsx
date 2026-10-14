import { Text } from '@/components/ui/text';
import { staleReadLabel, type Connectivity } from '@/lib/data/network';

export function ReadState({
  updatedAt,
  stale,
  connectivity,
  variant = 'muted',
}: {
  updatedAt: number;
  stale: boolean;
  connectivity: Connectivity;
  variant?: 'muted' | 'caption';
}) {
  return (
    <Text variant={variant} className="text-muted-foreground" accessibilityRole="text">
      {stale
        ? staleReadLabel(updatedAt, connectivity)
        : `Data terakhir diperbarui ${new Date(updatedAt).toLocaleString('id-ID')}`}
    </Text>
  );
}
