# `@fastgpt-sdk/durable-saga`

A portable durable Saga runtime for linear, forward-recovery workflows. It has no runtime dependency
on MongoDB, Redis, BullMQ, Mongoose, FastGPT, or a specific schema library. This workspace package is
currently private and governed by the repository license; extracting it under a separate open-source
license requires an explicit legal decision rather than a package.json declaration.

## Guarantees

- Durable at-least-once Activity execution, not exactly-once remote effects.
- Idempotent start by `sagaId + inputHash`; terminal tombstones are retained by default.
- Monotonic execution epochs and token/revision fencing.
- Multi-resource reservations owned until a terminal transaction.
- Explicit `idempotent`, `reconcileRequired`, or `manual` effect policy per step.
- Step output and complete next-state validation before checkpoint.
- Domain projection and Saga checkpoint through one driver transaction callback.
- Optional leases and wake-up scheduling; neither is a source of durable truth.

## Layers

```text
core       definitions, registry, errors, state invariants
runtime    engine and Store/Lease/Wakeup/Clock/Observer ports
```

The application must keep every historical `name@version` definition registered while active Saga
instances still reference it. A manifest mismatch is never auto-failed.

## Minimal Example

```ts
import {
  bindSaga,
  createSagaEngine,
  createSagaRegistry,
  defineSaga,
  defineStep,
  type DurableSagaStore
} from '@fastgpt-sdk/durable-saga';

type Input = { accountId: string };
type State = { charged: boolean };
type Transaction = { session: unknown };

declare const store: DurableSagaStore<Transaction>;

const passthrough = <T>() => ({ parse: (value: unknown) => value as T });

const charge = defineStep<Input, State, boolean, Transaction>({
  id: 'charged',
  output: passthrough<boolean>(),
  effect: { type: 'idempotent' },
  retry: { maxAttempts: 5, initialIntervalMs: 1_000 },
  timeoutMs: 30_000,
  execute: async ({ idempotencyKey, input }) => {
    await paymentClient.charge(input.accountId, { idempotencyKey });
    return true;
  },
  apply: ({ state, output }) => ({ ...state, charged: output })
});

const definition = bindSaga(
  defineSaga<Input, State, Transaction>({
    name: 'billing.charge',
    version: 1,
    input: passthrough<Input>(),
    state: passthrough<State>(),
    initialState: () => ({ charged: false }),
    reservationKeys: (input) => [`account:${input.accountId}`],
    steps: [charge]
  }),
  {}
);

const registry = createSagaRegistry<Transaction>();
registry.register(definition);
registry.seal();

const engine = createSagaEngine({
  store,
  registry
});

await engine.start(definition, {
  sagaId: 'charge-command-123',
  input: { accountId: 'account-1' },
  run: true
});
```

Production drivers should use a transactional authoritative store. Queue jobs should contain only a
Saga ID and expected revision, then call `engine.run`; queue attempts and results must not represent
business retry or workflow state.

## Definition Contract

Every definition has a positive `version`. Bump it whenever schemas, `when`, `apply`, reservation
semantics, terminal bindings, or any other running-instance behavior changes. Keep every referenced
historical `name@version` registered during a rolling deployment. The registry object is canonical:
`start` never executes callbacks from an unregistered lookalike.

`reservationKeys` are authoritative and remain owned while waiting or blocked. Optional
`initializationLeaseKeys` and `executionLeaseKeys` are advisory concurrency controls held only around
those slices; they must not be treated as durable ownership.

## Effect Policies

| Policy | Recovery rule |
| --- | --- |
| `idempotent` | Activity may run at least once with a stable idempotency key. The caller owns true replay safety. |
| `reconcileRequired` | After an uncertain result, wait through the isolation window and run a read-only reconcile before any replay. |
| `manual` | Any uncertain result blocks until an operator explicitly resolves it. |

Abort signals and timeouts cannot stop a provider SDK that ignores its abort signal. For
`reconcileRequired`, isolation is extended from the point the result becomes uncertain. An
`idempotent` Activity must tolerate a previous non-cooperative call continuing in the background.

## Status And Recovery

`pending`, `running`, `waiting`, and `blocked` are active statuses. `completed` and `failed` are
terminal. Blocked instances retain reservations and require operator attention; they are never
silently expired or replayed.

Mongo or another transactional store is the only truth. A queue improves wake-up latency, while a
periodic `recoverDue()` scan repairs lost queue notifications, worker crashes and stale executions.
Deterministic queue jobs must be removable after completion/failure so the same unchanged Mongo
revision can be scheduled again.

Terminal tombstones are retained indefinitely, preserving `sagaId` idempotency.

## Operator Resolution

`resolveBlocked` is revision-fenced. `retryReconcile` preserves the uncertain checkpoint.
`confirmNotApplied` clears it only after an operator explicitly asserts that the external effect did
not happen; the runtime never infers that assertion from a timeout.

## Payloads And Drivers

Input and state schemas run both at start and recovery. The default input hash is canonical and
type-tagged, omits optional object properties whose value is `undefined`, and rejects cycles,
non-finite numbers, unsupported class instances and array `undefined`. Driver payload support still
sets the final persistence boundary.

All execution mutations are fenced by revision, execution token, and execution epoch. Domain
projection and checkpoint must commit atomically. Transaction callbacks may be retried by the
database and therefore must never contain remote I/O. Persisted error details are bounded,
cycle-safe and redact common credential keys.
