# FastGPT AI Sandbox 集成方案

## 一、背景与目标

当 Agent 拥有一个独立虚拟机时，可以执行代码、管理文件、调用系统命令，能力大幅增强。本方案通过接入外部沙盒服务，为每个会话提供一个隔离、持久的容器环境，让 Agent 拥有完整的 root 权限操作空间。

**核心目标**：
- 每会话独立隔离，互不干扰
- Agent 无感知沙盒状态，调用接口简单
- 沙盒自动生命周期管理，节省资源
- 支持用户通过 SSH/Web IDE 直接进入沙盒

---

## 二、整体架构

FastGPT 作为**纯业务层**，只负责在合适时机调用 SDK；沙盒的生命周期管理、配额、清理、审计等全部由下游（SDK / SSS）负责。

```mermaid
graph TB
    subgraph FastGPT["FastGPT 业务层"]
        Agent["Agent / 工具调用节点\n(useAgentSandbox=true)"]
        SandboxMgr["execShell()\n(薄封装)"]
    end

    subgraph SDK["@fastgpt-sdk/sandbox-adapter"]
        Adapter["统一适配器\ncreate() / exec()"]
    end

    subgraph Downstream["下游服务（FastGPT 不关心）"]
        SSS["Sealos Sandbox Server\n(生命周期 / 配额 / 审计)"]
        Devbox["Sealos Devbox\n(容器实例)"]
    end

    Agent -->|"首次调用 shell 工具时\n(懒加载)"| SandboxMgr
    SandboxMgr -->|"create() + exec()"| Adapter
    Adapter -->|"API 调用"| SSS
    SSS -->|"管理容器"| Devbox
```

### 组件职责

| 组件 | 职责 | 归属 |
|------|------|------|
| **FastGPT execShell()** | 薄封装：组装 sandboxId，调用 SDK | FastGPT |
| **@fastgpt-sdk/sandbox-adapter** | 统一适配层；`create()` 保证返回可用沙盒 | SDK |
| **Sealos Sandbox Server** | 容器 CRUD、生命周期管理、配额、审计 | 下游 |
| **Sealos Devbox** | 实际的隔离容器实例 | 下游 |

---

## 三、沙盒管理设计

### 3.1 沙盒粒度

沙盒以 **会话维度** 分配，唯一标识由三元组生成：

```
sandboxId = hash(appId + userId + chatId)
```

```mermaid
graph LR
    AppId["appId"]
    UserId["userId"]
    ChatId["chatId"]
    Hash["Hash 函数\n(SHA256)"]
    SandboxId["sandboxId\n(唯一 ID)"]

    AppId --> Hash
    UserId --> Hash
    ChatId --> Hash
    Hash --> SandboxId
```

> 不同会话之间完全隔离；同一会话内多轮对话共享同一个沙盒，保留执行上下文（变量、文件等）。

### 3.2 沙盒生命周期

```mermaid
stateDiagram-v2
    [*] --> Running : Agent 首次调用 shell / 打开 Web IDE\ncreate()（懒加载）

    Running --> Stoped : FastGPT 定时任务\n(5 分钟无活动)
    Stoped --> Running : Agent 再次调用 shell / 打开 Web IDE\ncreate() 自动恢复

    Running --> Deleted : 会话被删除\n(异步触发)
    Stoped --> Deleted : 会话被删除\n(异步触发)

    Deleted --> [*]
```

**FastGPT 侧规则**：
- **懒加载**：会话开始时不创建沙盒，Agent 首次调用 `shell` 工具或用户打开 Web IDE 时才触发 `create()`
- **停止**：由 FastGPT 定时任务驱动，扫描 `lastActiveAt` 超过 5 分钟的 Running 沙盒，调用 SDK 停止
- **销毁**：会话被删除时，**异步**触发 SDK 删除并清理 DB 记录（不阻塞会话删除主流程）

### 3.3 数据库设计

**集合名**：`sandbox_instances`

```typescript
type SandboxInstanceSchema = {
  _id: ObjectId;
  provider: 'sealosdevbox';  // 沙盒提供商
  sandboxId: string;         // hash(appId+userId+chatId)

  appId?: ObjectId;          // 可选，Chat 模式下关联应用
  userId?: string;           // 可选，Chat 模式下关联用户
  chatId?: string;           // 可选，Chat 模式下关联会话

  status: 'running' | 'stoped';
  lastActiveAt: Date;        // 最后活跃时间，驱动停止定时任务
  createdAt: Date;

  limit?: {                  // 可选，资源限制
    cpuCount: number;
    memoryMiB: number;
    diskGiB: number;
  };
};
```

