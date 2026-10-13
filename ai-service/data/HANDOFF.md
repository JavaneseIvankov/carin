# AI data artifacts handoff

## Status

This is the preparatory subset of T31/C31. The files in this directory are
unpublished templates. There are no real foods, nutrition values, supported
conditions, rules, or capabilities in them. `1970-01-01T00:00:00Z` in the
manifest is a placeholder required by the shared wire schema; internal
`publicationStatus: "unpublished"` prevents it from being treated as a release
timestamp. No PRD candidate food or condition is implicitly approved.

The internal catalog, nutrition dataset, rule set, and capability manifest each
have separate versions. A catalog food is projected to the existing AI-service
`CatalogFood` schema without changing the wire contract. Source rows keep
`license`, `basis`, and `synthetic` metadata internally; publication reviews are
kept out of band in `review-metadata.json`, because the shared `Source` schema
does not allow those fields. Rules have their own version and stable IDs, link to
condition IDs, food scope, citations, required inputs, limitations, and conflict
sets. The current `ruleBody` is only a schema placeholder; do not use it as
clinical logic without approval.

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

An unpublished manifest must keep supported foods, nutrient claims, and
conditions empty. Wire-shape tests use synthetic catalog rows without adding
those claims to the manifest.

## Validation

From the repository root:

```sh
python -m unittest discover -s ai-service/tests
python ai-service/validate_data_artifacts.py
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

Focused verification after review corrections:

```text
PYTHONDONTWRITEBYTECODE=1 python -m unittest discover -s ai-service/tests — 19 passed
PYTHONDONTWRITEBYTECODE=1 python ai-service/validate_data_artifacts.py — PASS
git diff --check — PASS
```

The repository contract validator was not rerun in this worktree because its
system Python lacks `openapi_spec_validator`; T1 owns validation through the
pinned root virtual environment.

## Remaining T31 release gate

Before any real capability is published, the data and product owners need to
provide or approve:

- Source records for each nutrient and serving with exact source item/basis,
  accessible citation URL, and license/use permission, plus an approved policy
  identifying which source types/datasets may be used.
- Food IDs, names, preparation variants, serving IDs/grams, and nutrient values
  traced to those source records. No generic serving weights or inferred
  nutrient substitutions.
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

Until those items exist, the supported personal condition scope and supported
photo food list remain empty. Real sources are not researched or invented in
this preparatory change. T32 real AI integration remains gated on the approved
source set, published capability scope, evaluation evidence, and separate
provider/model/credential decisions.
