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

Requirements: Docker Engine with Compose v2. The published development port binds only to `127.0.0.1`. Then run:

```bash
docker compose up --build --wait
```

Open <http://localhost:8080>. Development-only accounts are:

| Role | Username | Password |
|---|---|---|
| Operator | `operator` | `local-operator-password` |
| Officer | `officer` | `local-officer-password` |

These defaults only exist under Spring's `dev` profile. Do not enable that profile outside local/CI use; the default profile requires externally supplied database connection values and secure cookies. Startup refuses blank/the known local database password, insecure cookies, or persisted operator/officer hashes that still match either published local application password outside `dev`. Explicitly replaced BCrypt application-account hashes are allowed; no provisioning or account-management feature is introduced. Reset local state deliberately with `docker compose down --volumes`; ordinary `docker compose down` and restarts retain database, sessions, and private file-volume data.

## Architecture and security

The browser uses one origin: nginx serves the React/Vite build and proxies `/api` to Spring Boot. Spring Security authenticates BCrypt hashes from PostgreSQL, rotates the session identifier on authentication, and stores server-side sessions through Spring Session JDBC. The official PostgreSQL session schema is applied once through Flyway rather than relying on initializer error-tolerance on every restart. Independent original-branch Docker evidence showed that the earlier `initialize-schema: always` did tolerate existing tables and did not cause observed restart failure or data loss; Flyway ownership is retained as the clearer production-safe lifecycle. Login/logout require a freshly fetched cookie-to-header CSRF token, including after authentication rotates the session. Cookies are HttpOnly and SameSite=Lax; Secure is disabled only for labelled local HTTP. Backend role checks protect both workspace routes. Flyway owns application migrations, and the idempotent dev seed never updates an existing account.

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

The local backend command uses H2 in PostgreSQL compatibility mode and validates migrations/session/auth behavior at that seam; it is not proof of PostgreSQL compatibility. The **Backend PostgreSQL checks** CI job overrides that test datasource with a real PostgreSQL container. Current-branch PostgreSQL, Compose, and browser results remain pending publication and Actions execution.

Frontend coverage is emitted at `frontend/coverage`; JaCoCo emits `backend/target/site/jacoco`. Measured locally after the review fixes, frontend coverage was 94.18% statements, 97.77% branches, 86.20% functions, and 93.90% lines; backend coverage was 92.77% lines. The gates are therefore set slightly below or at observed levels: frontend 75% statements, 70% branches, 75% functions, and 80% lines; backend 80% lines. Focused success/auth/CSRF/error-path tests cover `api.ts` completely. The existing gates remain conservative regression floors and cover all application and authentication code. Generated shadcn source is not excluded, so the thresholds are an honest regression floor rather than a cosmetic percentage.

CI checks every pull request (including stacked targets) and pushes to `main`: **Frontend checks**, **Backend PostgreSQL checks**, **Dependency and secret scans**, and **Compose security and browser smoke**. Artifacts retain coverage and browser screenshots for seven days and bounded Compose logs on failure. CI also runs npm advisory checks, verified no-license Gitleaks CLI scanning over full history, Trivy source-manifest and packaged-backend-JAR dependency scanning, high/critical scans of both explicitly named images, and Playwright operator/officer keyboard and responsive flows with screenshot evidence. CD, deployment destinations, rollback, production secret configuration, and ruleset changes are deferred.

## Version and source decisions

Pinned choices were checked against official documentation on 2026-10-03:

