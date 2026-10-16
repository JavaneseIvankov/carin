# AI data artifacts handoff

## Status

This is the draft candidate subset of T31/C31. The catalog now contains 189 food
records with 189 original row-level nutrition sources: 32 SMILING Indonesia, 19 Bapanas
TKPSI, 76 USDA FNDDS 2021–2023 (55 western, 21 noodles/Asian foods), 38 MEXT
Japan, and 24 MFDS Korea. The original 51 Indonesian IDs are preserved.
Burger, fries, pizza, pasta, Japanese noodles/instant noodles/ready-made dishes,
Korean noodles and other common dishes are included as preparation-specific
research candidates. See [the complete inventory](CATALOG_INVENTORY.md) for all
foods, values, citations, coverage, exclusions, and reproducible extraction.
These are not approved recognition or health capabilities.

There are now 376 source records in total: the original 189 plus 173 nutrient
completion sources and 14 health-guideline citations. The seven nutrient fields are numerically present for all
189 foods. Of the 173 newly filled cells, 18 are food-reference supplements and
155 are explicitly labeled estimates. See [nutrient completion details](NUTRIENT_COMPLETION.md)
and `import/nutrient-completions.json` for every value, method, input, evidence
and limitation. All 1,150 original non-null values and their source IDs remain
unchanged. Numeric completeness is not complete analytical evidence.

The SMILING workbook describes its matrix as per 100 g edible portion. Its 32
selected rows provide standardized energy, available carbohydrate, protein,
fat, and dietary fiber. Energy is calculated by the workbook from macros and
fiber, rather than being a direct calorimetry result. The TKPSI page displays
proximate percentages for its 19 selected raw commodities. The catalog maps its
explicit available-carbohydrate row, where present, to g/100 g; the source page
does not state an edible-portion factor. TKPSI does not provide energy.
FNDDS/MFDS provide all seven catalog nutrients; MEXT's main table lacks total
sugars. Before completion, coverage was energy 170, carbohydrate 182, protein
189, fat 189, fiber 182, sugars 100, sodium 138. Supplements now use Panganku
sodium tables, USDA SR Legacy/FNDDS food proxies, MEXT partial sugar sums and
explicit energy conversion factors. None are VLM-generated guesses. No serving
weights were added; total menu content weights are not recommended portions.

Carbohydrate definitions differ: original SMILING/TKPSI/MEXT use available carbohydrate
(MEXT CHOAVL mass basis); FNDDS uses total carbohydrate and MFDS its reported
carbohydrate. Seven added available-carbohydrate cells explicitly derive total
minus fiber from a raw-food proxy, with provenance and estimate labels. Source
metadata preserves the distinction; no claim of fully harmonized definitions. MEXT parenthesized estimates retain
their raw notation in the snapshot. Raw, dry, cooked, broth-included and
broth-left-behind entries stay distinct. National reference recipes are not
exact Indonesian restaurant/menu specifications. Four MFDS candidates reporting
100mL instead of 100g were excluded without assuming a density.

FAO/INFOODS lists the SMILING table as free access, but its workbook and
metadata do not state an explicit redistribution license. The TKPSI page also
does not state a reuse license. Permission is unresolved for both sources and
blocks publication of those entries. USDA FNDDS is U.S. Public Domain and MEXT
explicitly permits attributed reuse. MFDS item-specific reuse permission remains
unconfirmed and is recorded as pending, rather than assumed open. Panganku also
lacks a confirmed reuse license. Its FR007 liver sodium (1068 mg/100g) differs
substantially from USDA 171060 (71 mg/100g); both evidence records are retained
and the local value requires review before use. Some SMILING rows trace to historical tables from
1964–2001; records labeled Nutrisurvey lack a bibliographic citation in the
workbook and need additional review. The TKPSI page does not show sample IDs or
collection dates. MFDS selected pages state analytical generation dated
2012–2022 and a reference date of 2026-08-28; the latter does not mean new lab
measurements in 2026. `review-metadata.json` leaves every artifact and source in
draft with null approval bindings. No reviewer approval is implied.

The rule set `rules-unpublished-0.3.0` contains 35 disabled draft policy
definitions in 13 categories, including general nutrition and common reported
conditions. See [the rule guide](RULES_GUIDE.md) for full scope and sources,
and [the scenario evaluation](RULES_EVALUATION.md) for a desk review of expected
answers across general nutrition and several conditions. The evaluation is not
an API/model run or clinical approval.
The manifest remains unpublished with empty supported-food and nutrient lists.
Its condition descriptors exactly match the rule set; all have
`personalizationSupported=false` and null supported ages. There are no verified
servings and no executable rule engine yet.
The live service's catalog remains unconfigured; this draft has not been loaded
into a shared database or exposed by the service. After the 2026-10-16 dev merge,
the separate VLM path returns seven per-portion nutrition estimates with
`model_estimate` provenance, without publishing this draft catalog or activating
its health rules. The draft manifest now follows dev's existing contract 2.0.0.
Held-out image and portion evaluation
was explicitly skipped for this pass. `1970-01-01T00:00:00Z` remains a required
wire-schema placeholder, not a release timestamp.

