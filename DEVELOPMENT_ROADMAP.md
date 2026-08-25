# PlumbTrack Development Roadmap

**Product:** PlumbTrack for Caulfield South Plumbing  
**Primary model:** ServiceM8-style residential field service  
**Secondary references:** Tradify for simplicity; Slack for HQ collaboration patterns  
**Audience:** Product, frontend, backend, integrations, operations, and QA  
**Roadmap baseline:** August 2026

---

## 1. Product direction

PlumbTrack is a field-service operating layer for Melbourne residential plumbing businesses. It should help a technician complete a 1–2 hour call-out with the fewest possible interactions while automatically producing the records the office, customer, accountant, and payroll system need.

The product is not a form-filling application and Slack is not the field system of record.

### Target technician experience

```text
Assigned
  → Navigate
  → Arrive / clock on
  → Capture photos and voice notes naturally
  → Select a service bundle or variation
  → Complete required safety checks
  → Customer approval
  → Invoice and leave
```

### Product principles

1. **Capture once, reuse everywhere.** A voice note, photo, time entry, or service selection should populate every relevant downstream record.
2. **Automate routine work.** Ask for confirmation only when an action is ambiguous, risky, regulated, or financially material.
3. **Offline by default.** Losing signal must delay synchronisation, not interrupt field work.
4. **PlumbTrack owns the job record.** Slack, accounting, payroll, payments, and evidence products are downstream or connected systems.
5. **Exceptions go to HQ.** Office staff should manage failures, disputes, and approvals rather than monitor every normal job.
6. **Professional, calm UI.** Dense enough for operations, simple enough for a tradie wearing gloves, and consistent across mobile and desktop.
7. **Provider-neutral contracts.** The job model should not be redesigned when Slack is replaced by Teams or Xero by MYOB.

---

## 2. Current baseline

### Already implemented

- ServiceM8-style residential job screen
- Tap-to-call and one-tap navigation
- Staff-specific clock-in/out with UTC timestamps
- GPS capture at clock-in
- Before/after photo workflow
- Voice-note and quick-note capture
- Preset service kits and item quantities
- Customer sign-off and invoice preview
- Slack-style in-app messaging mirror
- Server-side Slack incoming-webhook relay
- Persisted HQ notification feed with delivery state
- LocalStorage state persistence for legacy app state
- IndexedDB outbox for time, notifications, and photo uploads
- Exponential retry backoff with jitter
- HTTP 4xx terminal failure handling
- Dependency ordering for photo upload before Slack notification
- Idempotency keys for time, photo, and notification operations
- Light and dark theme modes using semantic CSS tokens
- Background-sync service-worker wake-up bridge
- API tenant scoping on the existing job routes
- Database migrations for contact metadata, GPS, notification outbox keys, and photo upload keys
- Unit tests for reducers, billing, API routes, Slack relay, and sync processing

### Known baseline limitations

- Authentication now has a signed bearer-session boundary and role guards, but a production identity provider/session issuer and membership bootstrap flow are still required.
- The organisation header remains only a non-production compatibility fallback; production requests must use a verified bearer session.
- Critical mutations now emit append-only audit events, but audit monitoring, retention, export, and support tooling remain to be completed.
- The service worker wakes an open foreground manager but does not independently execute all server sync operations.- The server now has a durable Slack delivery worker, transactional domain-event outbox, 
lease-based event worker, provider-neutral event and delivery adapter registries, lease-owned downstream delivery 
completion, durable attempt history, tenant-scoped integration health/retry APIs, and an HQ Integration Health 
screen with live counts, delivery history, auto-refresh, and authorised retry actions; accounting, payroll, payments, 
and evidence adapters remain to be implemented.
- Some job details such as service items, voice notes, safety confirmations, and daily reports remain client-local.
- Signed object-storage upload intents, idempotent media metadata, and the client binary-upload path are now available, but a production storage gateway/provider verification callback and resumable transfer worker are still required.
- Xero is still a simulated handoff.
- Customer, Property, and Appointment domain models and scoped APIs are now present, but dispatch automation, geofencing, and price-book linkage remain.
- No true browser-level offline/reconnect test suite exists yet.
- The design-token migration is complete for core surfaces but not every legacy Slack-specific component.

