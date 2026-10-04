# Regulatory and Licensing Platform — Implementation Backlog

## Authority and execution rules

This backlog derives from the current [SCOPE.md](SCOPE.md) and [SPEC.md](SPEC.md) in this documentation folder. The user authorizes one scoped issue at a time for autonomous routine implementation and verification through Codex CLOUD; agents do not need repeated permission questions for already accepted slices or routine technical choices. T04 foundation implementation is in draft PR #8; later application slices remain unstarted. Scope requirements remain accepted, while specification items explicitly marked proposed remain proposals until accepted through the decision tasks below.

**Accepted contribution rule:** main receives changes only through pull requests; agents work on branches (default prefix `feature/`) and must not commit directly on or push directly to main. **GitHub enforcement is verified:** `Cyrus-Krispin/licensing-platform` is public, and main has an active PR-only ruleset with no bypasses for admins, agents, or apps. The separate “Require pull requests for licensing platform main” chat confirmed API and saved-settings readback. No required approvals or CI checks were added; PR-only enforcement does not establish those review/validation gates. Required-check configuration is planned only after the exact check names have run green on GitHub. This backlog does not configure repository rules.

Apply narrow end-to-end slices, observable acceptance criteria, and explicit blocking edges. This file remains the planning backlog; the user authorizes dispatch of one reviewed issue at a time through the verified linked-human GitHub comment mention workflow. Do not create extra issues, parallel slices, labels, bots, or trigger configuration from this document alone.

Product boundary: fictional fixed-premises cafés/restaurants; selected UC1/2 pre-site submission, contextual **individual field/document** corrections, unlimited resubmission/history, officer-confirmed resolution, document-based approval, and final rejection. Preserve exactly one seeded local operator and officer, real Spring Security authentication and backend authorization, React/TypeScript/Vite, Spring Boot, PostgreSQL metadata/records, private immutable files in a persistent Docker volume, one monorepo, and separate Docker containers through Compose. Notifications are persistent in-app only. Verification status is explicitly simulated; AI warnings/results/flags remain deferred. Site/post-site states/workflows, separate approval routing, issuance/certificates, reopening/appeals, signup/admin, and email are excluded. **Do not claim full UC2 or all-original-state compliance.**

## Proposed order and direct blockers

Only direct blockers are listed; their ancestors also apply. Complete blockers before starting a task. A task is complete only when its acceptance criteria and relevant verification evidence are satisfied. Optional-task skip decisions must be recorded explicitly, not silently treated as completed implementation.

| Task | Title | Blocked by | What it delivers |
| --- | --- | --- | --- |
| T01 | Review technical defaults and development workflow | None | Reviewed implementation choices and skill/test approach |
| T02 | Review detailed product rules | None | Accepted or amended proposal baseline for dependent slices |
| T03 | Establish feasibility of GitHub-to-Codex dispatch | None | **Complete:** verified linked-human comment mention → cloud task → native draft PR/update |
| T04 | Start Docker product and sign in as either role | T01 | Real two-account login through the running product |
| T05 | Save and recover business/applicant drafts | T04, T02 | Owned application draft persisted across sessions |
| T06 | Complete premises and conditional requirements | T05 | Tenure/unit rules and correct evidence requests |
| T07 | Complete operations, declarations, and progress | T06 | Complete guided form with server-backed completion |
| T08 | Upload and privately retrieve required evidence | T06 | Persistent validated files and replacements through the product |
| T09 | Display simulated document-processing status | T08 | Basic mock status updating without page reload |
| T10 | Submit an immutable application for officer review | T07, T08 | Snapshot, received queue/detail, and persistent operator notification |
| T11 | Review and record final approval/rejection | T10 | Document-based final decisions, mapped status, retained history |
| T12 | Complete a field correction and review cycle | T11 | Targeted field feedback, resubmission, and officer resolution |
| T13 | Correct documents and provide additional evidence | T12 | Document-only permissions, replacements, missing/additional requests |
| T14 | Apply comment templates to correction requests | T13 | Reusable contextual comments without template administration |
| T15 | Compare and browse complete submission history | T13 | Full field/file comparisons and retained issue/audit history |
| T16 | Handle explicitly requested dependencies mid-round | T13 | **EXCLUDED / skipped:** fixed alternating rounds prohibit mid-round additions |
| T17 | Recover safely from retries, races, and partial failures | T13 | Proven recovery across complete product mutation flows |
| T18 | Verify and package the scoped product | T09, T14, T15, T17 | Reproducible acceptance evidence and assessment documentation |