The internal catalog, nutrition dataset, rule set, and capability manifest each
have separate versions. A catalog food is projected to the existing AI-service
`CatalogFood` schema without changing the wire contract. Source rows keep
`license`, `basis`, and `synthetic` metadata internally; publication reviews are
kept out of band in `review-metadata.json`, because the shared `Source` schema
does not allow those fields. Rules have their own version and stable IDs, link to
condition IDs, food scope, citations, required inputs, limitations, and conflict
sets. The current `nutrition_policy_v1` rule bodies are schema-checked draft
definitions with `enabled=false` and `executionStatus=draft_not_executable`.
They require review and an implemented/tested executor before use.

Approval records in `review-metadata.json` bind to both a version and the
artifact's deterministic SHA-256: UTF-8 JSON with sorted keys, compact
separators, and non-finite numbers rejected. The hash covers the artifact
record itself and excludes the sidecar, avoiding a circular digest. Source and
rule approvals use the same binding. Any version or content edit makes an
existing approval stale and blocks validation until a reviewer re-approves it.
Draft records have null bindings. Nutrition and portion sources bind to the
nutrition dataset version; health-rule sources bind to the rule-set version.
Synthetic sources follow their referenced role, and unreferenced synthetic
draft sources may only carry one of those two current versions.

An unpublished manifest must keep supported foods/nutrient claims empty and
every condition descriptor unsupported. Unsupported definitions may be listed
so rule-set and manifest conditions remain identical. Passing the catalog projection checks validates its wire
shape only; it does not approve these candidate records for use.

## Validation

From the repository root, validate the data artifacts:

```sh
rtk uv run --project ai-service python ai-service/validate_data_artifacts.py
```

From `ai-service/`, run the service tests (includes API/security and importer tests):

```sh
rtk uv run pytest
```

The validator checks internal JSON schemas, cross-artifact and source-role
versions, food, nutrient, serving, rule and source references, finite
nonnegative numeric values, approval version/content bindings, prevention of
synthetic-to-real promotion, and wire projections against
`specs/contracts/ai-service.openapi.yaml`. It returns schema failures before
semantic traversal of malformed artifact shapes. Approved records containing
non-finite numbers produce validation findings instead of aborting while
computing their content hash. Non-synthetic source citations require HTTP(S)
URLs with hosts and reject reserved `.invalid` hosts; synthetic test records use
`.invalid` URLs. Serving IDs must be unique within each food, while different
foods may reuse a serving ID. Passing validation does not approve content,
train/select a model, or establish recognition or portion accuracy.

Verification for this draft update:

```text
rtk uv run --project ai-service python ai-service/validate_data_artifacts.py — PASS
rtk uv run pytest — 78 passed (API, security, source-unit parsing, completion provenance, health policies, artifact gates)
rtk uv run --project ai-service python specs/validate-contracts.py — PASS
rtk git diff --check — PASS
```

The contract validator passed using the AI-service environment: 2 OpenAPI
documents, 40 operations, 447 local refs, 5 fixtures and 3 negative probes.
No provider calls or photo/portion evaluation ran for this collection task.
Rebuilding the five JSON artifacts offline from the selected-row snapshot was
also checked to be byte-identical. The upstream extraction rejects changed
workbook headers, food-name drift, unexpected units and a non-100g MFDS basis.

Worktree state: changes are uncommitted on `feat/t32-real-ai-service`; no push,
database activation or source approval was performed for this collection pass.

## Remaining T31 release gate

Before any real capability is published, the data and product owners need to
provide or approve:

- Explicit reuse permission for SMILING, Bapanas, Panganku and selected MFDS records, and full citations for the
  Nutrisurvey-labeled rows. Keep the current catalog local/draft until resolved.
- Source records for any future servings with exact source item/basis,
  accessible citation URL, and license/use permission, plus an approved policy
  identifying which source types/datasets may be used.
- Human review of the current food IDs, names, preparation variants, and
  nutrient mappings against the source workbook. No generic serving weights or
  inferred nutrient substitutions.
- A human-reviewed condition scope and each rule's source, input needs, food/
  portion scope, reason, adjustment, conflicts, and limitations. An exam type or
  stored condition alone does not imply personalization support.
- Named reviewers, approval IDs/timestamps, and approval metadata for the
  catalog, dataset, rule set, each source, each rule, and the manifest.
- A published capability manifest whose versions agree and whose supported
  foods, nutrients, and conditions match validated catalog/rule evidence.
- Held-out food photos and measured portions for recognition/portion evaluation,
  plus contract, math, unsupported-scope, and failure-case results as required by
  `specs/04-ai-data-and-policy.md` and `specs/05-verification-and-deployment.md`.

Until those items exist, no condition has supported personalization and the
supported photo food list remains empty. T32 real AI integration remains gated on approved
source use, reviewed catalog scope, evaluation evidence, and separate
provider/model/credential decisions.
