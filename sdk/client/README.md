# FastGPT SDK

`@fastgpt-sdk/client` 是通过 HTTP 调用 FastGPT 的 TypeScript SDK。支持 Node.js ≥ 22.23.2，使用 API Key 认证，无运行时依赖。

联合搜索方法依赖服务端搜索接口 [PR #8194](https://github.com/labring/FastGPT/pull/8194)。客户端构建使用已提交的生成契约，不包含该 PR 的服务端实现；其余方法可调用现有公开接口。

## 开始使用

在仓库中运行 `pnpm build:cli`，构建 SDK 和 CLI。发布后可通过包管理器安装 `@fastgpt-sdk/client`；当前改动没有执行发布。

```ts
import { FastGPT } from '@fastgpt-sdk/client';
import type { SearchParams } from '@fastgpt-sdk/client/dataset/type';

const client = new FastGPT({
  baseURL: process.env.FASTGPT_BASE_URL!,
  apiKey: process.env.FASTGPT_API_KEY!
});

const datasetId = await client.datasets.create({ name: '产品文档' });
const imported = await client.datasets.collections.importText({
  datasetId,
  name: '入门',
  text: 'FastGPT 支持知识库检索和工作流编排。'
});
await client.datasets.collections.waitForReady({ id: imported.collectionId });

const query: SearchParams = {
  scope: { datasetIds: [datasetId] },
  query: { text: 'FastGPT 可以做什么？' },
  retrieval: { mode: 'mixedRecall', embeddingWeight: 0.5 },
  rerank: { enabled: false },
  queryExtension: { enabled: false },
  result: { maxTokens: 5000, similarity: 0 }
};
const result = await client.datasets.search(query);
console.log(result.list, result.meta);
```

`baseURL` 可以包含 `/api` 和反向代理路径前缀。只传 API Key 本身，SDK 添加 `Authorization: Bearer …`。调用使用该 Key 所属成员的团队和资源权限；Key 不会绕过知识库、集合或模型权限。

## 资源与方法

仅封装 `/apidoc/systemopenapi` 中知识库模块的非弃用接口，共 23 个操作。以 `SystemOpenApiTagMap` 显式标签作为公开边界；IDE 可查看完整参数和返回类型。

| 资源 | 操作范围 |
| --- | --- |
| `client.datasets` | `list`、`get`、`create`、`delete`、`batchMove`、`batchDelete`、`search`、`searchTest` |
| `.collections` | `list`、`get`、`create`、`update`、`delete`、`importText`、`importUrl`、`importFile`、`downloadTicket`、`download` |
| `.chunks` | `list`、`get`、`update`、`delete`、`push` |

`collections.waitForReady({ id })` 是组合公开集合详情接口的便捷方法，不新增服务端接口。旧版知识库列表与 API 集合创建接口已弃用，不重复封装。控制台专用的权限、协作者、标签维护、同义词、训练管理和第三方源浏览接口不在当前范围内。

生成器会拒绝没有正式 Open API 标签的操作。契约测试同时检查公开接口是否全部覆盖，避免后续无意扩大范围或遗漏新接口。

## 联合搜索

`datasets.search` 使用新增的 `POST /api/core/dataset/search`，参数按搜索链路分组：

- `scope`：知识库 ID 列表和可选集合、创建时间、标签筛选。
- `query`：文本与本团队临时图片 key，至少提供一种。
- `retrieval`：召回模式与混合检索权重。
- `rerank` / `queryExtension`：用 `enabled` 判别联合表达是否启用；关闭时不接受模型配置。
- `result`：token 预算与相似度阈值。预算保留完整数据块，末块可能超出预算。

多个知识库会逐个鉴权，任一目标不可读则整个请求失败。向量与混合检索要求知识库使用相同的有效向量模型。集合筛选与权限范围求交集；筛选需要服务端商业版本支持，未支持时明确报错。`meta.usingSimilarityFilter` 和 `meta.usingReRank` 表示实际执行情况。

```ts
await client.datasets.search({
  scope: {
    datasetIds: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012'],
    filter: {
      createTime: { gte: '2026-01-01T00:00:00Z' },
      tags: { and: [{ tag: 'department', op: '$eq', value: 'support' }] }
    }
  },
  query: { text: '如何退款？' }
});
```

旧单库协议保留为 `datasets.searchTest`。搜索领域入口在 `packages/service/core/dataset/search/service.ts`；HTTP 凭证解析在 API 层，限流、余额、计费、审计由应用适配层通过回调注入。

## 文件与训练

```ts
import { openAsBlob } from 'node:fs';

const imported = await client.datasets.collections.importFile(
  { datasetId },
  { file: await openAsBlob('./手册.pdf'), filename: '手册.pdf' }
);
await client.datasets.collections.waitForReady(
  { id: imported.collectionId },
  {
    waitTimeoutMs: 300_000,
    pollIntervalMs: 1000,
    onProgress: ({ activeTrainingAmount, finalErrorAmount }) => {
      console.log(activeTrainingAmount, finalErrorAmount);
    }
  }
);

const ticket = await client.datasets.collections.downloadTicket({
  datasetId, collectionIds: [imported.collectionId]
});
const response = await client.datasets.collections.download({ ticket: ticket.ticket });
// Response.body 可交给流式文件写入工具；日期字段在 HTTP 响应中为 ISO 字符串。
```

等待轮询公开集合详情中的 `activeTrainingAmount` 和 `finalErrorAmount`，遇到最终训练失败会抛错。默认整体等待上限五分钟，单次请求默认一分钟；两者都可配置。每个请求也支持 `{ signal, timeoutMs }`，可用 `AbortController` 取消。

## 错误处理

```ts
import { FastGPTError } from '@fastgpt-sdk/client/error';

try {
  await client.datasets.get({ id: datasetId });
} catch (error) {
  if (error instanceof FastGPTError) {
    console.error(error.details.kind, error.details.code, error.details.requestId);
  } else {
    throw error;
  }
}
```

错误类型包括 `api`、`network`、`protocol`、`timeout`、`aborted`、`training`。API 错误保留 HTTP 状态、业务码与服务端 requestId。SDK 不自动重试，避免创建、上传或计费操作重复。SDK 类型与 CLI 基础校验不能替代服务端权限及业务校验。

## 维护和验证

```sh
pnpm --dir sdk/client generate:check
pnpm --dir sdk/client typecheck
pnpm --dir sdk/client test --coverage
pnpm --dir sdk/client test:live
```

契约映射位于 `scripts/contracts.ts`。修改共享 Schema 后运行 `pnpm --dir sdk/client generate`；生成的 `src/dataset/type.ts`、`operations.ts`、`schema.ts` 必须一并提交。发布产物只依赖生成的普通 TypeScript/JSON，不加载 monorepo 或 Zod。

在 #8194 合并前，生成和检查联合搜索契约需指定该 PR 的工作区，例如 `FASTGPT_API_CONTRACTS_ROOT=/path/to/search-pr pnpm --dir sdk/client generate:check`。普通 `build` 不重新生成契约。创建知识库时，SDK 会补齐 `type: 'dataset'`、`intro: ''`，无需修改现有服务端协议。

真实集成测试需启动本仓库 app、配置 MongoDB、向量库、对象存储和可用模型。测试默认读取 `projects/app/.env.local` 的 MongoDB 配置，可用 `FASTGPT_TEST_MONGODB_URI`、`FASTGPT_TEST_BASE_URL` 覆盖。测试创建独立临时团队、成员和 API Key，调用真实服务并清理本次数据，不使用现有用户凭证。测试会产生模型调用成本。
