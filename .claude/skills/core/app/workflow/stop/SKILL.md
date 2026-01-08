---
name: workflow-stop-design
description: 工作流暂停逻辑设计方案
---

## 1. Redis 状态管理方案

### 1.1 状态键设计

**Redis Key 结构:**
```typescript
// Key 格式: agent_runtime_stopping:{appId}:{chatId}
const WORKFLOW_STATUS_PREFIX = 'agent_runtime_stopping';

type WorkflowStatusKey = `${typeof WORKFLOW_STATUS_PREFIX}:${string}:${string}`;

// 示例: agent_runtime_stopping:app_123456:chat_789012
```

**状态值设计:**
- **存在键 (值为 1)**: 工作流应该停止
- **不存在键**: 工作流正常运行
- **设计简化**: 不使用状态枚举,仅通过键的存在与否判断

**参数类型定义:**
```typescript
type WorkflowStatusParams = {
  appId: string;
  chatId: string;
};
```

### 1.2 状态生命周期管理

**状态转换流程:**
```
正常运行(无键) → 停止中(键存在) → 完成(删除键)
```

**TTL 设置:**
- **停止标志 TTL**: 60 秒
  - 原因: 避免因意外情况导致的键泄漏
  - 正常情况下会在工作流完成时主动删除
- **工作流完成后**: 直接删除 Redis 键
  - 原因: 不需要保留终态,减少 Redis 内存占用

### 1.3 核心函数说明

**1. setAgentRuntimeStop**
- **功能**: 设置停止标志
- **参数**: `{ appId, chatId }`
- **实现**: 使用 `SETEX` 命令,设置键值为 1,TTL 60 秒

**2. shouldWorkflowStop**
- **功能**: 检查工作流是否应该停止
- **参数**: `{ appId, chatId }`
- **返回**: `Promise<boolean>` - true=应该停止, false=继续运行
- **实现**: GET 命令获取键值,存在则返回 true

**3. delAgentRuntimeStopSign**
- **功能**: 删除停止标志
- **参数**: `{ appId, chatId }`
- **实现**: DEL 命令删除键

**4. waitForWorkflowComplete**
- **功能**: 等待工作流完成(停止标志被删除)
- **参数**: `{ appId, chatId, timeout?, pollInterval? }`
- **实现**: 轮询检查停止标志是否被删除,超时返回

### 1.4 边界情况处理

**1. Redis 操作失败**
- **错误处理**: 所有 Redis 操作都包含 `.catch()` 错误处理
- **降级策略**:
  - `shouldWorkflowStop`: 出错时返回 `false` (认为不需要停止,继续运行)
  - `delAgentRuntimeStopSign`: 出错时记录错误日志,但不影响主流程
- **设计原因**: Redis 异常不应阻塞工作流运行,降级到继续执行策略

**2. TTL 自动清理**
- **TTL 设置**: 60 秒
- **清理时机**: Redis 自动清理过期键
- **设计原因**:
  - 避免因异常情况导致的 Redis 键泄漏
  - 自动清理减少手动维护成本
  - 60 秒足够大多数工作流完成停止操作

**3. stop 接口等待超时**
- **超时时间**: 5 秒
- **超时策略**: `waitForWorkflowComplete` 在 5 秒内轮询检查停止标志是否被删除
- **超时处理**: 5 秒后直接返回,不影响工作流继续执行
- **设计原因**:
  - 避免前端长时间等待
  - 5 秒足够大多数节点完成当前操作
  - 用户体验优先,超时后前端可选择重试或放弃

**4. 并发停止请求**
- **处理方式**: 多次调用 `setAgentRuntimeStop` 是安全的,Redis SETEX 是幂等操作
- **设计原因**: 避免用户多次点击停止按钮导致的问题

---

## 2. Redis 工具函数实现

**位置**: `packages/service/core/workflow/dispatch/workflowStatus.ts`

