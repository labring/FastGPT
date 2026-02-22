# FastGPT Code Sandbox

基于 Bun + Hono 的代码执行沙盒，支持 JS 和 Python。采用进程池架构，预热长驻 worker 进程，通过 stdin/stdout JSON 协议通信，消除每次请求的进程启动开销。

## 架构

```
HTTP Request → Hono Server → Process Pool → Worker (long-lived) → Result
                                ↓
                         ┌──────────────┐
                         │  JS Workers   │  bun run worker.ts (×N)
                         │  Py Workers   │  python3 worker.py (×N)
                         └──────────────┘
                         stdin: JSON task → stdout: JSON result
```

- **进程池**：启动时预热 N 个 worker 进程（默认 20），请求到达时直接分配空闲 worker，执行完归还池中
- **JS 执行**：Bun worker 进程 + 安全 shim（禁用 Bun API、冻结 Function 构造器、require 白名单）
- **Python 执行**：python3 worker 进程 + `__import__` 拦截 + resource 资源限制
- **网络请求**：统一通过 `SystemHelper.httpRequest()` / `system_helper.http_request()` 收口，内置 SSRF 防护
- **并发控制**：请求数超过池大小时自动排队，worker 崩溃自动重启补充

## 性能

进程池 vs 旧版 spawn-per-request 对比（SANDBOX_POOL_SIZE=20，50 并发）：

| 场景 | 旧版 QPS / 延迟 | 进程池 QPS / 延迟 | 提升 |
|------|-----------------|-------------------|------|
| JS 简单函数 | 22 / 1,938ms | 1,422 / 35ms | **65x** |
| JS IO 500ms | 22 / 2,107ms | 38 / 1,201ms | 1.7x |
| JS 高 CPU | 9 / 1,079ms | 12 / 804ms | 1.3x |
| Python 简单函数 | 14.7 / 2,897ms | 5,375 / 9ms | **366x** |
| Python IO 500ms | 14.2 / 3,066ms | 38 / 1,200ms | 2.7x |
| Python 高 CPU | 3.1 / 2,845ms | 4 / ~2,500ms | 1.2x |

资源占用（20+20 workers）：空闲 ~1.5GB RSS，压测峰值 ~2GB RSS。

## 快速开始

```bash
# 安装依赖
bun install

# 开发运行
bun run src/index.ts

# 运行测试
bun run test
```

## Docker

```bash
# 构建
docker build -f projects/sandbox/Dockerfile -t fastgpt-sandbox .

# 运行
docker run -p 3000:3000 \
  -e SANDBOX_TOKEN=your-secret-token \
  -e SANDBOX_POOL_SIZE=20 \
  fastgpt-sandbox
```

## API

### `POST /sandbox/js`

执行 JavaScript 代码。

```json
{
  "code": "async function main(variables) {\n  return { result: variables.a + variables.b }\n}",
  "variables": { "a": 1, "b": 2 },
  "limits": {
    "timeoutMs": 10000,
    "memoryMB": 64
  }
}
```

### `POST /sandbox/python`

执行 Python 代码。

```json
{
  "code": "def main(variables):\n    return {'result': variables['a'] + variables['b']}",
  "variables": { "a": 1, "b": 2 },
  "limits": {
    "timeoutMs": 10000,
    "memoryMB": 64
  }
}
```

### `GET /health`

健康检查，返回进程池状态。

```json
{
  "status": "ok",
  "version": "5.0.0",
  "jsPool": { "total": 20, "idle": 18, "busy": 2, "queued": 0 },
  "pythonPool": { "total": 20, "idle": 20, "busy": 0, "queued": 0 }
}
```

### 响应格式

成功：

```json
{
  "success": true,
  "data": {
    "codeReturn": { "result": 3 },
    "log": "console.log 输出内容"
  }
}
```

失败：

```json
{
  "success": false,
  "message": "错误信息"
}
```

## 环境变量

### 服务配置

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `SANDBOX_PORT` | 服务端口 | `3000` |
| `SANDBOX_TOKEN` | Bearer Token 认证密钥 | 空（不鉴权） |
| `LOG_LEVEL` | 日志级别 | `info` |

### 进程池

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `SANDBOX_POOL_SIZE` | 每种语言的 worker 进程数 | `20` |

### 资源限制

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `SANDBOX_TIMEOUT` | 默认执行超时（ms） | `10000` |
| `SANDBOX_MAX_TIMEOUT` | 超时上限（ms），请求不可超过此值 | `60000` |
| `SANDBOX_MEMORY_MB` | 默认内存限制（MB） | `64` |
| `SANDBOX_MAX_MEMORY_MB` | 内存上限（MB） | `256` |
| `SANDBOX_DISK_MB` | 默认磁盘限制（MB） | `10` |
| `SANDBOX_MAX_DISK_MB` | 磁盘上限（MB） | `100` |

### 网络请求限制

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `SANDBOX_MAX_REQUESTS` | 单次执行最大 HTTP 请求数 | `30` |
| `SANDBOX_REQUEST_TIMEOUT` | 单次 HTTP 请求超时（ms） | `10000` |
| `SANDBOX_MAX_RESPONSE_SIZE` | 最大响应体大小（bytes） | `2097152`（2MB） |

## 项目结构

