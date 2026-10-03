# Licensing Platform

A Regulatory and Licensing Platform MVP for fixed-premises cafés and restaurants in a fictional jurisdiction. Selected scope covers pre-site submission, officer review, targeted corrections and resubmissions, and final approval/rejection.

## Planning documents

- [MVP scope](docs/SCOPE.md)
- [Product specification](docs/SPEC.md)
- [Implementation backlog](docs/TASKS.md)

The full scope is maintained in `docs/`; the root [SCOPE.md](SCOPE.md) is an assessment entry point.

## Implementation status

Application implementation has not started. The selected architecture is a React/TypeScript/Vite frontend using shadcn/ui in a black-background dark theme, a separate Java Spring Boot/Spring Security backend, PostgreSQL, and private persistent document-file storage. All runtime services will run in separate Docker Compose containers in one monorepo.

Cloud issue dispatch and automatic PR creation must be verified before claiming that workflow is configured. Main accepts changes only through pull requests under its verified GitHub ruleset. See the backlog for accepted requirements, proposed detailed rules, dependencies, and verification expectations.
