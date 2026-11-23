# `@fastgpt/sdk`

Official TypeScript / JavaScript SDK for FastGPT System OpenAPI.

- **Zero runtime dependencies** — built on standard Web Fetch, `FormData`, `Blob`, and `ReadableStream` (Node.js `>= 20`, Bun, Deno, Edge Runtime).
- **Lark-style domain resource tree** — `client.chat.*`, `client.datasets.*`, `client.apps.logs.*`, `client.models.*` (strictly scoped to declared System OpenAPI operations).
- **Direct typed responses** — `await` directly returns unwrapped business data `T`, with `.withRawResponse()` available whenever you need HTTP headers or `requestId`.
- **Workflow & pagination helpers** — workflow interactive pause/resume (`client.chat.interactive`) and async auto-pagination (`*AutoPaging` / `@fastgpt/sdk/pagination`).

---

## Installation

```bash
npm install @fastgpt/sdk
# or
pnpm add @fastgpt/sdk
```

---

## Quick Start & Authentication

FastGPT SDK supports both **Personal API Keys** (full System OpenAPI access including datasets, multi-app chat, and model catalog) and **App API Keys** (scoped to a single bound app; `appId` is omitted automatically):

```ts
import { FastGPT } from '@fastgpt/sdk';

// 1. Singleton client (supports static apiKey or async () => Promise<string> rotation)
const client = new FastGPT({
  baseUrl: process.env.FASTGPT_BASE_URL ?? 'https://cloud.fastgpt.cn',
  apiKey: process.env.FASTGPT_API_KEY,
  defaultAppId: process.env.FASTGPT_APP_ID // optional: auto-fills appId when using a personal key
});

// List available team/system models & check API Key connectivity
const catalog = await client.models.catalog();
console.log(catalog.version, catalog.data?.models.length ?? 0);
```

> **Browser safety**: Instantiating `FastGPT` in a browser environment (`window.document`) is blocked by default to avoid leaking API Keys into frontend bundles. Pass `{ dangerouslyAllowBrowser: true }` only if you explicitly accept the risk.

### End-User Identity Isolation (`withIdentity`) & Per-Request Overrides

FastGPT accepts `customUid` (external end-user isolation) or `authProxy` (team member proxy for personal keys with proxy enabled) in `query` or `body` depending on the endpoint. `client.withIdentity(...)` injects the identity into the exact contract carrier automatically:

```ts
const userClient = client.withIdentity({ customUid: 'customer_42' });

// Automatically injects defaultAppId + customUid into JSON body or query params
const histories = await userClient.chat.histories.list({ pageSize: 20 });

// Per-request overrides via the 2nd argument (RequestOptions)
const detail = await client.datasets.detail(
  { id: '68ad85a7463006c963799a05' },
  {
    apiKey: process.env.FASTGPT_PERSONAL_KEY,
    timeoutMs: 10_000,
    signal: AbortSignal.timeout(10_000)
  }
);
```

---

## Chat Completions (Sync & SSE Streaming)

Streaming and non-streaming variants of `/v2/chat/completions` are split into `completionsV2` and `completionsV2Stream`:

```ts
// Non-streaming
const completion = await userClient.chat.completionsV2({
  chatId: 'chat_001',
  messages: [{ role: 'user', content: 'Summarize today’s release notes.' }],
  detail: true
});

// Streaming with real-time events + post-stream aggregated summary
const stream = await userClient.chat.completionsV2Stream({
  chatId: 'chat_001',
  messages: [{ role: 'user', content: 'Summarize today’s release notes.' }],
  detail: true
});

for await (const event of stream) {
  if (event.type === 'answer') {
    process.stdout.write(event.textDelta);
  } else if (event.type === 'flowNodeStatus') {
    console.log('Node:', event.name, event.status);
  }
}

// Safely callable both after `for await` or standalone without iterating
const summary = await stream.finalResult();
console.log('Quotes:', summary.quotes, 'Interactive:', summary.interactive);
```

### Workflow Interactive Pause & Resume

```ts
if (userClient.chat.interactive.isPending(completion)) {
  const prompt = userClient.chat.interactive.unwrap(
    userClient.chat.interactive.extract(completion)!
  );

  if (prompt.type === 'userSelect') {
    await userClient.chat.interactive.replyUserSelect({
      chatId: 'chat_001',
      value: prompt.params.userSelectOptions[0]!.value
    });
  } else if (prompt.type === 'userInput') {
    await userClient.chat.interactive.replyUserForm({
      chatId: 'chat_001',
      values: { project: 'FastGPT', priority: 'P0' }
    });
  }
}
```

---

## Datasets: Collections & Auto-Pagination

