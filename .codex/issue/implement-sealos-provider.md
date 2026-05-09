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
- `code-server` 当前监听 `1318`，可以配置 `CODE_SERVER_BIND_ADDR` 变更
- `code-server` 默认不启动，需要 `CODE_SERVER_ENABLED=true`
- 默认工作目录是 `/home/devbox/workspace`
- 默认 Codex home 是 `/codex-home`

建议 Sealos runtime env：

```ts
{
  CODEX_GATEWAY_CWD: '/home/devbox/workspace',
  CODEX_GATEWAY_CODEX_HOME: '/codex-home',
  CODE_SERVER_ENABLED: enableCodeServer ? 'true' : 'false'
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

## 4. Endpoint 与 Proxy

### 4.1 Adaptor Endpoint 能力

endpoint 解析应收敛到 `agent-sandbox-adaptor`，FastGPT 不应知道 provider 的 endpoint 规则。

adaptor 里把 endpoint 能力正式化为两层：

- `getEndpoint(service)`：返回 provider 对外服务地址，用于健康检查、普通服务访问。
- `getProxyTarget(service)`：返回给 FastGPT `sandbox-proxy` 使用的 upstream target，用于 iframe/WS/cookie/auth。

`getEndpoint(service)`：

```ts
interface IEndpointAccess {
  getEndpoint(service: 'code-server'): Promise<Endpoint>;
}

type Endpoint = {
  host: string;
  port: number;
  protocol: 'http' | 'https';
  url: string;
};
```

`getProxyTarget(service)`：

```ts
type SandboxProxyTarget = {
  service: 'code-server';
  origin: string;
  basePath: string;
  auth: 'code-server';
};
```

OpenSandbox 的 `code-server` 是双端口语义：

- provider direct endpoint 端口：`44772`
- iframe 内部服务路径端口：`8080`

这个差异属于 OpenSandbox provider 的内部实现，FastGPT 不应该知道 `44772`。

Sealos Devbox 的 `code-server` 当前是单端口语义，但端口和 OpenSandbox 不同：

- httpgate 端口：`1318`
- iframe 服务路径端口：`1318`

因此 `code-server` 的服务端口不是全局常量，而是 provider/runtime 维度的映射。

因此 provider 映射应收敛在 adaptor：

- `ISandbox` 增加 `getEndpoint(service)`，不支持的 provider 由 `BaseSandboxAdapter` 抛 `FeatureNotSupportedError`。
- `ISandbox` 增加 `getProxyTarget(service)`。
- OpenSandbox adapter 把现有 direct endpoint 解析逻辑收进去，避免 FastGPT 继续调用 OpenSandbox 私有 `/v1/sandboxes/.../endpoints?...`。
- SealosDevbox adapter 从 Devbox info 推导 `code-server` 的 httpgate endpoint。

SealosDevbox adapter 的 `getEndpoint('code-server')` 内部可以有两种实现来源：

1. 首期采用：从 Devbox info 返回的 `gateway.url` 推导 httpgate domain，再根据 `uniqueID` 拼出 `devbox-<uniqueID>-1318.<domain>`。
2. 后续可替换：如果 Devbox v2 server info API 返回 app port endpoint，则直接使用 API 返回值。

首期不新增 FastGPT 环境变量配置 `httpgateDomain`。推导逻辑只放在 `SealosDevboxAdapter` 内部，FastGPT 不感知：

```txt
gateway.url = https://devbox-gateway.staging-usw-1.sealos.io/codex/<uniqueID>
httpgate    = https://devbox-<uniqueID>-1318.staging-usw-1.sealos.io
```

如果某个部署的 gateway/httpgate 域名规则不同，后续再给 adaptor connection config 增加可选 override。

FastGPT 只调用：

```ts
const endpoint = await sandbox.getEndpoint('code-server');
const proxyTarget = await sandbox.getProxyTarget('code-server');
```

不关心 OpenSandbox 背后是 `44772` direct endpoint，也不关心 Sealos 背后是 httpgate host 规则还是 Devbox API。

### 4.2 服务划分

Sealos `frameworks/sandbox/fastgpt` runtime 有两个相关服务：

- `codex-gateway`: `1317`
- `code-server`: `1318`

当前 FastGPT iframe 在 Sealos Devbox 下目标是 `code-server:1318`。

`codex-gateway:1317` 是 runtime 内置能力，但不是当前技能编辑 iframe 的首期入口。

### 4.3 Proxy Target

浏览器不直接访问 provider endpoint。浏览器只拿 FastGPT proxy token，`sandbox-proxy` 通过 FastGPT internal API 解析实际 upstream。

`sandbox-proxy` 使用 FastGPT internal API 返回的 target。浏览器和 JWT 不携带 provider upstream，也不携带 provider path：

```ts
type SandboxProxyTarget = {
  service: 'code-server';
  origin: string;
  basePath: string;
  auth: 'code-server';
};
```

OpenSandbox `code-server`：

```ts
{
  service: 'code-server',
  origin: 'http://<direct-host>',
  basePath: '/proxy/8080',
  auth: 'code-server'
}
```

Sealos `code-server`：

```ts
{
  service: 'code-server',
  origin: 'https://devbox-<uniqueID>-1318.<httpgate-domain>',
  basePath: '',
  auth: 'code-server'
}
```

`sandbox-proxy` 需要：

- 只接受稳定 public path：`/__fastgpt_proxy/code-server/`。
- 通过 internal API 解析 `origin/basePath/auth`，并在 proxy 进程内短缓存。
- 将 public path 重写为 provider `basePath`：
  - OpenSandbox：`/__fastgpt_proxy/code-server/...` -> `/proxy/8080/...`
  - Sealos：httpgate 直达 code-server 根路径，`/__fastgpt_proxy/code-server/...` -> `/...`
- 同时识别 provider `basePath` 请求，处理 code-server 生成的绝对资源路径：
  - OpenSandbox：`/proxy/8080/...`
  - Sealos：`/...`
- 支持 HTTP/WS
- 复用现有 code-server session 逻辑

wildcard domain 仍然需要，用于按 sandbox 隔离浏览器 origin、cookie、localStorage 和 WebSocket。

`codex-gateway:1317` 首期不接入 FastGPT iframe/proxy。

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
    CODEX_GATEWAY_CODEX_HOME: '/codex-home',
    CODE_SERVER_ENABLED: enableCodeServer ? 'true' : 'false'
  },
  metadata: {
    sessionId
  }
}
```

