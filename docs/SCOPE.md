# Regulatory and Licensing Platform — MVP Scope

## Objective and scope boundary

Build a product for operators applying for food business licences and officers reviewing their applications in a **fictional jurisdiction**. The initial domain covers **fixed-premises cafés and restaurants**. Product rules and document requirements are fictional assumptions, not assertions of legal compliance.

Implement the selected features of **use case 1: Operator Application Submission & Resubmission** and **use case 2: Officer Application Review & Feedback** from the Software Engineering Assessment. Retain the pre-site review statuses plus approved/rejected. Defer site/post-site states and workflows, including use case 3. This is deliberately scoped coverage, not full use case 2 or all-status compliance. The brief describes a three-day MVP; scope decisions here follow the agreed product requirements rather than treating that time limit as the deciding constraint.

This document records the delivered local core MVP and its accepted boundaries. Submission, simulated processing, fixed correction/resubmission rounds, officer resolution/final decisions, immutable history and persistent in-app notifications are implemented. Verification evidence and remaining limitations are recorded in [the README](../README.md) and [UI review](UI_REVIEW.md); local checks do not replace required hosted CI.

## Users and access

- One web product provides role-specific operator and officer workspaces.
- Normal local setup seeds exactly **one operator and one officer** in persistent storage. Each application has one operator owner; shared business teams are excluded.
- Real sign-in uses Spring Security within the backend. Store password hashes; enforce roles and ownership on the server, including document access. Do not compare credentials against hardcoded runtime values.
- Provide convenient default **local development** credentials through setup. They are not a production credential policy. Do not commit secrets or deployment credentials.
- No public registration or user-management UI. Independent security test fixtures may exercise other identities without expanding normal product setup.

## Application information and documents

The following fields are required unless marked optional or conditional. Enumerations, formats, atomic validation and conditional evidence rules are implemented in [the product specification](SPEC.md) and enforced by the backend.

| Section | Information |
| --- | --- |
| Business identity | Legal name, registration number, business structure; optional trading name |
| Applicant/contact | Applicant name, role, email, phone |
| Premises | Address, owned/rented tenure; an explicit unit-applicability Yes/No choice, unit number when applicable; optional premises name |
| Food operations | Business type, at least one preparation activity, at least one service mode (dine-in/takeaway/delivery), proposed opening date |
| Declaration | Confirmation of accuracy and authority to apply |

Required evidence: business registration, premises layout, and permission to use the premises for a food business. Lease evidence applies to rented premises; ownership evidence applies to owned premises. An authorization letter is required when the applicant acts as a representative. Officers may request missing or additional evidence only when publishing a fixed correction set during an officer review round.

Accept **PDF, JPEG, and PNG**, at most **10 MB per file**, with one current file per document request. Replacing a document creates a new file record; previously submitted files remain available to their submission versions. Validate formats and fictional product consistency on key paths, without implying checks against an official register or real jurisdiction's laws.

Operating hours have been removed from application entry, review screens and completeness/submission requirements. Existing stored values and immutable submission records are retained for compatibility; ordinary form saves do not overwrite them.

## Functional coverage

### Operator submission

- Create and save a working draft, enter the complete application, and upload documents through drag-and-drop or file selection.
- Show overall completion progress and basic, clearly labelled **simulated document verification status per uploaded document**, updating as the simulated check runs without a manual page reload. No live AI integration or dual live/mock modes.
- Block initial submission for missing mandatory fields/documents, invalid input, or failed uploads. Simulated AI warnings and flagged verification issues are not included at this stage.
- Preserve a fixed submission snapshot of field values and document references, with who submitted it and when. Ordinary draft saves update the working draft rather than creating submission versions.

### Officer review and contextual corrections

