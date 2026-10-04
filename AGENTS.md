# Agent guidance
Work only on the current feature branch; never merge or push `main`. Keep the active slice limited to its reviewed issue. T06 premises/evidence drafts and T07 operations/progress are complete. For T08, extend only initial editable drafts with reviewed private uploads, retrieval, replacement retention, saved progress, and recovery; preserve T09 processing, T10 submission/officer access, and all later workflows.

Checks: `npm --prefix frontend ci && npm --prefix frontend run check`; `cd backend && ./mvnw verify`; `node scripts/check-markdown-links.mjs`; `docker compose up --build --wait` when Docker is available.
