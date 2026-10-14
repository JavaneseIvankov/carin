import { and, eq, gt, gte, isNull, lt, sql } from 'drizzle-orm';
import type { components as AiComponents } from '../../contracts/generated/ai-service.js';
import type { components as AppComponents } from '../../contracts/generated/app-api.js';
import { ContractValidationError, validateSchema } from '../../contracts/validation.js';
import { getCalendarDayWindow, getDashboardWindow, getDashboardWindowForDate } from '../../domain/time-window.js';
import type { Database } from '../../db/client.js';
import {
  analysisResult,
  catalogCapabilityManifest,
  catalogVersion,
  consumption,
  consumptionEvaluation,
  consumptionSnapshot,
  healthProfile,
  session,
  user,
} from '../../db/schema/index.js';
import { listAllActiveExaminations } from '../examinations/repository.js';
import { examinationFromRow } from '../examinations/service.js';
import type { ExaminationRow } from '../examinations/repository.js';
import { calculateProfilePersonalization, type ProfileCapabilityManifest } from '../profile/validation.js';
import { buildDashboardSummary, type DashboardSummaryItem } from './summary.js';

type App = AppComponents['schemas'];
type Dashboard = App['Dashboard'];
type ConsumptionSnapshot = App['ConsumptionSnapshot'];
type ProfileFields = App['Profile']['fields'];
type Ai = AiComponents['schemas'];

export class DashboardSessionError extends Error {}
export class DashboardDateError extends Error {}

type DashboardOwner = {
  birthDate: string;
  timezone: string;
  profile: typeof healthProfile.$inferSelect | null;
};

function validCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function profileFields(profile: DashboardOwner['profile']): ProfileFields {
  if (!profile) return {
    heightCm: null,
    weightKg: null,
    sexForReference: null,
    diagnoses: { state: 'not_provided', entries: [] },
    familyHistory: { state: 'not_provided', entries: [] },
    allergies: { state: 'not_provided', entries: [] },
    clinicianNotes: null,
    activity: null,
    smoking: null,
  };
  return {
    heightCm: profile.heightCm === null ? null : Number(profile.heightCm),
    weightKg: profile.weightKg === null ? null : Number(profile.weightKg),
    sexForReference: profile.sexForReference as ProfileFields['sexForReference'],
    diagnoses: {
      state: profile.diagnosisState as ProfileFields['diagnoses']['state'],
      entries: profile.conditions as ProfileFields['diagnoses']['entries'],
    },
    familyHistory: {
      state: profile.familyHistoryState as ProfileFields['familyHistory']['state'],
      entries: profile.familyHistory as ProfileFields['familyHistory']['entries'],
    },
    allergies: {
      state: profile.allergyState as ProfileFields['allergies']['state'],
      entries: profile.allergies as ProfileFields['allergies']['entries'],
    },
    clinicianNotes: profile.clinicianNotes,
    activity: profile.activity as ProfileFields['activity'],
    smoking: profile.smoking as ProfileFields['smoking'],
  };
}

function parseSnapshot(value: unknown): ConsumptionSnapshot {
  try {
    validateSchema('app.ConsumptionSnapshot', value);
  } catch (error) {
    if (error instanceof ContractValidationError) throw error;
    throw new ContractValidationError('app.ConsumptionSnapshot');
  }
  return value as ConsumptionSnapshot;
}

function evaluationAttentions(value: unknown): Ai['AnalysisResult']['attentions'] {
  validateSchema('ai.AnalysisResult', value);
  return (value as Ai['AnalysisResult']).attentions;
}

function parseManifest(value: unknown): ProfileCapabilityManifest | null {
  try {
    validateSchema('ai.CapabilityManifest', value);
    const manifest = value as Ai['CapabilityManifest'];
    return { conditions: manifest.conditions.map((condition) => ({
      id: condition.id,
      personalizationSupported: condition.personalizationSupported,
      requiredProfileFields: condition.requiredProfileFields,
      supportedAgeMinimum: condition.supportedAgeMinimum,
      supportedAgeMaximum: condition.supportedAgeMaximum,
    })) };
  } catch {
    return null;
  }
}

function latestExaminations(rows: ExaminationRow[]): App['Examination'][] {
  const seen = new Set<string>();
  const latest: App['Examination'][] = [];
  for (const row of rows) {
    if (seen.has(row.seriesKey)) continue;
    seen.add(row.seriesKey);
    latest.push(examinationFromRow(row));
  }
  return latest;
}

function nextActions(input: {
  profileMissingFields: string[];
  consumptionCount: number;
  hasExaminations: boolean;
}): Dashboard['nextActions'] {
  const actions: Dashboard['nextActions'] = [];
  if (input.profileMissingFields.length) actions.push({
    code: 'complete_profile',
    label: 'Lengkapi profil kesehatan',
    target: '/(tabs)/profile',
  });
  if (input.consumptionCount === 0) actions.push({
    code: 'record_consumption',
    label: 'Catat konsumsi',
    target: '/consumptions/new',
  });
  if (!input.hasExaminations) actions.push({
    code: 'record_examination',
    label: 'Tambahkan pemeriksaan',
    target: '/exams/new',
  });
  return actions;
}

