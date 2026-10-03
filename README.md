# Licensing Platform

A Regulatory and Licensing Platform MVP for fixed-premises cafés and restaurants in a fictional jurisdiction. Selected scope covers pre-site submission, officer review, targeted corrections and resubmissions, and final approval/rejection.

## Planning documents

- [MVP scope](docs/SCOPE.md)
- [Product specification](docs/SPEC.md)
- [Implementation backlog](docs/TASKS.md)

The full scope is maintained in `docs/`; the root [SCOPE.md](SCOPE.md) is an assessment entry point.

## Codex cloud workflow

Work progresses one scoped implementation issue at a time through Codex CLOUD, a reviewable PR, meaningful CI checks, independent review, and a normal PR merge. The linked GitHub account's issue comment mention was verified to start an actual cloud task. An original issue-body mention still needs observation before claiming support; do not duplicate dispatch if it already starts a task. Native cloud PR publication currently needs an orchestrator UI action.

The optional ready-label workflow bot was removed at the user's request. There is no persistent repository bot dispatcher, OpenAI API-key Actions executor, or personal-token setup. Ordinary GitHub Actions performs checks, not coding. The retained read-only PR check runs `node scripts/check-markdown-links.mjs` on every PR base.

## Start locally

Requirements: Docker Engine with Compose v2. Then run:

```bash
docker compose up --build --wait
```

Open <http://localhost:8080>. Development-only accounts are:

| Role | Username | Password |
|---|---|---|
| Operator | `operator` | `local-operator-password` |
| Officer | `officer` | `local-officer-password` |

These defaults only exist under Spring's `dev` profile. Do not enable that profile outside local/CI use; the default profile requires externally supplied database connection values and secure cookies. Startup refuses blank/the known local database password or insecure cookies outside `dev`. Reset local state deliberately with `docker compose down --volumes`; ordinary `docker compose down` and restarts retain database, sessions, and private file-volume data.

## Architecture and security

The browser uses one origin: nginx serves the React/Vite build and proxies `/api` to Spring Boot. Spring Security authenticates BCrypt hashes from PostgreSQL, rotates the session identifier on authentication, and stores server-side sessions through Spring Session JDBC. The official PostgreSQL session schema is applied once through Flyway rather than rerunning raw initialization on every restart. Login/logout require a freshly fetched cookie-to-header CSRF token, including after authentication rotates the session. Cookies are HttpOnly and SameSite=Lax; Secure is disabled only for labelled local HTTP. Backend role checks protect both workspace routes. Flyway owns application migrations, and the idempotent dev seed never updates an existing account.

PostgreSQL and private file storage use named volumes. The file volume is mounted only into the backend and has no public route; uploads are deliberately absent in T04.

## Development and checks

```bash
npm --prefix frontend ci
npm --prefix frontend run check
cd backend && ./mvnw verify
node scripts/check-markdown-links.mjs
git diff --check
docker compose up --build --wait && ./ci/smoke.sh
```

Frontend coverage is emitted at `frontend/coverage`; JaCoCo emits `backend/target/site/jacoco`. Measured locally after the review fixes, frontend coverage was 80.23% statements, 73.33% branches, and 85.89% lines; backend coverage was 82.14% lines. The gates are therefore set slightly below or at observed levels: frontend 75% statements, 70% branches, 75% functions, and 80% lines; backend 80% lines. These gates cover all application and authentication code. Generated shadcn source is not excluded, so the thresholds are an honest regression floor rather than a cosmetic percentage.

CI checks every pull request (including stacked targets) and pushes to `main`: **Frontend checks**, **Backend PostgreSQL checks**, **Dependency and secret scans**, and **Compose security and browser smoke**. Artifacts retain coverage for seven days and bounded Compose logs on failure. CI also runs npm advisory checks, verified no-license Gitleaks CLI scanning over full history, Trivy dependency scanning, high/critical scans of both explicitly named images, and Playwright operator/officer keyboard and responsive flows with screenshot evidence. CD, deployment destinations, rollback, production secret configuration, and ruleset changes are deferred.

## Version and source decisions

Pinned choices were checked against official documentation on 2026-10-03:

- Java 21 and Spring Boot 3.5.7 are a conservative supported line for the verified Java 21 cloud runtime. See [Spring Boot system requirements](https://docs.spring.io/spring-boot/system-requirements.html).
- PostgreSQL-backed sessions use Spring Session JDBC and its packaged vendor schema. See [Spring Session JDBC](https://docs.spring.io/spring-session/reference/configuration/jdbc.html).
- Vite 7.3.5 uses its documented Node 20.19+ floor; local/container/CI Node is pinned to 20.20.0. See [Vite getting started](https://vite.dev/guide/).
- React 19, Tailwind CSS 4, and genuine shadcn/ui Button, Input, Label, Card, and Alert source generated by the official CLI use its standard neutral black-theme tokens. See [shadcn Vite installation](https://ui.shadcn.com/docs/installation/vite) and [theme guidance](https://ui.shadcn.com/docs/theming).
- Flyway runs idempotent versioned database migrations. See [Spring Boot Flyway guidance](https://docs.spring.io/spring-boot/how-to/data-initialization.html#howto.data-initialization.migration-tool.flyway).

Dependency versions and npm's lockfile are committed; Maven's wrapper pins Maven 3.9.10 while Spring Boot manages compatible Spring dependencies.

## Known limits and next steps

No application form, signup, administration, upload, decision, notification, or correction workflow exists. Playwright browser automation runs against the real Compose stack in CI; local unit tests cover session restoration, both roles, logout, visible workspace failure, and retry recovery. HTTPS termination and deployment secrets require a selected production destination. Next, review T02 product rules before implementing T05 onward.

## AI Usage

Codex generated this T04 implementation from the issue prompt. It inspected the scope/spec/task documents, checked official Spring, Spring Session, Vite, and shadcn documentation, pinned dependencies/actions, and implemented thin auth/UI/Compose slices. Validation included frontend lint/type/build/behavior tests, Maven security tests, markdown links, diff hygiene, and the Docker workflow definition. Docker was unavailable in the cloud environment, so no local Compose/browser claim is made; the Docker-capable GitHub Actions job is the required real validation. Corrections made during review are recorded in Git history and CI results; no human-review evidence is claimed.
