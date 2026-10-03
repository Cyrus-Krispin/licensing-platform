# Agent guidance
Work only on the current feature branch; never merge or push `main`. Keep this slice limited to authentication and role workspaces (T04), preserving unresolved T02 proposals.

Checks: `npm --prefix frontend ci && npm --prefix frontend run check`; `cd backend && ./mvnw verify`; `node scripts/check-markdown-links.mjs`; `docker compose up --build --wait` when Docker is available.