T03 is complete: issue #4’s linked-human `@codex` comment launched Codex CLOUD task `task_e_6ac15e7122c8832e843307e6faac0e56`, which used native Create draft PR and repeated native Update branch publication on PR #8. The optional Actions dispatcher bot was removed and is neither accepted nor part of this proof. T01/T02/T03 are planning/feasibility tasks; T17/T18 are cross-flow verification tasks. The other tasks are vertical product slices, each including necessary persistence, API, UI, and behavioural checks. No separate “all schema,” “all backend,” or “all frontend” phase is intended.

## Common completion standard

**Accepted UI constraint for every user-facing slice:** use existing shadcn/ui components and official patterns with a black-background dark theme and established theme tokens, closely matching the shadcn website's look and feel. Limit custom styling to necessary layout/composition; avoid bespoke widgets and visual redesign. Required licensing workflow/business logic remains necessary; no marketing-site clone is requested. Verify component/token consistency alongside keyboard/error/recovery behaviour.

For each product slice, build the narrow behaviour through the relevant frontend, backend, database/file storage, and tests. Enforce roles, ownership, validation, safe errors, and editing state from its first usable implementation. New mutations must carry the agreed concurrency/retry protections; T17 deepens fault coverage rather than postponing correctness until the end. New transitions must retain audit evidence and persistent in-app notifications where required. Do not add temporary credential bypasses, mutable submitted files, or unguarded APIs to get a slice working.

Verify behaviour at the highest useful seam: API/database integration for rules and persistence, plus a browser check of the slice's user outcome. Use focused unit checks only where validation/diff/progress boundaries justify them. Update relevant setup/limitations and record meaningful AI prompts, review, corrections, and discarded output as work proceeds. No arbitrary performance targets, deadlines, or unselected libraries are imposed here.

## T01 — Review technical defaults and development workflow

**Blocked by:** None. **Kind:** decision/planning. **References:** NFR-01, NFR-03/04/05/07; SPEC API, error, testing, and open-decision sections.

**Deliver:** a recorded implementation baseline, preserving the accepted stack.

- [ ] Confirm supported runtime/dependency versions and choose migration, API documentation, and test tooling with reasons; do not silently introduce a different stack.
- [ ] Apply the accepted shadcn/ui component/dark-theme direction to frontend defaults using official guidance; choose compatible setup details without reopening the accepted visual constraint or inventing bespoke widgets.
- [ ] Review proposed session cookies/CSRF, same-origin API proxy, session restart expectations, password encoder, error envelope, concurrency revision/idempotency rules, and upload recovery contract.
- [ ] Confirm the intended installed development skill set and review/test expectations. Identify applicable instructions before code begins.
- [ ] Record accepted/amended choices and any remaining narrowly scoped gates. Separate Docker/local credential policy from deployment policy.

**Validation:** read-only repository/tool/documentation inspection and consistency review; no application implementation or external setup. Any later spec amendment requires authorization for that amendment.

## T02 — Review detailed product rules

**Blocked by:** None. **Kind:** decision/planning. **References:** FR-03/04/05/06/08/09/10/12/14; SPEC proposal markers.

**Deliver:** one coherent reviewed rules package for the product slices.

