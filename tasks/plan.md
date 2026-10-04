# Plan: licensing workspace UI update

The user approved replacing the enclosing grey workspace card with a wider black-background interface, coloured labels, useful navigation, correct action placement, and vertically stacked desktop form fields. This extends the presentation work within issue #25 on the current feature branch.

Keep shadcn Base UI (`base-nova`), Geist, Lucide, and semantic theme tokens. Add official Badge, Tabs, Textarea, and Dropdown Menu primitives as needed. Status colours have textual labels and consistent meanings: neutral draft, blue received/review, amber action required, green approved/complete, red rejected/error. Colours are semantic tokens with contrast checked in the browser.

## Ordered slices

1. **Workspace shell.** Extract signed-in chrome into a focused component. Remove the enclosing Card; add a full-width header with identity/sign-out, accessible workspace/notification tabs, and a black content area. Keep the editor mounted across tab changes so navigation does not discard local edits. Sign-in stays focused.
2. **Status and record hierarchy.** Add a reusable status Badge, mobile wrapping record rows with readable identity/status/revision, and colour-coded requirement/issue states. Keep role-specific labels and immutable version/revision semantics.
3. **Application composition.** Use one column for fields and hours at every breakpoint. Add section anchors, visible save controls, grouped evidence, and a labelled submission/history destination with focus handling. Keep operator feedback first during corrections and preserve requested-target locks.
4. **Review composition.** Use multiline explanation controls, organised one-column snapshot summaries, quiet section dividers, and clearer notification/queue empty states. Repair officer feedback anchors without changing command permissions.
5. **Verification and PR.** Run frontend checks, backend verification, Markdown link checking, Compose with the existing local 8081 override, and browser checks for both roles at measured desktop/mobile widths. Review diff and preserve untracked LOCAL_HANDOFF.md. Commit/push only the current feature branch and open a draft PR covering its complete final diff.

## Acceptance criteria

- Signed-in work sits directly on the black page; navigation/account controls are above content and notifications have their own view.
- Status/requirements/feedback use consistent coloured labels with readable text; long record names/statuses remain readable on mobile.
- Desktop fields and opening-hour controls stack vertically. Sections have explicit navigation and clear primary actions.
- Switching workspace/notifications preserves unsaved editor values. Opening submission visibly focuses its destination. Officer target links reach snapshot rows.
- Existing authentication, explicit save/conflict recovery, immutable uploads, simulation, strict fixed rounds, history, resolution, and final decisions continue to pass regression checks.

## Boundaries and risks

No workflow expansion, dependency unlock, completeness waiver, autosave, issuance, inspection, or backend/API redesign. Historical-view safeguards, unsaved exit confirmation, URL routing, and final-decision confirmation identified in the research audit remain separate follow-up work; this PR focuses on the requested visual/navigation overhaul. Generated components increase coverage surface and must not reduce existing gates. The core workflow has already merged through PR #26; the final PR diff against main contains this UI update.
