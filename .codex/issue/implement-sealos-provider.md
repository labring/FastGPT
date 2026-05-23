# Sealos Sandbox Provider 实现方案

## 1. 设计基线

FastGPT 统一通过 `@fastgpt-sdk/sandbox-adapter` 使用 sandbox provider：

```txt
FastGPT
  -> @fastgpt-sdk/sandbox-adapter
    -> OpenSandboxAdapter
       -> OpenSandbox
       -> fastgpt-agent-sandbox

    -> SealosDevboxAdapter
       -> Sealos Devbox
       -> frameworks/sandbox/fastgpt
```

已确认结论：

- OpenSandbox 和 Sealos 都必须走 `sandbox-adapter`，FastGPT 不直接请求 provider API。
- `projects/agent-sandbox` 只用于 OpenSandbox 场景。
- Sealos 场景下，Devbox 本身就是 agent sandbox 方案。
- Sealos 新 runtime 使用 `labring-actions/devbox-runtime#122` 新增的 `frameworks/sandbox/fastgpt`，不是 FastGPT 的 `fastgpt-agent-sandbox` 镜像。

参考：

- Sealos Devbox v2 server API：https://github.com/sealos-apps/devbox/blob/main/v2/server/docs/api.md
- Devbox FastGPT runtime：https://github.com/labring-actions/devbox-runtime/pull/122
- sandbox adaptor：https://github.com/labring/agent-sandbox-adaptor

## 2. Provider 能力

### 2.1 OpenSandbox

OpenSandbox 使用 FastGPT 自己维护的 `fastgpt-agent-sandbox` 镜像。

当前 FastGPT 依赖的 create 能力：

- `image`
- `entrypoint`
- `env`
- `metadata`
- `volumes`
- `resourceLimits`

相关环境变量：

- `AGENT_SANDBOX_OPENSANDBOX_IMAGE_REPO`
- `AGENT_SANDBOX_OPENSANDBOX_IMAGE_TAG`
- `FASTGPT_WORKDIR`
- `FASTGPT_ENABLE_CODE_SERVER`

这些是 OpenSandbox provider 的实现细节，不应直接套到 Sealos。

### 2.2 Sealos Devbox

Sealos Devbox v2 server create API 支持：

- `name`
- `image`
- `upstreamID`
- `env`
- `kubeAccess`
- `pauseAt`
- `archiveAfterPauseTime`
- `labels`

Sealos Devbox info API 返回：

- `state`
- `ssh`
- `gateway.url`
- `gateway.token`
- `gateway.port`
- `gateway.uniqueID`

Sealos Devbox server 已提供 exec/file 能力：

- `POST /api/v1/devbox/{name}/exec`
- `POST /api/v1/devbox/{name}/files/upload`
- `GET /api/v1/devbox/{name}/files/download`

这些接口内部转发到 Pod 内 `devbox-sdk-server:9757`，FastGPT 不需要自己实现 exec/file 通道。

### 2.3 Devbox FastGPT Runtime

`frameworks/sandbox/fastgpt` runtime 的关键约定：

- `codex-gateway` 默认监听 `1317`
- Devbox v2 server gateway 固定反代 Pod 内 `1317`
- `code-server` 是 runtime 的可选浏览器编辑服务，当前 FastGPT Skill 编辑页不再依赖它
- 如果未来恢复 provider 页面嵌入，`code-server` 可通过 `CODE_SERVER_ENABLED=true` 启动
- 默认工作目录是 `/home/devbox/workspace`
- 默认 Codex home 是 `/codex-home`

建议 Sealos runtime env：

```ts
{
  CODEX_GATEWAY_CWD: '/home/devbox/workspace',
  CODEX_GATEWAY_CODEX_HOME: '/codex-home'
}
```

当前 `SandboxEditor` 文件 API 链路不需要启动 `code-server`。如果后续重新接入 provider 浏览器页面，再额外传入：

```ts
{
  CODE_SERVER_ENABLED: 'true'
}
```

## 3. Adapter 方案

### 3.1 Create Spec

create spec 抽象放在 `agent-sandbox-adaptor`。

建议保留一个统一 zod schema，不拆 provider-specific schema。provider 支持范围用 typed metadata 描述。

核心结构：