---

## 3. Delivery strategy

Work is ordered by **risk reduction and operational leverage**, not by screen count.

### Release tracks

| Track | Purpose |
|---|---|
| Field Reliability | Offline work, media, timers, sync, recovery |
| Trust & Security | Authentication, tenant isolation, auditability, privacy |
| Job Operations | Customers, dispatch, service lifecycle, exceptions |
| Integrations | Slack, accounting, payroll, payments, evidence |
| Intelligence | Voice, automation, suggestions, anomaly detection |
| Design System | Responsive, accessible, token-driven product quality |

Every release must preserve the core field path and pass the release gates in Section 10.

---

# Phase 0 — Stabilise the foundation

**Status:** In progress / partially complete  
**Goal:** Establish a trustworthy technical baseline before real customer data or money flows through the system.

## Deliverables

- Keep all database changes additive and migration-safe.
- Document local, preview, test, and production run procedures.
- Establish a single domain-event naming convention.
- Transactionally persist domain events with stable IDs and lease-based replay.
- Establish a single idempotency-key convention across all mutations.
- Add structured server logging with request ID, organisation ID, operation ID, and external provider ID.
- Separate demo seed data from production configuration.
- Replace misleading UI copy such as “local only” where server sync is available.
- Complete the token migration for core PlumbTrack surfaces.
- Add browser-level smoke tests for the primary job path.

## Exit criteria

- A fresh checkout can install, migrate, seed, typecheck, test, lint, and build.
- No destructive migration is required for an additive release.
- All production mutations have an idempotency strategy.
- Every user-visible integration state maps to an actual stored state.

---

# Phase 1 — Production field reliability

**Priority:** P0  
**Goal:** A technician can work safely inside a concrete building with no signal and never lose billable time, evidence, or customer records.

## 1.1 Universal offline outbox

Extend the IndexedDB outbox to every field mutation:

- Clock-in and clock-out
- Photos
- Voice notes and transcripts
- Service items and variations
- Safety confirmations
- Customer signatures
- Job status changes
- Customer notes
- Daily reports where applicable
- Messages and HQ updates
- Invoice creation requests

Each operation must contain:

```ts
{
  id,
  organisationId,
  entityType,
  entityId,
  action,
  payload,
  createdAt,
  retryCount,
  nextRetryTimestamp,
  status,
  dependsOn,
  idempotencyKey,
  lastError
}
```

## 1.2 Media storage

The API now provides tenant-scoped, expiring signed upload intents, idempotent
operation keys, and a completion contract backed by `MediaAsset` metadata. The
client outbox uses this binary path when storage is configured and retains the
legacy URL path only for local/demo fallback. Complete production media handling
with:

- IndexedDB blob storage on the device
- Client-side image compression
- Signed object-storage uploads
- Upload progress and resumability
- Thumbnail generation
- Hash-based duplicate detection
- Retention and deletion policies
- A verified storage callback or provider adapter before marking an asset uploaded

The local preview must remain available even while the upload is pending.

## 1.3 Sync recovery UX

Add a non-blocking sync centre with:

- Pending count
- Uploading count
- Failed count
- Last successful sync
- Retry failed
- Review error
- Remove local unsent item
- Per-job pending state

Normal work must never be blocked by a non-critical sync failure.

## 1.4 Background operation

Complete the PWA layer:

- Web app manifest
- Service-worker asset caching
- Offline application-shell loading
- Background Sync where supported
- Reconciliation when the app is reopened
- Graceful fallback for browsers without Background Sync

The server remains responsible for durable integration processing when no browser session is active.

## 1.5 Conflict handling

Add record revisions or ETags to mutable entities. The client must distinguish:

- Remote update newer than local update
- Local update not yet acknowledged
- Duplicate operation
- Invalid operation
- Conflict requiring an office decision

## Exit criteria

- A large mock photo can be captured offline, stored in IndexedDB, and previewed immediately.
- A reload does not lose the photo or pending operation.
- Reconnection uploads media before dependent notifications.
- Replaying the same operation cannot duplicate time, photos, messages, or signatures.
- A forced 422 is terminal and visible as user action required.
- A forced 503 retries using backoff.
- A browser-level test covers offline → reload → reconnect → reconciliation.

