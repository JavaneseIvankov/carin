import { eq, sql } from 'drizzle-orm';
import type { components } from '../contracts/generated/ai-service.js';
import type { Database } from '../db/client.js';
import { catalogCapabilityManifest, catalogCondition, catalogFood, catalogServing, catalogVersion } from '../db/schema/index.js';
import { CatalogImportError } from './errors.js';
import type { CatalogSnapshot } from './importer.js';

type CatalogFoodArtifact = components['schemas']['CatalogFood'];

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export async function persistCatalogSnapshot(db: Database, snapshot: CatalogSnapshot): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(77183, 14)`);
    const version = snapshot.manifest.catalogVersion;
    const existing = await tx.select({ digest: catalogVersion.digest }).from(catalogVersion).where(eq(catalogVersion.version, version)).limit(1);
    if (existing[0]) {
      if (existing[0].digest !== snapshot.digest) {
        throw new CatalogImportError('CATALOG_VERSION_CONFLICT', 'Catalog version already exists with different contents.');
      }
      const [persistedAuthority] = await tx.select({ manifest: catalogCapabilityManifest.manifest })
        .from(catalogCapabilityManifest).where(eq(catalogCapabilityManifest.catalogVersion, version)).limit(1);
      if (persistedAuthority && canonicalJson(persistedAuthority.manifest) !== canonicalJson(snapshot.manifest)) {
        throw new CatalogImportError('CATALOG_VERSION_CONFLICT', 'Catalog capability authority differs from its immutable version.');
      }
      if (!persistedAuthority) {
        await tx.insert(catalogCapabilityManifest).values({ catalogVersion: version, manifest: snapshot.manifest });
      }
      await tx.update(catalogVersion).set({ isCurrent: false });
      await tx.update(catalogVersion).set({ isCurrent: true }).where(eq(catalogVersion.version, version));
      return;
    }

    await tx.insert(catalogVersion).values({
      version,
      nutritionDatasetVersion: snapshot.manifest.nutritionDatasetVersion,
      ruleSetVersion: snapshot.manifest.ruleSetVersion,
      dataMode: snapshot.manifest.dataMode,
      publishedAt: new Date(snapshot.manifest.publishedAt),
      digest: snapshot.digest,
      isCurrent: false,
    });
    await tx.insert(catalogCapabilityManifest).values({ catalogVersion: version, manifest: snapshot.manifest });

    const foods: CatalogFoodArtifact[] = snapshot.foods;
    for (let start = 0; start < foods.length; start += 200) {
      const batch = foods.slice(start, start + 200);
      if (batch.length === 0) continue;
      await tx.insert(catalogFood).values(batch.map((food) => ({
        id: food.id,
        version,
        displayName: food.displayName,
        aliases: food.aliases,
        preparation: food.preparation,
        energyKcal: food.per100g.energyKcal === null ? null : String(food.per100g.energyKcal),
        carbohydrateG: food.per100g.carbohydrateG === null ? null : String(food.per100g.carbohydrateG),
        proteinG: food.per100g.proteinG === null ? null : String(food.per100g.proteinG),
        fatG: food.per100g.fatG === null ? null : String(food.per100g.fatG),
        fiberG: food.per100g.fiberG === null ? null : String(food.per100g.fiberG),
        sugarsG: food.per100g.sugarsG === null ? null : String(food.per100g.sugarsG),
        sodiumMg: food.per100g.sodiumMg === null ? null : String(food.per100g.sodiumMg),
        sourceRefs: food.sources,
        nutrientSourceIds: food.nutrientSourceIds,
      })));
      const servings = batch.flatMap((food) => food.servings.map((serving) => ({
        id: serving.id,
        catalogVersion: version,
        foodId: food.id,
        label: serving.label,
        grams: String(serving.grams),
        sourceRefs: { sourceId: serving.sourceId },
      })));
      if (servings.length > 0) await tx.insert(catalogServing).values(servings);
    }

    const conditions = snapshot.manifest.conditions;
    for (let start = 0; start < conditions.length; start += 200) {
      const batch = conditions.slice(start, start + 200);
      if (batch.length > 0) {
        await tx.insert(catalogCondition).values(batch.map((condition) => ({
          catalogVersion: version,
          conditionId: condition.id,
          displayName: condition.displayName,
          condition,
        })));
      }
    }

    await tx.update(catalogVersion).set({ isCurrent: false });
    await tx.update(catalogVersion).set({ isCurrent: true }).where(eq(catalogVersion.version, version));
  });
}
