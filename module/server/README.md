# Progress business ownership

The public module owns the monitoring routes, configuration persistence, create/reserve/enqueue transaction orchestration, result queries, reports and provider job repository. `createProgressRepository(core)` constructs the complete business repository; the private account repository extends it with login, wallet/account management and administrator identity views.

`ProgressRepositoryCore` supplies admitted workspace predicates, active owner checks and shared funds primitives. Every funds reservation and settlement receives the same Drizzle transaction used for monitor/run/attempt/job writes. No HTTP boundary or second transaction is introduced. The public code decides whether and when to reserve, submit, cancel or retry; Core only performs generic identity and unified money operations.

`createProgressWorkerRepository(core)` owns leases, result acceptance, reconciliation, schedule materialization, retries and monitoring cleanup. Private Core provides identity retention and financial-reference cleanup, while module code owns the business records. The worker processor in `worker/` consumes only progress jobs.

`schema/index.ts` is the single source for monitoring tables, provider queues/catalog/results/observations and immutable per-attempt price/settlement snapshots. Foreign keys to private identities/pricing/reservations are supplied as Core column handles. Existing table names, foreign keys and transactions are unchanged; this extraction does not add a migration.

Public route factories receive an admitted context from the host. They never read session cookies, passwords, member directories or tenant tables. Independent questions are stored as progress business records; cross-module imports belong to the main-workbench adapter.
