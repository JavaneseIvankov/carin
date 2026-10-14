import { OnlineIndicator } from '@/components/app/online-indicator';
import { ReadState } from '@/components/app/read-state';
import { ServiceError } from '@/components/app/service-error';
import { MissingFieldActions } from '@/components/profile/missing-field-actions';
import { Button } from '@/components/ui/button';
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
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';

function RecurringAttentionCard({
  attention,
  onOpenLink,
}: {
  attention: ReturnType<typeof getRecurringAttentionCards>[number];
  onOpenLink: (
    href: ReturnType<typeof getRecurringAttentionCards>[number]['links'][number]['href']
  ) => void;
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
    <View className="gap-2 rounded-lg border border-border p-3">
      <Text variant="large">{attention.label}</Text>
      {reason ? <Text variant="muted">{reason}</Text> : null}
      <Text>Tercatat pada {attention.count} catatan konsumsi</Text>
      {attention.links.map((link) => (
        <Pressable
          key={link.id}
          className="min-h-11 justify-center"
          accessibilityRole="link"
          accessibilityLabel={`${link.label} dari ${attention.label}`}
          onPress={() => onOpenLink(link.href)}>
          <Text className="font-medium text-primary">{link.label} →</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function DashboardScreen() {
  const router = useRouter();
  const { connectivity } = useAppData();
  const dashboardQuery = useDashboard();
  const dashboard = dashboardQuery.data?.data;
  const intake = dashboard ? getDailyIntakeSummary(dashboard) : null;
  const recurringAttentions = dashboard ? getRecurringAttentionCards(dashboard) : [];
  const examinations = dashboard ? getLatestExaminationCards(dashboard) : [];

  const openTarget = (
    target: string | { pathname: string; params?: Record<string, string> } | null
  ) => {
    if (target) router.push(target as Href);
  };

  return (
    <View className="flex-1 bg-background">
      <OnlineIndicator connectivity={connectivity} />
      <ScrollView contentContainerClassName="gap-5 px-5 pb-10 pt-7">
        <View className="gap-1">
          <Text variant="h2">Beranda</Text>
          {dashboard ? (
            <Text variant="muted">
              {formatDashboardDate(dashboard.date)} · {dashboard.timezone}
            </Text>
          ) : (
            <Text variant="muted">Ringkasan catatan kesehatan Anda.</Text>
          )}
          {dashboardQuery.data ? (
            <ReadState
              updatedAt={dashboardQuery.data.updatedAt}
              stale={dashboardQuery.data.stale}
              connectivity={connectivity}
            />
          ) : null}
        </View>

        <View className="flex-row gap-3">
          <Button
            className="min-h-12 flex-1"
            onPress={() => router.push('/food/capture' as Href)}
            accessibilityLabel="Analisis foto makanan">
            <Text>Analisis foto</Text>
          </Button>
          <Button
            variant="outline"
            className="min-h-12 flex-1"
            onPress={() => router.push('/consumptions/new' as Href)}
            accessibilityLabel="Catat makanan yang sudah dikonsumsi">
            <Text>Catat manual</Text>
          </Button>
        </View>

        {dashboardQuery.isPending && !dashboard ? (
          <View className="flex-row items-center gap-3 rounded-xl border border-border p-4">
            <ActivityIndicator accessibilityLabel="Memuat ringkasan hari ini" />
            <Text variant="muted">Memuat ringkasan hari ini…</Text>
          </View>
        ) : null}
        {dashboardQuery.error && !dashboard ? (
          <ServiceError
            error={dashboardQuery.error}
            onRetry={() => void dashboardQuery.refetch()}
          />
        ) : null}

        {dashboard && intake ? (
          <View className="gap-3 rounded-xl border border-border bg-card p-4">
            <View className="gap-1">
              <Text variant="h3">Asupan hari ini</Text>
              <Text variant="muted">Dihitung dari catatan konsumsi, bukan hasil scan.</Text>
            </View>
            {intake.kind === 'empty' ? (
              <View className="gap-2 rounded-lg border border-dashed border-border p-4">
                <Text variant="large">Belum ada konsumsi tercatat hari ini</Text>
                <Text variant="muted">
                  Hasil analisis foto baru masuk ke asupan setelah Anda mengonfirmasi konsumsi.
                </Text>
              </View>
            ) : (
              <>
                <View className="flex-row justify-between gap-3">
                  <Text variant="muted">Catatan makan</Text>
                  <Text>{intake.consumptionCount}</Text>
                </View>
                <View className="flex-row justify-between gap-3">
                  <Text variant="muted">Komponen makanan</Text>
                  <Text>{intake.componentCount}</Text>
                </View>
                <View className="gap-2 border-t border-border pt-3">
                  {intake.nutrients.map((nutrient) => (
                    <View key={nutrient.key} className="flex-row items-start justify-between gap-3">
                      <View className="flex-1 gap-0.5">
                        <Text>{nutrient.label}</Text>
                        <Text variant="muted">Cakupan: {nutrient.coverage}</Text>
                      </View>
                      <Text className="text-right">{nutrient.value}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}
          </View>
        ) : null}

        {dashboard ? (
          <View className="gap-3 rounded-xl border border-border bg-card p-4">
            <View className="gap-1">
              <Text variant="h3">Perhatian berulang</Text>
              <Text variant="muted">
                Periode {formatDashboardDate(dashboard.attentionWindow.startDate)} –{' '}
                {formatDashboardDate(dashboard.attentionWindow.endDate)}
              </Text>
            </View>
            {recurringAttentions.length ? (
              recurringAttentions.map((attention) => (
                <RecurringAttentionCard
                  key={attention.id}
                  attention={attention}
                  onOpenLink={(href) => router.push(href as Href)}
                />
              ))
            ) : (
              <Text variant="muted">
                Belum ada catatan perhatian berulang yang tersedia untuk periode ini.
              </Text>
            )}
          </View>
        ) : null}

        {dashboard ? (
          <View className="gap-3 rounded-xl border border-border bg-card p-4">
            <Text variant="h3">Pemeriksaan terakhir</Text>
            {examinations.length ? (
              examinations.map((examination) => (
                <Pressable
                  key={examination.id}
                  className="min-h-16 gap-1 rounded-lg border border-border p-3"
                  accessibilityRole="link"
                  accessibilityLabel={`${examination.title}, ${examination.value}, diukur ${examination.measuredAt}`}
                  onPress={() => router.push(examination.href as Href)}>
                  <View className="flex-row items-start justify-between gap-3">
                    <Text className="flex-1 font-medium">{examination.title}</Text>
                    <Text>{examination.value}</Text>
                  </View>
                  <Text variant="muted">Diukur {examination.measuredAt}</Text>
                </Pressable>
              ))
            ) : (
              <Text variant="muted">Belum ada pemeriksaan tersimpan.</Text>
            )}
          </View>
        ) : null}

        {dashboard ? (
          <View className="gap-3 rounded-xl border border-border bg-card p-4">
            <Text variant="h3">Langkah berikutnya</Text>
            {dashboard.profileMissingFields.length ? (
              <MissingFieldActions
                fields={dashboard.profileMissingFields}
                onOpen={(focus) =>
                  router.push({
                    pathname: '/(onboarding)/health-profile',
                    params: { focus },
                  } as Href)
                }
              />
            ) : null}
            {dashboard.nextActions
              .filter((action) => action.code !== 'complete_profile')
              .map((action) => {
                const target = getNextActionTarget(action, dashboard.profileMissingFields);
                if (!target) return null;
                return (
                  <Button
                    key={action.code}
                    variant="outline"
                    className="min-h-12"
                    onPress={() => openTarget(target)}>
                    <Text>{action.label}</Text>
                  </Button>
                );
              })}
            {!dashboard.profileMissingFields.length && !dashboard.nextActions.length ? (
              <Text variant="muted">Belum ada langkah tambahan yang disarankan.</Text>
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
    </View>
  );
}
