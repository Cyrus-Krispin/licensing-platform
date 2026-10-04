# Plan: licensing workspace UI update

The user approved replacing the enclosing grey workspace card with a wider black-background interface, coloured labels, useful navigation, correct action placement, and vertically stacked desktop form fields. This extends the presentation work within issue #25 on the current feature branch.

Keep shadcn Base UI (`base-nova`), Geist, Lucide, and semantic theme tokens. Add official Badge, Textarea, Dropdown Menu, and Popover primitives as needed. Status colours have textual labels and consistent meanings: neutral draft, blue received/review, amber action required, green approved/complete, red rejected/error. Colours are semantic tokens with contrast checked in the browser.

## Ordered slices

1. **Workspace shell.** Extract signed-in chrome into a focused component. Remove the enclosing Card; add a full-width header with identity/sign-out, accessible workspace navigation and notification dropdown, and a black content area. Keep the editor mounted while the dropdown is open so navigation does not discard local edits. Sign-in stays focused.
2. **Status and record hierarchy.** Add a reusable status Badge, mobile wrapping record rows with readable identity/status/revision, and colour-coded requirement/issue states. Keep role-specific labels and immutable version/revision semantics.
3. **Application composition.** Use one column for fields and hours at every breakpoint. Add section anchors, visible save controls, grouped evidence, and a labelled submission/history destination with focus handling. Keep operator feedback first during corrections and preserve requested-target locks.
4. **Review composition.** Use multiline explanation controls, organised one-column snapshot summaries, quiet section dividers, and clearer notification/queue empty states. Repair officer feedback anchors without changing command permissions.
5. **Verification and PR.** Run frontend checks, backend verification, Markdown link checking, Compose with the existing local 8081 override, and browser checks for both roles at measured desktop/mobile widths. Review diff and preserve untracked LOCAL_HANDOFF.md. Commit/push only the current feature branch and open a draft PR covering its complete final diff.

## Acceptance criteria

- Signed-in work sits directly on the black page; navigation/account controls are above content and notifications appear in a bell dropdown.
- Status/requirements/feedback use consistent coloured labels with readable text; long record names/statuses remain readable on mobile.
- Desktop fields and opening-hour controls stack vertically. Sections have explicit navigation and clear primary actions.
- Opening/closing notifications preserves unsaved editor values. Opening submission visibly focuses its destination. Officer target links reach snapshot rows.
- Existing authentication, explicit save/conflict recovery, immutable uploads, simulation, strict fixed rounds, history, resolution, and final decisions continue to pass regression checks.

## Boundaries and risks

No workflow expansion, dependency unlock, completeness waiver, autosave, issuance, inspection, or backend/API redesign. Historical-view safeguards, sign-out/reload protection, URL routing, and final-decision confirmation identified in the research audit remain separate follow-up work; this PR focuses on the requested visual/navigation overhaul. Generated components increase coverage surface and must not reduce existing gates. The core workflow has already merged through PR #26; the final PR diff against main contains this UI update.

The user subsequently requested Create application naming and a bell dropdown with mark-read and Clear all controls. The small recipient-scoped notification deletion endpoint is authorised within this slice; no application/history deletion is exposed. Latest verification uses mocked browser notification data to preserve the locally reset database.

## Current priority slice

Address the user's three reported obstacles before broader audit work: unclear save-to-submission transition, evidence selection disappearing when the form resets after saving, and navigation failing to return to the list. Keep evidence outside the resettable field form, distinguish selected/unuploaded files from saved uploads, expose Review and submit near Save, and show saved answers before fresh declarations. Route workspace navigation to the role's list and protect unsaved operator edits/selections with an explicit discard dialog. Preserve submission concurrency guards, immutable uploads and fixed targeted corrections. Use regression and mocked browser tests without adding records to the user's database.

## Submission-readiness refinement

The user requested the final Submit/Resubmit action in one bottom row beside a quieter Save draft button. Keep the workflow panel and officer feedback above the editor, while rendering its declaration/actions in the footer. Synchronize the panel only from accepted local working revisions; retain explicit stale-server checks and original retry receipts. Clear local selections for evidence that becomes non-applicable without deleting retained uploads. Update README/scope to the delivered MVP and defer templates explicitly. Verify the complete correction-to-approval journey on disposable isolated Compose data, then remove that temporary stack and retain the single local 8081 instance.