async function readDashboardOwner(
  tx: Parameters<Parameters<Database['transaction']>[0]>[0],
  userId: string,
  sessionId: string,
): Promise<DashboardOwner> {
  const [row] = await tx.select({
    birthDate: user.birthDate,
    timezone: user.timezone,
    deletionStatus: user.deletionStatus,
    expiresAt: session.expiresAt,
    profile: healthProfile,
  }).from(user)
    .innerJoin(session, eq(session.userId, user.id))
    .leftJoin(healthProfile, eq(healthProfile.userId, user.id))
    .where(and(
      eq(user.id, userId),
      eq(user.deletionStatus, 'active'),
      eq(session.id, sessionId),
      gt(session.expiresAt, sql`transaction_timestamp()`),
    )).limit(1);
  if (!row) throw new DashboardSessionError();
  return { birthDate: row.birthDate, timezone: row.timezone, profile: row.profile };
}

export async function getDashboard(
  db: Database,
  input: { userId: string; sessionId: string; date?: string },
): Promise<Dashboard> {
  if (input.date && !validCalendarDate(input.date)) throw new DashboardDateError();
  return db.transaction(async (tx) => {
    await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY`);
    const owner = await readDashboardOwner(tx, input.userId, input.sessionId);
    const time = await tx.execute(sql`SELECT transaction_timestamp() AS now`);
    const rawNow = (time.rows[0] as { now?: Date | string } | undefined)?.now;
    const now = rawNow instanceof Date ? rawNow : typeof rawNow === 'string' ? new Date(rawNow) : null;
    if (!now || !Number.isFinite(now.getTime())) throw new Error('Dashboard transaction time is unavailable');

    const selected = input.date ?? getDashboardWindow(now, owner.timezone).endDate;
    const attentionWindow = getDashboardWindowForDate(selected, owner.timezone);
    const consumptionWindow = getCalendarDayWindow(selected, owner.timezone);
    const rows = await tx.select({
      id: consumption.id,
      consumedAt: consumption.consumedAt,
      snapshot: consumptionSnapshot.snapshot,
      evaluationState: consumptionEvaluation.state,
      evaluationOutput: analysisResult.output,
    }).from(consumption)
      .innerJoin(consumptionSnapshot, and(
        eq(consumptionSnapshot.id, consumption.currentSnapshotId),
        eq(consumptionSnapshot.userId, consumption.userId),
      ))
      .leftJoin(consumptionEvaluation, and(
        eq(consumptionEvaluation.snapshotId, consumptionSnapshot.id),
        eq(consumptionEvaluation.userId, consumption.userId),
      ))
      .leftJoin(analysisResult, and(
        eq(analysisResult.id, consumptionEvaluation.resultId),
        eq(analysisResult.userId, consumption.userId),
      ))
      .where(and(
        eq(consumption.userId, input.userId),
        isNull(consumption.deletedAt),
        gte(consumption.consumedAt, new Date(attentionWindow.startInclusiveUtc)),
        lt(consumption.consumedAt, new Date(attentionWindow.endExclusiveUtc)),
      ));

    const snapshotRows = rows.map((row) => ({
      id: row.id,
      consumedAt: row.consumedAt,
      state: row.evaluationState ?? 'not_requested',
      snapshot: parseSnapshot(row.snapshot),
    }));
    const daily = snapshotRows.filter(({ consumedAt }) =>
      consumedAt >= new Date(consumptionWindow.startAt) && consumedAt < new Date(consumptionWindow.endAt));
    const summaryItems: DashboardSummaryItem[] = rows.map((row, index) => {
      const { id, snapshot } = snapshotRows[index]!;
      const resultAttentions = row.evaluationState === 'completed' && row.evaluationOutput !== null
        ? evaluationAttentions(row.evaluationOutput)
        : [];
      return {
        id,
        evaluationState: (row.evaluationState ?? 'not_requested') as DashboardSummaryItem['evaluationState'],
        components: snapshot.components.map(({ id: componentId, nutrients }) => ({ id: componentId, nutrients })),
        attentions: [...snapshot.attentions, ...resultAttentions]
          .map(({ ruleId, conditionId }) => ({ ruleId, conditionId })),
      };
    });
    const dailyIds = new Set(daily.map(({ id }) => id));
    const dailyItems = summaryItems.filter(({ id }) => dailyIds.has(id));
    const summary = buildDashboardSummary(dailyItems, summaryItems);

    const examRows = await listAllActiveExaminations(tx, input.userId);
    const profile = profileFields(owner.profile);
    const [manifestRow] = await tx.select({ manifest: catalogCapabilityManifest.manifest })
      .from(catalogVersion)
      .innerJoin(catalogCapabilityManifest, eq(catalogCapabilityManifest.catalogVersion, catalogVersion.version))
      .where(eq(catalogVersion.isCurrent, true))
      .limit(1);
    const manifest = manifestRow ? parseManifest(manifestRow.manifest) : null;
    const profileMissingFields = owner.profile === null
      ? ['diagnoses']
      : calculateProfilePersonalization(profile, {
        birthDate: owner.birthDate,
        timezone: owner.timezone,
        manifest,
        now,
      }).missingFields;
    const exams = latestExaminations(examRows);

    return {
      date: selected,
      timezone: owner.timezone,
      consumptionWindow,
      attentionWindow: { startDate: attentionWindow.startDate, endDate: attentionWindow.endDate },
      ...summary,
      latestExaminations: exams,
      profileMissingFields,
      nextActions: nextActions({
        profileMissingFields,
        consumptionCount: summary.consumptionCount,
        hasExaminations: exams.length > 0,
      }),
      computedAt: now.toISOString(),
    };
  });
}