```ts
const SandboxCreateSpecSchema = z.object({
  image: z
    .object({
      repository: z.string(),
      tag: z.string().optional(),
      digest: z.string().optional()
    })
    .optional(),
  env: z.record(z.string(), z.string()).optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  labels: z.array(z.object({ key: z.string(), value: z.string() })).optional(),
  lifecycle: z
    .object({
      pauseAt: z.string().optional(),
      archiveAfterPauseTime: z.string().optional()
    })
    .optional(),
  kubeAccess: z
    .object({
      enabled: z.boolean().optional(),
      roleTemplate: z.enum(['view', 'edit', 'admin']).optional()
    })
    .optional(),
  entrypoint: z.array(z.string()).optional(),
  workingDir: z.string().optional(),
  volumes: z.array(z.unknown()).optional(),
  resourceLimits: z.unknown().optional()
});
```

OpenSandbox adapter 映射：

- `image`
- `entrypoint`
- `env`
- `metadata`
- `volumes`
- `resourceLimits`

SealosDevbox adapter 映射：

- `image` -> Devbox `image`，仅使用 Sealos 专用 runtime image
- `env` -> Devbox `env`
- `metadata.sessionId` 或显式字段 -> Devbox `upstreamID`
- `workingDir` -> `env.CODEX_GATEWAY_CWD`
- `labels` -> Devbox `labels`
- `kubeAccess` -> Devbox `kubeAccess`
- `lifecycle.pauseAt` -> Devbox `pauseAt`
- `lifecycle.archiveAfterPauseTime` -> Devbox `archiveAfterPauseTime`

Sealos adapter 不支持：

- `entrypoint`
- `volumes`
- `resourceLimits`

### 3.2 Sealos Image 配置

默认让 Devbox server 的 `createDefaults.image` 配成 `frameworks/sandbox/fastgpt` 对应镜像，FastGPT 创建 Devbox 时不传 `image`。

`agent-sandbox-adaptor` 仍保留 Sealos `image` 映射能力，用于调试、灰度或多 runtime 场景。如果 FastGPT 需要显式控制 runtime 镜像，再新增 Sealos 专用配置：

```txt
AGENT_SANDBOX_SEALOS_IMAGE
```

不要复用：

```txt
AGENT_SANDBOX_OPENSANDBOX_IMAGE_REPO
AGENT_SANDBOX_OPENSANDBOX_IMAGE_TAG
```

## 4. 编辑器访问与文件通道

### 4.1 当前产品形态

当前 FastGPT 不再使用 `SandboxIframe` 嵌入 `code-server`，也不再要求浏览器直接访问 provider endpoint。

Skill 编辑页使用 FastGPT 自己的 `SandboxEditor` 文件树和 Monaco 编辑器：

```txt
Skill detail page
  -> SandboxEditor
    -> /api/core/ai/skill/edit              创建或复用 edit-debug sandbox
    -> /api/core/ai/sandbox/listRecursive   递归读取 workspace 文件树
    -> /api/core/ai/sandbox/read            读取文件
    -> /api/core/ai/sandbox/write           写入文件
    -> /api/core/ai/sandbox/fileOp          mkdir/delete/move/copy/upload
    -> /api/core/ai/sandbox/download        下载文件或目录
    -> /api/core/ai/skill/save-deploy       从 workspace 打包并发布版本
```

因此首期 Sealos 接入的验收重点是 provider adapter 的生命周期、exec 和文件系统能力，而不是 `code-server` iframe、WebSocket 或 cookie/session 隔离。

### 4.2 Backend 文件通道

所有浏览器操作都回到 FastGPT API，由后端鉴权后通过 sandbox adapter 操作远端文件系统：

```txt
Browser
  -> FastGPT API
    -> authSandboxSession
    -> getSandboxClient(appId/userId/chatId 或 edit-debug)
    -> ISandbox.execute / readFiles / writeFiles / listDirectory / getFileInfo / moveFiles
    -> OpenSandboxAdapter 或 SealosDevboxAdapter
```

关键边界：

- 浏览器只知道 FastGPT 的 API，不持有 provider endpoint、proxy target 或 provider path。
- `authSandboxSession` 统一区分普通 chat sandbox 和 Skill `edit-debug` sandbox。
- `getSandboxClient` 负责确保 sandbox 可用，并刷新本地 `agent_sandbox_instances` 记录。
- `SandboxEditor` 只处理文件树/文件内容 UI，不承担 provider endpoint 解析。

### 4.3 Adapter Endpoint 能力

`ISandbox.getEndpoint(port)` 可以作为 provider 暴露端口的可选能力保留，用于未来诊断或额外服务访问。

当前 Skill 编辑链路不依赖：

- `getProxyTarget(service)`
- `sandbox-proxy`
- `/__fastgpt_proxy/code-server/`
- `SandboxIframe.tsx`
- `code-server` HTTP/WS 访问