### 5.3 Sandbox Iframe

`SandboxIframe.tsx` 不硬编码 provider path。前端只访问稳定入口：

```txt
https://<sandboxId>.<sandbox_proxy_base>/__fastgpt_proxy/code-server/?_t=<token>
```

proxy token 只携带 `sid + svc`，实际 provider upstream 由 `sandbox-proxy` 通过 FastGPT internal API 解析。

首期：

- OpenSandbox -> `code-server`
- Sealos -> `code-server`

后续如果要接入 `codex-gateway`，再新增对应 service target。

## 6. TODO

1. [x] 修改 `agent-sandbox-adaptor`：定义统一 `SandboxCreateSpecSchema`。
2. [x] 修改 `agent-sandbox-adaptor`：SealosDevbox adapter 支持 `env/upstreamID/kubeAccess/pauseAt/archiveAfterPauseTime/labels/image`。
3. [x] 修改 `agent-sandbox-adaptor`：把 `getEndpoint(service)` 提升为统一接口。
4. [x] 修改 `agent-sandbox-adaptor`：增加 `getProxyTarget(service)`。
5. [x] 修改 `agent-sandbox-adaptor`：OpenSandbox adapter 内收 direct endpoint 解析逻辑。
6. [x] 修改 `agent-sandbox-adaptor`：SealosDevbox adapter 从 `gateway.url` 推导 httpgate domain，实现 `getEndpoint('code-server')` 和 `getProxyTarget('code-server')`。
7. [x] 修改 FastGPT：新增 Sealos runtime 配置，避免复用 OpenSandbox image env。
8. [x] 修改 FastGPT：Sealos provider 不再拒绝所有 create spec，而是只传支持字段。
9. [x] 修改 FastGPT：新增 provider-aware proxy target internal API。
10. [x] 修改 `sandbox-proxy`：支持 provider-aware `origin/basePath`，复用 code-server session 逻辑。
11. [x] 修改 `SandboxIframe.tsx`：固定访问 `/__fastgpt_proxy/code-server/`，不感知 provider endpoint/path。
12. [ ] 增加集成测试：创建 Devbox、exec、upload/download、访问 `code-server:1318`、验证 HTTP/WS。
