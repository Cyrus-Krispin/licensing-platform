# Agent guidance
Work only on the current feature branch; never merge or push `main`. Keep the active slice limited to its reviewed issue. T05 owned business/applicant drafts are complete. For T06, extend only those initial drafts with reviewed premises fields and stable conditional evidence requests; preserve all unrelated T02 proposals and later workflows.

Checks: `npm --prefix frontend ci && npm --prefix frontend run check`; `cd backend && ./mvnw verify`; `node scripts/check-markdown-links.mjs`; `docker compose up --build --wait` when Docker is available.
