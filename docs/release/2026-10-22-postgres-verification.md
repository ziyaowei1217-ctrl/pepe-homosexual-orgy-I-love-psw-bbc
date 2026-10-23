# PostgreSQL verification

The isolated managed PostgreSQL 18 run passed all eight integration cases on server version 180006 with verified TLS. Three cases cover immutable identity binding, concurrent exchanges, recycled-email rejection and atomic invitations. Five cover query deadlines, readiness recovery, transaction rollback, Prisma error mapping and quoted schema selection. The adjacent JSON records each case and SHA-256 fingerprints of the tested source; those files were unchanged during the run and when this release record was prepared. Six separate helper safety tests also passed.

The helper requires explicit remote-test opt-in plus an operator administrator connection. It creates UUID-named databases with independent ownership markers and checks each marker before deletion. Credentials stay out of command arguments and release evidence. The final run left no disposable databases; the main application database had zero public tables before and after. Subsequent main-database migrations and restricted runtime-role checks are a separate deployment step.

An earlier attempt passed the eight cases but failed cleanup. Its failed result is retained. Cleanup was corrected to use PostgreSQL's shared database-comment lookup, and both databases from that attempt were removed only after their ownership markers were verified.

This record does not establish live Google OAuth behavior, runtime-role privileges, messaging or published-site acceptance. The identity tests supply an already verified identity fixture. Docker/PostgreSQL 16 was not available locally. The machine-local raw receipts and redacted test output are retained separately; connection URLs, credentials and workstation paths are omitted from this committed record.
