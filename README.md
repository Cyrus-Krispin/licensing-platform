# Licensing Platform

A Regulatory and Licensing Platform MVP for fixed-premises cafés and restaurants in a fictional jurisdiction. Selected scope covers pre-site submission, officer review, targeted corrections and resubmissions, and final approval/rejection.

## Planning documents

- [MVP scope](docs/SCOPE.md)
- [Product specification](docs/SPEC.md)
- [Implementation backlog](docs/TASKS.md)

The full scope is maintained in `docs/`; the root [SCOPE.md](SCOPE.md) is an assessment entry point.

Check that relative links to Markdown files resolve from each planning document:

```sh
node scripts/check-markdown-links.mjs
```

## Implementation status

Application implementation has not started. The selected architecture is a React/TypeScript/Vite frontend using shadcn/ui in a black-background dark theme, a separate Java Spring Boot/Spring Security backend, PostgreSQL, and private persistent document-file storage. All runtime services will run in separate Docker Compose containers in one monorepo.

Cloud issue dispatch and automatic PR creation must be verified before claiming that workflow is configured. Main accepts changes only through pull requests under its verified GitHub ruleset. See the backlog for accepted requirements, proposed detailed rules, dependencies, and verification expectations.

## Codex cloud issue dispatch

The `Dispatch Codex cloud` workflow listens for the `codex:ready` label on an open issue. A repository collaborator with write, maintain, or admin permission must apply the label. It posts one fixed `@codex` comment as `github-actions[bot]`, marks the issue `codex:dispatched`, and removes readiness. Keep acceptance criteria in the issue; issue text is never executed by Actions. One open dispatched issue is allowed at a time. Close it after reviewed work is merged before marking the next issue ready. GitHub concurrency retains only one pending event, so keep exactly one ready issue; if an event is canceled, remove and reapply readiness after diagnosis. Blocked or failed tasks require explicit maintainer diagnosis; relabeling never silently duplicates the original mention.

The workflow uses the short-lived repository `GITHUB_TOKEN` with contents read and issues write. It needs no OpenAI API key and runs no coding agent in Actions. The executor is the connected Codex cloud environment. GitHub Actions checks prove only comment delivery; cloud acceptance must be observed independently in the Codex task list and issue replies. Bot admission is not yet proven. For a noncoding pickup test, additionally apply `codex:read-only` before readiness: the fixed prompt then forbids implementation and verifies current main without taking an implementation slot. Only use this proof after the current cloud task has finished. Native cloud PR publication currently requires an orchestrator UI action; this workflow does not claim automatic PR publication, review, merge, or deployment.

Run `node --test .github/scripts/dispatch-codex.test.cjs` to verify dispatch guards. The read-only `Automation tests and documentation` PR check also runs the Markdown link checker. Actions are pinned to verified full commit SHAs. Repository issue-trigger workflows must be merged to the default branch before an issue label can exercise them.

References: [GitHub issue events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#issues), [GitHub workflow triggering and GITHUB_TOKEN limits](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow), and [actions/github-script](https://github.com/actions/github-script).
