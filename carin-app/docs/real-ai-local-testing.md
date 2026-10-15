# Local real AI startup handoff

Task / scope: Make food photo analysis use the provider credentials added to ai-service/.env.

Diagnosis: The running Compose stack had no analysis worker or AI-service container. infra/.env still selected AI_MODE=fixture. Compose explicitly takes provider settings from infra/.env; ai-service/.env is only loaded for the standalone Python process, and its AI_SERVICE_KEY was empty.

Changes: Updated only ignored local env files. Copied provider settings from ai-service/.env into infra/.env without exposing values, selected AI_MODE=real, aligned a generated internal service key on both sides, and kept AI_CATALOG_MODE=unconfigured. Started the email + worker Compose profiles and imported the AI capabilities/catalog snapshot through the backend catalog CLI. Catalog state is local to carin-dev; no accounts were created or reset. No UI or application source change was required.

Verification (repository root, desktop-linux Docker context):

- Compose up -d --build with email and worker profiles completed. API, PostgreSQL, MinIO and AI-service health checks passed; analysis/email workers are running.
- Provider credential/model probe from AI container returned HTTP 200.
- VLMClient image recognition accepted an existing synthetic onboarding asset and identified 5 components.
- Worker catalog import completed for the unconfigured snapshot.
- Full internal photo pipeline smoke test uploaded that synthetic image to a temporary private object, issued a short-lived MinIO URL, called the actual /internal/v1/analyses route from the worker container and received HTTP 200 with 5 components and model_estimate sources. The temporary object was removed in finally.

Unverified work / blockers: A real food photograph submitted through the iPhone UI has not been tested in this session. The synthetic illustration probe demonstrates connectivity and schema flow, not food-recognition or nutrition accuracy. Catalog currently has zero approved food entries; unmatched items can use clearly labeled visual model estimates. No approved personal-health rules were introduced.

Next step: Reload the app, open Analisis foto, submit a fresh food photo and inspect the result. Keep both worker and AI-service running. For later starts, use:

    docker --context desktop-linux compose --profile email --profile worker --env-file infra/.env -f infra/compose.yaml up -d

If provider values are changed in ai-service/.env, synchronize the corresponding infra/.env values and recreate the containers. Secrets stay in ignored env files.

Worktree state: Only this handoff note is new tracked content. Preserve the user's pre-existing infra/.env.example modification; do not stage or publish its credentials.