**索引**：
- `{ provider, sandboxId }`：唯一索引（快速查找）
- `{ appId, chatId }`：部分唯一索引（仅当两者都存在时）
- `{ status, lastActiveAt }`：暂停定时任务扫描

### 3.4 定时任务 & 触发时机

```mermaid
flowchart LR
    subgraph StopJob["停止任务（每 5 分钟）"]
        S1["查询 status=running\n且 lastActiveAt < now-5min"] --> S2["SDK.stop(sandboxId)"]
        S2 --> S3["更新 status=stoped"]
    end

    subgraph DeleteTrigger["会话删除（事件触发）"]
        D1["单个会话删除\ndelete by chatId"] --> D2["查询 chatId 对应沙盒"]
        D2 --> D3["异步：SDK.delete(sandboxId)"]
        D3 --> D4["删除 DB 记录"]

        D5["整个应用删除\ndelete by appId"] --> D6["查询 appId 下所有沙盒"]
        D6 --> D7["批量异步：SDK.delete(sandboxId)"]
        D7 --> D8["批量删除 DB 记录"]
    end
```

---

## 四、执行流程

Agent 调用 shell 工具时序：

```mermaid
sequenceDiagram
    participant Agent as Agent 节点
    participant Exec as execShell()
    participant DB as MongoDB
    participant SDK as sandbox-adapter
    participant SSS as Sealos SSS

    Agent->>Exec: execShell({ appId, userId, chatId, command })
    Note over Exec: sandboxId = hash(appId+userId+chatId)

    Exec->>SDK: create(sandboxId)
    Note over SDK,SSS: 幂等：不存在则创建，Stoped 则唤醒，Running 则直接返回
    SDK-->>Exec: SandboxClient

    Exec->>DB: upsert { sandboxId, status=running, lastActiveAt=now }

    Exec->>SDK: exec(sandboxId, command, timeout)
    SDK->>SSS: 执行命令
    SSS-->>SDK: { stdout, stderr, exitCode }
    SDK-->>Exec: ExecResult
    Exec-->>Agent: { stdout, stderr, exitCode }
```

**FastGPT 侧代码逻辑（伪代码）**：

```typescript
async function execShell(params: {
  appId: string;
  userId: string;
  chatId: string;
  command: string;
  timeout?: number;
}) {
  const { appId, userId, chatId, command, timeout } = params;
  const sandboxId = sha256(`${appId}-${userId}-${chatId}`).slice(0, 16);
  const sandbox = await sandboxAdapter.create(sandboxId);   // 幂等，保证可用
  await SandboxInstanceModel.upsert({ sandboxId, status: 'running', lastActiveAt: new Date() });
  return sandboxAdapter.exec(sandbox.id, command, { timeout });
}

---

## 五、Agent 工具设计

### 5.1 节点改造方案

**不新增节点类型**，在现有的**工具调用节点**上增加一个 input：

```typescript
{
  key: 'useAgentSandbox',
  type: 'switch',          // 开关类型
  label: '启用沙盒（Computer Use）',
  defaultValue: false,
  description: '开启后，Agent 将获得一个独立 Linux 环境，可执行命令、操作文件'
}
```

### 5.2 启用后的行为

```mermaid
flowchart TD
    NodeExec["工具调用节点执行"] --> Check{useAgentSandbox\n= true?}
    Check -->|否| Normal["正常执行，不注入任何沙盒能力"]
    Check -->|是| Inject["自动注入内置 sandbox_shell 工具\n到 Agent 的 tools 列表"]
    Inject --> Prompt["在 System Prompt 末尾\n追加沙盒环境说明"]
    Prompt --> Run["Agent 正常运行\n（可自主决定是否调用 sandbox_shell）"]
    Run --> CallShell{Agent 调用\nsandbox_shell 工具?}
    CallShell -->|否| End["正常返回"]
    CallShell -->|是| Sandbox["SandboxClient\n执行命令并返回结果"]
    Sandbox --> End
