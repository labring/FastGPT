# BullMQ 管理面板（pro/admin mini dashboard）功能开发文档

## 0. 文档标识

- 任务前缀：`bullmq-admin-dashboard`
- 文档文件名：`bullmq-admin-dashboard-功能开发文档.md`
- 更新时间：2026-08-13
- 文档状态：`v1.0 初稿，待确认`
- 关联需求文档：`bullmq-admin-dashboard-需求设计文档.md`

## 1. 技术方案总览

- 后端：`pro/admin` NextJS API 路由 + 服务层，复用 `@fastgpt/dal/redis/bullmq` 的队列服务（`*MQService.getQueue()` / `bullMQ` binding），不需要新建 Redis 连接体系。
- 前端：`pro/admin` 新增管理页面，Chakra UI + `useRequest` + i18n（复用 dashboard 页模式）。
- 鉴权：所有接口 `adminCert({ req, authToken: true })`；写操作记录审计日志。
- 不改动 worker、SDK、`packages/dal/redis/bullmq` 的现有服务合同。

## 2. 新增目录与文件

```
pro/admin/src/pages/system/bullmq/index.tsx                 # 页面
pro/admin/src/pageComponents/system/bullmq/                  # 页面组件
pro/admin/src/service/core/system/bullmq/queue.ts            # 服务层：队列/任务/操作
pro/admin/src/pages/api/admin/system/bullmq/list.ts          # GET 队列概览
pro/admin/src/pages/api/admin/system/bullmq/jobs.ts          # GET failed 任务列表
pro/admin/src/pages/api/admin/system/bullmq/retry.ts         # POST 重试
pro/admin/src/pages/api/admin/system/bullmq/remove.ts        # POST 删除 failed 记录
packages/global/openapi/admin/system/bullmq/api.ts           # 接口类型
pro/admin/src/service/common/bullmq/queueWhitelist.ts        # 队列白名单常量
```

## 3. 队列白名单

`queueWhitelist.ts` 定义：

```ts
export const BULLMQ_QUEUE_WHITELIST: Record<string, { label: string }> = {
  s3FileDelete: { label: 'S3 文件删除' },
  datasetDelete: { label: '知识库删除' },
  appDelete: { label: '应用删除' },
  agentSkillDelete: { label: 'Skill 删除' },
  teamDelete: { label: '团队删除' },
  datasetSync: { label: '知识库同步' },
  evaluation: { label: '应用评测' },
  collectionUpdate: { label: '集合更新' },
  agentSkillCreate: { label: 'Skill 创建' },
  wechatReply: { label: '微信公众号回复' },
  wechatPoll: { label: '微信公众号轮询' }
};
```

- 不在白名单的队列一律不展示、不可操作（接口层二次校验）。
- 队列名使用 `QueueNames` 枚举，避免字符串散落。

## 4. API 设计

统一入参校验用 `parseApiInput`（`@fastgpt/service/common/zod/requestParseError`），类型定义放 `packages/global/openapi/admin/system/bullmq/api.ts`。

### 4.1 GET `/api/admin/system/bullmq/list`

- 入参：无。
- 出参：

```ts
type BullmqQueueOverview = {
  name: string;
  label: string;
  counts: { waiting: number; active: number; delayed: number; failed: number; completed: number };
  lastFailedAt?: number; // 最近失败时间（秒），无则 undefined
};
type GetBullmqQueuesResponse = { queues: BullmqQueueOverview[] };
```

- 实现：遍历白名单 `getQueue(name).getJobCounts(...)`；`lastFailedAt` 取 `getFailed(0, 0)[0]?.failedReason 所在 job 的 finishedOn`（最近一条失败任务的 `finishedOn`）。

### 4.2 GET `/api/admin/system/bullmq/jobs`

- 入参（query）：`queue`（白名单校验）、`page`、`pageSize`（默认 20，上限 100）、`search?`（匹配 data 或 failedReason 子串）。
- 出参：

```ts
type BullmqFailedJobItem = {
  id: string;
  name?: string;
  attemptsMade: number;
  data: unknown;
  failedReason?: string;
  finishedOn?: number;
};
type GetBullmqFailedJobsResponse = { total: number; jobs: BullmqFailedJobItem[] };
```

- 实现：`getJobs(['failed'], start, end, false)`（默认按失败时间倒序，`queue-getters.js` 默认 `asc=false`）；`search` 过滤在返回前做（failed 上限 10000，先拉全量再内存分页+过滤；若 `total > 5000` 且未传 `search`，响应提示引导先过滤）。

### 4.3 POST `/api/admin/system/bullmq/retry`