```ts
// Upload a local file directly to create a dataset collection (multipart/form-data)
const created = await client.datasets.collections.createByLocalFile({
  datasetId: '68ad85a7463006c963799a05',
  trainingType: 'chunk',
  file: { data: markdownBytes, filename: 'handbook.md', contentType: 'text/markdown' }
});

console.log('Collection ID:', created.collectionId);

// Auto-paginate any list endpoint (`for await`, `.pages()`, or `.toArray()`)
for await (const chunk of client.datasets.data.listAutoPaging(
  { collectionId: created.collectionId },
  { pageSize: 50, maxItems: 500 }
)) {
  console.log(chunk._id, chunk.q);
}

// Cursor-based auto-pagination for app chat logs (`POST /core/app/logs/search`)
for await (const log of client.apps.logs.searchAutoPaging(
  {
    dateStart: '2026-01-01T00:00:00.000Z',
    dateEnd: '2026-01-31T23:59:59.999Z'
  },
  { maxPages: 5 }
)) {
  console.log(log.chatId, log.title);
}
```

---

## Raw Responses, Observability & Errors

```ts
import { FastGPT } from '@fastgpt/sdk';
import {
  FastGptAuthError,
  FastGptConflictError,
  FastGptRateLimitError
} from '@fastgpt/sdk/errors';

const client = new FastGPT({
  apiKey: process.env.FASTGPT_API_KEY,
  logger: 'warn', // or custom FastGptLogger (secrets & tokens are always redacted)
  hooks: {
    onRequest: ({ method, url, attempt }) => console.debug('->', method, url, attempt),
    onResponse: ({ status, requestId, durationMs }) =>
      console.debug('<-', status, requestId, `${durationMs}ms`),
    onError: ({ operationId, error }) => console.error(operationId, error.message)
  }
});

// Inspect raw status, headers, and requestId
const { data, response } = await client.models.list().withRawResponse();
console.log(data.models.length, response.status, response.requestId);

try {
  await client.chat.histories.list();
} catch (err) {
  if (err instanceof FastGptAuthError) {
    // 401 / 403 / serverCode 514 (unAuthApiKey)
  } else if (err instanceof FastGptConflictError) {
    // 409 (e.g. chatIsGenerating)
  } else if (err instanceof FastGptRateLimitError) {
    // 429 (tooManyRequest)
  }
}
```

---

### Package Entry Points

Each capability is published directly from its defining module for minimal bundle size:

- `@fastgpt/sdk` — `FastGPT` main client class
- `@fastgpt/sdk/errors` — `FastGptError`, `FastGptAuthError`, `FastGptRateLimitError`, etc.
- `@fastgpt/sdk/sse` — `ChatStream`, `ChatSseEvent`, `ChatStreamFinalResult`, `ChatStreamTerminalState`
- `@fastgpt/sdk/interactive` — `InteractivePayload`, `isUserSelectInteractive`, `isUserInputInteractive`, etc.
- `@fastgpt/sdk/pagination` — `createOffsetPaginator`, `createPageNumPaginator`, `createCursorPaginator`, `AsyncPageIterable`
- `@fastgpt/sdk/options` — `FastGptClientOptions`, `RequestOptions`, `FastGptHooks`, `FastGptLogger`
- `@fastgpt/sdk/types` — generated System OpenAPI `*Req` / `*Res` contract types

---

## Release Scope (`0.1.0-beta.2`) & Migration from `0.1.0-beta.1`

Starting from `0.1.0-beta.2`, `@fastgpt/sdk` is strictly scoped to **published System OpenAPI operations only** (**47 active operations** across `apps.logs`, `chat`, `datasets`, and `models`). Routes not yet formally added to System OpenAPI are deferred so that every SDK method maintains verified API Key semantics and generated type contracts.

### Retained Capabilities (`0.1.0-beta.2`)

- **Core client & auth**: Personal and App API Keys, `withIdentity({ customUid })` / `authProxy`, per-request `RequestOptions`, `.withRawResponse()`, redacted hooks/logger, and retry/timeout handling.
- **47 System OpenAPI methods** across `client.apps.logs.*` (cursor `search` / `listUsers` / `getTotalData` / `getChartData`), `client.chat.*` (`completionsV2`, `completionsV2Stream`, `init`, `stop`, `histories.*`, `records.*`, `feedbacks.*`), `client.datasets.*` (CRUD, `search`, `batchMove`, `batchDelete`, `collections.*`, `data.*`), and `client.models.*` (`list`, `catalog`, `summary`).
- **OpenAPI-backed helpers**:
  - **Workflow interactive continuation**: `client.chat.interactive.{isPending,extract,unwrap,replyUserSelect,replyUserSelectStream,replyUserForm,replyUserFormStream}` (built on `POST /v2/chat/completions`).
  - **Auto-pagination**: `*AutoPaging` methods (including `client.apps.logs.searchAutoPaging`) plus `@fastgpt/sdk/pagination`.

