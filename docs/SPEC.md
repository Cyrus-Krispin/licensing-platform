# Regulatory and Licensing Platform — Product Specification

## Problem statement and authority

Operators need to submit complete food business applications and respond to specific corrections without re-entering retained information. Officers need to review documents, explain deficiencies, inspect subsequent changes, and make accountable decisions across repeated submission rounds.

The approved [SCOPE.md](SCOPE.md) in this documentation folder defines the product boundary. This specification elaborates that scope for a fictional jurisdiction covering fixed-premises cafés and restaurants. It specifies selected submission/resubmission and officer review features using the pre-site status subset plus approved/rejected. Site/post-site states and workflows are deferred; this is not full use case 2 or all-status compliance, nor actual legal compliance.

**Decision authority:** requirements explicitly accepted in `SCOPE.md` remain accepted. Detailed rules marked **Proposed** below are a coherent design for review, not previously accepted user decisions. Acceptance criteria for proposed behaviour become implementation requirements only when that design is accepted. This document is separate from scope and is not evidence of completed implementation.

## Solution and user stories

Provide one role-aware web product with a separate React/TypeScript/Vite frontend and Java Spring Boot backend. Use Spring Security for backend authentication, PostgreSQL for records, and private persistent volume storage for document files. Run all runtime components through Docker Compose in one monorepo with separate frontend/backend folders.

1. As an operator, I want a persistent working draft so that I can finish an application across sessions.
2. As an operator, I want clear field/document requirements and completion progress so that I know what remains before submission.
3. As an operator, I want drag-and-drop uploads and visible simulated check status so that I can follow each document's processing.
4. As an operator, I want prominent feedback linked to individual fields/documents so that I can correct the requested information.
5. As an operator, I want to upload missing or additional requested evidence without replacing unrelated information.
6. As an operator, I want previous submissions and comments retained so that repeated correction rounds remain understandable.
7. As an officer, I want the complete submitted application and documents in an organised view so that I can assess the application.
8. As an officer, I want contextual feedback and reusable comment templates so that requests explain exactly what needs attention.
9. As an officer, I want changed fields/documents highlighted and previous versions available so that I can review a resubmission efficiently.
10. As an officer, I want to confirm issue resolution myself so that resubmission cannot silently close an unresolved problem.
11. As an officer, I want document-based approval or final rejection with a recorded explanation so that the outcome is accountable.
12. As either user, I want persistent in-app notifications so that relevant updates remain available after I sign in again.
13. As an officer, I want every submitted case in the included workflow to remain discoverable across transitions and filters so that workflow changes cannot hide work permanently.

## Actors and access matrix

Normal local setup contains exactly one operator and one officer, seeded persistently. Additional identities may exist only in isolated authorization tests. No public signup, user administration, business teams, officer allocation system, or separate identity service is included.

| Capability | Anonymous | Operator | Officer |
| --- | --- | --- | --- |
| Sign in | Yes | Already authenticated | Already authenticated |
| Create/save initial application draft | No | Own application | No |
| Read application and issued feedback | No | Own applications | All submitted cases in scope |
| Read unsubmitted working draft | No | Owner | No |
| Upload/replace current requested document | No | Owner, within editing permissions | No |
| Read submitted versions/files/history | No | Own applications | All submitted cases |
| Enter contextual feedback/use templates | No | No | Yes, while reviewing; the issued request set stays fixed while an operator correction round is open |
| Start review/request corrections/resolve issues | No | No | Yes in the defined review workflow |
| Submit/resubmit | No | Owner, in permitted state | No |
| Approve/reject | No | No | Yes, while reviewing |
| Read/mark notification read | No | Own notifications | Own notifications |

**Proposed access detail:** officers see submitted snapshots and their own review work, not operator draft changes before resubmission. Unissued officer feedback is private to the officer until a correction request is issued. Apply every rule on the server, not merely through hidden UI controls. Authorization to a historical file follows its application/version relationship, not possession of a file identifier.

## Field schema and validation

**Accepted through T07:** the initial-draft sections, required/optional exceptions, conditional unit, activities/service modes, daily hours, opening date, saved progress formula, and declaration display follow scope. Later submission/correction rules remain proposed where marked. These are fictional product rules.

Trim surrounding whitespace in text. Validate the API's types, known keys, enumerations, lengths, and calendar/time formats on every write. Drafts may omit required values; completeness rules apply at submission/resubmission. Invalid values return field errors rather than being silently coerced. Escape values on display; do not accept HTML as field content.

