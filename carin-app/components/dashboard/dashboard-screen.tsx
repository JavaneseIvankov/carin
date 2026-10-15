import { HeaderPattern } from '@/components/app/header-pattern';
import { OnlineIndicator } from '@/components/app/online-indicator';
import { ReadState } from '@/components/app/read-state';
import { ServiceError } from '@/components/app/service-error';
import { MissingFieldActions } from '@/components/profile/missing-field-actions';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useAppRead } from '@/lib/api/query';
import { useAppData } from '@/lib/data/provider';
import {
  formatDashboardDate,
  getDailyIntakeSummary,
  getLatestExaminationCards,
  getNextActionTarget,
  getRecurringAttentionCards,
  getRecurringAttentionReason,
} from '@/lib/dashboard/presentation';
import { useDashboard } from '@/lib/dashboard/use-dashboard';
import type { Href } from 'expo-router';
import { useRouter } from 'expo-router';
import { useColorScheme } from 'nativewind';
import {
  CalendarDays,
  Camera,
  ChevronRight,
  ClipboardPlus,
  FlaskConical,
  Sprout,
  Utensils,
} from 'lucide-react-native';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { shouldShowDashboardNextAction, shouldStackDashboardActions } from '@/lib/dashboard/layout';

const MASCOT = require('../../assets/images/carin-mascot.png');

function SectionTitle({ title, detail }: { title: string; detail?: string }) {
  return (
    <View className="gap-1">
      <Text variant="h2">{title}</Text>
      {detail ? (
        <Text variant="caption" className="text-muted-foreground">
          {detail}
        </Text>
      ) : null}
    </View>
  );
}

function RecurringAttentionItem({
  attention,
  onOpenLink,
  isLast,
}: {
  attention: ReturnType<typeof getRecurringAttentionCards>[number];
  onOpenLink: (
    href: ReturnType<typeof getRecurringAttentionCards>[number]['links'][number]['href']
  ) => void;
  isLast: boolean;
}) {
  const firstConsumptionId = attention.links[0]?.id;
  const detailQuery = useAppRead(
    'getConsumption',
    { path: { id: firstConsumptionId ?? '' } },
    { enabled: Boolean(firstConsumptionId) }
  );
  const reason = detailQuery.data
    ? getRecurringAttentionReason(attention, detailQuery.data.data)
    : null;

  return (
    <View className={isLast ? 'gap-2' : 'gap-2 border-b border-foreground/15 pb-3'}>
      <Text variant="h3">{attention.label}</Text>
      {reason ? <Text>{reason}</Text> : null}
      <Text variant="caption" className="text-muted-foreground">
        Muncul di {attention.count} catatan konsumsi
      </Text>
      {attention.links.map((link) => (
        <Pressable
          key={link.id}
          className="min-h-11 flex-row items-center gap-1 self-start"
          accessibilityRole="link"
          accessibilityLabel={`${link.label} dari ${attention.label}`}
          onPress={() => onOpenLink(link.href)}>
          <Text className="font-semibold text-primary">{link.label}</Text>
          <Icon as={ChevronRight} className="text-primary" size={18} />
        </Pressable>
      ))}
    </View>
  );
}