- [ ] Accept/amend proposed field names/enums/formats/limits, unit applicability, daily hours/opening-date treatment, required evidence, byte interpretation of 10 MB, and structural upload validation.
- [ ] Accept/amend scoped transitions/start-review action, editing locks, declaration renewal, active-issue responses, resolution/approval guards, and progress computation.
- [ ] Review mock processing states/gating/retry, notification read state, templates, and the screen-flow defaults; preserve the no-AI-flags and in-app-only decisions.
- [x] Record the accepted strict fixed alternating-round rule and exclude T16 mid-round additions; never infer dependent-field unlocking.
- [ ] Review the narrow proposed correction-resubmit completeness exception for a newly mandatory but locked dependent target. This does not reopen T16 or permit initial/final incompleteness.
- [ ] Confirm a clearly identified product display timezone. Record decisions without reviving site/post-site states, approval routing, or reopening.

**Validation:** walk initial submission, correction, resubmission, resolution, and final outcome examples against the reviewed rules. Questions may be relayed one at a time; no implementation is required to complete this review.

## T03 — Establish feasibility of GitHub-to-Codex dispatch — COMPLETE

**Blocked by:** None. **Kind:** feasibility. **References:** verified issue #4 / cloud task / draft PR #8 evidence.

**Verified result:** a linked human GitHub issue-comment mention (`@codex`) on issue #4 started Codex CLOUD task `task_e_6ac15e7122c8832e843307e6faac0e56`. The task received repository context, implemented and tested T04, used native Create to publish draft PR #8, and used native Update branch to publish subsequent repairs to the same branch. This proves that specific linked-human comment workflow; it does not prove that issue-body mentions, labels, or arbitrary automation dispatch Codex.

- [x] Verify the public repository, main PR-only ruleset, cloud repository access, branch workflow, and native draft-PR publication path.
- [x] Observe one real issue-comment mention → Codex CLOUD task → native draft PR result.
- [x] Observe native Update branch publication of follow-up commits to the same PR.
- [x] Separate ordinary GitHub Actions verification from cloud coding; Actions does not run Codex or require an OpenAI key.
- [x] Remove the optional Actions dispatcher bot; do not restore it or cite it as accepted/proven dispatch.
- [x] Record Docker as unavailable in Codex cloud and use an ordinary Docker-capable GitHub runner plus independently attributed orchestrator evidence without relabelling either as cloud Docker execution.

**Operating rule:** the user authorizes one reviewed issue at a time with autonomous routine implementation and verification. Do not ask new permission questions for an accepted slice’s routine technical choices. Dispatch, review, merge, deployment, and repository rules remain distinct: no merge, auto-merge, deployment, or ruleset change follows from this proof.

**Validation evidence:** issue #4, task `task_e_6ac15e7122c8832e843307e6faac0e56`, and draft PR #8. Preserve exact limitations rather than generalizing the verified trigger.

## T04 — Start Docker product and sign in as either role

**Blocked by:** T01. **References:** FR-01; NFR-01/02/03/04/05/06.

**Deliver:** both users reach their role workspace through real authentication in a clean Docker setup.

- [ ] Separate frontend/backend/PostgreSQL containers start through documented Compose setup; persistent volumes and schema initialization are in place.
- [ ] Seed exactly one local operator and officer with password hashes; restart/re-run setup without duplicate users or erasing data. Local defaults are explicitly development-only.
- [ ] Correct login reaches the right workspace; incorrect login and unauthorized/forbidden API calls fail safely; logout ends access. No signup/admin UI or hardcoded runtime comparison.
- [ ] Apply the agreed session/CSRF policy and keyboard-accessible login. No application form is required in this slice.
- [ ] Build login/workspace surfaces from existing shadcn/ui components and the accepted black-background dark-theme tokens; establish composition that subsequent product slices reuse.

**Validation:** clean-volume Docker smoke run, both browser logins/logout, backend auth/session negative checks, credential-storage inspection, and account persistence after restart. Extra identities are isolated test fixtures only.