| Property | Type / proposed values | Submission validation |
| --- | --- | --- |
| `business.legalName` | Text, 1–200 characters | Required, nonblank |
| `business.tradingName` | Nullable text, at most 200 | Optional; blank becomes null |
| `business.registrationNumber` | Text, 3–40 | Required; letters, digits, hyphen and slash; no registry lookup |
| `business.structure` | `SOLE_PROPRIETOR`, `PARTNERSHIP`, `COMPANY`, `OTHER` | Required known value |
| `applicant.name` | Text, 1–120 | Required |
| `applicant.role` | `OWNER`, `DIRECTOR`, `EMPLOYEE`, `REPRESENTATIVE` | Required; representative activates authorization evidence |
| `applicant.email` | Text, at most 254 | Required syntactically valid email; contact information, not notification delivery or login-identity change |
| `applicant.phone` | Text, at most 32 | Required; permit leading `+`, spaces, parentheses, hyphens; 7–15 digits after removing separators |
| `premises.address` | Text, 1–500 | Required fictional-jurisdiction address; no geocoding or real postcode rule |
| `premises.unitApplicable` | Boolean | Required; explicitly indicates whether there is a unit |
| `premises.unitNumber` | Nullable text, at most 40 | Required/nonblank when unit applicable; null otherwise |
| `premises.name` | Nullable text, at most 200 | Optional |
| `premises.tenure` | `OWNED`, `RENTED` | Required; activates ownership or lease evidence |
| `operations.businessType` | `CAFE`, `RESTAURANT` | Required; fixed premises only |
| `operations.preparationActivities` | Distinct set: `BEVERAGE_PREPARATION`, `COOKING`, `BAKING`, `REHEATING`, `COLD_FOOD_PREPARATION`, `PREPACKAGED_FOOD_SALE` | At least one known value |
| `operations.serviceModes` | Distinct set: `DINE_IN`, `TAKEAWAY`, `DELIVERY` | At least one known value |
| `operations.operatingHours` | Seven named weekdays; each `{closed, opensAt, closesAt, closesNextDay}` | Each day explicitly closed or has one valid `HH:mm` interval; closed days have no times; same-day end after start, next-day end at/before start; no zero-length or 24-hour interval |
| `operations.proposedOpeningDate` | ISO calendar date `YYYY-MM-DD` | Required valid date; no automatic rejection when a retained date becomes past during review |
| Declaration | Accuracy and authority confirmations captured on submission | Both affirmatively confirmed by the submitting operator |

**Proposed declaration handling:** confirmation is part of the submit/resubmit command and is recorded in that snapshot with actor/time. It is not a general permission to edit other fields. A new submission needs fresh confirmation; previous declarations remain retained.

Dependent values must remain consistent. In initial drafts, changes such as tenure may alter required evidence without deleting existing uploads. **Accepted strict alternating rounds:** during corrections, every unrequested dependent field and document stays locked. The officer cannot append to or edit the published request set while the operator round is open, and the product never unlocks dependencies automatically. After the operator resubmits, the officer may request newly identified missing/additional evidence only in a new fixed review round. Never bypass server permissions to repair consistency automatically.

**Proposed completeness exception, pending review and not implemented:** if changing an explicitly requested field creates a newly mandatory dependent document that was not in the fixed request set, allow that correction resubmission to omit only that newly required locked document, retain an explicit server-recorded deferred-completeness marker, and require the officer to request it in the next round. Example: an officer requests `premises.tenure`; changing `OWNED` to `RENTED` makes lease evidence mandatory, but the lease request remains locked because it was not in the fixed set. The proposal would allow this correction version to be resubmitted with a prominent “lease evidence deferred to next officer round” result. It would not unlock uploads, waive any originally requested target, permit initial submission while incomplete, or permit final approval until all mandatory fields/documents are complete. Acceptance or amendment is required before implementation.

## Documents and processing

| Request type | Required condition |
| --- | --- |
| `BUSINESS_REGISTRATION` | Every application |
| `PREMISES_LAYOUT` | Every application |
| `FOOD_USE_PERMISSION` | Every application |
| `LEASE_EVIDENCE` | Rented premises |
| `OWNERSHIP_EVIDENCE` | Owned premises |
| `REPRESENTATIVE_AUTHORIZATION` | Applicant role is representative |
| `ADDITIONAL_EVIDENCE` | An officer issues a specific request with title and explanation |

One request has one current file. Multiple additional-evidence requests are separate requests, each with its own file and contextual feedback. Replacement creates a new immutable upload record; it never overwrites a previously submitted file. Historical snapshots retain their original references. A now-inapplicable initial request is excluded from completion requirements, but its stored/history records are not erased.

**Proposed upload contract:** interpret the accepted 10 MB ceiling as **10,000,000 bytes per file**, inclusive. Permit nonempty PDF/JPEG/PNG only, checking allowed extension, detected content type/signature, and basic parse/decode validity rather than trusting the browser MIME type. Reject encrypted/password-protected PDFs that cannot be parsed. The original filename is display metadata, never a path; generate the storage key on the server. These structural checks are ordinary input validation, not AI verification. Malware scanning and document-content/legal authenticity checks are deferred and must not be claimed.

Drag-and-drop and keyboard-accessible file selection use the same validation. Show upload progress, failure, and retry without clearing other draft data. The backend rejects uploads when a request or application is not editable. Do not expose the file volume as a public static directory.

### Basic simulated verification

**Accepted:** per-file simulated status visible as processing changes, without manual page reload; no live AI integration, warnings, flagged results, confidence scores, or inferred compliance.

