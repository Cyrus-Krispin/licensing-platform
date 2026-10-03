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

## Codex cloud workflow

Work progresses one scoped implementation issue at a time through Codex CLOUD, a reviewable PR, meaningful CI checks, independent review, and a normal PR merge. The linked GitHub account's issue comment mention was verified to start an actual cloud task. An original issue-body mention still needs observation before claiming support; do not duplicate dispatch if it already starts a task. Native cloud PR publication currently needs an orchestrator UI action.

The optional ready-label workflow bot was removed at the user's request. There is no persistent repository bot dispatcher, OpenAI API-key Actions executor, or personal-token setup. Ordinary GitHub Actions performs checks, not coding. The retained read-only PR check runs `node scripts/check-markdown-links.mjs` on every PR base.