## T05 — Save and recover business/applicant drafts

**Blocked by:** T04, T02. **References:** FR-01/02; NFR-02/03/05/06.

**Deliver:** an operator creates an owned application and saves the business/applicant portions of a working draft.

- [x] Draft creation/list/detail and field saves persist the agreed identity/contact schema, including optional trading name and representative role.
- [x] Incomplete drafts are saveable; invalid supplied values have linked errors and preserve other saved/recoverable values. Contact email does not alter login identity or introduce email notifications.
- [x] Sign out/in and reload recover saved data. Officers cannot see unsubmitted drafts; other test owners cannot access them.
- [x] Draft saves do not create immutable submission versions. Expected revisions prevent competing saves from overwriting each other.

T05 accepts only the business/applicant validation table as routine defaults. Creation uses an actor-scoped idempotency key, PATCH omission leaves values unchanged, explicit null clears an optional or incomplete value, and stale saves return conflict guidance without clearing client input. Representative authorization evidence remains T06 work; all other proposal markers, including the correction-completeness exception, remain unresolved.

**Validation:** browser save/reopen, API ownership/role and draft-validation boundaries, and competing-save conflict check.

## T06 — Complete premises and conditional requirements

**Blocked by:** T05. **References:** FR-02/03/09; NFR-05/06.

**Deliver:** the draft records premises and shows the correct applicable evidence requests.

- [x] Address, optional premises name, conditional unit, and tenure follow reviewed rules.
- [x] Registration/layout/food-use permission requests exist for every draft; lease/ownership and representative authorization requirements follow current inputs.
- [x] Initial-draft changes recalculate requirements without deleting retained data or existing document records. Show why a conditional request is needed.
- [x] Persist request identities so later feedback and submission versions can link to individual document requests.

**Validation:** browser tenure/unit/representative changes and API requirement calculations. File bytes/upload UI are delivered by T08, not this task.

T06 keeps incomplete premises values saveable, validates explicit values and the resulting unit combination atomically, and recalculates all six retained request records in the revision-checked save transaction. The product distinguishes required, known-not-required, and missing-input conditions without claiming uploads, evidence success, progress, or submission readiness. H2 provides the labelled portable local check; the required PostgreSQL CI job verifies migrations and races against PostgreSQL, while Compose/Playwright verifies persisted product recovery and conflict safety.

## T07 — Complete operations, declarations, and progress

**Blocked by:** T06. **References:** FR-02/03/06; NFR-05/06.

**Deliver:** the operator can complete all form sections and understand remaining submission requirements.

- [x] Café/restaurant, preparation activities, service modes, seven daily hour entries, and opening date follow reviewed rules.
- [x] Display accuracy/authority confirmation and stable unmet-item navigation without capturing declarations before submission.
- [x] Progress uses the reviewed server-backed formula and current applicable document readiness. Optional/inapplicable inputs and simulated status do not affect required completion.
- [x] The form remains keyboard-operable and saved data survives invalid inputs/network failures. No submission action is introduced.

T07 accepts the routine initial-draft operations and progress defaults. PATCH omission retains values, explicit null clears nullable business type/opening date, empty arrays/maps clear sets/hours, and malformed supplied types are rejected. Progress describes only the saved server revision. T08 supplies real ready-file state; T10 captures fresh declaration confirmations and actor/time snapshots. The dependent-document correction-resubmit completeness exception remains unaccepted and unimplemented.

**Validation:** valid and boundary-invalid fields/sets/hours/date, conditional denominator calculations, browser error navigation, and persisted complete-field draft. T08 later supplies ready files to the same progress calculation; do not fabricate successful uploads.

## T08 — Upload and privately retrieve required evidence

**Blocked by:** T06. **References:** FR-01/04/16; NFR-02/03/05/07.