**Proposed statuses:** `QUEUED` → `CHECKING` → `COMPLETE`; `ERROR` represents a processing failure and permits retry. Display “Simulated check complete” with an explanation that completion does not establish document validity or licensing compliance. Do not label a completed simulation “approved” or “AI verified.” Status updates can use polling; no extra broker or live-AI credentials are required. Recover queued/interrupted work after restart. A safely stored, structurally valid document may be submitted while a simulated check is queued/running/errored; simulation is not a submission gate. The independent upload state must be ready before submission.

## Application lifecycle and status mapping

**Accepted:** mapped pre-site labels, unlimited correction rounds, immutable submitted versions, officer-confirmed resolution, document-based decisions, and final rejection without reopening. **Proposed:** exact scoped transition graph, explicit start-review action, and editing locks below. The latest user direction cancels all-status expansion: site/post-site states and separate approval routing remain deferred.

| Internal code | Officer label | Operator label |
| --- | --- | --- |
| `DRAFT` | Not in submitted queue | Draft |
| `APPLICATION_RECEIVED` | Application Received | Submitted |
| `UNDER_REVIEW` | Under Review | Under Review |
| `PENDING_PRE_SITE_RESUBMISSION` | Pending Pre-Site Resubmission | Pending Pre-Site Resubmission |
| `PRE_SITE_RESUBMITTED` | Pre-Site Resubmitted | Pre-Site Resubmitted |
| `APPROVED` | Approved | Approved |
| `REJECTED` | Rejected | Rejected |

`DRAFT` is a product working state, not an extra assignment-mapped officer status. Keep the pre-site terminology for traceability despite excluding inspections. There is no site/post-site transition or pending-approval route in this scoped product. The source table's “Pending Approval” operator label conflicts with its privacy constraint; the constraint takes precedence. Never expose an internal approval stage through operator labels, codes, filters, history, or notifications. If approval routing is added later, its public projection must be designed then. Queue/filter/history coverage applies to the included subset only; no imported/seeded cases in deferred stages or all-state compliance are promised.

| From | Command / actor | To | Preconditions and effects |
| --- | --- | --- | --- |
| `DRAFT` | Submit / operator owner | `APPLICATION_RECEIVED` | Full validation, required ready files, declarations; create version 1 |
| `APPLICATION_RECEIVED` | Start review / officer | `UNDER_REVIEW` | Review latest submitted version; no inspection prerequisite |
| `PRE_SITE_RESUBMITTED` | Start review / officer | `UNDER_REVIEW` | Review new version and issues awaiting confirmation |
| `UNDER_REVIEW` | Request corrections / officer | `PENDING_PRE_SITE_RESUBMISSION` | At least one unresolved contextual issue; issue feedback and open targeted working revision |
| `PENDING_PRE_SITE_RESUBMISSION` | Resubmit / operator owner | `PRE_SITE_RESUBMITTED` | Required data/docs valid, each active request addressed, declarations; create next version and mark issues awaiting review |
| `UNDER_REVIEW` | Approve / officer | `APPROVED` | Required explanation; no unresolved issued issues; record actor/time/decision |
| `UNDER_REVIEW` | Reject / officer | `REJECTED` | Required reason; preserve unresolved issues and full history as of rejection |

No other transition is permitted in the proposed scoped graph. `APPROVED` and `REJECTED` are read-only terminal states. Rejection cannot be edited/resubmitted/reopened, and no appeal/request-reopening API exists. Approval does not create a licence number/certificate. Approval and rejection notifications link to the recorded outcome.

**Proposed save rules:** allow initial draft edits in `DRAFT`; allow only active requested field/document edits in `PENDING_PRE_SITE_RESUBMISSION`. Lock operator writes in all review/submitted/final states. Creating a correction working revision copies the latest submitted values/file references without mutating that snapshot. Officer review commands operate against a specified latest version and application concurrency revision.

## Feedback, correction rounds, and resolution

Each issue targets one stable field identifier or one document request. It has contextual text, officer, creation time, issued round, response history, and resolution events. Section headings may group issues for display, but a section itself does not grant editing permissions.

**Proposed issue lifecycle:** `DRAFT` (private officer feedback), `OPEN` (issued, operator can address), `AWAITING_REVIEW` (resubmitted), `RESOLVED` (officer confirmed). If insufficient, the officer adds another explanation and returns the issue to `OPEN` when issuing the next correction round; retain earlier text/responses. Officers may add new issues only when publishing a later fixed round after reviewing the resubmitted immutable version. A published operator correction round cannot be edited or appended. No cycle counter limits submissions or issues.

**Proposed operator response:** each active issue needs a short response explaining the correction, linked to the changed field/file; a document request also needs a ready current file. A response may explain why an existing field value/file should remain, rather than forcing a meaningless edit. Officer confirmation still decides resolution. Mandatory additional evidence cannot be bypassed by a response alone. Response text is proposed (1–2,000 characters), not an accepted new application field.

**Proposed review behaviour:** resolving an issue records the officer, reviewed version, time, and optional note without modifying historic issue events. Approval is blocked until issued issues are resolved; rejection may end review with unresolved issues retained. Draft officer notes do not become operator-visible merely because a page is refreshed. Resolution, response, and status changes after issuance append events; issued request targets and text are immutable and cannot be appended or edited during the operator round.

