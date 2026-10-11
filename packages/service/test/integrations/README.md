# Service Integration Tests

- `vectorDB/`: real vector database integration tests and local compose files
- `sandbox/`: FastGPT Agent Sandbox business chains against the dev infrastructure
- `workflow/fileUrls*.integration.ts`: real HTTP file classification and workflow consumer chains

## Workflow file URLs

These tests use a dedicated configuration without the shared mock setup, database services, or
model credentials. The `.integration.ts` suffix keeps them out of the default mocked test suites.

```bash
# Local HTTP fixtures: real HEAD/GET, redirects, timeouts, concurrency, Context and message adaptation
pnpm --dir packages/service exec vitest run --config vitest.files.integration.config.ts --reporter=verbose --silent=false

# Optional public endpoints: production-mode HTTP safety checks, image messages and actual file bytes
FILE_URL_INTEGRATION_PUBLIC=true pnpm --dir packages/service exec vitest run --config vitest.files.integration.config.ts --reporter=verbose --silent=false
```

The local group uses development mode to permit its loopback HTTP server. The public group uses
production mode and the product default `CHECK_INTERNAL_IP=false`; set `CHECK_INTERNAL_IP=true`
explicitly to test strict private-network blocking. Fake-IP DNS environments (for example, domains
resolved to `198.18.x.x`) can block public fixtures under that strict policy. Public tests also
depend on Internet access and third-party availability and are therefore opt-in.

Server-side request logs verify HEAD-first classification, bounded streaming GET fallback for
unsupported HEAD or generic MIME, cancellation, a shared timeout budget, and redirect safety.
Both HTTP 200 (Range ignored) and 206 fixtures verify that the client closes after 8 KiB,
before the server sends the remaining 1 MiB. Deduplication and quotas happen before probing,
and concurrent consumers share probes. The system helper is also exercised without a Context.
Known limits are asserted explicitly: failed probes fall back to `file`,
and recognized suffixes are trusted even if GET returns a different format. These suites execute
file preparation and node message adapters, not a full workflow scheduler or a paid LLM response.

## Sandbox

This suite tests FastGPT rather than the provider SDK. It covers `prepareSandboxToolRuntime`, all
eight tools dispatched by `runSandboxTools`, Mongo lifecycle state, Redis leases and preview
sessions, provider/volume cleanup, egress policy, and failure recovery.

The suite loads `test/.env.test.local` and uses the dev Mongo and Redis services by default. Mongo
gets a random database; Redis uses DB 15 so lifecycle leases and preview sessions execute real
Redis commands without mixing with dev application keys. Set `SANDBOX_INTEGRATION=true` and a
complete provider configuration, then run:

```bash
FASTGPT_TEST_MODE=sandbox pnpm test
```

`SANDBOX_INTEGRATION_TOOL_MAX_MS`, `SANDBOX_INTEGRATION_TIMEOUT_MAX_MS`,
`SANDBOX_INTEGRATION_LIFECYCLE_MAX_MS`, and `SANDBOX_INTEGRATION_CLEANUP_MAX_MS` configure the
single-operation budgets. The final test output contains the measured wall-clock duration and the
tool-reported duration for every command. Ordinary tools default to a strict 2-second budget;
timeouts and lifecycle recovery use separate budgets because they intentionally wait for remote
state transitions.

The suite includes the multi-Chat and concurrent-command case. Every fixture creates a unique App
source and is removed through FastGPT's delete lifecycle, including provider runtime, egress
sidecar, persistent volume, archive phase, and Mongo record.