- Provide an organised full view of submitted form data and documents, including the basic simulated verification status.
- Let the officer request corrections on **individual fields and documents**, including requests for missing/additional documents. Officers enter their own explanations; predefined comment templates are deferred.
- Present officer feedback prominently at the top of the operator application, with links to the specific field or document concerned.
- Use strict alternating rounds: an officer reviews the current immutable submission, publishes one fixed correction request set, and cannot append to or edit that set while the operator correction round is open. The operator may update only the individually requested field/document targets and resubmits a new immutable version. The officer then reviews that version, resolves requests, and may publish a new fixed round. Do not silently permit whole-section or whole-application edits, mid-round additions, or automatic conditional/dependent unlocks.
- On resubmission, preserve a new fixed snapshot, highlight changes, and allow officers to open and compare prior submissions with the latest one. Unchanged files can be referenced by multiple versions without duplicating their contents.
- Keep corrected issues awaiting officer review. Only the officer confirms resolution or requests a further correction; resubmission does not automatically resolve an issue.
- Support unlimited feedback/resubmission rounds without loss of application data. Retain feedback, submitted values/files, resolution history, actors, timestamps, and workflow decisions in the audit history.
- Keep cases discoverable across included status changes and filters; verify that queue/filter behaviour cannot silently lose a case. All-status coverage across deferred stages is not included.

### Decisions and notifications

- One officer may request corrections, approve, or reject after **document review**. No inspection prerequisite is imposed in the fictional jurisdiction.
- Approval records the officer, timestamp, and decision explanation. Licence numbers and certificate issuance are deferred.
- Rejection is final, requires an explanation, and retains the application and history. A rejected case cannot continue through corrections. Reopening and appeals are excluded.
- Status changes generate persistent **in-app operator notifications**; resubmission generates an officer notification. Notifications remain available when the recipient next signs in, including when they were logged out during the event.
- In-app delivery is the only notification channel. No external email delivery or local email-capture service. Separate browser sessions can exercise both roles simultaneously.

## Status assumptions and brief ambiguities

Retain the brief's labels for the included pre-site workflow even though actual site assessments are deferred:

| Internal status | Officer label | Operator label |
| --- | --- | --- |
| Application Received | Application Received | Submitted |
| Under Review | Under Review | Under Review |
| Pending Pre-Site Resubmission | Pending Pre-Site Resubmission | Pending Pre-Site Resubmission |
| Pre-Site Resubmitted | Pre-Site Resubmitted | Pre-Site Resubmitted |
| Approved | Approved | Approved |
| Rejected | Rejected | Rejected |

The product's working **Draft** state is separate from the assessment mapping. The brief's mapping table defines labels, not a complete transition graph. The backend enforces the scoped transition graph: Draft → Application Received → Under Review; review may publish a fixed Pending Pre-Site Resubmission round, the operator resubmits to Pre-Site Resubmitted, and the officer starts review again. Only the officer resolves/reissues requests and records a final Approved/Rejected decision after the mandatory conditions pass. Final cases are locked. Site/post-site states and separate approval routing are deferred. Queue/filter/history verification covers the included subset; it does not claim coverage of all original statuses.

The source mapping exposes “Pending Approval” to operators, but the later constraint prohibits exposing the internal approval stage. **Prioritise that prohibition.** A separate approval-routing stage is deferred in the accepted one-officer scope; if introduced later, its internal state must remain hidden through operator labels, codes, history, filters, and notifications. Ordinary submission, review, and correction statuses remain visible.

## Stack and architecture rationale

**Accepted frontend design constraint:** use existing **shadcn/ui components throughout**, with a black-background dark product UI closely matching the shadcn website's established look and feel. Prefer official component patterns and theme tokens; use only minimal layout/composition styling where necessary. Avoid bespoke widgets, custom widget behaviour, and an independently invented visual system. This does not require cloning the marketing website or remove the licensing workflow/business logic. The delivered shell has a black workspace, vertically stacked fields, profile controls, a notification dropdown, and grouped saved-answer/history views.

