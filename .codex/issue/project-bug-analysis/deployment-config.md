# 部署配置潜在 Bug 分析

## 范围

分析范围包括 `deploy/templates`、`deploy/docker`、`deploy/helm` 以及 `document/public/deploy` 中复制给用户使用的 Docker Compose 和 Helm 部署模板。重点关注默认密钥、服务暴露、沙箱控制面、对象存储和 SSRF 相关安全默认值。

## Findings

### 严重：Helm Secret 模板内置生产可用弱密钥和默认 root 密码

- 位置：`deploy/helm/fastgpt/templates/secret-env.yaml:3`

#### 问题

FastGPT Helm chart 的 Secret 模板直接写入固定值：

- `DEFAULT_ROOT_PSW: "1234"`
- `CHAT_API_KEY: "sk-xxxx"`
- `TOKEN_KEY: "any"`
- `ROOT_KEY: "root_key"`
- `FILE_TOKEN_KEY: "filetoken"`
- `AES256_SECRET_KEY: "fastgptsecret"`

这些值会随默认 `helm install` 渲染成可用 Secret。

#### 触发场景

用户直接执行默认 Helm 安装，未覆盖这些字段。部署后 root 密码、root key、JWT/文件 token/加密 key 都是公开模板里的固定值。

#### 影响

默认安装实例可能被默认 root 密码登录；token 签名和加密密钥固定会放大伪造 token、读取文件或跨实例攻击风险。

#### 建议修复

- 将这些字段改为 `values.yaml` 必填项或 `existingSecret`。
- 使用 Helm `required` 阻止默认弱密钥部署。
- 文档要求首次部署前生成至少 32 字节随机密钥，并禁止 `1234/root_key/fastgptsecret` 这类占位值。

### 高：Helm 内置 MongoDB/PostgreSQL 默认密码固定

- 位置：
  - `deploy/helm/fastgpt/values.yaml:119`
  - `deploy/helm/fastgpt/values.yaml:134`

#### 问题

Helm values 中内置数据库默认凭证：

- MongoDB root 密码：`123456`
- PostgreSQL `postgres` 密码：`postgres`

#### 触发场景

用户默认安装 chart，且启用内置 MongoDB/PostgreSQL。

#### 影响

集群内任意可访问数据库 Service 的 Pod 都可尝试默认凭证连接数据库。一旦命名空间或网络策略不严，数据库可被横向访问。

#### 建议修复

- 数据库密码改为必填或引用外部 Secret。
- 默认 values 中不提供可用密码。
- 安装文档和 chart NOTES 提示用户生成随机密码。

### 严重：生产 docker-compose 模板硬编码多组系统密钥和服务 token

- 位置：
  - `deploy/templates/docker-compose.prod.yml:7`
  - `deploy/templates/docker-compose.prod.yml:9`
  - `deploy/templates/docker-compose.prod.yml:11`
  - `deploy/templates/docker-compose.prod.yml:13`
  - `deploy/templates/docker-compose.prod.yml:15`
  - `deploy/templates/docker-compose.prod.yml:17`
  - `deploy/templates/docker-compose.prod.yml:166`
  - `deploy/templates/docker-compose.prod.yml:173`
  - `deploy/templates/docker-compose.prod.yml:175`
  - `deploy/templates/docker-compose.prod.yml:177`

#### 问题

生产 compose 模板内置：

- root 默认密码：`1234`
- 系统最高密钥：`fastgpt-xxx`
- plugin token：`token`
- code sandbox token：`codesandbox`
- volume-manager token：`vmtoken`
- aiproxy token：`token`
- `TOKEN_KEY: fastgpt`
- `FILE_TOKEN_KEY: filetokenkey`
- `AES256_SECRET_KEY: fastgptsecret`

模板注释只建议修改账密，但不会阻止用户直接启动。

#### 触发场景

用户按模板生成并启动生产 compose，未逐项修改默认密钥。

#### 影响

默认 root 密码可登录管理后台；内部服务 token 可从公开模板直接获知；JWT、文件 token 和加密 key 固定会放大跨实例伪造和泄露风险。

#### 建议修复

- 安装脚本生成强随机值并写入 `.env`。
- compose 使用 `${VAR:?must set}`，不提供可用默认值。
- 应用启动时检测已知弱默认值并拒绝启动。

### 严重：MinIO 默认暴露到宿主机且使用 minioadmin/minioadmin