Proposed built-in, editable comment templates: “Please correct the value for {field},” “Please provide {document},” “The supplied document is unreadable; please replace it,” and “Please clarify {detail}.” Officers must fill placeholders and may customise the text before issuing it. Template-management UI is excluded.

## Revisions, comparison, audit, and progress

Submission snapshots include the complete accepted field values, declarations, referenced immutable uploads, submitter, timestamp, and monotonic per-application version number. Issued rounds and issue events identify which version was reviewed. Draft saves are not submission versions. Preserve unchanged documents by reference.

**Proposed comparison contract:** compare any two authorised versions of the same application, defaulting to latest versus its predecessor. Return field-level old/new values and added/replaced/no-longer-required document references. Compare normalized values rather than display formatting; preparation/service sets are order-insensitive. Changed file identity counts as replacement even if original names match. Show changes first with access to the full submission, unresolved issues, and unchanged values. “Only changes surfaced” must not prevent full context access.

The audit trail records submission, resubmission, status changes, issued feedback, responses, resolution, document replacement references, decisions, and notification generation with actors and server timestamps. It is append-only through ordinary product APIs; users cannot delete/alter past submitted data. No general-purpose audit export is included.

**Accepted initial-draft progress calculation:** return completed/required counts and a percentage rounded down. Count each required scalar field, each nonempty required set, each of seven valid daily-hour entries, each applicable required document request with a ready file, and the two declaration confirmations. Optional/inapplicable items and simulated check states do not affect the denominator. T07 has no ready uploads or captured declarations, so those items remain unmet. Recompute conditional requirements from saved inputs and return stable unmet-item identifiers. Correction progress remains proposed. Neither a percentage nor a response count overrides server submission validation.

## Persistent notifications

**Accepted:** in-app only, stored when the recipient is logged out; operator notifications on status changes and officer notifications on resubmission. No email or email-capture container.

**Proposed notification record:** recipient, event identifier, application, public-facing message, creation time, and nullable read time. Store operator status notifications and resubmission officer notifications in the same transaction as the associated database workflow event. One event produces at most one notification per recipient. Notifications have a case link, newest-first list, unread indicator, and recipient-only mark-read action. Read state must not leak across the two accounts. Messages and payloads respect operator approval-stage privacy; notifications do not expose private draft feedback. No push/browser notification permission or guaranteed live transport is required.

## Core screen flows

**Accepted visual/component constraint:** use existing **shadcn/ui components throughout** the React/TypeScript/Vite frontend. Aim for a black-background dark product UI closely matching the shadcn website's established look and feel, using official component patterns and theme tokens. Permit minimal layout/composition styling only where needed; avoid bespoke widget design/behaviour and an independently invented CSS visual system. This is product-interface consistency, not a marketing-site clone. Required licensing interactions, state management, API integration, and server business rules still apply. The component base/preset/version and exact screen composition are routine follow-up design choices, not silently selected dependencies.

**Proposed presentation; accepted workflow remains unchanged.**

1. **Sign-in:** use a real backend login; show local setup credentials in setup documentation rather than bypassing authentication. Redirect to the appropriate workspace; failed login does not reveal whether a username exists.
2. **Operator workspace:** list own drafts/submissions with public status and notification access. Open a draft or create an application.
3. **Application form:** organise the five accepted sections, show completion, save state, field errors, document slots, drag/drop/file selection, upload/check statuses, and a review/submit confirmation. Distinguish saved data from unsaved inputs; explicit save is the proposed baseline, not an unapproved autosave promise.
4. **Operator corrections:** place issued feedback first, link each item to its target, show permitted controls for requested fields/documents and read-only retained information, gather responses, and validate resubmission. Offer previous submissions/comments without changing the working draft.
5. **Officer queue:** list all submitted cases in the included workflow, filter by its statuses, and provide an explicit “All submitted cases” view including final decisions. After an action moves a case outside the active filter, explain the new status and keep its detail link available. Unsubmitted operator drafts are excluded deliberately. The view does not promise coverage of deferred site/post-site/approval-routing states.
6. **Officer review:** full organised snapshot, document access/check status, contextual issues/templates, start-review action, new-round feedback, issue resolution, comparison selector, and approve/reject with explanations. Display latest versus historical context clearly; historic views cannot receive mutation commands.
7. **History/outcome:** both authorised actors can open prior submissions, comments, and outcomes. Terminal application controls are read-only. Notifications link back to the relevant case/round.

Use semantic controls, labelled inputs, keyboard-operable uploads and dialogs, readable error summaries, and status meaning conveyed beyond colour. Preserve draft values when validation or network actions fail.

## Logical data model

**Proposed logical entities, not finalized database tables or dependency choices.**