### Breaking Import Path Changes (Root Entry -> Subpath Exports)

In `0.1.0-beta.1`, the root entrypoint `@fastgpt/sdk` re-exported error classes, `ChatStream`, paginators, interactive helpers, client/request option types, `ApiPromise`, `SDK_VERSION`, and `*Req` / `*Res` types. Starting from `0.1.0-beta.2`, both the ESM and CJS root entrypoints export **only `FastGPT`**, and every helper/type module must be imported directly from its dedicated subpath export. Existing code that imports error classes or helpers from `@fastgpt/sdk` will fail at compile time or module load time until updated:

```ts
// 0.1.0-beta.1 (no longer works in 0.1.0-beta.2)
import {
  FastGPT,
  FastGptAuthError,
  ChatStream,
  createPageNumPaginator,
  extractInteractive,
  type FastGptClientOptions,
  type ChatCompletionsV2Req
} from '@fastgpt/sdk';

// 0.1.0-beta.2
import { FastGPT } from '@fastgpt/sdk';
import { FastGptAuthError } from '@fastgpt/sdk/errors';
import { ChatStream } from '@fastgpt/sdk/sse';
import { createPageNumPaginator } from '@fastgpt/sdk/pagination';
import { extractInteractive } from '@fastgpt/sdk/interactive';
import type { FastGptClientOptions, WithRawResponseResult } from '@fastgpt/sdk/options';
import type { ChatCompletionsV2Req } from '@fastgpt/sdk/types';
```

#### Root Entry Import Migration Table

| `0.1.0-beta.2` Subpath | Exported Symbols Migrated from `0.1.0-beta.1` Root (and Additions) |
| --- | --- |
| `@fastgpt/sdk` | `FastGPT` (sole root export in `0.1.0-beta.2`) |
| `@fastgpt/sdk/errors` | `FastGptError`, `FastGptAuthError`, `FastGptBadRequestError`, `FastGptNotFoundError`, `FastGptConflictError`, `FastGptRateLimitError`, `FastGptServerError`, `FastGptTimeoutError`, `FastGptNetworkError` (alongside `type FastGptErrorDetails`, `redactSecrets`, `createMappedApiError`) |
| `@fastgpt/sdk/sse` | `ChatStream`, `type ChatSseEvent`, `type ChatStreamFinalResult` (plus `type ChatStreamTerminalState`, `parseChatSseFrame`, `iterateRawSseFrames`, `type RawSseFrame`) |
| `@fastgpt/sdk/interactive` | `unwrapInteractive`, `extractInteractive`, `isInteractivePending`, `buildUserSelectMessage`, `buildUserFormMessage`, `type InteractivePayload`, `type InteractiveUserMessage`, `type ReplyUserSelectParams`, `type ReplyUserFormParams`, `type UserSelectInteractiveOption` (plus `isUserSelectInteractive`, `isUserInputInteractive`, `isPaymentPauseInteractive`) |
| `@fastgpt/sdk/pagination` | `createOffsetPaginator`, `createPageNumPaginator`, `type AutoPagingOptions`, `type PageSlice`, `type AsyncPageIterable` (plus cursor pagination: `createCursorPaginator`, `type CursorAutoPagingOptions`, `type CursorPageSlice`) |
| `@fastgpt/sdk/options` | `type FastGptClientOptions`, `type RequestOptions`, `type CredentialProvider`, `type AuthProxyIdentity`, `type FastGptIdentity`, `type FastGptHooks`, `type FastGptLogger`, `type FastGptLogLevel`, `type RequestHookContext`, `type ResponseHookContext`, `type ErrorHookContext`, `type Uploadable`, `type UploadableFileObject`, `type BinaryInput`, `type RawResponseInfo`, `type WithRawResponseResult` |
| `@fastgpt/sdk/types` | All retained System OpenAPI `*Req` / `*Res` contract types (e.g. `ChatCompletionsV2Req`, `ChatCompletionsV2Res`, `DatasetsSearchReq`, `ModelsCatalogRes`, plus new `AppsLogsSearchReq` / `AppsLogsSearchRes`) |

#### Removed / No Longer Publicly Exported Symbols

