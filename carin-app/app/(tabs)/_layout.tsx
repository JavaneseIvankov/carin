import { ActionSheet } from '@/components/app/action-sheet';
import { Icon } from '@/components/ui/icon';
import { Tabs, useRouter } from 'expo-router';
import { ClipboardList, House, Plus, Stethoscope, UserRound } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { nextSheetOpen, type ShellAction } from '@/lib/navigation';
import { useAuth } from '@/lib/auth/provider';
import { useOnboardingSession } from '@/components/onboarding/onboarding-session';
import { useAppRead } from '@/lib/api/query';
import { onboardingGateStateFromQuery } from '@/lib/onboarding/routes';
import { getRootRouteAccess } from '@/lib/auth/root-route-access';

const items = [
  { name: 'index', label: 'Beranda', icon: House },
  { name: 'history', label: 'Riwayat', icon: ClipboardList },
  { name: 'exams', label: 'Pemeriksaan', icon: Stethoscope },
  { name: 'profile', label: 'Profil', icon: UserRound },
] as const;

type BarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>>[0];

function AppTabBar({ state, navigation, canAccessFullApp }: BarProps & { canAccessFullApp: boolean }) {
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const sheetAction = (action: ShellAction) => setSheetOpen((open) => nextSheetOpen(open, action));
  const router = useRouter();
  const { bottom } = useSafeAreaInsets();
  const visibleItems = canAccessFullApp ? items : items.slice(0, 1);
  const navigateAction = (href: '/food/capture' | '/consumptions/new') => {
    sheetAction('close-sheet');
    router.push(href);
  };

  return (
    <>
      <View
        className="flex-row items-center border-t border-border bg-card px-2 pt-1"
        style={{
          paddingBottom: Math.max(bottom, 8),
          overflow: 'visible',
        }}>
        {visibleItems.map((item, index) => {
          const selected = state.routes[state.index]?.name === item.name;
          return (
            <React.Fragment key={item.name}>
              {index === 2 && (
                <Pressable
                  className="-mt-6 mx-1.5 h-14 w-14 items-center justify-center rounded-[20px] bg-primary border-b-4 border-[#33451f] shadow-md z-10 active:translate-y-0.5 active:opacity-95"
                  accessibilityRole="button"
                  accessibilityLabel="Tambah makanan"
                  accessibilityState={{ expanded: sheetOpen }}
                  onPress={() => sheetAction('open-sheet')}
                  style={{
                    transform: [{ rotate: '-8deg' }],
                  }}>
                  <Icon
                    as={Plus}
                    className="text-primary-foreground"
                    size={28}
                    strokeWidth={2.75}
                    style={{ transform: [{ rotate: '8deg' }] }}
                  />
                </Pressable>
              )}
              <Pressable
                className="min-h-12 flex-1 items-center justify-center py-1"
                accessibilityRole="tab"
                accessibilityLabel={item.label}
                accessibilityState={{ selected }}
                onPress={() => {
                  sheetAction('select-tab');
                  navigation.navigate(item.name);
                }}>
                <View
                  className={`min-h-9 min-w-12 items-center justify-center rounded-compact ${
                    selected ? 'bg-carin-olive-soft' : ''
                  }`}>
                  <Icon
                    as={item.icon}
                    size={22}
                    className={selected ? 'text-primary' : 'text-muted-foreground'}
                  />
                </View>
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
  const { status, user } = useAuth();
  const { isBypassed } = useOnboardingSession();
  const onboardingQuery = useAppRead('getOnboarding', {}, { enabled: status === 'authenticated' });
  const access = getRootRouteAccess(
    status,
    onboardingGateStateFromQuery(onboardingQuery),
    Boolean(user?.id && isBypassed(user.id))
  );

  return (
    <Tabs
      backBehavior="history"
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <AppTabBar {...props} canAccessFullApp={access.authenticated} />}>
      <Tabs.Protected guard={access.dashboard}>
        <Tabs.Screen name="index" options={{ title: 'Beranda' }} />
      </Tabs.Protected>
      <Tabs.Protected guard={access.authenticated}>
        <Tabs.Screen name="history" options={{ title: 'Riwayat' }} />
        <Tabs.Screen name="exams" options={{ title: 'Pemeriksaan' }} />
        <Tabs.Screen name="profile" options={{ title: 'Profil' }} />
      </Tabs.Protected>
    </Tabs>
  );
}
