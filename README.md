# Licensing Platform

A Regulatory and Licensing Platform MVP for fixed-premises cafés and restaurants in a fictional jurisdiction. Selected scope covers pre-site submission, officer review, targeted corrections and resubmissions, and final approval/rejection.

## Planning documents

- [MVP scope](docs/SCOPE.md)
- [Product specification](docs/SPEC.md)
- [Implementation backlog](docs/TASKS.md)

The full scope is maintained in `docs/`; the root [SCOPE.md](SCOPE.md) is an assessment entry point.

## Codex cloud workflow

Work progresses one scoped implementation issue at a time through Codex CLOUD, a reviewable PR, meaningful CI checks, independent verification, and a normal PR merge. A linked-human `@codex` issue comment on issue #4 started Codex CLOUD task `task_e_6ac15e7122c8832e843307e6faac0e56`; that task used native Create to publish draft PR #8 and native Update branch to publish its follow-up repairs. This proves that exact comment workflow, not issue-body mentions, labels, or arbitrary automation. The user authorizes autonomous routine implementation and verification within each accepted slice, without renewed permission questions for routine technical choices.

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

The local backend command uses H2 in PostgreSQL compatibility mode and validates portable migration/session/auth/draft behavior at that seam; it is not PostgreSQL concurrency evidence. The **Backend PostgreSQL checks** CI job overrides that datasource with a real PostgreSQL container and runs the controlled simultaneous-create test against PostgreSQL advisory transaction locks. PostgreSQL, Compose, and browser evidence for published commit `34000145922a19eb29a925bd61aa52a750cee804` is attributed below alongside its failed scanner evidence; exact-head Docker and scanner results for the subsequent dependency/image repair remain pending publication and execution.

Frontend coverage is emitted at `frontend/coverage`; JaCoCo emits `backend/target/site/jacoco`. The 16 frontend tests measure 89.44% statements, 81.90% branches, 80.76% functions, and 91.15% lines. Local Maven executes 17 backend tests with the PostgreSQL-only concurrent-create case explicitly skipped under H2; the remaining portable HTTP, persistence, validation, ownership, and safety tests measure 86.89% lines and 67.56% branches. CI runs all 17 against real PostgreSQL. The gates are therefore set slightly below or at observed levels: frontend 75% statements, 70% branches, 75% functions, and 80% lines; backend 80% lines. The existing gates remain conservative regression floors and cover all application and authentication code. Generated shadcn source is not excluded, so the thresholds are an honest regression floor rather than a cosmetic percentage.

Five required checks protect `main`: **Frontend checks**, **Backend PostgreSQL checks**, **Dependency and secret scans**, **Compose security and browser smoke**, and the read-only **Automation tests and documentation** check. Artifacts retain coverage and browser screenshots for seven days and bounded Compose logs on failure. CI also runs npm advisory checks, verified no-license Gitleaks CLI scanning over full history, a bounded Trivy source-manifest scan, Trivy `rootfs` scanning plus an asserted Java-package inventory for the packaged backend JAR, independent high/critical scans of both explicitly named images, and Playwright operator/officer keyboard and responsive flows with screenshot evidence. The source-manifest scan cannot establish packaged Java transitives; the rootfs inventory gate prevents an empty packaged-JAR scan from passing. These are the saved required-check contexts; this work does not alter repository settings. CD, deployment destinations, rollback, and production secret configuration remain separately deferred.

## Version and source decisions

Pinned choices were checked against official documentation on 2026-10-03:

- Java 21 and Spring Boot 3.5.16 are a supported compatible 3.5 patch line for the verified Java 21 cloud runtime. See [Spring Boot system requirements](https://docs.spring.io/spring-boot/3.5/system-requirements.html).
- PostgreSQL JDBC is explicitly pinned to 42.7.12, overriding the 3.5.16 BOM’s 42.7.11 to include fixes for both CI-reported high advisories. Jackson uses the coherent 2.21.7 BOM, and embedded Tomcat uses compatible patch 10.1.59 because the reported fixes require 10.1.58 or later and 10.1.58 is not published in Maven Central. See [PostgreSQL JDBC 42.7.12](https://repo.maven.apache.org/maven2/org/postgresql/postgresql/42.7.12/), [Jackson BOM 2.21.7](https://repo.maven.apache.org/maven2/com/fasterxml/jackson/jackson-bom/2.21.7/), and [Tomcat embed 10.1.59](https://repo.maven.apache.org/maven2/org/apache/tomcat/embed/tomcat-embed-core/10.1.59/) in Maven Central. PostgreSQL-backed sessions use Spring Session JDBC and its packaged vendor schema. See [Spring Session JDBC](https://docs.spring.io/spring-session/reference/configuration/jdbc.html).
- Node 24.21.0 is pinned for local verification, the frontend image, and CI because Node 20 is end-of-life; Node 24 is the current LTS line. See [Node.js releases](https://nodejs.org/en/about/previous-releases). Vite 7.3.5 is compatible with the selected runtime. See [Vite getting started](https://vite.dev/guide/).
- React 19, Tailwind CSS 4, and genuine shadcn/ui Button, Input, Label, Card, and Alert source generated by the official CLI use its standard neutral black-theme tokens. The runtime image pins the official `nginx:1.30.5-alpine3.24` manifest digest and applies only the vendor-published `libexpat` and `pcre2` security updates. See [shadcn Vite installation](https://ui.shadcn.com/docs/installation/vite), [theme guidance](https://ui.shadcn.com/docs/theming), and the [official nginx image](https://hub.docker.com/_/nginx).
- Flyway runs idempotent versioned database migrations. See [Spring Boot Flyway guidance](https://docs.spring.io/spring-boot/how-to/data-initialization.html#howto.data-initialization.migration-tool.flyway).

Dependency versions and npm's lockfile are committed; Maven's wrapper pins Maven 3.9.10 while Spring Boot manages compatible Spring dependencies.

## Actual CI and independent repair evidence

Published run `37152700694` first exposed four high Maven findings and a real missing-CSRF status regression. The Spring Boot/PostgreSQL and access-denied repairs on `34000145922a19eb29a925bd61aa52a750cee804` corrected those specific failures. Run `37153551330` then showed that the packaged-JAR filesystem scan was a false green (`0` language files and no supported target) and that the backend image still contained eight high/critical findings in Jackson 2.21.4 and Tomcat 10.1.55. The same run's backend-image failure skipped its frontend-image step. An independent Trivy 0.75 scan of the full frontend image found 39 high and two critical Alpine findings. Complete CI therefore remains failed, not green.

This repair upgrades the coherent Jackson BOM to 2.21.7 and embedded Tomcat to the published compatible 10.1.59 patch; local Maven resolution, the packaged archive, all 12 auth/safety/real-HTTP tests, and the coverage gate verify those versions. CI now stages the packaged JAR under a rootfs, emits a list-all-packages JSON inventory, requires nonzero Java packages plus the expected Spring Boot, PostgreSQL, Jackson, and Tomcat package URLs/versions, and fails on any high/critical result. Source-manifest scanning remains only a declared-manifest check. Backend and frontend image scans emit inventories and the frontend scan runs even when the backend scan fails.

The frontend runtime now pins the official `nginx:1.30.5-alpine3.24` digest and narrowly upgrades `libexpat` and `pcre2`. The orchestrator's throwaway-base probe found zero high/critical issues after those two vendor patches, but that is candidate evidence only. The full application images, packaged-JAR rootfs inventory, and vulnerability results for this new commit remain pending exact-head CI/orchestrator execution.

## Independently executed Docker and browser evidence

The orchestrator/root—not a user report or human review—executed the original Compose revision. Backend and PostgreSQL became healthy. Real cookie-jar requests returned CSRF `200`, login `204`, and current-principal `200`; reusing the pre-login CSRF token made logout return `403`, while fetching the rotated token made logout return `204` and the subsequent principal request return `401`. An officer session using the same session cookie returned `200` after an ordinary backend restart without re-login. That original run also exposed the IPv6 frontend-health and private-volume ownership defects later repaired.

The orchestrator independently built published commit `cb574d33279b1f4ba792831810f7570cdb9b2418` with all three Compose services healthy. Its IPv4 readiness check and private-volume write probe as non-root uid 10001 passed. Browser checks covered both roles, login/logout, invalid-password recovery, keyboard operation, a 390px responsive viewport, black official shadcn surfaces, and no console errors. That revision was **not** green: real HTTP login without CSRF returned `401` instead of `403`, so the smoke script failed, and Trivy failed on four high-severity findings.

For published commit `34000145922a19eb29a925bd61aa52a750cee804`, the orchestrator's full Compose smoke passed, including the repaired real missing-CSRF `403`; both real browser role flows, login/logout, wrong-password recovery, and no-console-error checks passed, and the CI Playwright run reported two passing tests. Complete verification still failed for the backend image, the packaged-JAR scan was empty rather than meaningful, and the independently scanned frontend image had 41 high/critical findings. These successes establish the Compose/browser behavior of that exact revision only and do not establish security-scan success for this subsequent dependency/image/CI repair.

## Deferred CI roadmap

SonarQube integration is the separate deferred **CI-D1** checklist in [the implementation backlog](docs/TASKS.md#ci-d1--add-sonarqube-static-analysis-and-quality-gate--deferred). It covers the future supported Server-versus-Cloud decision, Java and TypeScript/React analysis, actual JaCoCo XML and LCOV imports, a reviewed quality gate, and account/tool/cost and least-privilege secret decisions. This slice installs no scanner, creates no account, requests no secret, performs no live Sonar check, and makes no free-plan claim.

## Known limits and next steps

Operators can create, list, reopen, and explicitly save incomplete business/applicant drafts. Saves are owner-scoped, validate supplied fields atomically, and require the displayed revision; a stale save retains browser input and directs the operator to reload. Creation retries are actor-scoped through `Idempotency-Key`. Officers cannot access these endpoints. No premises, operations, upload, submission, administration, decision, notification, or correction workflow exists. Playwright browser automation runs against the real Compose stack in CI. The locked Vite toolchain currently reports one low-severity Windows-only esbuild development-server advisory; CI keeps it visible and fails on high/critical findings. HTTPS termination and deployment secrets require a selected production destination.

## AI Usage

Codex generated the T04 foundation and this T05 owned-draft slice from their reviewed issue prompts. It inspected the scope/spec/task documents, checked official Spring, Spring Session, Vite, and shadcn documentation, pinned dependencies/actions, and implemented thin auth/UI/Compose slices. Validation included frontend lint/type/build/behavior tests, Maven security tests, markdown links, diff hygiene, and the Docker workflow definition. Docker was unavailable in the cloud environment, so no local Compose/browser claim is made; the Docker-capable GitHub Actions job is the required real validation. Corrections made during review are recorded in Git history, CI results, and explicitly attributed orchestrator/root checks; no user-supplied or human-review evidence is claimed.