**Deliver:** the operator drops/selects required evidence, sees upload success/failure, and accesses persisted private files.

- [ ] PDF/JPEG/PNG and the reviewed 10 MB contract are validated on the backend; failed upload leaves the prior good reference and unrelated draft data intact.
- [ ] One current file per request; replacement creates an immutable file/metadata record and generated storage key, not an overwrite or original-filename path.
- [ ] Database metadata and file-volume bytes persist; downloads/preview require ownership or an authorized submitted officer context. Unsubmitted files stay private to the operator.
- [ ] Implement agreed staging/commit/cleanup safeguards and safe errors for storage or database failures; no public file directory, object-storage service, content findings, or email dependency.

**Validation:** browser drop/file selection; empty/type/signature/parse/size boundaries as accepted; filename/path attempts, authorization, replacement retention, partial-failure check, and file persistence after container recreation.

## T09 — Display simulated document-processing status

**Blocked by:** T08. **References:** FR-05; NFR-02/05/08.

**Deliver:** per-file basic mock status changes appear without manual reload.

- [ ] Use reviewed queued/running/completed/error/retry semantics and durable restart recovery; expose the status to each authorized role when its document is visible.
- [ ] Label processing as simulated and avoid approval/compliance claims, AI warnings, flags, confidence, findings, live API integration, or dual modes.
- [ ] Keep upload readiness distinct from simulated processing; apply only the reviewed submission-gating rule.

**Validation:** browser state updates without manual reload, interrupted-job recovery, failure/retry, permission checks, and assertions that no AI finding/approval payload is generated. Officer-facing integration is verified again after T10.

## T10 — Submit an immutable application for officer review

**Blocked by:** T07, T08. **References:** FR-06/07/13/14/15; NFR-02/03/05/07.

**Deliver:** valid submission moves from the operator form to the officer's received queue with a retained snapshot.

- [ ] Block missing/invalid mandatory data, not-ready uploads, or missing declarations. Valid submit creates version 1 with actual values/file references/actor/time.
- [ ] Map Application Received to operator “Submitted”; officers see “Application Received,” full organised data, and authorized submitted files. Preserve initial working data and history.
- [ ] Persist the required operator status notification with the submission event; provide recipient-only in-app listing, case link, and reviewed read-state behaviour, including next-sign-in visibility.
- [ ] Submitted fields/files are immutable; reviewed lock, transaction, stale-command, and retry safeguards prevent duplicate versions/notifications.
- [ ] Display mock status when T09 is available; initial submission must not depend on live AI or completion of that optional development branch.

**Validation:** full browser operator-to-officer handoff, blocked submissions, exact snapshot and file access, offline notification recovery, repeat-submit receipt, and DB rollback check. Included-state queue filters are extended as later transitions arrive.

## T11 — Review and record final approval/rejection

**Blocked by:** T10. **References:** FR-07/12/13/14/15; NFR-03/05/07.

**Deliver:** an officer starts review and records an accountable document-based final outcome.

- [ ] Reviewed start-review transition uses “Under Review” for both roles and preserves case discoverability in filtered/all-submitted views.
- [ ] Approval/rejection require explanations and record officer/time/version; notifications survive operator logout. No inspection prerequisite or separate approver/routing stage.
- [ ] Final states preserve submitted information/history and prevent edit/resubmit/reopen/appeal actions. No licence number/certificate.
- [ ] Implement the reviewed unresolved-issue approval guard; T12/T13 will exercise it with real issues. Decision retries/races cannot produce conflicting outcomes.

**Validation:** browser initial-approval and initial-rejection paths, missing explanations, roles/state guards, final locks, queue transitions, offline notices, and concurrent/retried decision checks.

## T12 — Complete a field correction and review cycle

**Blocked by:** T11. **References:** FR-08/09/10/11/13/14/15; NFR-03/05/07.

**Deliver:** a complete feedback/resubmission round for an individual field, including officer-confirmed resolution.