- 入参：`{ queue, jobIds?: string[] }`；`jobIds` 为空表示重试该队列全部 failed。
- 行为：
  - 传 `jobIds`：逐条 `job.retry('failed')`（只处理 failed 状态，其他状态跳过）。
  - 不传：`queue.retryJobs({ state: 'failed' })`。
- 出参：`{ replayed: number }`。
- 审计：记录 `queue`、`jobIds`、操作人。

### 4.4 POST `/api/admin/system/bullmq/remove`

- 入参：`{ queue, jobIds: string[] }`（必传）。
- 行为：逐条校验状态为 failed 后 `queue.remove(jobId)`。
- 出参：`{ removed: number }`。
- 审计：同上。

### 4.5 注意事项

- 队列对象通过 `bullMQ.getQueue(name)` 懒加载复用，路由 handler 内直接 `new` 对应 `*MQService` 或使用统一的 `getBullmqQueue(name)` helper（按白名单映射到具体 service，避免直接 `bullMQ.getQueue` 字符串化调用）。
- 重试/删除为写操作，统一加 `adminCert` + 审计；响应错误统一走现有 `NextAPI` 错误处理。
- `job.retry('failed')` 与 `queue.retryJobs` 均**不会重置 attemptsMade**，重放后任务只有一次执行机会；文档在 UI 提示语中说明。

## 5. 前端页面设计

- 路由：`/system/bullmq`（侧边栏"系统"分组下新增入口，i18n key 如 `system_bullmq`）。
- 页面结构（两个视图，一个页面内切换）：
  1. **队列概览**：卡片/表格列出白名单队列，展示各状态计数，failed>0 高亮；点击队列进入任务列表。
  2. **failed 任务列表**：表格列 = jobId、name、attemptsMade、data（JSON 截断，点击展开/复制）、failedReason、finishedOn、操作（重试、删除）；顶部支持搜索、批量勾选、批量重试/删除；分页组件复用 `pro/admin/src/components/Pagination`。
- 写操作弹窗二次确认（Chakra `AlertDialog` / `useConfirm` 现有模式）。
- 数据获取用 `@fastgpt/web/hooks/useRequest` + `pro/admin/src/service/common/request` 的 GET/POST。
- i18n：新增命名空间 key，中文/英文。
- 刷新：手动刷新按钮；首版不做自动轮询。

## 6. 关键实现细节与边界

- **排序**：`getJobs(['failed'], start, end, false)` 返回新→旧，分页按此顺序。
- **搜索过滤**：`search` 匹配 `JSON.stringify(data)` 或 `failedReason`；大数据量提示引导过滤。
- **只删 failed**：`remove` 前校验 `job.getState() === 'failed'`，避免误删 active/waiting 任务。
- **幂等**：重试重复点击以 jobId 维度去重（同 jobId 已回 waiting 则跳过）。
- **审计**：复用 admin 现有 audit 能力（若 `pro/admin/src/service` 已有 audit 写入服务则直接调用；没有则先记录结构化日志，明确记录操作人/队列/jobIds/结果）。
- **并发**：批量操作串行执行（`batchRun` 或 for 循环），避免并发触发 BullMQ 脚本冲突。

## 7. 测试计划

- 单元测试（`pro/admin/test` 或 `packages/service/test`，跟随现有测试结构）：
  - 服务层：队列概览（mock queue）、failed 列表分页/过滤、retry/remove 的幂等与状态校验。
  - API 路由：白名单校验、非管理员拒绝、入参校验（parseApiInput 错误）。
- 手动验证：
  - 构造 `s3FileDelete` failed 任务（如含控制字符的 legacy key），验证列表可见、重试后走 raw 直删降级成功、记录被清除。
  - 验证删除 failed 记录不影响已存在的 S3 对象。

## 8. TODO 列表

- [x] `packages/global/openapi/admin/system/bullmq/api.ts`：接口类型 + zod schema
- [x] `pro/admin/src/service/common/bullmq/queueWhitelist.ts`：队列白名单常量
- [x] 服务层 `pro/admin/src/service/core/system/bullmq/queue.ts`：概览/列表/retry/remove
- [x] API 路由 `list.ts` / `jobs.ts` / `retry.ts` / `remove.ts`（adminCert + parseApiInput + 审计）
- [x] 前端页面 `pages/system/bullmq/index.tsx` + 页面组件（概览、任务列表、详情弹窗、二次确认）
- [x] i18n 文案（审计事件中/英/繁；页面文案与 pro/admin 现有页面一致使用内置文案）
- [x] 单元测试（服务层 + API 路由）
- [ ] 手动验证（构造 failed 任务 → 重试 → 删除记录）
- [x] 全量测试确认无回归（pro/admin 99 文件 540 用例；packages/global 93 文件 1906 用例）