- Java 21 and Spring Boot 3.5.16 are a supported compatible 3.5 patch line for the verified Java 21 cloud runtime. See [Spring Boot system requirements](https://docs.spring.io/spring-boot/3.5/system-requirements.html).
- PostgreSQL JDBC is explicitly pinned to 42.7.12, overriding the 3.5.16 BOM’s 42.7.11 to include fixes for both CI-reported high advisories. See [PostgreSQL JDBC 42.7.12 in Maven Central](https://repo.maven.apache.org/maven2/org/postgresql/postgresql/42.7.12/). PostgreSQL-backed sessions use Spring Session JDBC and its packaged vendor schema. See [Spring Session JDBC](https://docs.spring.io/spring-session/reference/configuration/jdbc.html).
- Node 24.21.0 is pinned for local verification, the frontend image, and CI because Node 20 is end-of-life; Node 24 is the current LTS line. See [Node.js releases](https://nodejs.org/en/about/previous-releases). Vite 7.3.5 is compatible with the selected runtime. See [Vite getting started](https://vite.dev/guide/).
- React 19, Tailwind CSS 4, and genuine shadcn/ui Button, Input, Label, Card, and Alert source generated by the official CLI use its standard neutral black-theme tokens. See [shadcn Vite installation](https://ui.shadcn.com/docs/installation/vite) and [theme guidance](https://ui.shadcn.com/docs/theming).
- Flyway runs idempotent versioned database migrations. See [Spring Boot Flyway guidance](https://docs.spring.io/spring-boot/how-to/data-initialization.html#howto.data-initialization.migration-tool.flyway).

Dependency versions and npm's lockfile are committed; Maven's wrapper pins Maven 3.9.10 while Spring Boot manages compatible Spring dependencies.

## Actual CI repair evidence

Published run `37152700694` established two current-head failures rather than a passing Compose claim. Gitleaks passed, while Trivy reported four high Maven findings: two in PostgreSQL JDBC 42.7.8 and two in Spring Boot Actuator 3.5.7. This repair updates the supported Spring Boot 3.5 line to 3.5.16 and PostgreSQL JDBC to 42.7.12, verifies the resolved dependency tree and packaged JAR contents locally, and retains manifest, packaged-JAR, and both-image scans. The same run’s Compose job stopped at missing-CSRF login because servlet error dispatch changed the intended 403 to 401. Security now emits a direct 403 access-denied response, permits safe error dispatch, and a random-port embedded Tomcat HTTP test verifies missing-CSRF 403, invalid-credential 401, anonymous 401, cross-role 403, fresh-CSRF logout, and safe error bodies. Current repaired Docker/image/browser results remain pending the next published Actions run.

## Independent Docker evidence supplied during review

The user supplied results from an independent run of the original Compose revision. Backend and PostgreSQL became healthy. Real cookie-jar requests returned CSRF `200`, login `204`, and current-principal `200`; reusing the pre-login CSRF token made logout return `403`, while fetching the rotated token made logout return `204` and the subsequent principal request return `401`. An officer session using the same session cookie returned `200` after an ordinary backend restart without re-login. The same run found the frontend container unhealthy because Alpine resolved `localhost` to IPv6 while nginx listened on IPv4 (`127.0.0.1/health` succeeded), and found the existing private volume root-owned and unwritable by application uid 10001. The current patch uses the verified IPv4 loopback health target and an entrypoint that repairs storage ownership before dropping to uid 10001; CI tests writability and non-public exposure. This evidence confirms the repaired client CSRF lifecycle and persistent JDBC session expectation. It does **not** establish that the corrected frontend health check, private-volume ownership, current images, Playwright flow, or current CI workflow have passed; those remain pending on a Docker-capable runner.

## Deferred CI roadmap

SonarQube integration for Java and TypeScript/React static analysis and a quality gate is deferred to a separate existing backlog/CI-roadmap task. That future task should consume the actual JaCoCo XML and frontend LCOV outputs. Selection between an officially supported SonarQube Server or Cloud setup depends on the available account, tooling, and cost decision. This slice installs no Sonar scanner, creates no account, requests no secret, and makes no live-check or free-plan claim.

## Known limits and next steps

No application form, signup, administration, upload, decision, notification, or correction workflow exists. Playwright browser automation runs against the real Compose stack in CI; local unit tests cover session restoration, both roles, logout, visible workspace failure, and retry recovery. The locked Vite toolchain currently reports one low-severity Windows-only esbuild development-server advisory; the supported semver range has no patched release, so CI keeps it visible and fails on high/critical findings rather than forcing an incompatible override. HTTPS termination and deployment secrets require a selected production destination. Next, review T02 product rules before implementing T05 onward.

## AI Usage

Codex generated this T04 implementation from the issue prompt. It inspected the scope/spec/task documents, checked official Spring, Spring Session, Vite, and shadcn documentation, pinned dependencies/actions, and implemented thin auth/UI/Compose slices. Validation included frontend lint/type/build/behavior tests, Maven security tests, markdown links, diff hygiene, and the Docker workflow definition. Docker was unavailable in the cloud environment, so no local Compose/browser claim is made; the Docker-capable GitHub Actions job is the required real validation. Corrections made during review are recorded in Git history and CI results; no human-review evidence is claimed.
