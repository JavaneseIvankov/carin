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

## Validation

From the repository root:

```sh
python -m unittest discover -s ai-service/tests
python ai-service/validate_data_artifacts.py
```

The validator checks internal JSON schemas, cross-artifact versions, food,
nutrient, serving, rule and source references, finite nonnegative numeric
values, publication approvals, prevention of synthetic-to-real promotion, and
wire projections against `specs/contracts/ai-service.openapi.yaml`. Synthetic
records in tests use `.invalid` URLs and are test data only. Passing validation
does not approve content, train/select a model, or establish recognition or
portion accuracy.

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