- 位置：
  - `deploy/templates/docker-compose.prod.yml:117`
  - `deploy/templates/docker-compose.prod.yml:123`
  - `deploy/docker/global/docker-compose.pg.yml:147`
  - `deploy/docker/global/docker-compose.pg.yml:153`

#### 问题

生产模板和多份 docker compose 示例把 MinIO API/Console 映射到宿主机 `9000:9000`、`9001:9001`，同时使用默认凭证 `minioadmin/minioadmin`。`document/public/deploy/docker/*` 中也复制了同类配置。

#### 触发场景

默认 compose 启动后，访问 `http://<host>:9001`，使用默认凭证即可登录对象存储控制台。

#### 影响

攻击者可读取或修改 FastGPT 私有/公开文件桶内容，影响知识库文件、聊天文件、头像和临时文件。

#### 建议修复

- 默认不将 MinIO API/Console 暴露到宿主机，只保留容器网络访问。
- 如需外部访问，要求强密码、TLS、反向代理鉴权和来源限制。
- 启动前检测默认 `minioadmin/minioadmin` 并拒绝生产启动。

### 高：OpenSandbox Helm 默认 apiKey 为空，控制面可无认证访问

- 位置：
  - `deploy/helm/opensandbox/values.yaml:176`
  - `deploy/helm/opensandbox/templates/server-configmap.yaml:19`

#### 问题

OpenSandbox Server 默认：

```yaml
apiKey: ""
```

模板只有在 apiKey 非空时才写入认证配置。该服务是沙箱控制面，负责创建和管理 workload。

#### 触发场景

默认 Helm 安装后，集群内可达 `opensandbox-server` 的客户端无需 API key 即可调用控制面。如果用户打开 Ingress、NodePort 或 LoadBalancer，风险扩大到集群外。

#### 影响

未授权客户端可创建或管理沙箱 workload，造成资源滥用、横向探测或容器逃逸风险放大。

#### 建议修复

- `apiKey` 为空时 Helm 渲染失败。
- Ingress/NodePort/LoadBalancer 开启时强制 TLS、鉴权和网络来源限制。
- FastGPT 侧也应拒绝配置空 `AGENT_SANDBOX_OPENSANDBOX_API_KEY` 的生产启动。

### 高：dev compose 暴露 OpenSandbox 控制面并直挂 Docker socket

- 位置：
  - `deploy/templates/docker-compose.dev.yml:264`
  - `deploy/templates/docker-compose.dev.yml:270`
  - `deploy/templates/docker-compose.dev.yml:387`

#### 问题

dev compose 将 OpenSandbox 控制面映射为 `8090:8090`，并挂载 `/var/run/docker.sock`，配置中未设置 API key。这等价于把“创建沙箱容器”的 Docker 控制入口暴露到宿主机监听地址。

#### 触发场景

开发者在本机或内网机器启动 dev compose 后，同网段可访问端口的位置请求 OpenSandbox 控制 API。

#### 影响

未授权请求可能触发沙箱容器创建、管理或资源消耗。由于直挂 Docker socket，控制面漏洞的影响会直接扩大到宿主机 Docker 权限。

#### 建议修复

- dev 环境也绑定 `127.0.0.1:8090:8090`，或默认不映射端口。
- OpenSandbox 必须配置 API key。
- Docker socket 尽量通过受限代理暴露，而不是直接挂载。

### 高：部署模板默认关闭完整内网 IP 检查

- 位置：
  - `deploy/templates/docker-compose.prod.yml:221`
  - `deploy/templates/docker-compose.prod.yml:260`
  - `deploy/docker/global/docker-compose.pg.yml:251`
  - `deploy/docker/global/docker-compose.pg.yml:290`

#### 问题

FastGPT 主服务和 code-sandbox 在生产模板中都默认：

```yaml
CHECK_INTERNAL_IP: false
```

代码侧确认该开关为 false 时会放行普通私网段，仅 metadata/localhost 等特殊地址被单独拦截。

#### 触发场景

默认 compose 中，用户通过工作流 HTTP Tool、代码沙盒网络请求或可配置出站请求访问 `10.x`、`172.16.x`、`192.168.x` 内网服务。

#### 影响

默认部署可被用作内网探测或访问内部服务的跳板，和 SSRF 重定向绕过问题叠加后风险更高。

#### 建议修复

- 生产模板默认设为 `true`。
- 提供显式 allowlist 机制替代全局关闭。
- 文档中把关闭该项标为高风险兼容选项。

