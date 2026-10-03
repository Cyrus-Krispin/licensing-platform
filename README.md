# Regulatory and Licensing Platform

T04 supplies one real session-authenticated entry point for the fictional licensing product. It intentionally stops at the operator and officer workspace shells; application and correction rules remain unresolved T02 work.

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

These defaults only exist under Spring's `dev` profile. Do not enable that profile outside local/CI use; supply deployment-managed database credentials and `SECURE_COOKIES=true` behind HTTPS. Reset local state deliberately with `docker compose down --volumes`; ordinary `docker compose down` and restarts retain database, sessions, and private file-volume data.

## Architecture and security

The browser uses one origin: nginx serves the React/Vite build and proxies `/api` to Spring Boot. Spring Security authenticates BCrypt hashes from PostgreSQL, rotates the session identifier on authentication, and stores server-side sessions through Spring Session JDBC. Login/logout require the cookie-to-header CSRF token. Cookies are HttpOnly and SameSite=Lax; Secure is disabled only for labelled local HTTP. Backend role checks protect both workspace routes. Flyway owns application migrations, and the idempotent dev seed never updates an existing account.

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

Frontend coverage is emitted at `frontend/coverage`; JaCoCo emits `backend/target/site/jacoco`. This first thin slice records coverage without a numeric gate: a threshold should be based on initial reports after CI runs, then reviewed. Generated shadcn component code may later be excluded with justification; authentication/business code must not be excluded.

CI checks every pull request (including stacked targets) and pushes to `main`: **Frontend checks**, **Backend PostgreSQL checks**, **Secret scan**, and **Compose security smoke**. Artifacts retain coverage for seven days and bounded Compose logs on failure. CI also runs npm advisory checks and a high/critical backend-image Trivy scan. CD, deployment destinations, rollback, production secret configuration, and ruleset changes are deferred.

## Version and source decisions

Pinned choices were checked against official documentation on 2026-10-03:

- Java 21 and Spring Boot 3.5.7 are a conservative supported line for the verified Java 21 cloud runtime. See [Spring Boot system requirements](https://docs.spring.io/spring-boot/system-requirements.html).
- PostgreSQL-backed sessions use Spring Session JDBC and its packaged vendor schema. See [Spring Session JDBC](https://docs.spring.io/spring-session/reference/configuration/jdbc.html).
- Vite 7.3.5 uses its documented Node 20.19+ floor; local/container/CI Node is pinned to 20.20.0. See [Vite getting started](https://vite.dev/guide/).
- React 19 and semantic local shadcn-style Button/Input source components use standard neutral dark tokens. See [shadcn Vite installation](https://ui.shadcn.com/docs/installation/vite) and [theme guidance](https://ui.shadcn.com/docs/theming).
- Flyway runs idempotent versioned database migrations. See [Spring Boot Flyway guidance](https://docs.spring.io/spring-boot/how-to/data-initialization.html#howto.data-initialization.migration-tool.flyway).

Dependency versions and npm's lockfile are committed; Maven's wrapper pins Maven 3.9.10 while Spring Boot manages compatible Spring dependencies.

## Known limits and next steps

No application form, signup, administration, upload, decision, notification, or correction workflow exists. Browser automation is not yet included; CI exercises the real same-origin API with Compose and unit-level UI loading/error behavior. HTTPS termination and deployment secrets require a selected production destination. Next, review T02 product rules before implementing T05 onward.

## AI Usage

Codex generated this T04 implementation from the issue prompt. It inspected the scope/spec/task documents, checked official Spring, Spring Session, Vite, and shadcn documentation, pinned dependencies/actions, and implemented thin auth/UI/Compose slices. Validation included frontend lint/type/build/behavior tests, Maven security tests, markdown links, diff hygiene, and the Docker workflow definition. Docker was unavailable in the cloud environment, so no local Compose/browser claim is made; the Docker-capable GitHub Actions job is the required real validation. Corrections made during review are recorded in Git history and CI results; no human-review evidence is claimed.