- [ ] Officer issues contextual field feedback; operator sees it prominently with a target link and “Pending Pre-Site Resubmission.” Private draft feedback follows the reviewed policy.
- [ ] Only requested fields can be changed server-side; retain unrelated values and immutable previous snapshot. Apply reviewed response/declaration requirements without inventing whole-section permissions.
- [ ] Resubmit creates the next snapshot, maps “Pre-Site Resubmitted,” notifies the officer, and marks the issue awaiting review without auto-resolution.
- [ ] Officer sees a changed-field marker and old/new field context, can confirm resolution or issue another correction, and can approve/reject under the agreed guards.
- [ ] Preserve actors/times/comments/responses across repeated rounds with no configured cap; ordinary saves remain mutable draft work, not submitted versions.

**Validation:** one field round end-to-end, unflagged/dependent write rejection, officer notification while logged out, insufficient correction followed by another round, prior value retention, and resolution/approval negative checks. Complete multi-version comparison presentation comes in T15.

## T13 — Correct documents and provide additional evidence

**Blocked by:** T12. **References:** FR-04/08/09/10/11/13/14; NFR-02/03/05/07.

**Deliver:** the same review cycle works for a replaced, missing, or additional document.

- [ ] Officer targets a specific document request or creates a titled missing/additional request with explanation; operator can upload only permitted evidence during corrections.
- [ ] Ready-file and reviewed issue-response rules gate resubmission; new versions reference replacements while earlier versions retain actual old files. Unchanged documents are shared by immutable reference.
- [ ] Officer reviews changed-file context and confirms/re-requests resolution; a replaced filename alone never implies resolution.
- [ ] Failed uploads and rejected unauthorized replacements preserve prior valid evidence and other corrections. Simulation remains status-only when integrated.

**Validation:** browser replacement and additional-evidence cycles, locked unrequested slots, failure then retry, historical authorized downloads, unchanged-file reference reuse, and repeated document rounds.

## T14 — Apply comment templates to correction requests

**Blocked by:** T13. **References:** FR-08/09; NFR-05/06.

**Deliver:** officers select a predefined common comment, fill contextual placeholders, and issue useful feedback.

- [ ] Reviewed templates cover field correction, missing evidence, unreadable document, and clarification; customize before issuance.
- [ ] Incomplete placeholders/blank text fail clearly; issued text remains in history even if a template later changes in development.
- [ ] Operator sees the final contextual text linked to its exact target. No template-management UI.

**Validation:** browser field/document template selection/customization, unresolved-placeholder errors, and retained issued text in another round. Do not add tests that merely duplicate constant template definitions.

## T15 — Compare and browse complete submission history

**Blocked by:** T13. **References:** FR-07/11/14; NFR-02/03/06.

**Deliver:** both authorized roles open previous actual submissions; officers compare field/file changes in organized review context.

- [ ] Version selector opens full values, declarations, files, submitter/time, and issued comments for every round, not just an activity log.
- [ ] Reviewed comparison semantics identify changed fields and added/replaced/inapplicable file references, default latest/predecessor, with full context still available.
- [ ] Link issue responses/resolutions and status/decision events to reviewed/submitted versions. Historical views are read-only and respect actor access/approval privacy.
- [ ] All included states remain discoverable through the scoped queue and mapped labels; do not add site/post-site fixtures or claim all-original-state coverage.

**Validation:** at least three mixed field/document rounds, same-name replaced files, unchanged reference reuse, order-insensitive sets if accepted, nonadjacent comparison, authorization, history reopening, and queue/filter coverage across every included state.

## T16 — Handle explicitly requested dependencies mid-round — EXCLUDED / skipped

**Decision:** The user rejected this optional task. Strict fixed alternating rounds prohibit an officer from appending to or editing requests while an operator correction round is open. There is no mid-round unlock, automatic conditional unlock, or API for adding requests to an open round. Missing/additional evidence discovered from a correction is raised only after resubmission, in a later fixed officer review round.

