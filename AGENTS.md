# Agent guidance
Work only on the current feature branch; never merge or push `main`. Keep the active slice limited to its reviewed issue. T06 premises/evidence drafts are complete. For T07, extend only initial drafts with reviewed operations, saved progress, and declaration display; preserve later workflows and unrelated proposals.

Checks: `npm --prefix frontend ci && npm --prefix frontend run check`; `cd backend && ./mvnw verify`; `node scripts/check-markdown-links.mjs`; `docker compose up --build --wait` when Docker is available.