```

**自动注入的内置 sandbox_shell 工具定义**：

```typescript
// 由系统内置，不需要用户配置，useAgentSandbox=true 时自动追加到 tools
export const SANDBOX_SHELL_TOOL: ChatCompletionTool = {
  type: 'function',
  function: {
    name: 'sandbox_shell',
    description: '在独立 Linux 环境中执行 shell 命令，支持文件操作、代码运行、包安装等',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: '要执行的 shell 命令' },
        timeout: {
          type: 'number',
          description: '超时秒数',
          max: 300,
          min: 1
        }
      },
      required: ['command']
    }
  }
};
```

### 5.3 自动注入的系统提示词

`useAgentSandbox=true` 时，在节点原有 System Prompt **末尾追加**：

```
你拥有一个独立的 Linux 沙盒环境（Ubuntu 22.04），可通过 sandbox_shell 工具执行命令：
- 预装：bash / python3 / node / bun / git / curl
- 工作目录：/workspace（文件在本次会话内持久保留）
- 可自行安装软件包（apt / pip / npm）
```

---

## 六、错误处理

```mermaid
flowchart TD
    Exec["执行命令"] --> E1{沙盒服务\n不可用?}
    E1 -->|是| Err1["返回错误：\n'沙盒服务暂时不可用，请稍后重试'\nexitCode=-1"]
    E1 -->|否| E3{exitCode != 0?}
    E3 -->|是| Warn["返回 stderr 内容\n（非致命错误，Agent 可继续）"]
    E3 -->|否| OK["返回 stdout\n正常执行完成"]
```

| 错误类型 | exitCode | 处理策略 |
|----------|----------|----------|
| 沙盒服务不可用 | -1 | 返回错误，终止当前节点，不中断整个工作流 |
| 命令执行失败 | ≠0 | 将 stderr 作为输出返回，由 Agent 自行判断 |
| 命令超时 | 由上游处理 | 上游沙盒服务自动断开，FastGPT 透传结果即可 |

---

## 七、安全与资源限制

FastGPT 业务层只控制命令超时，其余由下游负责：

| 限制项 | FastGPT 侧 | 说明 |
|--------|-----------|------|
| **命令超时** | 支持传递 timeout 参数 | 由上游沙盒服务控制，FastGPT 透传 timeout 参数（秒）转换为毫秒 |
| **CPU / 内存 / 磁盘** | 不关心 | 下游（SSS/Devbox）控制 |
| **配额** | 不关心 | 下游控制 |
| **网络隔离** | 不关心 | 下游控制 |
| **审计日志** | 不关心 | 下游控制 |

---

## 八、前端功能

### 8.1 文件操作 API

提供文件读写和下载接口，替代 Web IDE 方案：

**文件操作 API**：`POST /api/core/ai/sandbox/file`

```typescript
// 支持三种操作
type Action = 'list' | 'read' | 'write';

// 列出目录
{ action: 'list', appId, chatId, path: '/workspace' }
→ { action: 'list', files: [{ name, path, type, size }] }

// 读取文件
{ action: 'read', appId, chatId, path: '/workspace/test.txt' }
→ { action: 'read', content: 'file content' }

// 写入文件
{ action: 'write', appId, chatId, path: '/workspace/test.txt', content: 'new content' }
→ { action: 'write', success: true }
```

**文件下载 API**：`POST /api/core/ai/sandbox/download`

```typescript
// 下载单个文件或整个目录（ZIP）
{ appId, chatId, path: '/workspace' }
→ 返回文件流或 ZIP 压缩包
```

### 8.2 沙盒状态展示

在对话页面的工具调用结果中，展示：
- 命令内容（折叠显示）
- 执行状态（成功/失败/超时）
- stdout/stderr 输出（Markdown 代码块）
- 执行耗时
- 文件操作入口（列表、读取、下载）

---

## 九、设计决策记录

| 问题 | 决策 |
|------|------|
| 沙盒配额管理 | 不关心，由下游处理 |
| 沙盒何时创建 | 懒加载，Agent 首次调用 sandbox_shell 时才创建 |
| 停止由谁驱动 | **FastGPT 定时任务**，5 分钟无活动自动停止，不可配置 |
| 销毁由谁驱动 | **会话删除时异步触发**，不依赖定时任务 |
| 多厂商适配 | 由 SDK 适配层处理，FastGPT 不感知 |
| 审计日志 | 下游处理，FastGPT 不记录 |
| 事务一致性 | 使用 mongoSessionRun 保证 DB 操作和 SDK 调用的一致性 |
| Web IDE 方案 | 改为文件操作 API（list/read/write/download），不使用 Web IDE |