| Entity | Principal relationships / responsibilities |
| --- | --- |
| User | Identity, password hash, fixed role; owns applications or performs officer events |
| Application | Operator owner, scoped lifecycle status plus draft state, latest version reference, concurrency revision |
| WorkingDraft | Application's mutable initial/correction data and current document references; basis version |
| SubmissionVersion | Application, immutable values/declarations, version number, submitting user/time |
| DocumentRequest | Application, stable request ID/type, required condition or officer request, title |
| UploadedFile | Application/request, generated unique storage key, original filename, detected content type, byte count, uploader/time, storage readiness |
| VersionDocument | Submission version → request/file association; file may be referenced by many versions |
| SimulatedCheck | Uploaded file, processing state and timestamps; no AI content findings |
| FeedbackRound | Application, reviewed version, issuing officer/time, issue membership |
| FeedbackIssue / IssueEvent | Stable field/request target and append-only responses/resolution events tied to rounds/versions |
| Decision | Application/version, approval or rejection, explanation, officer/time |
| AuditEvent | Application, actor, event kind, related IDs, server timestamp; public projection by role |
| Notification | Recipient, unique source event, application link, message/time/read time |
| MutationReceipt | Principal, operation, idempotency key, payload fingerprint, committed result |

Enforce unique version numbers per application, unique file storage keys, unique event-recipient notifications, valid foreign keys, and valid status/role values. Do not cascade-delete submitted file records on replacement. Store timestamps as instants and render with a clearly identified display timezone; the fictional jurisdiction's product timezone is an open decision. Audit data should avoid passwords, session tokens, and document bytes.

## API contracts

**Proposed HTTP contract:** JSON under `/api`, with authenticated multipart uploads and streamed downloads. Use opaque identifiers; the frontend does not derive file paths. Return role-appropriate DTOs, not database entities. Exact wire schema belongs in the implementation's API documentation once accepted.

| Method / route | Actor | Input / result |
| --- | --- | --- |
| `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` | Login anonymous; remainder authenticated | Establish/end backend session; current identity and role |
| `GET /applications` | Both | Operator-own or officer-submitted list in scoped workflow; known included-status filter, pagination, public labels |
| `POST /applications` | Operator | Create owned draft; application ID and revision |
| `GET /applications/{id}` | Both, authorized | Operator working/public view or officer submitted view; revision and allowed actions |
| `PATCH /applications/{id}/draft` | Owner | Explicit field-path/value patch, expected revision; validate permission and return updated draft/progress |
| `POST /applications/{id}/documents/{requestId}/uploads` | Owner | Multipart file, expected revision and idempotency key; new immutable file reference/status |
| `GET /applications/{id}/files/{fileId}` | Both, authorized | Private authenticated download/preview with safe content disposition |
| `GET /applications/{id}/files/{fileId}/check` | Both, authorized | Simulation label/state only |
| `POST /applications/{id}/files/{fileId}/check/retry` | Owner when editable | Retry failed simulation, without affecting historical fields/files |
| `POST /applications/{id}/submit` | Owner | Revision, declarations, idempotency key; committed version/status |
| `POST /applications/{id}/review/start` | Officer | Expected revision/latest version; review status |
| `POST /applications/{id}/review/issues` | Officer under review | Field/request target and text, or additional-document request; private draft issue |
| `POST /applications/{id}/review/request-corrections` | Officer reviewing an immutable version | Revision/version, complete fixed request set, idempotency key; publish round/status |
| `POST /applications/{id}/issues/{issueId}/response` | Owner in correction state | Revision, response, referenced correction; save working response |
| `POST /applications/{id}/resubmit` | Owner | Revision, declarations, idempotency key; next snapshot/status |
| `POST /applications/{id}/issues/{issueId}/resolve` | Officer under review | Revision/latest version, optional note; append resolution |
| `POST /applications/{id}/decision` | Officer | Revision/latest version, `APPROVED` or `REJECTED`, explanation, idempotency key |
| `GET /applications/{id}/versions`, `GET /applications/{id}/versions/{number}` | Both, authorized | Retained snapshot summaries/full immutable values and file references |
| `GET /applications/{id}/comparison?from=...&to=...` | Both, authorized | Same-application field/file differences |
| `GET /applications/{id}/history`, `GET /comment-templates` | Both for history; officer for templates | Issued history projection or predefined templates |
| `GET /notifications`, `POST /notifications/{id}/read` | Recipient | Paginated persistent list or mark own notification read |

Issue draft amendment/removal before issuance may be part of the issue resource; issued text must never be overwritten. The route list does not authorize additional product features. Default pagination and stable ordering are proposed implementation details, not product performance commitments.

**Proposed session design:** server-side Spring Security sessions, HttpOnly session cookie, SameSite protection, and CSRF protection for state-changing requests including multipart upload/logout. Serve frontend and proxy API through one browser origin while keeping separate containers. Persist sessions in PostgreSQL if sessions must survive backend restart; account/application persistence is mandatory regardless. Use Secure cookies over HTTPS in deployment; local HTTP mode is explicitly development-only. Password hashing uses a supported adaptive Spring Security encoder; exact algorithm/configuration and dependency versions remain open. No browser-local-storage bearer tokens or hardcoded credential shortcuts.

## Errors, consistency, and concurrency

**Proposed error envelope:** `{code, message, fieldErrors?, correlationId}`. Field errors identify stable paths/request IDs. Use `400` for malformed requests, `401` for unauthenticated access, `403` for a forbidden role/action, `404` for unknown or inaccessible object identifiers, `409` for stale revision/invalid transition/idempotency conflict, `413` for oversized uploads, `415` for unsupported content, `422` for validly formed requests failing field/completeness validation, and `503` for temporary database/storage unavailability. Unexpected failures return a generic `500` with correlation ID, never stack traces, SQL, secrets, or host paths.