```typescript
import { addLog } from '../../../common/system/log';
import { getGlobalRedisConnection } from '../../../common/redis/index';
import { delay } from '@fastgpt/global/common/system/utils';

const WORKFLOW_STATUS_PREFIX = 'agent_runtime_stopping';
const TTL = 60; // 60秒

export const StopStatus = 'STOPPING';

export type WorkflowStatusParams = {
  appId: string;
  chatId: string;
};

// 获取工作流状态键
export const getRuntimeStatusKey = (params: WorkflowStatusParams): string => {
  return `${WORKFLOW_STATUS_PREFIX}:${params.appId}:${params.chatId}`;
};

// 设置停止标志
export const setAgentRuntimeStop = async (params: WorkflowStatusParams): Promise<void> => {
  const redis = getGlobalRedisConnection();
  const key = getRuntimeStatusKey(params);
  await redis.setex(key, TTL, 1);
};

// 删除停止标志
export const delAgentRuntimeStopSign = async (params: WorkflowStatusParams): Promise<void> => {
  const redis = getGlobalRedisConnection();
  const key = getRuntimeStatusKey(params);
  await redis.del(key).catch((err) => {
    addLog.error(`[Agent Runtime Stop] Delete stop sign error`, err);
  });
};

// 检查工作流是否应该停止
export const shouldWorkflowStop = (params: WorkflowStatusParams): Promise<boolean> => {
  const redis = getGlobalRedisConnection();
  const key = getRuntimeStatusKey(params);
  return redis
    .get(key)
    .then((res) => !!res)
    .catch(() => false);
};

/**
 * 等待工作流完成(停止标志被删除)
 * @param params 工作流参数
 * @param timeout 超时时间(毫秒),默认5秒
 * @param pollInterval 轮询间隔(毫秒),默认50毫秒
 */
export const waitForWorkflowComplete = async ({
  appId,
  chatId,
  timeout = 5000,
  pollInterval = 50
}: {
  appId: string;
  chatId: string;
  timeout?: number;
  pollInterval?: number;
}) => {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const sign = await shouldWorkflowStop({ appId, chatId });

    // 如果停止标志已被删除,说明工作流已完成
    if (!sign) {
      return;
    }

    // 等待下一次轮询
    await delay(pollInterval);
  }

  // 超时后直接返回
  return;
};
```

**测试用例位置**: `test/cases/service/core/app/workflow/workflowStatus.test.ts`

```typescript
import { describe, test, expect, beforeEach } from 'vitest';
import {
  setAgentRuntimeStop,
  delAgentRuntimeStopSign,
  shouldWorkflowStop,
  waitForWorkflowComplete
} from '@fastgpt/service/core/workflow/dispatch/workflowStatus';

describe('Workflow Status Redis Functions', () => {
  const testAppId = 'test_app_123';
  const testChatId = 'test_chat_456';

  beforeEach(async () => {
    // 清理测试数据
    await delAgentRuntimeStopSign({ appId: testAppId, chatId: testChatId });
  });

  test('should set stopping sign', async () => {
    await setAgentRuntimeStop({ appId: testAppId, chatId: testChatId });
    const shouldStop = await shouldWorkflowStop({ appId: testAppId, chatId: testChatId });
    expect(shouldStop).toBe(true);
  });

  test('should return false for non-existent status', async () => {
    const shouldStop = await shouldWorkflowStop({ appId: testAppId, chatId: testChatId });
    expect(shouldStop).toBe(false);
  });

  test('should return false after deleting stop sign', async () => {
    await setAgentRuntimeStop({ appId: testAppId, chatId: testChatId });
    await delAgentRuntimeStopSign({ appId: testAppId, chatId: testChatId });
    const shouldStop = await shouldWorkflowStop({ appId: testAppId, chatId: testChatId });
    expect(shouldStop).toBe(false);
  });

  test('should wait for workflow completion', async () => {
    // 设置初始停止标志
    await setAgentRuntimeStop({ appId: testAppId, chatId: testChatId });

    // 模拟异步完成(删除停止标志)
    setTimeout(async () => {
      await delAgentRuntimeStopSign({ appId: testAppId, chatId: testChatId });
    }, 500);

    // 等待完成
    await waitForWorkflowComplete({
      appId: testAppId,
      chatId: testChatId,
      timeout: 2000
    });

    // 验证停止标志已被删除
    const shouldStop = await shouldWorkflowStop({ appId: testAppId, chatId: testChatId });
    expect(shouldStop).toBe(false);
  });

  test('should timeout when waiting too long', async () => {
    await setAgentRuntimeStop({ appId: testAppId, chatId: testChatId });

    // 等待超时(不删除标志)
    await waitForWorkflowComplete({
      appId: testAppId,
      chatId: testChatId,
      timeout: 100
    });

    // 验证停止标志仍然存在
    const shouldStop = await shouldWorkflowStop({ appId: testAppId, chatId: testChatId });
    expect(shouldStop).toBe(true);
  });

  test('should handle concurrent stop sign operations', async () => {
    // 并发设置停止标志
    await Promise.all([
      setAgentRuntimeStop({ appId: testAppId, chatId: testChatId }),
      setAgentRuntimeStop({ appId: testAppId, chatId: testChatId })
    ]);

    // 停止标志应该存在
    const shouldStop = await shouldWorkflowStop({ appId: testAppId, chatId: testChatId });
    expect(shouldStop).toBe(true);
  });
});
```

