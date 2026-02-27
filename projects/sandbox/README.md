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

进程池 vs 旧版 spawn-per-request 对比（SANDBOX_POOL_SIZE=20）：

| 场景 | 旧版 QPS / P50 | 进程池 QPS / P50 | 提升 |
|------|----------------|------------------|------|
| JS 简单函数 (c50) | 22 / 1,938ms | 1,414 / 7ms | **64x** |
| JS IO 500ms (c50) | 22 / 2,107ms | 38 / 1,005ms | 1.7x |
| JS 高 CPU (c10) | 9 / 1,079ms | 12 / 796ms | 1.3x |
| JS 高内存 (c10) | — | 13 / 787ms | — |
| Python 简单函数 (c50) | 14.7 / 2,897ms | 4,247 / 4ms | **289x** |
| Python IO 500ms (c50) | 14.2 / 3,066ms | 38 / 1,003ms | 2.7x |
| Python 高 CPU (c10) | 3.1 / 2,845ms | 4 / 2,191ms | 1.3x |
| Python 高内存 (c10) | — | 11 / 893ms | — |

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
  "variables": { "a": 1, "b": 2 }
}
```

### `POST /sandbox/python`

执行 Python 代码。

```json
{
  "code": "def main(variables):\n    return {'result': variables['a'] + variables['b']}",
  "variables": { "a": 1, "b": 2 }
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

### 进程池

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `SANDBOX_POOL_SIZE` | 每种语言的 worker 进程数 | `20` |

### 资源限制

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `SANDBOX_MAX_TIMEOUT` | 超时上限（ms），请求不可超过此值 | `60000` |
| `SANDBOX_MAX_MEMORY_MB` | 内存上限（MB） | `256` |

### 网络请求限制

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `SANDBOX_REQUEST_MAX_COUNT` | 单次执行最大 HTTP 请求数 | `30` |
| `SANDBOX_REQUEST_TIMEOUT` | 单次 HTTP 请求超时（ms） | `60000` |
| `SANDBOX_REQUEST_MAX_RESPONSE_MB` | 最大响应体大小（MB） | `10` |
| `SANDBOX_REQUEST_MAX_BODY_MB` | 最大请求体大小（MB） | `5` |

## 项目结构

```
src/
├── index.ts                   # 入口：Hono 服务 + 进程池初始化
├── env.ts                     # 环境变量校验（zod）
├── config.ts                  # 配置导出
├── types.ts                   # 类型定义
├── pool/
│   ├── process-pool.ts        # JS 进程池管理
│   ├── python-process-pool.ts # Python 进程池管理
│   ├── worker.ts              # JS worker（长驻进程，含安全 shim）
│   └── worker.py              # Python worker（长驻进程，含安全沙箱）
└── utils/
    └── semaphore.ts           # 信号量（通用并发控制）

test/
├── unit/                      # 单元测试（进程池、信号量）
├── integration/               # 集成测试（API 路由）
├── boundary/                  # 边界测试（超时、内存限制）
├── security/                  # 安全测试（沙箱逃逸防护）
├── compat/                    # 兼容性测试（旧版代码格式）
├── examples/                  # 示例测试（常用包）
└── benchmark/                 # 压测脚本
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

2. **加入白名单**（环境变量 `SANDBOX_JS_ALLOWED_MODULES`）：

在逗号分隔列表中添加包名：

```bash
SANDBOX_JS_ALLOWED_MODULES=lodash,dayjs,moment,uuid,crypto-js,qs,url,querystring,your-new-package
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

2. **加入白名单**（环境变量 `SANDBOX_PYTHON_ALLOWED_MODULES`）：

在逗号分隔列表中添加包名。如果新包依赖了黑名单中的模块（如 `os`），标准库路径的间接导入会自动放行，无需额外配置。

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

### Python

- `__import__` 黑名单拦截：用户代码无法 import 危险模块（`os`、`sys`、`subprocess` 等）
- `exec()`/`eval()` 内的 import 同样被拦截（基于调用栈帧检测）
- `builtins.__import__` 通过代理对象保护，用户无法覆盖
- `signal.SIGALRM` 超时保护

### 网络

- 所有网络请求通过 `httpRequest()` 收口
- 内网 IP 黑名单：`10.0.0.0/8`、`172.16.0.0/12`、`192.168.0.0/16`、`127.0.0.0/8`、`169.254.0.0/16`
- 仅允许 `http:` / `https:` 协议
- 单次执行请求数、响应体大小、超时均有限制

## 内置函数

### JS（全局可用）

| 函数 | 说明 |
|------|------|
| `SystemHelper.httpRequest(url, opts?)` | HTTP 请求（opts: `{method, headers, body, timeout}`） |
| `SystemHelper.countToken(text)` | 估算 token 数（`≈ len/4`） |
| `SystemHelper.strToBase64(text, prefix?)` | 字符串转 Base64 |
| `SystemHelper.createHmac(algorithm, secret)` | HMAC 签名，返回 `{timestamp, sign}` |
| `SystemHelper.delay(ms)` | 延迟（最大 10s） |
| `countToken(text)` | 同 `SystemHelper.countToken` |
| `strToBase64(text, prefix?)` | 同 `SystemHelper.strToBase64` |
| `createHmac(algorithm, secret)` | 同 `SystemHelper.createHmac` |
| `delay(ms)` | 同 `SystemHelper.delay` |
| `httpRequest(url, opts?)` | 同 `SystemHelper.httpRequest` |

### Python（全局可用）

| 函数 | 说明 |
|------|------|
| `system_helper.http_request(url, method, headers, body, timeout)` | HTTP 请求 |
| `system_helper.count_token(text)` | 估算 token 数（`≈ len/4`） |
| `system_helper.str_to_base64(text, prefix?)` | 字符串转 Base64 |
| `system_helper.create_hmac(algorithm, secret)` | HMAC 签名，返回 `{timestamp, sign}` |
| `system_helper.delay(ms)` | 延迟（最大 10s） |
| `count_token(text)` | 同 `system_helper.count_token` |
| `str_to_base64(text, prefix?)` | 同 `system_helper.str_to_base64` |
| `create_hmac(algorithm, secret)` | 同 `system_helper.create_hmac` |
| `delay(ms)` | 同 `system_helper.delay` |
| `http_request(...)` | 同 `system_helper.http_request` |

## 测试

```bash
# 全部测试（332 cases）
bun run test

# 单个文件
bunx vitest run test/security/security.test.ts

# 带详细输出
bunx vitest run --reporter=verbose

# 压测（需先启动服务）
bash test/benchmark/bench-sandbox.sh
bash test/benchmark/bench-sandbox-python.sh
```

测试配置：串行执行（`fileParallelism: false`），池大小 1（避免资源竞争）。

测试覆盖维度：

| 分类 | 文件数 | 用例数 | 说明 |
|------|--------|--------|------|
| 单元测试 | 4 | 43 | 进程池生命周期/恢复/健康检查、Semaphore 并发控制 |
| 集成测试 | 2 | 53 | HTTP API 路由、JS/Python 功能验证 |
| 安全测试 | 1 | 102 | 模块拦截、逃逸攻击、SSRF 防护、注入攻击 |
| 边界测试 | 1 | 58 | 空输入、超时、大数据、类型边界 |
| 兼容性测试 | 2 | 39 | 旧版 JS/Python 代码格式兼容 |
| 示例测试 | 1 | 31 | 常用场景和第三方包 |

详细测试报告见 [`test/README.md`](test/README.md)。
