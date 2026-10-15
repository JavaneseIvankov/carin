import { Text } from '@/components/ui/text';
import type { components } from '@/lib/api/generated/app-api';
import {
  formatProjectedMeasurements,
  projectSeries,
  seriesAccessibleSummary,
} from '@/lib/exams/model';
import { cn } from '@/lib/utils';
import * as React from 'react';
import { View } from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';

type ExamSeries = components['schemas']['ExamSeries'];
const WIDTH = 340;
const HEIGHT = 180;
const LEFT = 32;
const RIGHT = 320;
const TOP = 20;
const BOTTOM = 148;

const metricColors: Record<string, string> = {
  value: 'hsl(var(--primary))',
  systolic: 'hsl(var(--primary))',
  diastolic: '#4b6f96',
};

const metricBgClasses: Record<string, string> = {
  value: 'bg-primary',
  systolic: 'bg-primary',
  diastolic: 'bg-[#4b6f96]',
};

function xPosition(index: number, count: number) {
  return count <= 1 ? (LEFT + RIGHT) / 2 : LEFT + (index / (count - 1)) * (RIGHT - LEFT);
}

export function computeYAxisTicks(values: number[]): number[] {
  if (values.length === 0) return [0, 50, 100];
  const dataMin = Math.min(...values);
  const dataMax = Math.max(...values);
  const rawSpan = dataMax - dataMin;

  const candidateSteps = [5, 10, 15, 20, 25, 30, 40, 50, 100];

  if (rawSpan === 0) {
    const step = candidateSteps.find((s) => s >= dataMin * 0.1) ?? 10;
    const base = Math.round(dataMin / step) * step;
    const start = Math.max(0, base - step);
    const end = base + 2 * step;
    const ticks: number[] = [];
    for (let t = start; t <= end + 0.001; t += step) {
      ticks.push(Math.round(t));
    }
    return ticks;
  }

  let best: { step: number; start: number; end: number; score: number } | null = null;
  for (const step of candidateSteps) {
    let start = Math.floor(dataMin / step) * step;
    let end = Math.ceil(dataMax / step) * step;
    if (dataMin >= 0 && start < 0) start = 0;
    let intervals = Math.round((end - start) / step);
    if (intervals === 0) continue;

    if (start === dataMin && intervals < 4 && (start - step >= 0 || dataMin < 0)) {
      start -= step;
      intervals++;
    }
    if (end === dataMax && intervals < 4) {
      end += step;
      intervals++;
    }

    if (intervals >= 2 && intervals <= 4) {
      const count = intervals + 1;
      const score = Math.abs(count - 4);
      if (
        !best ||
        score < best.score ||
        (score === best.score && (step === 30 || step === 20 || step === 25))
      ) {
        best = { step, start, end, score };
      }
    }
  }

  if (!best) {
    const step = candidateSteps.find((s) => (dataMax - dataMin) / s <= 4) ?? 20;
    let start = Math.floor(dataMin / step) * step;
    let end = Math.ceil(dataMax / step) * step;
    if (dataMin >= 0 && start < 0) start = 0;
    best = { step, start, end, score: 0 };
  }

  const ticks: number[] = [];
  for (let t = best.start; t <= best.end + best.step * 0.001; t += best.step) {
    ticks.push(Math.round(t));
  }
  return ticks;
}

export function ExaminationSeriesChart({ series }: { series: ExamSeries }) {
  const projected = projectSeries([series])[0];
  if (!projected) return null;
  const measurements = projected.points.flatMap((point) => point.measurements);
  const values = measurements.map(({ value }) => value);
  const ticks = computeYAxisTicks(values);
  const yMin = ticks[0] ?? 0;
  const yMax = ticks[ticks.length - 1] ?? 100;
  const span = yMax - yMin || 1;
  const getY = (value: number) => BOTTOM - ((value - yMin) / span) * (BOTTOM - TOP);
  const metricKeys = [...new Set(measurements.map(({ key }) => key))];
  const accessibilitySummary = seriesAccessibleSummary(projected);

  return (
    <View className="gap-4 rounded-summary border border-border bg-card p-4">
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
            {ticks.map((tick) => {
              const y = getY(tick);
              return (
                <React.Fragment key={`grid-${tick}`}>
                  <Line
                    x1={LEFT}
                    y1={y}
                    x2={RIGHT}
                    y2={y}
                    stroke="hsl(var(--border))"
                    strokeDasharray="3 3"
                    strokeWidth="1"
                    opacity={0.6}
                  />
                  <SvgText
                    x={LEFT - 4}
                    y={y + 3.5}
                    fontSize="10"
                    fill="hsl(var(--muted-foreground))"
                    textAnchor="end">
                    {tick}
                  </SvgText>
                </React.Fragment>
              );
            })}
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
                      stroke={metricColors[metricKey] ?? 'hsl(var(--primary))'}
                      strokeWidth="3"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  ) : null;
                });
              })}
            {projected.points.flatMap((point) =>
              point.measurements.map((measurement) => {
                const cx = xPosition(point.dateIndex, projected.dateCount);
                const cy = getY(measurement.value);
                const color = metricColors[measurement.key] ?? 'hsl(var(--primary))';
                return (
                  <React.Fragment key={`${point.id}-${measurement.key}`}>
                    <Circle
                      cx={cx}
                      cy={cy}
                      r="6"
                      fill="hsl(var(--card))"
                    />
                    <Circle
                      cx={cx}
                      cy={cy}
                      r="4"
                      fill={color}
                      stroke="hsl(var(--card))"
                      strokeWidth="1.5"
                    />
                  </React.Fragment>
                );
              })
            )}
          </Svg>
          {projected.points.length === 1 && (
            <View className="min-h-20 items-center justify-center rounded-control bg-carin-olive-soft/30 px-4 py-3">
              <Text className="font-semibold text-foreground">Satu pengukuran tercatat</Text>
              <Text variant="caption" className="text-muted-foreground">
                Belum ada cukup data untuk membandingkan waktu.
              </Text>
            </View>
          )}
          <View className="flex-row flex-wrap gap-4 pt-1">
            {metricKeys.map((key) => {
              const label = measurements.find(({ key: itemKey }) => key === itemKey)?.label ?? '';
              const isDiastolic = key === 'diastolic';
              return (
                <View key={key} className="flex-row items-center gap-2">
                  <View
                    className={cn(
                      'h-2.5 w-2.5 rounded-full ring-1 ring-border',
                      metricBgClasses[key] ?? (isDiastolic ? 'bg-[#4b6f96]' : 'bg-primary')
                    )}
                    style={{ backgroundColor: metricColors[key] }}
                  />
                  <Text variant="muted" className="text-xs font-medium">
                    {label}
                  </Text>
                </View>
              );
            })}
          </View>
          <View className="gap-2 pt-2">
            {projected.points.map((point) => (
              <View
                key={point.id}
                className="flex-row flex-wrap items-center justify-between gap-1 border-t border-border pt-2.5">
                <Text variant="caption" className="text-muted-foreground">
                  {point.measuredAt}
                </Text>
                <Text className="font-medium text-foreground">
                  {formatProjectedMeasurements(point.measurements, series.unit)}
                </Text>
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
