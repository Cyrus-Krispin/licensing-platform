# Agent guidance
Work only on the current feature branch; never merge or push `main`. Keep the active slice limited to its reviewed issue. T06–T08 are complete. The user expanded issue #25 for local core completion: retain immutable uploads and simulated processing; implement submission, fixed targeted correction/resubmission rounds, officer resolution/final decisions, history, and in-app notifications. Preserve strict alternation; no automatic dependent unlock or unaccepted completeness exception. Site/post-site workflows and issuance remain excluded.

Checks: `npm --prefix frontend ci && npm --prefix frontend run check`; `cd backend && ./mvnw verify`; `node scripts/check-markdown-links.mjs`; `docker compose up --build --wait` when Docker is available.