---

# Phase 2 — Identity, tenancy, privacy, and audit

**Priority:** P0  
**Status:** Foundation implemented; production identity provider and audit layer remain  
**Goal:** Make the application safe for real businesses, staff, customer data, and financial records.

## Deliverables

- Signed bearer-session verification at the API boundary
- Server-side tenant resolution from authenticated claims
- Append-only organization-scoped audit events for critical mutations
- Technician, dispatcher, manager, accountant, admin, and owner roles
- Route-level role guards for job, quote, photo, time-entry, and organization mutations
- Durable `User` and `OrganizationMembership` schema foundation
- User authentication and session management through a production identity provider
- Organisation membership and server-side tenant resolution
- Role-based API authorisation
- Organisation-scoped integration credentials
- Encrypted secrets management
- Secure signed upload URLs
- Customer data access rules
- Rate limiting by identity and organisation
- Audit log for critical actions
- Session/device management
- Privacy and retention controls
- Australian privacy and data-retention review

## Audit events

Record immutable audit facts for:

- Clock-in and clock-out
- GPS coordinates and accuracy
- Time corrections
- Price or quantity changes
- Variations
- Customer signature
- Safety confirmations
- Invoice creation and edits
- Payment state changes
- Integration delivery outcomes
- Data exports and deletions

## Exit criteria

- No production organisation can be selected solely by changing a browser header.
- Every protected API route has an authorisation test.
- Expired, malformed, or cross-organization bearer sessions are rejected before database access.
- Critical field, quote, notification, photo, and job mutations record actor, tenant, entity, and action context.
- Support staff can reconstruct the history of a disputed job.
- Secrets are never shipped to the web bundle or stored in local job state.

---

# Phase 3 — Core residential operations

**Priority:** P1  
**Status:** Customer/property/appointment foundation implemented; dispatch automation and price book remain  
**Goal:** Replace seed-only metadata and manual transitions with a real service-business operating model.

## 3.1 Domain model

The first residential domain slice now includes server-backed `Customer`,
`Property`, and `Appointment` entities. Jobs can link to validated customer and
property records while legacy client/address fields remain additive for older
records. Continue introducing:

```text
Organisation
User
Customer
Contact
Property
Job
Appointment
ServiceVisit
TimeEntry
Evidence
VoiceNote
SafetyCheck
ServiceItem
Quote
Invoice
Payment
IntegrationDelivery
AuditEvent
```

A job references a customer and property rather than duplicating all customer information.

## 3.2 Job lifecycle

Implement:

```text
Assigned
En route
Arrived
Working
Awaiting customer
Awaiting parts
Complete
Invoiced
Paid
Closed
```

The UI should show only the next useful action for the current state.

## 3.3 Dispatch and arrival

- Appointment time windows
- Technician assignment
- Route and ETA
- Geofence-assisted arrival
- Configurable auto-clock-in policy
- Auto-clock-out grace period
- Wrong-address detection
- Customer ETA notifications
- Access instructions before arrival

Automatic clocking must be transparent, reversible, and privacy-controlled.

## 3.4 Price book and service kits

Create an organisation-managed catalogue for:

- Tap and cartridge repairs
- Blocked drains
- Burst pipes
- Hot water diagnostics
- Hot water replacements
- Gas compliance work
- Toilet repairs
- Leak detection

Each item or bundle should support:

- Price
- Cost
- Labour allowance
- Materials
- GST treatment
- Accounting code
- Required evidence
- Required safety checks
- Customer wording
- Version history

## Exit criteria

- A technician can complete a standard call-out without a paragraph form.
- Customer and property data is reusable across jobs.
- A job can be dispatched, completed, invoiced, and audited entirely through server-backed records.
- Customer/property ownership is validated before records are linked to a job or appointment.
- Completing a job emits one provider-neutral domain event for downstream integrations.

---

# Phase 4 — Slack HQ integration

**Priority:** P1  
**Status:** Transactional event outbox, lease worker, rendering boundary, adapter registry, and durable Slack delivery implemented; provider configuration and interactive Slack app remain  
**Goal:** Give HQ excellent operational visibility without making technicians operate a second app.

