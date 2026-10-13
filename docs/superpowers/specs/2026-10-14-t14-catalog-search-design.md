# C14 Versioned Catalog Import and Search Design

## Goal

Import the versioned food catalog and condition capability labels from the internal AI REST API into PostgreSQL, then serve authenticated food and condition search from the imported immutable snapshots. The API keeps the existing OpenAPI payloads unchanged.

## Design

The existing AI client owns contract-validated access to `/internal/v1/capabilities` and `/internal/v1/catalog`. A catalog importer reads the manifest, fetches every page for exactly its `catalogVersion`, validates source and serving references, and prepares a deterministic digest before opening a database transaction. The transaction writes version metadata, food rows, serving rows, and candidate condition rows as one immutable snapshot, then changes the active-version pointer only after every row is present. A repeated identical version is idempotent; a conflicting payload for an existing version is rejected. Previous versions remain queryable.

Version metadata records catalog, nutrition dataset, and rule-set versions plus mode, publication time, digest, and activation time. Condition labels retain the manifest's explicit `personalizationSupported` and required-field metadata; labels do not create or imply rules. The existing composite food/serving keys stay in place. Food aliases and nutrient-to-source mappings are stored explicitly so database search and response reconstruction preserve the AI contract.

`GET /api/v1/catalog/foods` and `/conditions` require a verified session. Food search returns stable `(displayName,id)` order with an opaque cursor bound to version and normalized query. Search by an explicit imported version continues to work after a newer version activates. An unavailable explicit version returns 409 `CATALOG_VERSION_UNAVAILABLE`. When no snapshot has been imported, food search returns an empty page with `catalogVersion: "unavailable"`; this allows unmatched manual entry without inventing food or nutrient data. Condition search returns matching labels from the current snapshot, or an empty array when none exists.

The importer is exposed as an operational command and service function, not as a new public API operation. It must not affect readiness or change any app/AI wire schema. Development imports use only the packaged synthetic catalog already exposed by C15; they do not add external nutrition or clinical sources.

## Validation and verification

Tests cover page traversal and repeated cursors, atomic activation, immutable re-import, explicit old-version lookup, no-catalog behavior, stable cursor pagination, name/preparation ambiguity, serving/source integrity, and condition labels whose support flag remains explicit. Database integration tests exercise real PostgreSQL constraints and transaction behavior; route integration tests validate the existing request/response contracts and status codes.