Use one monorepo with separate frontend and backend folders: **React, TypeScript, and Vite** for the frontend, and **Java Spring Boot with Spring Security** for the backend. This separation gives the frontend responsibility for the role-specific experience while the backend owns authentication, authorization, validation, and workflow rules. **PostgreSQL** stores accounts, application/workflow data, submission versions, notifications, audit history, and document metadata. Actual document files live in a persistent named **Docker volume** and are served only through the authorized backend; immutable file references preserve earlier submissions. **Docker Compose** runs separate frontend, backend, and database containers with persistent storage, providing a reproducible setup without externally hosted authentication or email services.

File writes and database updates are not one atomic transaction. Uploads use cleanup/recovery paths so failed file/database operations do not create usable broken references. Use database transactions for related workflow records and notifications, and protect against stale or duplicate actions without silently overwriting accepted work.

## Explicit mocks and deferrals

- **Simulated document verification:** basic per-document status only; no live AI integration. **AI warnings, verification results with flagged issues, and officer visibility of AI flags are deferred pending a later decision.** This is a deliberate gap against the original use cases' AI-result/flagged-issue criteria; do not claim those criteria are fully implemented.
- **Predefined comment templates:** deferred; contextual requests and responses use free-text explanations.
- **Site/post-site states and workflows:** deferred, including scheduling, use case 3 inspection checklist/on-site capture/post-site responses, and all-status queue/filter coverage. Separate approval routing is also deferred; the current scope permits one officer's document-based final decision.
- **Licence issuance, certificates, reopening, and appeals:** excluded to keep the final-decision boundary clear.
- **Registration, user administration, business teams, and separate identity service:** excluded; the agreed seeded accounts and backend authentication serve the initial users.
- **Email and local email capture:** excluded in favour of persistent in-app notifications.
- **Dedicated object-storage service:** deferred; the agreed volume-backed file storage meets the initial Docker setup.
- **Other licence categories, hotels, and non-fixed-premises businesses:** excluded from the agreed domain.

## Quality, verification, and deliverables

Provide a working repository (or assessment zip), this `SCOPE.md`, and a README with reproducible Docker setup, local sign-in instructions, stack rationale, known limitations, and “What I would do next.” Document AI-assisted development separately from the product's simulated verification: include tools/tasks, representative prompts, review and validation, corrections, and discarded/unhelpful output in the README's **AI Usage** section.

Validate key inputs on the backend and provide actionable errors without losing saved information. Verify role/ownership isolation, authenticated document access, and absence of committed secrets. Exercise initial submission, targeted corrections and missing-document uploads, multiple resubmission rounds, officer-confirmed resolution, version comparisons and retained files, final approval/rejection, persistent notifications, and discoverability across every included status/filter. Verify the scoped role-label mapping, approval-stage privacy, and retained history. Include failure-path checks for invalid uploads, partial storage failures, and stale/duplicate actions, plus persistence across container restarts. These are the scoped verification requirements. Executed test counts, skipped cases and browser journeys are documented in the README and UI review; this does not claim full assessment-state coverage or arbitrary performance targets.

## Remaining follow-ups

- Conditional correction requests must explicitly include dependent evidence targets before publication. Automatic dependent unlock and a correction-resubmit completeness exception were not accepted and are not implemented. Guidance and recovery for an already incomplete fixed set need a separately accepted product change.
- Site/post-site workflows, separate approval routing, live AI warnings/results and comment templates remain deferred as above.
- UI improvements still under review include historical-version action safeguards, final-decision confirmation, URL routing, search/pagination and sign-out/reload protection. The delivered notification dropdown supports refresh, read/all-read and clearing only the current recipient's messages.
- Hosting, production HTTPS, credential/secrets policy, operational monitoring and backup configuration remain destination-dependent. Dependency versions, Spring Security session/CSRF configuration, APIs, schema and local verification tooling are implemented in the repository rather than pending design choices.
- SonarQube and automatic cloud issue dispatch remain deferred; they require separate tooling, permission and trigger decisions. No new automation is implied by this scope.