**Pending rules clarification, not implementation:** T02 must accept or amend the proposed narrow exception described in SPEC: a correction resubmission may defer only newly mandatory evidence that remains locked because it was not in the fixed request set. Initial submission and final approval remain mandatory complete. Until reviewed, dependent slices must not implement this exception or create an impossible correction flow.

**Validation:** documentation contains no mid-round append endpoint or acceptance case; later workflow tests must reject attempts to mutate a published request set.

## T17 — Recover safely from retries, races, and partial failures

**Blocked by:** T13. **Kind:** cross-flow recovery/verification. **References:** FR-15/16; NFR-02/03/05/07. T11's decision flow is already a prerequisite through T12/T13.

**Deliver:** demonstrated integrity and actionable recovery when product actions fail or overlap.

- [ ] Exercise concurrent saves, correction issuance, submissions/resubmissions, and decisions against stale revisions; no newer data or outcome is overwritten.
- [ ] Recover unknown-result retries from the committed receipt even after state/revision changes; different payload/key reuse conflicts, and effects/notices are not duplicated.
- [ ] Inject upload/finalization/DB commit failures and interrupted processing; cleanup/reconciliation preserves referenced historical files and prior good data while identifying unused or missing files safely.
- [ ] Verify status/version/audit/notification database effects commit together or roll back; restart preserves scoped application/history/notification/file data.
- [ ] User-facing errors retain recoverable inputs and correlation identifiers without exposing credentials, SQL, stack traces, or host paths.

**Validation:** integration fault injection and selected two-session browser races/recovery. Record actual outcomes and repair discrepancies; rerun affected checks after changes. This is not a broad refactor or blanket rewrite of earlier slices.

## T18 — Verify and package the scoped product

**Blocked by:** T09, T14, T15, T17. T16 is explicitly excluded and is not a blocker. **Kind:** acceptance/delivery. **References:** FR-01–16; NFR-01–08; assessment deliverables and traceability.

**Deliver:** a reviewable repository/zip with reproducible setup, proportionate evidence, and honest scope limitations.

- [ ] From clean volumes, run documented Docker setup and both seeded real sign-ins; prove no host Java/Node or external AI/auth/email service is required.
- [ ] Run focused end-to-end paths: initial final decisions, repeated mixed correction cycles, missing/additional evidence, officer confirmation, snapshots/compare/history, offline notices, included-state filters, final locks, and container persistence.
- [ ] Verify keyboard flows, target-linked errors, uploads, roles/ownership/private files, agreed session protections, and local-only credentials; inspect for committed/deployment secrets.
- [ ] Inspect product screens for consistent shadcn/ui components, official patterns and black-background dark-theme tokens; retain only necessary custom composition styling and required licensing interaction logic.
- [ ] Provide README setup/stack/known gaps/next priorities and AI Usage evidence (prompts, review, corrections, discarded output). Align scope/spec/tasks with actual implementation and any reviewed proposal changes.
- [ ] State the basic simulation and deferred AI findings, site/post-site states/workflows, approval routing, and other exclusions. Do not claim full UC2, all-status, formal accessibility certification, legal compliance, or unmeasured performance.
- [ ] Record commands/outcomes and material limitations. No automatic merge, production deployment, issue publication, or cloud dispatch is implied by packaging.

**Validation:** one fresh setup and final acceptance run, plus targeted checks for unresolved concerns. Do not repeat already-passing suites without a new change/failure reason. Hosted deployment, if later requested, needs a separate reviewed task.

## Requirement coverage index