All application mutations verify role/ownership and target permissions; new effects also verify current status and expected application revision. Notification read operations are recipient-scoped rather than application-revision-scoped. Serialize conflicting application actions with database transactional locking or conditional revision updates. A stale second save/decision gets a conflict and reload guidance; it never overwrites newer data. Keep unsaved client inputs available for recovery without automatically merging locked fields.

**Proposed retry contract:** submit, resubmit, upload, correction issuance/additions, and final decision carry an idempotency key. Persist a receipt atomically with database effects, scoped to actor/application/operation. After checking authentication and object/operation access, look up an existing matching receipt before applying status/revision preconditions for a new effect: the original successful command may already have changed that status/revision. Repeating the same key and payload returns the committed result without another version, notification, or decision; reusing it with different content returns a conflict. An unknown result after timeout is recovered by retrying with the same key or reading the case. Duplicate requests arriving together must converge on one committed effect.

**File/database consistency protocol (Proposed):**

1. Authorize upload before accepting a file; stream to a private staging area with byte/type limits. Never replace the current good reference during transfer.
2. Validate the file, assign an immutable storage key, and finalize it on the persistent volume before committing its ready metadata/current draft reference. Recheck revision/edit permission when committing.
3. If the database commit fails or editing became unavailable, remove the new unused file; if immediate cleanup fails, retain a recoverable cleanup marker or find it through reconciliation. Do not delete a file referenced by a committed upload/version.
4. A crash between file finalization and database commit may leave an orphan. Reconciliation compares storage keys and database references and removes only provably unused staging/orphan files, avoiding active uploads. Make the procedure runnable through the Docker setup and document recovery; no extra external storage service is implied.
5. Submission checks that required references are ready and files available before committing snapshot/status/audit/notification together. If storage is unavailable, report failure and preserve the working draft. Detect/report subsequently missing stored files as an integrity failure; never present them as a successful upload/check or silently remove their history.

Named volumes survive ordinary container recreation; explicit volume deletion is a destructive reset, not ordinary startup. Seed/migrate idempotently without wiping existing data. Volumes are persistence, not a claimed backup/disaster-recovery solution.

## Functional requirements and acceptance criteria

The proposal markers above apply to detailed criteria here. Test observable behaviour through the API and browser rather than internal class structure.

| ID | Requirement | Testable acceptance criteria |
| --- | --- | --- |
| FR-01 | Role-aware authentication and ownership | Correct seeded credentials sign in to their workspace; incorrect credentials fail; operator cannot read/change another test owner's application/file; officer cannot change operator form values |
| FR-02 | Persistent working draft | Save incomplete allowed draft, sign out/in, and recover saved values; invalid field input produces a targeted error without discarding other saved values |
| FR-03 | Guided form and progress | Each required/conditional rule has an unmet-item indication; optional values do not lower completion; switching initial-draft tenure recalculates evidence needs without deleting old uploads |
| FR-04 | Private validated uploads | File selection and drop accept supported ready files; zero bytes, unsupported/mismatched/invalid content, and size over the chosen limit fail; exact-limit valid file succeeds; unrelated data survives failure |
| FR-05 | Basic simulation only | Per-file state updates without manual reload and is labelled simulated; both roles can see submitted-file status; no warnings, AI flags, confidence, or compliance verdict is produced |
| FR-06 | Initial submission | Missing/invalid required data, failed/not-ready upload, or unchecked declaration blocks submit; valid submit creates exactly one version and received status, preserving all field/file references |
| FR-07 | Officer full review and scoped queue | Officer can access every submitted case in the included workflow's all-status view, full fields/files, and begin review; operator unsubmitted drafts are absent; each included state has its mapped label/filter and transitions leave cases discoverable |
| FR-08 | Contextual feedback/templates | Officer issues field/document issues with completed template text; operator sees issued comments prominently with target links; unissued feedback is not exposed |
| FR-09 | Targeted correction permissions | Only requested individual fields/documents can change in correction state; unrequested section/dependent-field writes are rejected server-side; officer-requested additional evidence accepts its upload; published request sets are fixed until resubmission and later officer review |
| FR-10 | Resubmission and issue confirmation | Active requests have required responses/evidence before resubmit; new version preserves earlier values/files; issues become awaiting review, and only officer review resolves or requests further correction |
| FR-11 | Repeated rounds and comparison | Run at least three correction cycles with field/file replacements; every version remains openable and diffable; unchanged file references survive; no configured round cap prevents the next cycle |
| FR-12 | Final decisions | Under-review officer approval/rejection records explanation/actor/time; proposed approval guard rejects unresolved issues; rejection may retain unresolved issues; subsequent edit/resubmit/reopen attempts fail; no certificate/number appears |
| FR-13 | Persistent notifications | Generate status event with operator logged out and resubmission with officer logged out; next login shows correct notifications; repeating the same command does not duplicate them; recipients cannot read each other's notices |
| FR-14 | Scoped status mapping, history and privacy | Both roles see mapped labels for every included state and authorised issued feedback/submission history with actors/times; historical mutation attempts fail; operator API/UI/filter/notification/history projections contain no internal approval stage |
| FR-15 | Retry and conflict handling | Distinct conflicting saves/decisions using the same revision yield one success and a conflict without lost updates; retries with the same idempotency key/payload return the one committed result even after the original transition; different payload with that key conflicts |
| FR-16 | Storage failure recovery | Inject storage/DB failures around upload commit; existing good reference remains intact, no broken ready reference is committed, and orphan cleanup preserves every referenced historical file |

