import { Text } from '@/components/ui/text';
import type { components } from '@/lib/api/generated/app-api';
import {
  formatProjectedMeasurements,
  projectSeries,
  seriesAccessibleSummary,
} from '@/lib/exams/model';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';
import { View } from 'react-native';

type ExamSeries = components['schemas']['ExamSeries'];
const WIDTH = 340;
const HEIGHT = 180;
const LEFT = 24;
const RIGHT = 316;
const TOP = 16;
const BOTTOM = 146;
const metricColors = {
  value: '#16765f',
  systolic: '#16765f',
  diastolic: '#4f78a8',
};

function xPosition(index: number, count: number) {
  return count <= 1 ? (LEFT + RIGHT) / 2 : LEFT + (index / (count - 1)) * (RIGHT - LEFT);
}

export function ExaminationSeriesChart({ series }: { series: ExamSeries }) {
  const projected = projectSeries([series])[0];
  if (!projected) return null;
  const measurements = projected.points.flatMap((point) => point.measurements);
  const values = measurements.map(({ value }) => value);
  const low = Math.min(...values, 0);
  const high = Math.max(...values, 1);
  const span = high - low || 1;
  const getY = (value: number) => BOTTOM - ((value - low) / span) * (BOTTOM - TOP);
  const metricKeys = [...new Set(measurements.map(({ key }) => key))];
  const accessibilitySummary = seriesAccessibleSummary(projected);

  return (
    <View className="gap-3 rounded-xl border border-border bg-card p-4">
      <View className="gap-1">
        <Text variant="large">{projected.label}</Text>
        <Text variant="muted">
          {projected.summary} · {series.unit}
        </Text>
      </View>
      {projected.points.length > 0 ? (
        <View accessibilityRole="summary" accessibilityLabel={accessibilitySummary}>
          <Svg
            width="100%"
            height={HEIGHT}
            viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
            accessible={false}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants">
            <Line x1={LEFT} y1={BOTTOM} x2={RIGHT} y2={BOTTOM} stroke="#9ca3af" strokeWidth="1" />
            {projected.points.length > 1 &&
              metricKeys.map((metricKey) => {
                return projected.lineSegments.map((segment, segmentIndex) => {
                  const line = segment.flatMap((point) => {
                    const measurement = point.measurements.find(({ key }) => key === metricKey);
                    return measurement
                      ? [
                          `${xPosition(point.dateIndex, projected.dateCount)},${getY(measurement.value)}`,
                        ]
                      : [];
                  });
                  return line.length > 1 ? (
                    <Polyline
                      key={`${metricKey}-${segmentIndex}`}
                      points={line.join(' ')}
                      fill="none"
                      stroke={metricColors[metricKey]}
                      strokeWidth="3"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  ) : null;
                });
              })}
            {projected.points.flatMap((point) =>
              point.measurements.map((measurement) => (
                <Circle
                  key={`${point.id}-${measurement.key}`}
                  cx={xPosition(point.dateIndex, projected.dateCount)}
                  cy={getY(measurement.value)}
                  r="4"
                  fill={metricColors[measurement.key]}
                />
              ))
            )}
          </Svg>
          {projected.points.length === 1 && (
            <View className="min-h-24 items-center justify-center rounded-lg bg-muted px-4">
              <Text className="font-medium">Satu pengukuran tercatat</Text>
              <Text variant="muted">Belum ada cukup data untuk membandingkan waktu.</Text>
            </View>
          )}
          <View className="flex-row flex-wrap gap-4">
            {metricKeys.map((key) => {
              const label = measurements.find(({ key: itemKey }) => key === itemKey)?.label ?? '';
              return (
                <View key={key} className="flex-row items-center gap-2">
                  <View
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: metricColors[key] }}
                  />
                  <Text variant="muted">{label}</Text>
                </View>
              );
            })}
          </View>
          <View className="gap-2 pt-2">
            {projected.points.map((point) => (
              <View
                key={point.id}
                className="flex-row flex-wrap items-center justify-between gap-1 border-t border-border pt-2">
                <Text variant="muted">{point.measuredAt}</Text>
                <Text>{formatProjectedMeasurements(point.measurements, series.unit)}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : (
        <Text variant="muted">Belum ada pengukuran pada seri ini.</Text>
      )}
    </View>
  );
}