| SPEC requirements | Main tasks |
| --- | --- |
| FR-01 | T04, T05, T08, T18 |
| FR-02 | T05–07 |
| FR-03 | T06, T07 |
| FR-04 | T08, T13 |
| FR-05 | T09, T18 |
| FR-06 | T07, T10 |
| FR-07 | T10, T11, T15 |
| FR-08 | T12–14 |
| FR-09 | T12, T13; T16 excluded |
| FR-10 | T12, T13 |
| FR-11 | T12, T13, T15 |
| FR-12 | T11, T12 |
| FR-13 | T10–13, T18 |
| FR-14 | T10–13, T15 |
| FR-15 | T05, T10–13, T17 |
| FR-16 | T08, T17 |
| NFR-01 | T04, T18 |
| NFR-02 | T04, T05, T08, T15, T17, T18 |
| NFR-03 | T04, T05, T08, T10–13, T18 |
| NFR-04 | T01, T04, T18 |
| NFR-05 | Every new input/mutation slice; T17, T18 |
| NFR-06 | Each user-facing slice; T18 |
| NFR-07 | T08, T10–13, T17 |
| NFR-08 | Ongoing evidence in each slice; T09, T18 |

## Next review step

T03 is verified and T04 is the active foundation PR. Continue one user-authorized issue at a time through the verified linked-human comment workflow and ordinary CI; do not infer that labels, issue bodies, or an Actions bot dispatch Codex. Review remaining T02 proposals before dependent product work. Strict fixed alternating rounds are accepted, T16 is excluded, and the narrow dependent-completeness exception remains proposed and unimplemented.

## T04 implementation evidence (2026-10-03)

The PR #8 feature slice records the accepted technical baseline and implements T04 only. It adds the four read-only CI checks documented in the README, designed to run real PostgreSQL and Compose validation after publication. Local Maven evidence uses H2 in PostgreSQL compatibility mode and does not establish PostgreSQL compatibility. The 12 frontend tests measured 94.18% statements, 97.77% branches, and 93.90% lines with the API module fully covered; after the current dependency patch, the 12 backend tests—including real random-port servlet HTTP over the H2-compatible database—still measure 92.77% lines and 100% branches. Independently executed evidence is attributed by revision in the README: `34000145922a19eb29a925bd61aa52a750cee804` passed full Compose smoke and both browser flows, but complete CI failed on eight backend-image findings, its packaged-JAR scan was empty, and the independently scanned frontend image had 41 high/critical findings. This subsequent repair makes the packaged-JAR rootfs inventory meaningful, patches the reported Jackson/Tomcat and nginx/Alpine dependencies, and runs both image scans independently; its real PostgreSQL, Docker, and scanner results remain pending exact-head publication. CD, rollback, production destination/secrets, required-check ruleset changes, and T02 product implementation remain deferred. This progress note does not accept or amend any proposal markers above.

## CI-D1 — Add SonarQube static analysis and quality gate — DEFERRED

**Blocked by:** explicit future CI-roadmap authorization and a reviewed account/tool/cost decision. **Kind:** separate CI roadmap task; not a blocker for T04 or the product backlog.

**Deliver later:** official supported Java and TypeScript/React analysis integrated with the selected SonarQube Server or Cloud offering. No free-plan availability or suitability is assumed.

- [ ] Compare currently supported SonarQube Server and Cloud options against the available account, repository tooling, operational ownership, and cost constraints.
- [ ] Select an official supported scanner/integration and pin its version or action immutably.
- [ ] Import the actual backend JaCoCo XML report and frontend LCOV report without replacing behavioural tests or existing coverage gates.
- [ ] Propose and review a meaningful quality gate for Java and TypeScript/React; do not exclude authentication or business code to improve metrics.
- [ ] Design least-privilege secret handling and fork/PR behavior before requesting or configuring any credential.
- [ ] Add a read-only PR check, document its exact check name and failure evidence, and consider ruleset enforcement only after that exact check has run green.

**Not authorized now:** scanner installation, account/project creation, secret requests, live Sonar checks, paid-service commitment, or claims about free plans. Existing coverage, Gitleaks, dependency, packaged-JAR, image, Compose, and browser checks remain required.