如果后续重新引入 `code-server` 或 `codex-gateway` 的浏览器访问，再单独设计 service-level endpoint/proxy target。该设计不应混入当前 `SandboxEditor` 文件 API 链路。

### 4.4 Sealos runtime 服务划分

Sealos `frameworks/sandbox/fastgpt` runtime 仍可能包含：

- `codex-gateway`: `1317`
- `code-server`: `1318`

但它们不是当前 FastGPT Skill 编辑 UI 的首期依赖。当前 Sealos provider 首期需要保证：

- Devbox 可创建、恢复、暂停、删除。
- `execute` 可运行 shell 命令。
- `readFiles`、`writeFiles`、`listDirectory`、`getFileInfo`、`moveFiles` 等文件能力满足 `SandboxEditor`。
- `workingDir` 正确映射到 `/home/devbox/workspace`，并和 Skill 包解压、保存发布使用同一个 workspace。

## 5. FastGPT 改造点

### 5.1 Provider Config

新增或整理 Sealos 专用配置：

```txt
AGENT_SANDBOX_PROVIDER=sealosdevbox
AGENT_SANDBOX_SEALOS_BASEURL
AGENT_SANDBOX_SEALOS_TOKEN
AGENT_SANDBOX_SEALOS_IMAGE          # 可选
```

`AGENT_SANDBOX_SEALOS_TOKEN` 是 Devbox server JWT，namespace 来自 token claims。

首期 Sealos provider 使用全局固定 token 和固定 namespace。所有 FastGPT team/user 的 Devbox 都创建在该 namespace 下，通过 `upstreamID` 和 labels 标记归属。

### 5.2 Sandbox 创建

FastGPT 上层继续传统一 create spec。

OpenSandbox 使用现有镜像与 entrypoint 逻辑。

Sealos 只传支持字段：

```ts
{
  image: sealosImageIfConfigured,
  env: {
    CODEX_GATEWAY_CWD: '/home/devbox/workspace',
    CODEX_GATEWAY_CODEX_HOME: '/codex-home'
  },
  metadata: {
    sessionId
  }
}
```

### 5.3 SandboxEditor 文件 API

Skill 编辑页不再嵌入 provider 页面。前端固定使用 `SandboxEditor`，所有文件操作走 FastGPT API。

首期需要保证这些接口在 Sealos provider 下行为一致：

- `/api/core/ai/skill/edit`：创建或复用 edit-debug sandbox，并把当前版本包解压到 workspace。
- `/api/core/ai/sandbox/listRecursive`：展示 Skill 文件树。
- `/api/core/ai/sandbox/read` / `/api/core/ai/sandbox/write`：读写编辑器内容。
- `/api/core/ai/sandbox/fileOp`：目录和文件的创建、删除、移动、复制、上传。
- `/api/core/ai/sandbox/download`：下载 workspace 文件或目录。
- `/api/core/ai/skill/save-deploy`：从 sandbox workspace 打包 ZIP，上传对象存储并切换当前版本。

后续如果要接入 `code-server` 或 `codex-gateway` 浏览器页面，再新增对应 endpoint/proxy 设计。

## 6. TODO

1. [x] 修改 `agent-sandbox-adaptor`：定义统一 `SandboxCreateSpecSchema`。
2. [x] 修改 `agent-sandbox-adaptor`：SealosDevbox adapter 支持 `env/upstreamID/kubeAccess/pauseAt/archiveAfterPauseTime/labels/image`。
3. [x] 修改 `agent-sandbox-adaptor`：保留 `getEndpoint(port)` 作为可选端口访问能力。
4. [x] 修改 `agent-sandbox-adaptor`：SealosDevbox adapter 支持从 `gateway.url` 推导 httpgate endpoint，用于未来端口访问或诊断。
5. [x] 修改 `agent-sandbox-adaptor`：OpenSandbox adapter 内收 direct endpoint 解析逻辑。
6. [x] 修改 FastGPT：Skill 编辑页改为 `SandboxEditor` 文件 API 链路，不再依赖 `SandboxIframe`。
7. [x] 修改 FastGPT：新增 Sealos runtime 配置，避免复用 OpenSandbox image env。
8. [x] 修改 FastGPT：Sealos provider 不再拒绝所有 create spec，而是只传支持字段。
9. [x] 修改 FastGPT：新增 provider-aware sandbox 文件 API，覆盖文件树、读写、文件操作和下载。
10. [x] 删除旧 `sandbox-proxy` / `SandboxIframe` 依赖路径。
11. [ ] 增加集成测试：创建 Devbox、exec、upload/download、listDirectory、getFileInfo、moveFiles，并通过 `SandboxEditor` 相关 API 验证编辑/发布闭环。
