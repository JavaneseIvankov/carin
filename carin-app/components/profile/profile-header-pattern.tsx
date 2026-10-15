import { Icon } from '@/components/ui/icon';
import {
  Apple,
  Carrot,
  HeartPulse,
  Leaf,
  NotebookPen,
  Sprout,
  Utensils,
} from 'lucide-react-native';
import { View } from 'react-native';

const motifs = [Leaf, Apple, NotebookPen, HeartPulse, Carrot, Sprout, Utensils];

export function ProfileHeaderPattern() {
  return (
    <View
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="absolute -left-5 -right-5 -top-4 opacity-[0.08]">
      {[0, 1, 2, 3, 4].map((row) => (
        <View key={row} className="h-16 flex-row items-center justify-around">
          {motifs.map((_, column) => (
            <View
              key={column}
              style={{
                transform: [{ rotate: `${(row + column) % 2 ? 18 : -18}deg` }],
                marginTop: column % 2 ? 16 : -8,
              }}>
              <Icon
                as={motifs[(column + row * 2) % motifs.length]}
                size={column % 3 === 0 ? 36 : 28}
                strokeWidth={1.3}
                className="text-primary"
              />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}