```
src/
├── index.ts                  # 入口：Hono 服务 + 进程池初始化
├── env.ts                    # 环境变量校验（zod）
├── config.ts                 # 配置导出
├── types.ts                  # 类型定义
├── pool/
│   ├── process-pool.ts       # JS 进程池管理
│   ├── python-process-pool.ts # Python 进程池管理
│   ├── worker.ts             # JS worker（长驻进程）
│   └── worker.py             # Python worker（长驻进程）
├── runner/                   # 旧版 spawn-per-request 执行器（测试用）
│   ├── base.ts
│   ├── js-runner.ts
│   └── python-runner.ts
├── sandbox/
│   ├── js-template.ts        # JS 安全 shim 模板
│   ├── python-template.ts    # Python 安全 shim 模板
│   └── network-config.ts     # 网络安全配置（SSRF 防护）
└── utils/
    └── semaphore.ts          # 信号量（旧版并发控制）

test/
├── unit/                     # 单元测试
├── integration/              # 集成测试（API 路由）
├── boundary/                 # 边界测试（超时、内存限制）
├── security/                 # 安全测试（沙箱逃逸防护）
├── compat/                   # 兼容性测试（旧版代码格式）
├── examples/                 # 示例测试（常用包）
└── benchmark/                # 压测脚本
```

## 添加 JS 包

沙盒内的 JS 代码通过 `require()` 加载包，但仅允许白名单内的包。

### 当前白名单

`lodash`、`dayjs`、`moment`、`uuid`、`crypto-js`、`qs`、`url`、`querystring`

### 添加新包步骤

1. **安装包**：

```bash
cd projects/sandbox
bun add <package-name>
```

2. **加入 require 白名单**（`src/sandbox/js-template.ts`）：

找到 `ALLOWED_MODULES` 数组，添加包名：

```typescript
const ALLOWED_MODULES = [
  'lodash', 'dayjs', 'moment', 'uuid',
  'crypto-js', 'qs', 'url', 'querystring',
  'your-new-package'  // ← 添加这里
];
```

3. **重新构建 Docker 镜像**。

### 注意事项

- 只添加纯计算类的包，不要添加有网络/文件系统/子进程能力的包
- 包会被打入 Docker 镜像，注意体积
- 网络请求统一走 `SystemHelper.httpRequest()`，不要放行 `axios`、`node-fetch` 等网络库

## 添加 Python 包

### 当前预装包

`numpy`、`pandas`（通过 `requirements.txt` 安装）

### 添加新包步骤

1. **编辑 `requirements.txt`**：

```
numpy
pandas
your-new-package
```

2. **检查模块黑名单**（`src/sandbox/python-template.ts`）：

确保新包不在 `DANGEROUS_MODULES` 列表中。如果新包依赖了黑名单中的模块（如 `os`），标准库路径的间接导入会自动放行，无需额外配置。

3. **重新构建 Docker 镜像**。

### 注意事项

- Python 的模块黑名单通过 `__import__` 拦截实现，只拦截用户代码的直接 import
- 标准库和第三方包的内部间接 import 不受影响
- 危险模块（`os`、`sys`、`subprocess`、`socket` 等）始终被拦截

## 安全机制

### JS

- `require()` 白名单，非白名单模块直接拒绝
- `Bun.spawn`、`Bun.write`、`Bun.serve` 等 API 禁用
- `Function` 构造器冻结，阻止 `constructor.constructor` 逃逸
- `process.env` 清理，仅保留必要变量
- `fetch`、`XMLHttpRequest`、`WebSocket` 禁用
- 临时文件系统路径遍历防护 + 磁盘配额

### Python

- `__import__` 白名单拦截：用户代码无法 import 危险模块
- `exec()`/`eval()` 内的 import 同样被拦截（基于调用栈帧检测）
- `resource` 模块限制 CPU 时间、内存、文件大小
- 临时文件系统路径遍历防护 + 磁盘配额

### 网络

- 所有网络请求通过 `httpRequest()` 收口
- 内网 IP 黑名单：`10.0.0.0/8`、`172.16.0.0/12`、`192.168.0.0/16`、`127.0.0.0/8`、`169.254.0.0/16`
- 仅允许 `http:` / `https:` 协议
- 单次执行请求数、响应体大小、超时均有限制

## 内置函数

### JS（全局可用）

| 函数 | 说明 |
|------|------|
| `SystemHelper.httpRequest(url, method, headers, body, timeout)` | HTTP 请求 |
| `SystemHelper.fs.writeFile(path, content)` | 写临时文件 |
| `SystemHelper.fs.readFile(path)` | 读临时文件 |
| `SystemHelper.fs.mkdir(path)` | 创建目录 |
| `SystemHelper.fs.readdir(path)` | 列出目录 |
| `SystemHelper.fs.exists(path)` | 文件是否存在 |
| `countToken(text)` | 估算 token 数 |
| `strToBase64(text, prefix?)` | 字符串转 Base64 |
| `createHmac(algorithm, secret)` | HMAC 签名 |
| `delay(ms)` | 延迟（最大 10s） |
| `httpRequest(...)` | 同 `SystemHelper.httpRequest` |

### Python（全局可用）

| 函数 | 说明 |
|------|------|
| `system_helper.http_request(url, method, headers, body, timeout)` | HTTP 请求 |
| `system_helper.fs.write_file(path, content)` | 写临时文件 |
| `system_helper.fs.read_file(path)` | 读临时文件 |
| `system_helper.fs.mkdir(path)` | 创建目录 |
| `system_helper.fs.readdir(path)` | 列出目录 |
| `system_helper.fs.exists(path)` | 文件是否存在 |
| `count_token(text)` | 估算 token 数 |
| `str_to_base64(text, prefix?)` | 字符串转 Base64 |
| `create_hmac(algorithm, secret)` | HMAC 签名 |
| `delay(ms)` | 延迟（最大 10s） |
| `http_request(...)` | 同 `system_helper.http_request` |

## 测试

```bash
# 全部测试（354 cases）
bun run test

# 单个文件
bunx vitest run test/security/security.test.ts

# 压测（需先启动服务）
bash test/benchmark/bench-sandbox.sh
bash test/benchmark/bench-sandbox-python.sh
```