## Nonfunctional requirements and acceptance criteria

| ID | Requirement | Verification |
| --- | --- | --- |
| NFR-01 | Reproducible container setup | From clean volumes, documented Docker Compose setup builds/starts frontend, backend, PostgreSQL, schema and exactly two local accounts; no host Java/Node install or external auth/email/AI service is needed |
| NFR-02 | Persistence | Restart/recreate containers without deleting volumes; accounts, drafts, versions, files, issues, outcomes, and notifications remain readable with scoped statuses preserved |
| NFR-03 | Server authorization and session safety | Negative API tests cover role/ownership/file access and hidden state; proposed session design rejects missing/invalid CSRF on mutations, clears session on logout, and sets documented cookie attributes |
| NFR-04 | Credential handling | Stored credentials are password hashes; runtime source does not compare plaintext constants; repository/artefacts contain no secret deployment credentials; local defaults require explicit non-development replacement or refusal |
| NFR-05 | Input/error safety | Key writes validate on server; invalid input returns stable actionable errors; unexpected failures contain no stack/SQL/path/secret details; backend logs can correlate the error without logging credentials/document contents |
| NFR-06 | Consistent UI, accessibility and usable recovery | Inspect main screens for existing shadcn/ui components, black-background dark-theme tokens and official patterns with minimal composition styling; sign-in/form/upload/review flows work by keyboard; inputs have labels, feedback is not colour-only, errors link to controls, and failed save/upload retains recoverable inputs |
| NFR-07 | Transactional consistency | Failure injection proves DB status/version/audit/notification effects commit together or roll back; concurrency and file recovery satisfy FR-15/16 |
| NFR-08 | Honest documentation | README explains setup, stack, mock status versus deferred AI findings, known gaps, AI coding prompts/review/corrections/discarded output, and next priorities; SCOPE/SPEC do not claim legal compliance or completed acceptance criteria |

No arbitrary latency, throughput, uptime, browser matrix, or formal accessibility certification is promised. Choose supported dependency/runtime versions and record them before implementation; verify at least the browser used for the main acceptance run, with further compatibility expectations decided explicitly.

## Testing decisions and verification scenarios

**Proposed test seams:** API/database integration is the main seam for permissions, transitions, invariants, idempotency, and persistence; a small set of browser flows verifies the actual operator/officer experience, upload interactions, errors, and comparison presentation. Use focused unit tests only for pure validation/diff/progress logic where they add meaningful boundary coverage. There is no existing application/test infrastructure to inherit. Exact libraries remain unselected.

1. Clean Docker setup → both real sign-ins → operator draft/save/upload → valid initial submission → officer full review → approval → operator persistent outcome notification.
2. Officer issues a field correction, replacement request, and additional evidence → operator sees prominent linked feedback and locked unrelated inputs → resubmits → officer compares versions and confirms resolution. Repeat with insufficient response and another round; inspect all retained files/comments.
3. Reject with an explanation while issues remain → verify retained history and absence of any reopening/edit path.
4. Exercise conditional tenure/representative/unit requirements, empty sets, invalid daily hours, declaration omission, upload boundary/mismatch cases, and a dependent-field correction that requires explicit officer request.
5. Use isolated extra-owner fixtures, anonymous calls, forged IDs, and direct API writes to prove authorization rather than relying on UI controls. Check sessions/CSRF and private file retrieval.
6. Inject DB/storage faults and interruption during upload, simulation, and submission; retry with stable keys, reconcile orphans, and inspect no lost good data/duplicate versions/events. Race stale browser sessions and reject overwrite attempts.
7. Exercise every included state and transition with queue filters active; recover each case through the scoped all-status view and verify exact role labels. Generate notifications while recipients are offline, restart containers, and verify correct history/read permissions and approval-stage privacy. Do not claim testing of deferred-stage cases or transitions.

The test plan verifies external behaviour and meaningful failure paths; it does not assert implementation details or require application tests during documentation drafting.

## Out of scope and traceability

Excluded: site/post-site states and workflows, including scheduling and use case 3 inspection checklists/on-site capture/post-site responses; separate approval routing; other licences/hotels/mobile premises; live AI and dual modes; AI warnings/flagged findings; public signup/admin/business teams; independent identity service; email/Mailpit/push notifications; licence numbers/certificates; reopening/appeals; object-storage service; officer assignment/reassignment UI; template administration; legal registry checks. All-original-state representation/filter/history coverage is deferred. These choices leave selected UC2/status-mapping criteria partially covered; no full UC2 compliance is claimed. Cloud dispatch/issue publishing is not configured by this document.

