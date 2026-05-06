# projects/volume-manager 潜在 Bug 分析

## 范围

分析范围包括 `projects/volume-manager` 的 Hono 路由、鉴权、sessionId 校验、Docker Volume/Kubernetes PVC 驱动、命名规则和幂等语义。

## Findings

### 中：非法 sessionId 在驱动层抛错，接口返回 500 而不是 400

- 位置：
  - `projects/volume-manager/src/routes/volumes.ts:6`
  - `projects/volume-manager/src/utils/naming.ts:4`

#### 问题

路由 schema 只校验 `sessionId` 是 string：

```ts
const ensureBodySchema = z.object({
  sessionId: z.string()
});
```

真正的格式校验在 `toVolumeName()` 中抛错。非法输入会落到框架默认错误处理，表现为 500，而不是稳定的 400。

#### 触发场景

带合法 token 请求：

```http
POST /v1/volumes/ensure
{"sessionId":"abc_123"}
```

或 `DELETE /v1/volumes/abc_123`。

#### 影响

客户端难以区分参数错误和服务异常，监控也会把用户输入错误误报为服务故障。

#### 建议修复

- 暴露并复用 sessionId 正则，在路由 zod schema 中校验。
- 捕获业务校验错误并返回 400。
- 为 ensure/delete 的非法 sessionId 增加测试。

### 中：K8s ensure 先 GET 后 POST，并发创建同一 PVC 时可能返回 409

- 位置：`projects/volume-manager/src/drivers/K8sVolumeDriver.ts:66`

#### 问题

K8s 驱动 `ensure()` 先 GET PVC，不存在再 POST 创建。两个相同 `sessionId` 并发请求时，都可能先看到 404；其中一个 POST 成功，另一个收到 409 AlreadyExists 后抛错。

#### 触发场景

对同一个不存在的 sessionId 并发发送两个 `POST /v1/volumes/ensure`。

#### 影响

破坏 ensure 的幂等语义，上层可能看到随机 500，导致沙箱创建失败或重试风暴。

#### 建议修复

- POST 遇到 409 时视为已存在，返回 `{ created: false }`。
- 或 409 后重新 GET PVC 并返回现有 claim。
- 增加并发 ensure 测试。

### 中：最终 PVC 名和 label value 未按 Kubernetes 限制校验

- 位置：
  - `projects/volume-manager/src/utils/naming.ts:1`
  - `projects/volume-manager/src/drivers/K8sVolumeDriver.ts:23`

#### 问题

`toVolumeName` 只限制 `sessionId`，未限制最终 `${prefix}-${sessionId}` 的长度和 prefix 格式。K8s `metadata.name` 需要满足 DNS label 规则和长度限制。另外 `sessionId` 被直接写入 label：

```ts
labels: { 'fastgpt/session-id': sessionId }
```

K8s label value 也有长度和字符约束。

#### 触发场景

传入 253 字符合法 sessionId，默认 prefix 下 `toVolumeName()` 通过，但 K8s 创建 PVC 会返回 422。

#### 影响

入口校验通过但后端创建失败，错误延迟到 K8s API 层；长 sessionId 还会导致 label 不合法。

#### 建议修复

- 校验最终 PVC name，而不是只校验 sessionId。
- prefix 也应纳入 zod/env 校验。
- 长 sessionId 放 annotation，label 使用 hash 或截断后的安全值。

### 中：K8s 部署模板端口与服务实际默认端口不一致，readiness 和 Service 会打到错误端口

- 位置：
  - `deploy/k8s/volume-manager.yaml:71`
  - `deploy/k8s/volume-manager.yaml:89`
  - `deploy/k8s/volume-manager.yaml:109`
  - `projects/volume-manager/src/env.ts:4`
  - `projects/volume-manager/src/index.ts:30`
  - `projects/volume-manager/README.md:66`
  - `projects/volume-manager/Dockerfile:13`

#### 问题

K8s 模板把 containerPort、readinessProbe 和 Service targetPort 都配置为 `3001`。但 volume-manager 代码读取的是 `PORT`，默认值为 `3000`；Dockerfile 也 `EXPOSE 3000`。模板没有设置 `PORT=3001`，README 又写的是 `VM_PORT`，但代码并不读取这个变量。

#### 触发场景

直接应用 `deploy/k8s/volume-manager.yaml` 部署 volume-manager。

#### 影响

Pod 内服务实际监听 3000，readinessProbe 和 Service 却访问 3001，导致 readiness 失败或服务不可达。

#### 建议修复

- 统一端口变量名和模板配置：要么 K8s 设置 `PORT: "3001"`，要么所有模板端口改为 3000。
- README 中 `VM_PORT` 改为真实生效的 `PORT`。
- 为 K8s manifest 增加基础配置校验或 smoke test。

### 中：health 固定返回 ok，无法发现 Docker/K8s driver 不可用

- 位置：
  - `projects/volume-manager/src/index.ts:9`
  - `projects/volume-manager/src/index.ts:15`

#### 问题

服务根据 `VM_RUNTIME` 创建 Docker 或 K8s driver，但 `/health` 固定返回：

```ts
app.get('/health', (c) => c.json({ status: 'ok' }));
```

它没有验证 Docker socket 是否可访问，也没有验证 Kubernetes API、ServiceAccount、RBAC、CA/token 是否可用。

#### 触发场景

Docker socket 未挂载或权限不足；K8s ServiceAccount/RBAC/CA/token 配置错误。

#### 影响

编排系统会认为实例健康并持续转发流量，实际 `ensure/remove` 首次调用才失败，FastGPT 侧可能持续把沙箱创建流量打到不可用的 volume-manager。

#### 建议修复

- 拆分 liveness 和 readiness。
- readiness 对当前 driver 做轻量探测，例如 Docker ping 或 K8s PVC list/get self namespace。
- 探测失败时返回 503，并输出明确错误原因。