### 中：dev compose MCP Server 默认指向不存在的 fastgpt 服务且端口对外暴露

- 位置：
  - `deploy/templates/docker-compose.dev.yml:224`
  - `deploy/templates/docker-compose.dev.yml:230`

#### 问题

dev compose 注释说明不包含 FastGPT 本体，但 MCP Server 配置为：

```yaml
FASTGPT_ENDPOINT: http://fastgpt:3000
```

同一文件中没有名为 `fastgpt` 的服务。MCP 端口又映射为 `3003:3000`。

#### 触发场景

只启动 dev compose 后访问 MCP SSE，MCP Server 对外可连，但内部请求会解析到不存在的 `fastgpt` 主机。

#### 影响

默认开发环境暴露一个不可用的 MCP 入口，造成调试误导、噪声错误，也可能被局域网访问并消耗连接资源。

#### 建议修复

- dev 模板改为 `http://host.docker.internal:3000`，或补齐 `fastgpt` 服务。
- MCP 端口默认绑定到 `127.0.0.1`。
- MCP Server 启动时校验 `FASTGPT_ENDPOINT` 可用性。

### 高：文件下载/上传 JWT 密钥默认值弱且运行时只要求 6 位

- 位置：
  - `packages/service/env.ts:20`
  - `packages/service/common/s3/security/token.ts:76`
  - `packages/service/common/s3/security/token.ts:82`
  - `deploy/templates/docker-compose.prod.yml:173`
  - `deploy/templates/docker-compose.prod.yml:175`
  - `deploy/templates/docker-compose.prod.yml:177`
  - `deploy/helm/fastgpt/templates/secret-env.yaml:7`
  - `deploy/helm/fastgpt/templates/secret-env.yaml:9`
  - `deploy/helm/fastgpt/templates/secret-env.yaml:10`

#### 问题

文件上传/下载 token 使用 `FILE_TOKEN_KEY` 签名和验签：

```ts
jwt.sign(payload, getTokenSecret(), ...)
jwt.verify(token, getTokenSecret(), ...)
```

但运行时 env schema 只要求 `FILE_TOKEN_KEY`、`AES256_SECRET_KEY` 至少 6 个字符。部署模板又提供固定弱值：

- `TOKEN_KEY: fastgpt`
- `FILE_TOKEN_KEY: filetokenkey` / `filetoken`
- `AES256_SECRET_KEY: fastgptsecret`

这些值会影响文件预览、私有 S3 代理下载、上传 token 和部分旧文件读取链路。

#### 触发场景

用户使用默认 compose/Helm 部署，或自行配置了短密钥但通过了启动校验。

#### 影响

文件 JWT 的伪造成本显著降低。一旦攻击者知道或猜到对象 key，可尝试伪造私有文件下载/上传 token；固定默认值还会造成不同默认部署实例之间密钥复用。

#### 建议修复

- 启动时要求 `FILE_TOKEN_KEY`、`TOKEN_KEY`、`AES256_SECRET_KEY` 至少 32 字节随机值。
- 对已知默认值如 `fastgpt/filetokenkey/filetoken/fastgptsecret/any` 直接拒绝启动。
- 部署模板改为 `${FILE_TOKEN_KEY:?must set}` 或 Helm `required`，不渲染可用默认密钥。
- 文档提供 `openssl rand -base64 32` 之类的生成方式。

### 中：生产 compose 模板注释中的 MCP Server 端口与实际映射不一致

- 位置：
  - `deploy/templates/docker-compose.prod.yml:3`
  - `deploy/templates/docker-compose.prod.yml:291`

#### 问题

生产 compose 模板顶部注释写的是：

```yaml
# - FastGPT-mcp-server 端口映射 3005:3000
```

但实际服务端口映射是：

```yaml
ports:
  - 3003:3000
```

该模板还会复制到文档侧部署目录，容易让文档和实际配置一起出现偏差。

#### 触发场景

用户按生产 compose 模板顶部注释访问 MCP Server，或在防火墙/反向代理中放行 3005。

#### 影响

按注释访问 3005 会失败，调试方向被误导；生产环境也可能错误开放未使用端口，而真正的 3003 没有按预期纳入管控。

#### 建议修复

- 统一注释和实际端口，明确 MCP Server 使用 3003 还是 3005。
- 如果文档生成会复制模板，确保源模板修正后同步产物。
- 在部署文档中说明 MCP Server 是否应公网暴露，以及推荐绑定地址。
