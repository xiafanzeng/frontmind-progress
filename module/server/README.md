# Progress server

`monitoring-read-repository.ts` owns progress read SQL and workflows. The
schema declarations are module owned in `modules/progress/schema`. `read-helpers.ts`
is a temporary compatibility port for pure aggregation helpers while Core read
contracts are published; it is the remaining private dependency and must be
replaced by injected helper ports before independent publication.
