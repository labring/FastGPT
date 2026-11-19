# `@fastgpt/sdk`

Official TypeScript / JavaScript SDK for FastGPT OpenAPI.

- **Zero runtime dependencies** — built on standard Web Fetch, `FormData`, `Blob`, and `ReadableStream` (Node.js `>= 20`, Bun, Deno, Edge Runtime).
- **Lark-style domain resource tree** — `client.chat.*`, `client.datasets.*`, `client.apps.logs.*`, `client.models.*`, `client.system.*`.
- **Direct typed responses** — `await` directly returns unwrapped business data `T`, with `.withRawResponse()` available whenever you need HTTP headers or `requestId`.
- **First-class high-level helpers** — presigned Single/Multipart file upload, dataset training completion polling, multimodal chat attachments, workflow interactive pause/resume, async auto-pagination, and `@fastgpt/sdk/server` custom API dataset handler.

---

## Installation

```bash
npm install @fastgpt/sdk
# or
pnpm add @fastgpt/sdk
```

---

## Quick Start & Authentication

FastGPT SDK supports both **Personal API Keys** (full OpenAPI access including datasets, multi-app chat, and model catalog) and **App API Keys** (scoped to a single bound app; `appId` is omitted automatically):

```ts
import { FastGPT } from '@fastgpt/sdk';

// 1. Singleton client (supports static apiKey or async () => Promise<string> rotation)
const client = new FastGPT({
  baseUrl: process.env.FASTGPT_BASE_URL ?? 'https://cloud.fastgpt.cn',
  apiKey: process.env.FASTGPT_API_KEY,
  defaultAppId: process.env.FASTGPT_APP_ID // optional: auto-fills appId when using a personal key
});

// Check credential health and identity metadata
const whoami = await client.system.whoami();
console.log(whoami);
```

> **Browser safety**: Instantiating `FastGPT` in a browser environment (`window.document`) is blocked by default to avoid leaking API Keys into frontend bundles. Pass `{ dangerouslyAllowBrowser: true }` only if you explicitly accept the risk.

### End-User Identity Isolation (`withIdentity`) & Per-Request Overrides

FastGPT accepts `customUid` (external end-user isolation) or `authProxy` (team member proxy for personal keys with proxy enabled) in `query`, `body`, or `multipart` `data` depending on the endpoint. `client.withIdentity(...)` injects the identity into the exact contract carrier automatically:

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

Streaming and non-streaming methods are split into explicit pairs (`completionsV2` / `completionsV2Stream`, `resume` / `resumeStream`):

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

### Multimodal Attachments & Workflow Interactive Resume

```ts
// 1. Upload a chat attachment (Single PUT or Multipart automatically)
const uploaded = await userClient.chat.files.upload({
  chatId: 'chat_001',
  file: { data: pdfBuffer, filename: 'report.pdf', contentType: 'application/pdf' }
});

const reply = await userClient.chat.completionsV2({
  chatId: 'chat_001',
  messages: [
    {
      role: 'user',
      content: [uploaded.toContentPart(), { type: 'text', text: 'Extract the key metrics.' }]
    }
  ]
});

// 2. Detect & resume workflow interactive pauses (userSelect / userInput)
if (userClient.chat.interactive.isPending(reply)) {
  const prompt = userClient.chat.interactive.unwrap(
    userClient.chat.interactive.extract(reply)!
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

## Datasets: One-Step File Upload, Training Wait & Auto-Pagination

```ts
// Two-phase presigned upload (auto Single PUT / Multipart with retries + abort cleanup) + poll training
const created = await client.datasets.collections.uploadFile({
  datasetId: '68ad85a7463006c963799a05',
  file: { data: markdownBytes, filename: 'handbook.md', contentType: 'text/markdown' },
  trainingType: 'chunk',
  onUploadProgress: ({ percent }) => console.log(`Uploading: ${percent}%`),
  waitForTraining: {
    pollIntervalMs: 2_000,
    onProgress: ({ queuedCount, trainingCount, trainedCount }) =>
      console.log({ queuedCount, trainingCount, trainedCount })
  }
});

console.log('Collection ID:', created.collectionId, 'Errors:', created.training?.errors);

// Auto-paginate any list endpoint (`for await`, `.pages()`, or `.toArray()`)
for await (const chunk of client.datasets.data.listAutoPaging(
  { collectionId: created.collectionId },
  { pageSize: 50, maxItems: 500 }
)) {
  console.log(chunk._id, chunk.q);
}
```

---

## Raw Responses, Escape Hatch, Observability & Errors

```ts
import {
  FastGPT,
  FastGptAuthError,
  FastGptConflictError,
  FastGptRateLimitError
} from '@fastgpt/sdk';

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
const { data, response } = await client.system.health().withRawResponse();
console.log(data, response.status, response.requestId);

// Call a brand-new server endpoint before regenerating the SDK
const custom = await client.rawRequest<{ ok: boolean }>({
  method: 'GET',
  path: '/support/openapi/health'
});

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

## Reverse Server Adapter (`@fastgpt/sdk/server`)

Expose your own enterprise document store as a FastGPT **Custom API Dataset** (`/v1/file/list`, `/v1/file/content`, `/v1/file/detail`, `/v1/file/read`) with zero web framework lock-in:

```ts
import http from 'node:http';
import { createApiDatasetHandler, toNodeHttpHandler } from '@fastgpt/sdk/server';

const fetchHandler = createApiDatasetHandler({
  authorization: process.env.KB_SERVER_TOKEN!,
  basePath: '/api/fastgpt-kb', // optional mount prefix
  provider: {
    async listFiles({ parentId, searchKey }) {
      return [
        {
          id: 'doc-1',
          parentId: parentId ?? null,
          name: 'Architecture.md',
          type: 'file',
          createTime: new Date(),
          updateTime: new Date()
        }
      ];
    },
    async getFileDetail({ id }) {
      return {
        id,
        parentId: null,
        name: 'Architecture.md',
        type: 'file',
        createTime: new Date(),
        updateTime: new Date()
      };
    },
    async getFileContent({ id }) {
      return { title: 'Architecture', content: `# Document ${id}` };
    },
    async getFileReadUrl({ id }) {
      return `https://wiki.example.com/docs/${id}`;
    }
  }
});

// Mount directly in Next.js App Router / Hono / Bun / Deno / Workers, or Node http / Express:
http.createServer(toNodeHttpHandler(fetchHandler)).listen(8080);
```

---

## Live Backend Smoke Testing

```bash
FASTGPT_SMOKE_BASE_URL=http://localhost:3000 \
FASTGPT_SMOKE_API_KEY=fastgpt-xxxx \
FASTGPT_SMOKE_APP_ID=68ad85a7463006c963799a05 \
pnpm --filter @fastgpt/sdk test:smoke
```