export function DashboardScreen() {
  const router = useRouter();
  const { connectivity } = useAppData();
  const { colorScheme } = useColorScheme();
  const dashboardQuery = useDashboard();
  const dashboard = dashboardQuery.data?.data;
  const intake = dashboard ? getDailyIntakeSummary(dashboard) : null;
  const recurringAttentions = dashboard ? getRecurringAttentionCards(dashboard) : [];
  const examinations = dashboard ? getLatestExaminationCards(dashboard) : [];
  const { width, fontScale } = useWindowDimensions();
  const pageGutter = width < 360 ? 16 : 20;
  const stackFoodActions = shouldStackDashboardActions(width, fontScale);

  const openTarget = (
    target: string | { pathname: string; params?: Record<string, string> } | null
  ) => {
    if (target) router.push(target as Href);
  };

  const nutrient = (key: string) => intake?.nutrients.find((item) => item.key === key);
  const energy = nutrient('energyKcal');

  return (
    <SafeAreaView className="flex-1 bg-carin-olive-soft" edges={['top', 'left', 'right']}>
      <OnlineIndicator connectivity={connectivity} />
      <ScrollView
        className="flex-1 bg-background"
        contentInsetAdjustmentBehavior="never"
        contentContainerClassName="gap-5 pb-8"
        contentContainerStyle={{ paddingHorizontal: pageGutter }}
        showsVerticalScrollIndicator={false}>
        <View
          className="relative gap-3 overflow-hidden rounded-b-[28px] bg-carin-olive-soft pb-6 pt-4"
          style={{ marginHorizontal: -pageGutter, paddingHorizontal: pageGutter }}>
          <HeaderPattern />
          <View className="flex-row items-center gap-1.5">
            <Icon as={Sprout} className="text-primary" size={20} />
            <Text variant="emphasis" className="text-primary">
              carin
            </Text>
          </View>
          <Text variant="label" className="text-muted-foreground">
            {dashboard ? formatDashboardDate(dashboard.date) : 'Hari ini'}
          </Text>
          <View className="min-h-[88px] flex-row items-center gap-2">
            <View className="min-w-0 flex-1 gap-1.5 py-1">
              <Text variant="h1">
                {dashboard?.consumptionCount
                  ? 'Halo! Lihat catatanmu, yuk.'
                  : 'Hai! Kita mulai dari yang sederhana.'}
              </Text>
              <Text className="text-muted-foreground">
                {dashboard?.consumptionCount
                  ? 'Catatanmu tersimpan di sini.'
                  : 'Satu makanan dulu juga boleh.'}
              </Text>
            </View>
            {!stackFoodActions ? (
              <View className="relative h-[96px] w-[96px] shrink-0 items-center justify-center">
                <Svg viewBox="0 0 100 100" className="h-[92px] w-[92px]">
                  <Path
                    d="M46,14 C64,12 82,22 87,38 C92,54 86,72 75,84 C64,95 44,95 28,88 C12,81 6,62 10,44 C14,28 26,16 46,14 Z"
                    fill={colorScheme === 'dark' ? '#5A5031' : '#F5E7A8'}
                  />
                </Svg>
                <Image
                  source={MASCOT}
                  resizeMode="contain"
                  accessibilityLabel="Maskot Carin menyapa dan mengajak mulai mencatat"
                  className="absolute"
                  style={{ width: 102, height: 102, top: -5 }}
                />
              </View>
            ) : null}
          </View>
        </View>

        {dashboardQuery.data ? (
          <ReadState
            updatedAt={dashboardQuery.data.updatedAt}
            stale={dashboardQuery.data.stale}
            connectivity={connectivity}
            variant="caption"
          />
        ) : null}

        <View className={stackFoodActions ? 'gap-3' : 'flex-row gap-3'}>
          <Button
            tactile
            className={
              stackFoodActions
                ? 'h-auto min-h-16 w-full justify-start rounded-[20px] px-4 py-3'
                : 'h-auto min-h-28 flex-1 flex-col items-start justify-center rounded-[20px] px-4 py-3'
            }
            accessibilityLabel="Catat makanan yang sudah dikonsumsi"
            onPress={() => router.push('/consumptions/new' as Href)}>
            <Icon as={ClipboardPlus} size={22} />
            <View className={stackFoodActions ? 'flex-1 gap-0.5' : 'w-full gap-0.5'}>
              <Text className="text-base font-bold">Catat makanan</Text>
              <Text className="text-[13px] font-normal leading-4 text-primary-foreground/90">
                Sudah dikonsumsi
              </Text>
            </View>
            {stackFoodActions ? <Icon as={ChevronRight} size={20} /> : null}
          </Button>

          <Button
            tactile
            variant="secondary"
            className={
              stackFoodActions
                ? 'h-auto min-h-16 w-full justify-start rounded-[20px] px-4 py-3'
                : 'h-auto min-h-28 flex-1 flex-col items-start justify-center rounded-[20px] px-4 py-3'
            }
            accessibilityLabel="Analisis foto makanan sebelum makan"
            onPress={() => router.push('/food/capture' as Href)}>
            <Icon as={Camera} className="text-secondary-foreground" size={22} />
            <View className={stackFoodActions ? 'flex-1 gap-0.5' : 'w-full gap-0.5'}>
              <Text className="text-base font-bold">Analisis foto</Text>
              <Text className="text-[13px] font-normal leading-4 text-secondary-foreground/90">
                Sebelum makan
              </Text>
            </View>
            {stackFoodActions ? (
              <Icon as={ChevronRight} className="text-secondary-foreground" size={20} />
            ) : null}
          </Button>
        </View>

        {dashboardQuery.isPending && !dashboard ? (
          <View className="flex-row items-center gap-3 rounded-summary bg-card p-4">
            <ActivityIndicator accessibilityLabel="Memuat ringkasan hari ini" />
            <Text variant="muted">Memuat catatanmu…</Text>
          </View>
        ) : null}
        {dashboardQuery.error && !dashboard ? (
          <ServiceError
            error={dashboardQuery.error}
            onRetry={() => void dashboardQuery.refetch()}
          />
        ) : null}

        {dashboard && intake ? (
          <View className="gap-4 rounded-summary bg-card p-4">
            <SectionTitle
              title="Asupan hari ini"
              detail={`${intake.consumptionCount} catatan · ${intake.componentCount} komponen`}
            />
            {intake.kind === 'empty' ? (
              <View className="items-center gap-3 py-2">
                <View className="h-16 w-16 items-center justify-center rounded-full bg-carin-butter">
                  <Icon as={Utensils} className="text-primary" size={24} />
                </View>
                <Text variant="h3" className="text-center">
                  Belum ada catatan konsumsi hari ini.
                </Text>
                <Text className="text-center text-muted-foreground">
                  Catat yang sudah dimakan. Hasil foto masuk ke asupan setelah kamu mengonfirmasi
                  konsumsi.
                </Text>
              </View>
            ) : (
              <View>
                {energy ? (
                  <View className="gap-1 pb-3">
                    <Text variant="label" className="text-muted-foreground">
                      Energi tercatat
                    </Text>
                    <Text variant="metric">{energy.value}</Text>
                    <Text variant="caption" className="text-muted-foreground">
                      Cakupan {energy.coverage}
                    </Text>
                  </View>
                ) : null}

                {intake.nutrients
                  .filter(({ key }) => key !== 'energyKcal')
                  .map((item) => (
                    <View
                      key={item.key}
                      className="min-h-12 flex-row items-center justify-between gap-3 border-t border-border py-2">
                      <View className="flex-1 gap-0.5">
                        <Text variant="label">{item.label}</Text>
                        <Text variant="caption" className="text-muted-foreground">
                          Cakupan {item.coverage}
                        </Text>
                      </View>
                      <Text className="shrink text-right font-semibold">{item.value}</Text>
                    </View>
                  ))}
                <Text variant="caption" className="mt-3 text-muted-foreground">
                  Ringkasan ini berasal dari makanan yang sudah dicatat, tanpa target harian.
                </Text>
              </View>
            )}
          </View>
        ) : null}

        {dashboard ? (
          <View className="gap-4 rounded-summary bg-card p-4">
            <SectionTitle
              title="Perhatian 7 hari"
              detail={`${formatDashboardDate(dashboard.attentionWindow.startDate)} – ${formatDashboardDate(dashboard.attentionWindow.endDate)}`}
            />
            {recurringAttentions.length ? (
              <View className="gap-3">
                {recurringAttentions.map((attention, index) => (
                  <RecurringAttentionItem
                    key={attention.id}
                    attention={attention}
                    isLast={index === recurringAttentions.length - 1}
                    onOpenLink={(href) => router.push(href as Href)}
                  />
                ))}
              </View>
            ) : (
              <View className="items-center gap-3 py-2">
                <View className="h-16 w-16 items-center justify-center rounded-full bg-carin-butter">
                  <Icon as={CalendarDays} className="text-primary" size={24} />
                </View>
                <Text variant="h3" className="text-center text-sm font-semibold leading-5">
                  Belum ada pola yang tercatat
                </Text>
                <Text className="text-center text-muted-foreground">
                  Catatan berulang dalam periode ini akan muncul di sini.
                </Text>
              </View>
            )}
          </View>
        ) : null}

        {dashboard ? (
          <View className="gap-4 rounded-summary bg-card p-4">
            <SectionTitle title="Pemeriksaan terakhir" />
            {examinations.length ? (
              <View>
                {examinations.map((examination, index) => (
                  <Pressable
                    key={examination.id}
                    className={`min-h-14 flex-row items-center gap-3 py-2 ${index === examinations.length - 1 ? '' : 'border-b border-border'}`}
                    accessibilityRole="link"
                    accessibilityLabel={`${examination.title}, ${examination.value}, diukur ${examination.measuredAt}`}
                    onPress={() => router.push(examination.href as Href)}>
                    <Icon as={FlaskConical} className="text-primary" size={20} />
                    <View className="flex-1 gap-0.5">
                      <Text variant="h3">{examination.title}</Text>
                      <Text variant="caption" className="text-muted-foreground">
                        Diukur {examination.measuredAt}
                      </Text>
                    </View>
                    <Text variant="label" className="shrink text-right">
                      {examination.value}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <View className="items-center gap-3 py-2">
                <View className="h-16 w-16 items-center justify-center rounded-full bg-carin-butter">
                  <Icon as={FlaskConical} className="text-primary" size={24} />
                </View>
                <Text variant="h3" className="text-center text-sm font-semibold leading-5">
                  Belum ada pemeriksaan tersimpan
                </Text>
                <Text className="text-center text-muted-foreground">
                  Hasil yang kamu catat akan tampil di bagian ini.
                </Text>
              </View>
            )}
          </View>
        ) : null}

        {dashboard ? (
          <View className="gap-3">
            <SectionTitle title="Langkah berikutnya" />
            {dashboard.profileMissingFields.length ? (
              <MissingFieldActions
                fields={dashboard.profileMissingFields}
                tone="tonal"
                heading="Profil kesehatan bersifat opsional"
                description="Tambahkan informasi jika ingin melihat pertimbangan yang lebih sesuai dengan profilmu."
                onOpen={(focus) =>
                  router.push({
                    pathname: '/(onboarding)/health-profile',
                    params: { focus },
                  } as Href)
                }
              />
            ) : null}
            {dashboard.nextActions
              .filter((action) => shouldShowDashboardNextAction(action.code))
              .map((action) => {
                const target = getNextActionTarget(action, dashboard.profileMissingFields);
                if (!target) return null;
                return (
                  <Pressable
                    key={action.code}
                    className="min-h-12 flex-row items-center justify-between border-b border-border"
                    accessibilityRole="button"
                    onPress={() => openTarget(target)}>
                    <Text className="font-semibold">{action.label}</Text>
                    <Icon as={ChevronRight} className="text-primary" size={18} />
                  </Pressable>
                );
              })}
            {!dashboard.profileMissingFields.length && !dashboard.nextActions.length ? (
              <Text className="text-muted-foreground">
                Belum ada langkah tambahan yang disarankan.
              </Text>
            ) : null}
          </View>
        ) : null}

        {dashboard && dashboardQuery.error ? (
          <ServiceError
            error={dashboardQuery.error}
            onRetry={() => void dashboardQuery.refetch()}
          />
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
