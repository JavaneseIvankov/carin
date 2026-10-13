import { ActionSheet } from '@/components/app/action-sheet';
import { Text } from '@/components/ui/text';
import { Tabs, useRouter } from 'expo-router';
import { ClipboardList, House, Plus, Stethoscope, UserRound } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { nextSheetOpen, type ShellAction } from '@/lib/navigation';
import { THEME } from '@/lib/theme';
import { useColorScheme } from 'nativewind';

const items = [
  { name: 'index', label: 'Beranda', icon: House },
  { name: 'history', label: 'Riwayat', icon: ClipboardList },
  { name: 'exams', label: 'Pemeriksaan', icon: Stethoscope },
  { name: 'profile', label: 'Profil', icon: UserRound },
] as const;

type BarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>>[0];

function AppTabBar({ state, navigation }: BarProps) {
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const sheetAction = (action: ShellAction) => setSheetOpen((open) => nextSheetOpen(open, action));
  const router = useRouter();
  const { bottom } = useSafeAreaInsets();
  const { colorScheme } = useColorScheme();
  const colors = THEME[colorScheme ?? 'light'];
  const navigateAction = (href: '/food/capture' | '/consumptions/new') => {
    sheetAction('close-sheet');
    router.push(href);
  };

  return (
    <>
      <View
        className="flex-row items-center border-t border-border bg-background px-2 pt-2"
        style={{ paddingBottom: Math.max(bottom, 8) }}>
        {items.map((item, index) => {
          const selected = state.routes[state.index]?.name === item.name;
          const Icon = item.icon;
          return (
            <React.Fragment key={item.name}>
              {index === 2 && (
                <Pressable
                  className="mx-1 min-h-14 min-w-14 items-center justify-center rounded-full bg-primary"
                  accessibilityRole="button"
                  accessibilityLabel="Tambah makanan"
                  accessibilityState={{ expanded: sheetOpen }}
                  onPress={() => sheetAction('open-sheet')}>
                  <Plus color={colors.primaryForeground} size={26} />
                </Pressable>
              )}
              <Pressable
                className="min-h-14 flex-1 items-center justify-center gap-1"
                accessibilityRole="tab"
                accessibilityLabel={item.label}
                accessibilityState={{ selected }}
                onPress={() => {
                  sheetAction('select-tab');
                  navigation.navigate(item.name);
                }}>
                <Icon size={21} color={selected ? colors.primary : colors.mutedForeground} />
                <Text
                  className={
                    selected
                      ? 'text-xs font-semibold text-primary'
                      : 'text-xs text-muted-foreground'
                  }>
                  {item.label}
                </Text>
              </Pressable>
            </React.Fragment>
          );
        })}
      </View>
      <ActionSheet
        visible={sheetOpen}
        onClose={() => sheetAction('back')}
        onPhoto={() => navigateAction('/food/capture')}
        onManual={() => navigateAction('/consumptions/new')}
      />
    </>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      backBehavior="history"
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <AppTabBar {...props} />}>
      <Tabs.Screen name="index" options={{ title: 'Beranda' }} />
      <Tabs.Screen name="history" options={{ title: 'Riwayat' }} />
      <Tabs.Screen name="exams" options={{ title: 'Pemeriksaan' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profil' }} />
    </Tabs>
  );
}
