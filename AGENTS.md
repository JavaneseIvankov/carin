# Repository Guidelines

## Orientation

This guide covers the whole repository. Keep module-specific implementation,
setup, and testing instructions in that module's `AGENTS.md` or README.

- `carin-app/`: mobile application; read [its guide](carin-app/AGENTS.md) before changes.
- `carin-api/`: application API and worker.
- `ai-service/`: internal AI REST service.
- `specs/`: product decisions, domain rules, API contracts, and verification requirements.

This is the intended structure, not a claim that every component is implemented.
Inspect the current files and any more-specific contributor instructions first.

## Before Working

1. Check `git status` and preserve existing changes, including other contributors' work.
2. Read the [spec index](specs/00-mvp-scope-and-decisions.md), then only the documents
   relevant to the assigned work and the applicable module guide.
3. Identify the task's scope, dependencies, acceptance criteria, and current implementation.
   Distinguish completed behavior from planned behavior; do not rely on prior chat context.

Recorded decisions in the spec index override conflicting baseline PRD requirements.
OpenAPI defines wire payloads; domain specs define behavior. If these disagree, flag
the conflict and resolve it before implementing the affected behavior.

## Scope and Coordination

- Keep changes focused on the assigned work; avoid unrelated refactoring or dependency upgrades.
- Treat contracts as shared interfaces. Coordinate changes across consumers, providers,
  fixtures, and tests; never silently change one side or substitute fixture behavior for real behavior.
- Do not overwrite others' changes, reset shared data, or commit secrets or sensitive user data.
  Ask for direction when resolving a conflict would require discarding work or expanding scope.
- `tsk` is optional. When available and used for the assignment, read/update tasks through
  its CLI; hand completed work back as `review`, not `done` without user approval.
  Do not assume task numbers match spec IDs. Without `tsk`, use the supplied brief and
  report progress in the handoff; do not install tooling or create a replacement board.

## Verification

Discover commands from the actual package manifests and module guides; run them from
the documented working directory. Do not invent scripts or claim checks that were not run.
Add or update tests with behavior changes, including relevant failure and boundary cases.
For contract or fixture changes, follow [contract verification](specs/05-verification-and-deployment.md).
Report unavailable checks and platform limitations explicitly; spec validation is not
proof that the application or real AI works.

## Handoff

Leave a concise summary in the agreed collaboration channel or task notes, accessible
without this conversation. Do not put temporary progress or credentials in this guide.

```text
Task / scope:
Changes and affected files:
Verification: commands, working directories, results, platform/device if relevant
Unverified work / blockers:
Next step:
Worktree state: committed/uncommitted changes and relevant work to preserve
```