## 3. 工作流停止检测机制改造

### 3.1 修改位置

**文件**: `packages/service/core/workflow/dispatch/index.ts`

### 3.2 工作流启动时的停止检测机制

**改造点 1: 停止检测逻辑 (行 196-216)**

使用内存变量 + 定时轮询 Redis 的方式:

```typescript
import { delAgentRuntimeStopSign, shouldWorkflowStop } from './workflowStatus';

// 初始化停止检测
let stopping = false;
const checkIsStopping = (): boolean => {
  if (apiVersion === 'v2') {
    return stopping;
  }
  if (apiVersion === 'v1') {
    if (!res) return false;
    return res.closed || !!res.errored;
  }
  return false;
};

// v2 版本: 启动定时器定期检查 Redis
const checkStoppingTimer =
  apiVersion === 'v2'
    ? setInterval(async () => {
        stopping = await shouldWorkflowStop({
          appId: runningAppInfo.id,
          chatId
        });
      }, 100)
    : undefined;
```

**设计要点**:
- v2 版本使用内存变量 `stopping` + 100ms 定时器轮询 Redis
- v1 版本仍使用原有的 `res.closed/res.errored` 检测
- 轮询频率 100ms,平衡性能和响应速度

**改造点 2: 工作流完成后清理 (行 232-249)**

```typescript
return runWorkflow({
  ...data,
  checkIsStopping,  // 传递检测函数
  query,
  histories,
  // ... 其他参数
}).finally(async () => {
  // 清理定时器
  if (streamCheckTimer) {
    clearInterval(streamCheckTimer);
  }
  if (checkStoppingTimer) {
    clearInterval(checkStoppingTimer);
  }

  // Close mcpClient connections
  Object.values(mcpClientMemory).forEach((client) => {
    client.closeConnection();
  });

  // 工作流完成后删除 Redis 记录
  await delAgentRuntimeStopSign({
    appId: runningAppInfo.id,
    chatId
  });
});
```

### 3.3 节点执行前的停止检测

**位置**: `packages/service/core/workflow/dispatch/index.ts:861-868`

在 `checkNodeCanRun` 方法中,每个节点执行前检查:

```typescript
private async checkNodeCanRun(
  node: RuntimeNodeItemType,
  skippedNodeIdList = new Set<string>()
) {
  // ... 其他检查逻辑 ...

  // Check queue status
  if (data.maxRunTimes <= 0) {
    addLog.error('Max run times is 0', {
      appId: data.runningAppInfo.id
    });
    return;
  }
  
  // 停止检测
  if (checkIsStopping()) {
    addLog.warn('Workflow stopped', {
      appId: data.runningAppInfo.id,
      nodeId: node.nodeId,
      nodeName: node.name
    });
    return;
  }

  // ... 执行节点逻辑 ...
}
```

**说明**:
- 直接调用 `checkIsStopping()` 同步方法
- 内部会检查内存变量 `stopping`
- 定时器每 100ms 更新一次该变量
- 检测到停止时记录日志并直接返回,不执行节点

## 4. v2/chat/stop 接口设计

### 4.1 接口规范

**接口路径**: `/api/v2/chat/stop`