| `0.1.0-beta.1` Symbol | Status in `0.1.0-beta.2` | Migration Guidance |
| --- | --- | --- |
| `ApiPromise` (class & type) | Not publicly exported | SDK methods still return a thenable supporting `await` and `.withRawResponse()`. For TypeScript annotations, use `Promise<T>` (unwrapped data), `Promise<WithRawResponseResult<T>>` from `@fastgpt/sdk/options` (for `.withRawResponse()`), or `ReturnType<FastGPT['models']['list']>` (to preserve `.withRawResponse()` on a method return). Avoid runtime `instanceof ApiPromise` checks and treat return values as standard thenables. |
| `SDK_VERSION` (constant) | Not publicly exported | `./package.json` is not exposed via `exports`; inspect the `x-fastgpt-client` header (`fastgpt-js-sdk/<version>`) inside `hooks.onRequest` if needed for diagnostics or telemetry. |
| Preview-only helper types (`RawRequestParams`, `PresignedUploadSession`, `UploadProgressInfo`, `UploadDatasetFileParams`, `UploadDatasetFileResult`, `UploadChatFileParams`, `UploadChatFileResult`, `ChatFileContentPart`, `ChatImageContentPart`, `ChatUploadedContentPart`, `CollectionTrainingProgress`, `DatasetTrainingProgress`, `WaitForCollectionTrainingParams`, `WaitForCollectionTrainingResult`, `WaitForDatasetTrainingParams`, `WaitForDatasetTrainingResult`) | Removed | Removed alongside deferred runtime helpers. Use `Uploadable` / `UploadableFileObject` from `@fastgpt/sdk/options` with `client.datasets.collections.createByLocalFile`, or pin `@fastgpt/sdk@0.1.0-beta.1`. |
| Removed endpoint `*Req` / `*Res` types (`SystemHealthRes`, `SystemWhoamiRes`, `ChatResumeReq` / `ChatResumeRes`, `AppsLogsListReq` / `AppsLogsListRes`, `DatasetsTraining*`, `DatasetsFiles*`, `DatasetsSynonyms*`, `ChatFiles*`, `ChatSandbox*`) | Removed / Replaced | Replace `AppsLogsListReq` / `AppsLogsListRes` with `AppsLogsSearchReq` / `AppsLogsSearchRes` from `@fastgpt/sdk/types`; pin `@fastgpt/sdk@0.1.0-beta.1` or type raw HTTP calls directly for deferred endpoints. |
| `@fastgpt/sdk/server` (`ApiDatasetHttpError`, `createApiDatasetHandler`, `toNodeHttpHandler`) | Removed | Use standard `fetch` / Web request handlers directly or pin `@fastgpt/sdk@0.1.0-beta.1`. |

### Deferred / Removed in `0.1.0-beta.2`

The following surfaces shipped in the earlier `0.1.0-beta.1` preview are **removed in `0.1.0-beta.2`** until their underlying contracts enter System OpenAPI:

| `0.1.0-beta.1` API | Status in `0.1.0-beta.2` | Upgrade / Transition Guidance |
| --- | --- | --- |
| `client.chat.resume` / `chat.resumeStream` | **Removed** (disconnect SSE recovery) | Not in System OpenAPI yet; distinct from workflow `chat.interactive` continuation (which remains supported). Pin `@fastgpt/sdk@0.1.0-beta.1` or call `/api/core/chat/resume` directly if needed. |
| `client.chat.interactive.*` | **Retained** (workflow pause/resume) | No action needed; continues to work via `POST /v2/chat/completions`. |
| `client.system.*` (`health`, `whoami`) | **Removed** | Switch connectivity / credential checks to `client.models.catalog()` (authenticated) or `client.models.list()` (public). |
| `client.datasets.collections.uploadFile` & `waitForTraining` | **Removed** | Use `client.datasets.collections.createByLocalFile({ datasetId, file, trainingType })` for direct OpenAPI multipart upload. |
| `client.datasets.files.*`, `training.*`, `synonyms.*`, `chat.files.*`, `chat.sandbox.*` | **Removed** | Pin `@fastgpt/sdk@0.1.0-beta.1` or invoke HTTP endpoints directly until added to System OpenAPI. |
| `client.apps.logs.list` / `listAutoPaging` | **Replaced** | Migrate to cursor-based `client.apps.logs.search` and `client.apps.logs.searchAutoPaging`. |
| `client.rawRequest` & `@fastgpt/sdk/server` | **Removed** | Use standard `fetch` / Web handlers or pin `@fastgpt/sdk@0.1.0-beta.1`. |

> **Upgrading or staying on the preview?** To keep calling non-System-OpenAPI preview endpoints temporarily, install the pinned preview version:
> ```bash
> npm install @fastgpt/sdk@0.1.0-beta.1
> ```

---

## Live Backend Smoke Testing

```bash
FASTGPT_SMOKE_BASE_URL=http://localhost:3000 \
FASTGPT_SMOKE_API_KEY=fastgpt-xxxx \
FASTGPT_SMOKE_APP_ID=68ad85a7463006c963799a05 \
pnpm --filter @fastgpt/sdk test:smoke
```