## 4.1 Outbound Slack relay

Job completion now follows a durable provider-neutral event into a Slack edge adapter:

```text
job transaction + DomainEventOutbox
  → lease-based DomainEventWorker
  → IntegrationRouter
  → SlackAdapter
  → rendered Block Kit
  → IntegrationDelivery worker
```

The current renderer is a typed component-style boundary because `jsx-slack`
is not an existing workspace dependency; it can be replaced by that JSX compiler
without changing the domain event or queue contracts. Use a server-side
integration adapter with:

- Block Kit messages
- Organisation-configured channel mapping
- Job deep links
- Thread correlation
- Idempotent delivery
- Durable retry worker
- Delivery attempts and timestamps
- Adapter registry with provider-specific delivery contracts
- Dead-letter state after terminal provider errors or exhausted retries
- Stale-processing recovery after worker restart
- Quiet hours and severity policies
- Photo/evidence links
- Redacted customer data where required

## 4.2 Event routing

Recommended events:

- Job assigned
- Technician en route
- Technician arrived
- Emergency flag raised
- Delay recorded
- Safety issue raised
- Customer signed
- Invoice created
- Payment failed
- Integration failed

Do not send every timer tick or photo as a separate noisy message.

## 4.3 Slack channels

Suggested defaults:

- `#field-live`
- `#field-completions`
- `#jobs`
- `#quotes`
- `#payments`
- `#exceptions`

Allow each organisation to override routing.

## 4.4 Slack app phase

Continue using incoming webhooks for outbound-only relay. Add a full Slack app only when HQ needs interactive actions such as:

- Approve a variation
- Reassign a job
- Acknowledge an emergency
- Request a customer callback
- Open a job in PlumbTrack

## Exit criteria

- Slack outages never block field work.
- Duplicate notification delivery is prevented.
- A persisted Slack delivery can be retried after the API process restarts.
- HQ can trace every Slack message back to a PlumbTrack job event.
- Failed delivery is visible in the notification feed and recoverable by policy or retry worker.
- Delivery observability includes attempt history, provider response metadata, tenant-scoped health counts, and role-protected retry recovery.

---

# Phase 5 — Accounting, payments, payroll, and evidence integrations

**Priority:** P1/P2  
**Goal:** Eliminate double entry from completion to cash collection and payroll.

## 5.1 Accounting

Implement connector interfaces for:

- Xero
- MYOB
- QuickBooks

Capabilities:

- OAuth connection
- Contact mapping
- Item/account-code mapping
- Draft invoice creation
- Invoice update
- Credit notes
- Payment reconciliation
- Token refresh
- Webhook processing
- Duplicate prevention
- External ID storage
- Retry and reconciliation dashboard

## 5.2 Payments

Support Stripe or Ezidebit through a provider-neutral payment interface:

- Payment link generation
- SMS/email delivery
- Payment status webhooks
- Failed payment notifications
- Refunds
- Reconciliation
- Customer receipt

## 5.3 Payroll

Support export or API connectors for Deputy and Employment Hero:

- Staff mapping
- Cost codes
- Geofenced time evidence
- Allowances
- Overtime rules
- EBA-aware configuration
- Approval workflow
- Export reconciliation

## 5.4 Evidence products

Add export/adapters for evidence systems such as CompanyCam or SiteCam when required:

- Before/during/after media
- Timestamp and location metadata
- Customer approval package
- Job and invoice linkage
- Concealed-works package where applicable

## Exit criteria

- An approved completion creates one authoritative invoice draft.
- The same invoice cannot be created twice by retrying.
- Payment state reconciles back to the job.
- Approved time is exportable to payroll with staff and cost-code mapping.

---

# Phase 6 — Automation and intelligence

**Priority:** P2  
**Goal:** Reduce technician input further while keeping humans in control of risky decisions.

## Deliverables

- Voice transcription with Australian English support
- Automatic work-summary generation
- Suggested service bundles from voice and job scope
- Suggested materials from service bundle and transcript
- Photo classification as before/during/after
- Duplicate and low-quality image detection
- Customer-facing completion-note generation
- Automatic weather and location context
- ETA and arrival automation
- Unusual-duration detection
- Unusual-price or material-cost detection
- Callback and warranty suggestions
- Automatic follow-up reminders