**Schema 位置**: `packages/global/openapi/core/chat/api.ts`

**接口文档位置**: `packages/global/openapi/core/chat/index.ts`

**请求方法**: POST

**请求参数**:
```typescript
// packages/global/openapi/core/chat/api.ts
export const StopV2ChatSchema = z
  .object({
    appId: ObjectIdSchema.describe('应用ID'),
    chatId: z.string().min(1).describe('对话ID'),
    outLinkAuthData: OutLinkChatAuthSchema.optional().describe('外链鉴权数据')
  });

export type StopV2ChatParams = z.infer<typeof StopV2ChatSchema>;
```

**响应格式**:
```typescript
export const StopV2ChatResponseSchema = z
  .object({
    success: z.boolean().describe('是否成功停止')
  });

export type StopV2ChatResponse = z.infer<typeof StopV2ChatResponseSchema>;
```

### 4.2 接口实现

**文件位置**: `projects/app/src/pages/api/v2/chat/stop.ts`

```typescript
import type { NextApiRequest, NextApiResponse } from 'next';
import { NextAPI } from '@/service/middleware/entry';
import { authChatCrud } from '@/service/support/permission/auth/chat';
import {
  setAgentRuntimeStop,
  waitForWorkflowComplete
} from '@fastgpt/service/core/workflow/dispatch/workflowStatus';
import { StopV2ChatSchema, type StopV2ChatResponse } from '@fastgpt/global/openapi/core/chat/controler/api';

async function handler(req: NextApiRequest, res: NextApiResponse): Promise<StopV2ChatResponse> {
  const { appId, chatId, outLinkAuthData } = StopV2ChatSchema.parse(req.body);

  // 鉴权 (复用聊天 CRUD 鉴权)
  await authChatCrud({
    req,
    authToken: true,
    authApiKey: true,
    appId,
    chatId,
    ...outLinkAuthData
  });

  // 设置停止标志
  await setAgentRuntimeStop({
    appId,
    chatId
  });

  // 等待工作流完成 (最多等待 5 秒)
  await waitForWorkflowComplete({ appId, chatId, timeout: 5000 });

  return {
    success: true
  };
}

export default NextAPI(handler);
```

**接口文档** (`packages/global/openapi/core/chat/index.ts`):

```typescript
export const ChatPath: OpenAPIPath = {
  // ... 其他路径

  '/v2/chat/stop': {
    post: {
      summary: '停止 Agent 运行',
      description: `优雅停止正在运行的 Agent, 会尝试等待当前节点结束后返回，最长 5s，超过 5s 仍未结束，则会返回成功。
LLM 节点，流输出时会同时被终止，但 HTTP 请求节点这种可能长时间运行的，不会被终止。`,
      tags: [TagsMap.chatPage],
      requestBody: {
        content: {
          'application/json': {
            schema: StopV2ChatSchema
          }
        }
      },
      responses: {
        200: {
          description: '成功停止工作流',
          content: {
            'application/json': {
              schema: StopV2ChatResponseSchema
            }
          }
        }
      }
    }
  }
};
```

**说明**:
- 接口使用 `authChatCrud` 进行鉴权,支持 Token 和 API Key
- 支持分享链接和团队空间的鉴权数据
- 设置停止标志后等待最多 5 秒
- 无论是否超时,都返回 `success: true`

## 5. 前端改造

由于当前代码已经能够正常工作,且 v2 版本的后端已经实现了基于 Redis 的停止机制,前端可以保持现有的简单实现:

**保持现有实现的原因**:
1. 后端已经通过定时器轮询 Redis 实现了停止检测
2. 前端调用 `abort()` 后,后端会在下个检测周期(100ms内)发现停止标志
3. 简化前端逻辑,避免增加复杂性
4. 用户体验上,立即中断连接响应更快

**可选的增强方案**:

如果需要在前端显示更详细的停止状态,可以添加 API 客户端函数:

**文件位置**: `projects/app/src/web/core/chat/api.ts`

```typescript
import { POST } from '@/web/common/api/request';
import type { StopV2ChatParams, StopV2ChatResponse } from '@fastgpt/global/openapi/core/chat/controler/api';

/**
 * 停止 v2 版本工作流运行
 */
export const stopV2Chat = (data: StopV2ChatParams) =>
  POST<StopV2ChatResponse>('/api/v2/chat/stop', data);
```

