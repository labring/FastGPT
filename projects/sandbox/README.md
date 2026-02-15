# FastGPT Code Sandbox

基于 Bun + Hono 的代码执行沙盒，支持 JS 和 Python，统一使用子进程模型执行用户代码。

## 架构

```
HTTP Request → Hono Server → Runner (JS/Python) → Subprocess → Result
                                ↓
                          Process Pool (可选预热)
```

- **JS 执行**：Bun 子进程 + 安全 shim（禁用 Bun API、冻结 Function 构造器、require 白名单）
- **Python 执行**：python3 子进程 + `__import__` 拦截 + resource 资源限制
- **网络请求**：统一通过 `SystemHelper.httpRequest()` / `system_helper.http_request()` 收口，内置 SSRF 防护

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
    "memoryMB": 64,
    "diskMB": 10
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
    "memoryMB": 64,
    "diskMB": 10
  }
}
```

### `GET /health`

健康检查。

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

### 进程池

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `SANDBOX_JS_POOL_SIZE` | JS 进程池大小（0 = 不预热） | `0` |
| `SANDBOX_PYTHON_POOL_SIZE` | Python 进程池大小（0 = 不预热） | `0` |
| `SANDBOX_POOL_MAX_IDLE_MS` | 空闲进程最大存活时间（ms） | `300000` |
| `SANDBOX_POOL_RECYCLE` | 单个进程最大复用次数 | `50` |

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

2. **检查模块黑名单**（`src/runner/python-runner.ts`）：

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
# 全部测试
bun run test

# 单个文件
bunx vitest run test/security/escape-attacks.test.ts

# 集成测试（需要服务运行）
SANDBOX_URL=http://localhost:3000 SANDBOX_TOKEN=xxx bunx vitest run test/integration/
```