## Safety constraints

AI may suggest but must not silently:

- Certify regulated gas work
- Approve a variation
- Change a price above configured limits
- Close a disputed job
- Alter a signed record
- Delete evidence

## Exit criteria

- Routine repairs require fewer interactions than the current workflow.
- Suggestions are explainable and reversible.
- Human approval is required for regulated, financial, or customer-facing exceptions.

---

# Phase 7 — Design system and multi-device product quality

**Priority:** P1/P2  
**Goal:** Deliver the visual quality expected from a polished 2026 professional application.

## Design system

Centralise semantic tokens for:

- Backgrounds
- Surfaces
- Inset surfaces
- Borders
- Text hierarchy
- Accent actions
- Warning and danger states
- Focus rings
- Shadows
- Sheet surfaces
- Signature surfaces
- Motion timing

The dark and light themes must share semantic roles rather than duplicate component-specific colours.

## Responsive layouts

- Technician mobile-first layout
- Tablet layout for supervisors
- Desktop HQ operations workspace
- Multi-column job detail on wide screens
- Keyboard navigation
- Touch and glove-friendly targets
- Safe-area support
- Reduced-motion support
- High-contrast support
- Screen-reader labels and live regions

## UX standards

- One primary CTA per context
- Optimistic updates
- Undo for reversible routine actions
- No unnecessary confirmation modals
- Clear offline/sync status
- Skeletons that match final layout
- Helpful empty and error states
- No dead-end integration errors
- No visual dependence on colour alone

## Exit criteria

- Core workflows pass accessibility review.
- Light and dark themes are visually coherent across field and HQ experiences.
- No core component contains provider-specific colour literals outside the token layer.
- Mobile and desktop screenshots meet the approved design review baseline.

---

## 4. Technical architecture target

```text
                    ┌─────────────────────┐
                    │  Mobile / Web UI     │
                    │  Field + HQ          │
                    └──────────┬──────────┘
                               │
                 local-first command/event API
                               │
                    ┌──────────▼──────────┐
                    │ IndexedDB outbox    │
                    │ + media store       │
                    └──────────┬──────────┘
                               │
                       authenticated API
                               │
        ┌──────────────────────▼──────────────────────┐
        │ Postgres domain model + server outbox       │
        │ revisions, audit events, idempotency         │
        └───────┬──────────┬──────────┬───────────────┘
                │          │          │
          Slack worker  Xero worker  Payroll/payment workers
                │          │          │
             HQ flow   accounting   external systems
```

### Architectural rules

- React components dispatch domain actions; they do not own integration logic.
- The API is the authority for identity, tenant access, billing, and audit records.
- The client is the authority for immediate offline interaction only.
- All integration work is asynchronous and idempotent.
- Every external provider is behind an adapter interface.
- Local and server records use stable IDs and explicit revision state.
- Provider failures are observable and recoverable.

---

## 5. Testing strategy

### Unit tests

- Reducer state transitions
- Billing and GST rules
- Time duration and overnight entries
- Backoff calculation
- Error classification
- Dependency scheduling
- Idempotency behaviour
- Token utility functions

### API tests

- Authentication and organisation isolation
- Permission matrix
- Idempotent mutations
- Time-entry scoping
- Photo upload scoping
- Notification persistence
- Slack delivery state
- Webhook signature validation
- Accounting reconciliation

### Browser tests

- Clock on/off flow
- Multi-staff job
- Offline photo capture
- Offline voice note
- Offline reload
- Reconnect and queue replay
- Media-first notification dependency
- 4xx terminal state
- 5xx retry state
- Failed-operation recovery
- Light/dark theme persistence
- Customer sign-off and invoice flow

### Failure-injection tests

- API unavailable
- API timeout after server acceptance
- Slack 429
- Slack 500
- Xero token expiry
- IndexedDB quota error
- Missing media payload
- Duplicate browser tab
- Device clock skew
- Partial upload

---

## 6. Operational metrics

Track product and reliability metrics from the beginning of production rollout.

### Field efficiency

