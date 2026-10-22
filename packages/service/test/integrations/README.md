# Service Integration Tests

- `vectorDB/`: real vector database integration tests and local compose files
- `sandbox/`: FastGPT Agent Sandbox business chains against the dev infrastructure
- `ai/sandbox/`: independent OpenSandbox resource requests integration tests. Run with
  `pnpm test packages/service/test/integrations/ai/sandbox/resourceRequests.integration.test.ts`
  or include them with `FASTGPT_TEST_MODE=integration pnpm test`. They are excluded from the default
  unit test suite. The 8 HTTP cases run locally; the 4 actual Pod cases require
  `SANDBOX_INTEGRATION=true`, `AGENT_SANDBOX_PROVIDER=opensandbox`,
  `AGENT_SANDBOX_OPENSANDBOX_RUNTIME=kubernetes`, and a configured provider URL, API key, and image.
  Docker skips the actual Pod cases. Each Kubernetes case deletes its temporary sandbox after use.
  No persistent volumes are created, and Pod QoS is not directly verified.

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
