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

## Live Backend Smoke Testing

```bash
FASTGPT_SMOKE_BASE_URL=http://localhost:3000 \
FASTGPT_SMOKE_API_KEY=fastgpt-xxxx \
FASTGPT_SMOKE_APP_ID=68ad85a7463006c963799a05 \
pnpm --filter @fastgpt/sdk test:smoke
```