**增强的 abortRequest 函数**:

```typescript
/* Abort chat completions, questionGuide */
const abortRequest = useMemoizedFn(async (reason: string = 'stop') => {
  // 先调用 abort 中断连接
  chatController.current?.abort(new Error(reason));
  questionGuideController.current?.abort(new Error(reason));
  pluginController.current?.abort(new Error(reason));

  // v2 版本: 可选地通知后端优雅停止
  if (chatBoxData?.app?.version === 'v2' && appId && chatId) {
    try {
      await stopV2Chat({
        appId,
        chatId,
        outLinkAuthData
      });
    } catch (error) {
      // 静默失败,不影响用户体验
      console.warn('Failed to notify backend to stop workflow', error);
    }
  }
});
```

**建议**:
- **推荐**: 保持当前简单实现,后端已经足够健壮
- **可选**: 如果需要更精确的停止状态追踪,可以实现上述增强方案

## 6. 完整调用流程

### 6.1 正常停止流程

```
用户点击停止按钮
    ↓
前端: abortRequest()
    ↓
前端: chatController.abort() [立即中断 HTTP 连接]
    ↓
[可选] 前端: POST /api/v2/chat/stop
    ↓
后端: setAgentRuntimeStop(appId, chatId) [设置停止标志]
    ↓
后端: 定时器检测到 Redis 停止标志,更新内存变量 stopping = true
    ↓
后端: 下个节点执行前 checkIsStopping() 返回 true
    ↓
后端: 停止处理新节点,记录日志
    ↓
后端: 工作流 finally 块删除 Redis 停止标志
    ↓
[可选] 后端: waitForWorkflowComplete() 检测到停止标志被删除
    ↓
[可选] 前端: 显示停止成功提示
```

### 6.2 超时流程

```
[可选] 前端: POST /api/v2/chat/stop
    ↓
后端: setAgentRuntimeStop(appId, chatId)
    ↓
后端: waitForWorkflowComplete(timeout=5s)
    ↓
后端: 5秒后停止标志仍存在
    ↓
后端: 返回成功响应 (不区分超时)
    ↓
[可选] 前端: 显示成功提示
    ↓
后端: 工作流继续运行,最终完成后删除停止标志
```

### 6.3 工作流自然完成流程

```
工作流运行中
    ↓
所有节点执行完成
    ↓
dispatchWorkFlow.finally()
    ↓
删除 Redis 停止标志
    ↓
清理定时器
    ↓
60秒 TTL 确保即使删除失败也会自动清理
```

### 6.4 时序说明

**关键时间点**:
- **100ms**: 后端定时器检查 Redis 停止标志的频率
- **5s**: stop 接口等待工作流完成的超时时间
- **60s**: Redis 键的 TTL,自动清理时间

**响应时间**:
- 用户点击停止 → HTTP 连接中断: **立即** (前端 abort)
- 停止标志写入 Redis: **< 50ms** (Redis SETEX 操作)
- 后端检测到停止: **< 100ms** (定时器轮询周期)
- 当前节点停止执行: **取决于节点类型**
  - LLM 流式输出: **立即**中断流
  - HTTP 请求节点: **等待请求完成**
  - 其他节点: **等待当前操作完成**

## 7. 测试策略

### 7.1 单元测试

**Redis 工具函数测试**:
- `setAgentRuntimeStop` / `shouldWorkflowStop` 基本功能
- `delAgentRuntimeStopSign` 删除功能
- `waitForWorkflowComplete` 等待机制和超时
- 并发操作安全性

**文件位置**: `test/cases/service/core/app/workflow/workflowStatus.test.ts`

**测试用例**:
```typescript
describe('Workflow Status Redis Functions', () => {
  test('should set stopping sign')
  test('should return false for non-existent status')
  test('should detect stopping status')
  test('should return false after deleting stop sign')
  test('should wait for workflow completion')
  test('should timeout when waiting too long')
  test('should delete workflow stop sign')
  test('should handle concurrent stop sign operations')
});
```