- Median time from job open to clock-in
- Median time from clock-in to completion
- Number of technician taps per completed job
- Percentage of jobs completed without manual paragraph entry
- Percentage of jobs auto-populated from service bundles
- Percentage of jobs completed without office intervention

### Reliability

- Offline operations captured
- Successful sync rate
- Median sync latency after reconnection
- Queue age at p50/p95
- Terminal failure rate
- Media upload success rate
- Duplicate operation rate
- Lost-event rate, target zero

### Integrations

- Slack delivery rate
- Slack delivery latency
- Xero creation success rate
- Payment-link conversion rate
- Payroll export rejection rate
- Reconciliation backlog

### Business outcomes

- Invoice creation time after completion
- Payment time after invoice
- Average revenue per call-out
- Variation leakage
- Unbilled completed jobs
- Customer disputes involving missing evidence
- Repeat/callback rate

---

## 7. Release gates

No production release should proceed unless all applicable gates pass.

### Data and security

- Migration tested on a realistic copy of production data
- Rollback/forward recovery procedure documented
- Tenant isolation tests pass
- Secrets and credentials audited
- No sensitive data in client logs

### Offline reliability

- Offline clock and photo scenario passes on supported browsers
- Queue survives reload
- Duplicate replay test passes
- Terminal error recovery is usable
- Media storage quota behaviour is tested

### Integrations

- Slack delivery and failure states verified
- Accounting sandbox reconciliation verified
- Webhook signatures validated
- External IDs stored and traceable

### UX

- Primary field path completed with one hand
- No blocked normal workflow due to integration outage
- Light and dark themes reviewed
- Accessibility smoke test passes
- Mobile viewport and keyboard behaviour verified

### Observability

- Error monitoring enabled
- Sync and integration dashboards available
- Alert thresholds configured
- Support can locate an operation by job ID and operation ID

---

## 8. Suggested delivery sequence

### Release 0.1 — Offline field foundation

- Universal IndexedDB outbox
- Photo blob storage
- Signed media upload contract
- Idempotent client binary upload path
- Retry/recovery centre
- PWA shell
- Browser offline tests

### Release 0.2 — Production trust

- Authentication
- Organisation membership
- Role permissions
- Audit events
- Secure media storage

### Release 0.3 — Residential operations

- Customer/property model
- Dispatch lifecycle
- Geofence policies
- Versioned price book
- Real service bundles

### Release 0.4 — HQ collaboration

- Rich Slack Block Kit relay
- Durable server integration worker with atomic lease claiming
- Exception routing
- Slack deep links and job threads

### Release 0.5 — Cash and labour

- Xero/MYOB connector
- Payment links
- Payroll export
- Reconciliation dashboards

### Release 0.6 — Automation

- Voice summaries
- Suggested services/materials
- Photo classification
- Customer communication automation

### Release 1.0 — Production scale

- Multi-organisation operations
- Full observability
- Disaster recovery
- Performance budgets
- Support tooling
- Security review
- Customer pilot sign-off

---

## 9. Out of scope for the immediate residential release

Do not allow commercial-construction features to distort the primary call-out workflow. The following remain secondary until residential operations are mature:

- Full multi-week construction planning
- BIM coordination as a primary workflow
- Complex progress claims
- Retention schedules
- Subcontractor payment chains
- Large-scale daily site reporting
- Visitor registers and weather logs for standard service calls

These capabilities can be added through the same domain and integration layers later, but they should not add friction to routine residential jobs.

---

## 10. Definition of success

PlumbTrack is ready for a controlled production pilot when a technician can complete a normal Caulfield South call-out as follows:

1. Open the assigned job.
2. Navigate to the property.
3. Arrive and clock on with minimal interaction.
4. Capture before/after evidence even with no signal.
5. Speak a short work summary instead of typing a report.
6. Select a service bundle or variation.
7. Complete only the safety checks relevant to that job.
8. Obtain customer approval through the appropriate channel.
9. Leave without waiting for network connectivity.
10. Have time, evidence, job notes, invoice, payment link, payroll record, and HQ Slack update reconcile automatically.

The final product measure is not the number of screens shipped. It is:

> **How little attention a technician must give the application while still producing a complete, trusted, billable job record.**