| Assignment / scope requirement | Specification coverage | Limitation |
| --- | --- | --- |
| UC1 complete form, drag/drop, progress | Field/document sections; FR-02/03/04/06 | Fictional validation, not legal verification |
| UC1 per-document real-time AI status | Basic simulation; FR-05 | Clearly mocked, status only |
| UC1 contextual resubmission/history | Feedback/revisions; FR-08/09/10/11/14 | Individual targets only; no automatic dependent unlock |
| UC2 full submission and AI flagged issues | FR-05/07; full review | Full submission included; AI warnings/results/flagged issues deferred, so this criterion is only partially covered |
| UC2 contextual comments/templates | FR-08/09 | Fixed templates, editable before issuance |
| UC2 status/resubmission notifications | FR-13 | Persistent in-app only |
| UC2 differences, comparisons, resolution | FR-10/11/14 | Officer confirmation required |
| UC2 no lost cases/audit/unlimited cycles | FR-07/11/14/15/16; NFR-02/07 | Included workflow only; deferred-stage cases are not covered; no configured correction-round cap |
| Status mapping and approval privacy | Pre-site plus approved/rejected subset; FR-07/12/14; NFR-02/03 | Partial original status coverage; explicit privacy constraint overrides contradictory Pending Approval label; routing deferred |
| UC3 site assessment | States and activity workflows excluded | No claim of UC3 coverage |
| README, SCOPE, AI usage, validation/no secrets/next work | NFR-01/04/05/08 | Deliverables planned; tests/implementation not yet completed |

## Material decisions still open

1. Accept or amend the **proposed field enums/validation, scoped transition and issue rules (including strict fixed alternating rounds and the pending dependent-completeness exception), response requirements, editing locks, simulation semantics, and progress formula** before implementation. Mid-round request additions are excluded; the narrowly proposed dependent-completeness exception remains unanswered. The latest direction retains the pre-site status subset; full-status expansion is cancelled and is not a pending decision.
2. Select supported versions, API/testing libraries and auth/session details; confirm whether sessions must survive restart and the product display timezone. The described session/proxy/error/consistency rules are proposed engineering defaults.
3. Review screen composition/templates within the accepted shadcn/ui black-background dark-theme constraint, and determine whether a hosted deployment is required beyond Docker setup. Basic accessible behaviour and persistent records are required regardless.
4. Confirm the intended development skill set and verify the eventual GitHub-issue-to-Codex-cloud dispatch/review capabilities before any configuration or issue creation. Do not assume triggers or automatically merge/deploy changes.
5. AI warning/result/flag behaviour remains explicitly deferred unless the user later elects to add it; no current proposal restores that cancelled scope.

This specification was synthesized from the approved scope and interview decisions using the installed Matt Pocock `to-spec` guidance, adapted to the explicitly requested local document. No issue tracker publication, code implementation, commits, or automation setup is authorized by its creation.

## Accepted T08 implementation subset and wire API

T08 accepts the initial-`DRAFT` upload rules above. It does not accept or implement T09 simulated processing, T10 submission/declarations/snapshots/officer file access, correction uploads, malware/content/authenticity findings, or live AI. An owner may upload only to a currently applicable request on their editable draft. Officers cannot read draft files. Owner access to every retained immutable upload remains available even if its request later becomes inapplicable.

- `POST /api/applications/{applicationId}/evidence/requests/{requestId}?expectedRevision={revision}` consumes `multipart/form-data` with one `file` part and requires the Spring CSRF header plus `Idempotency-Key`. Success returns `{upload:{id,requestId,filename,contentType,byteSize,sha256,createdAt},revision}`; it never returns a storage key or path.
- `GET /api/applications/{applicationId}/evidence/uploads/{uploadId}` streams an owner-authorized retained file with its detected media type, safe inline `Content-Disposition`, and `X-Content-Type-Options: nosniff`.
- Draft `documentRequests[]` adds nullable `currentUpload` with the same public upload metadata. A ready current upload completes that applicable request in saved progress.

The mutation key is scoped to actor/application/request and fingerprints actual bytes, sanitized display filename, and detected content type. Matching committed receipts are returned before stale-revision evaluation; a different fingerprint conflicts. Replacement inserts an immutable upload and moves only the request's current pointer. Bytes are finalized under an opaque generated key before the metadata/pointer/receipt/revision transaction; failure removes only the uncommitted object and leaves the old pointer intact. A missing committed object produces `file_integrity_failure` rather than a false download.

### Private-volume reconciliation

Stop the backend first so there are no active upload writers. Export `FILE_STORAGE_PATH` for the mounted private volume and a PostgreSQL `DATABASE_URL`, then run `scripts/reconcile-private-files.sh`. The script treats **all** `evidence_upload.storage_key` values as committed references (including historical/noncurrent and now-inapplicable uploads), removes only object keys absent from that set, and then clears uncommitted staging parts. For Docker volumes, mount the `private-files` volume into a one-off maintenance container and run the script with network access to the Compose database; never reconcile while the backend is running. Inspect/backup the volume and database before destructive production maintenance.
