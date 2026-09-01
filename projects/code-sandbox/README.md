# FastGPT Code Sandbox

基于 Node + Hono 的代码执行沙盒，支持 JS 和 Python。两种语言都采用 one-shot 预热进程池，Linux/Docker 环境固定启用 chroot、seccomp、setuid/setgid 隔离。

## 架构

```
HTTP Request → Hono Server
                  ├─ JS One-shot Warm Pool → clean node worker.js → one task → exit
                  └─ Python One-shot Warm Pool → clean python3 bootstrap → one task → exit
```

- **JS 进程池**：启动时预热 N 个干净 Node 子进程（默认 20）；每个进程只执行一个用户任务，随后销毁并异步补池
- **JS 执行**：Node 子进程 + native seccomp/chroot/独立 UID + 安全 shim（冻结 Function 构造器、危险全局对象遮蔽、require 白名单）
- **Python 执行**：预热 `SANDBOX_POOL_SIZE` 个干净 python3 进程，进程进入 native seccomp/chroot/降权后等待一条任务；执行用户代码后立即销毁并异步补充新的干净进程
- **网络请求**：沙箱子进程不允许网络 syscall；统一通过父进程代理的 `SystemHelper.httpRequest()` / `system_helper.http_request()` 收口，内置 SSRF 防护
- **并发控制**：JS 请求超过池大小时自动排队；Python 同时运行的独立子进程数复用 `SANDBOX_POOL_SIZE`

## 性能

JS 和 Python 的空闲进程都只在执行用户代码前复用，执行后立即销毁。预热能隐藏大部分启动延迟，但 one-shot 的吞吐必然低于跨任务复用进程；容量规划应以 `test/benchmark` 在目标架构上的实测为准，不能沿用旧长驻 JS worker 的基准数据。

资源占用由 `SANDBOX_POOL_SIZE`、两种语言的预热空闲进程、运行时包加载情况和 `SANDBOX_MAX_MEMORY_MB` 共同决定。

## 快速开始

```bash
# 安装依赖（在 monorepo 根目录执行）
pnpm install

# 开发运行（带 watch）
cd projects/code-sandbox && pnpm dev

# 运行测试
cd projects/code-sandbox && pnpm test

# 构建
cd projects/code-sandbox && pnpm build && pnpm start
```

macOS/Windows 的源码构建仅用于开发兼容，不具备 OS 级隔离。Linux 生产环境推荐使用下方 Docker 构建；若直接从源码构建，需安装 `libseccomp-dev`、C 编译器和 Go，并设置 `SANDBOX_BUILD_NATIVE_JS=true SANDBOX_BUILD_NATIVE_PYTHON=true`，否则服务会因缺少 native 隔离库而 fail-closed。

## Docker

```bash
# 构建
docker build -f projects/code-sandbox/Dockerfile -t fastgpt-code-sandbox .

# 运行
docker run -p 3000:3000 \
  -e SANDBOX_TOKEN=your-secret-token \
  -e SANDBOX_POOL_SIZE=5 \
  fastgpt-code-sandbox
```

生产环境使用只读根文件系统并清空默认 capabilities 时，需要显式保留沙箱初始化、降权和进程回收所需的最小集合：

```bash
docker run -p 3000:3000 \
  --read-only \
  --tmpfs /tmp/fastgpt-python-sandbox/tmp:rw,noexec,nosuid,nodev,size=512m,mode=0755 \
  --cap-drop ALL \
  --cap-add CHOWN \
  --cap-add DAC_OVERRIDE \
  --cap-add FOWNER \
  --cap-add KILL \
  --cap-add SETGID \
  --cap-add SETUID \
  --cap-add SYS_CHROOT \
  --security-opt no-new-privileges=true \
  -e SANDBOX_TOKEN=your-secret-token \
  -e SANDBOX_POOL_SIZE=20 \
  fastgpt-code-sandbox
```

不要把整个 `/tmp` 挂载为 tmpfs：这会遮住镜像中预制的 `/tmp/fastgpt-js-sandbox` 和 `/tmp/fastgpt-python-sandbox` chroot。只挂载上例中的 Python 任务临时目录；容量至少应覆盖 `SANDBOX_POOL_SIZE × SANDBOX_MAX_TMP_MB`，并为并发创建与清理预留余量。Docker 默认 capability 集合已经包含上述能力，因此未使用 `--cap-drop ALL` 时无需额外添加。

## API

### `POST /sandbox/js`

执行 JavaScript 代码。

```json
{
  "code": "async function main(variables) {\n  return { result: variables.a + variables.b }\n}",
  "variables": { "a": 1, "b": 2 },
  "queueId": "team-xxx"
}
```

`queueId` 可选；仅当配置 `SANDBOX_QUEUE_ID_CONCURRENCY` 时，同一 `queueId` 会按该并发数排队执行。

### `POST /sandbox/python`

执行 Python 代码。

```json
{
  "code": "def main(variables):\n    return {'result': variables['a'] + variables['b']}",
  "variables": { "a": 1, "b": 2 },
  "queueId": "team-xxx"
}
```

### `GET /health`

健康检查，返回 JS 进程池和 Python isolated runner 状态。

```json
{
  "status": "ok",
  "pools": {
    "js": {
      "total": 20,
      "idle": 18,
      "busy": 2,
      "warming": 0,
      "queued": 0,
      "poolSize": 20,
      "ready": true
    },
    "python": {
      "total": 20,
      "idle": 18,
      "busy": 2,
      "warming": 0,
      "queued": 0,
      "poolSize": 20,
      "ready": true
    }
  }
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

| 变量            | 说明                  | 默认值       |
| --------------- | --------------------- | ------------ |
| `SANDBOX_PORT`  | 服务端口              | `3000`       |
| `SANDBOX_TOKEN` | Bearer Token 认证密钥 | 空（不鉴权） |

### 并发控制

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `SANDBOX_POOL_SIZE` | JS worker 进程数；也是 Python 同时运行和空闲预热的进程数 | `5` |
| `SANDBOX_QUEUE_ID_CONCURRENCY` | 同一 `queueId` 同时可进入执行流程的请求数，空值表示不按 `queueId` 排队 | 空 |

### Python 隔离

Python 隔离不再提供运行时关闭开关。Linux 环境固定启用 native seccomp/chroot/降权，chroot 根目录固定为 `/tmp/fastgpt-python-sandbox`，用户代码进程固定降权到 `65537:65537`。Python 子进程不允许直接网络 syscall，外部请求必须通过父进程代理的 `http_request` 能力，并受请求次数、超时、请求体和响应体大小限制。

### JS 隔离

Linux 环境同样固定启用 native seccomp/chroot/降权，chroot 根目录为 `/tmp/fastgpt-js-sandbox`，JS 子进程使用独立的 `65538:65538`。每个预热进程最多执行一个用户任务，直接网络、创建进程和执行二进制的 syscall 均被拒绝。

### 资源限制

| 变量                      | 说明                                           | 默认值  |
| ------------------------- | ---------------------------------------------- | ------- |
| `SANDBOX_API_MAX_BODY_MB` | API JSON 请求体总大小上限（包含 variables）    | `8`     |
| `SANDBOX_MAX_TIMEOUT`     | 超时上限（ms），请求不可超过此值               | `60000` |
| `SANDBOX_MAX_MEMORY_MB`   | 内存上限（MB）                                 | `256`   |
| `SANDBOX_MAX_TMP_MB`      | Python 单任务临时目录写入上限（MB）            | `16`    |
| `SANDBOX_MAX_OUTPUT_MB`   | 单次执行输出 JSON 大小上限（包含返回值和日志） | `10`    |

### 网络请求限制

| 变量                              | 说明                                   | 默认值  |
| --------------------------------- | -------------------------------------- | ------- |
| `CHECK_INTERNAL_IP`               | 是否阻止访问内网、回环、链路本地等地址 | `true`  |
| `SANDBOX_REQUEST_MAX_COUNT`       | 单次执行最大 HTTP 请求数               | `30`    |
| `SANDBOX_REQUEST_TIMEOUT`         | 单次 HTTP 请求超时（ms）               | `60000` |
| `SANDBOX_REQUEST_MAX_RESPONSE_MB` | 最大响应体大小（MB）                   | `10`    |
| `SANDBOX_REQUEST_MAX_BODY_MB`     | 最大请求体大小（MB）                   | `5`     |

## 项目结构

```
src/
├── index.ts                   # 入口：Hono 服务 + 进程池初始化
├── env.ts                     # 环境变量加载与校验
├── types.ts                   # 类型定义
├── pool/
│   ├── base-process-pool.ts   # 通用预热进程池生命周期与父进程 HTTP RPC
│   ├── process-pool.ts        # JS one-shot 进程池配置
│   └── worker.ts              # JS one-shot 子进程入口（含安全 shim）
├── isolated/
│   ├── js-isolation-config.ts    # JS Linux native 隔离路径与身份配置
│   ├── python-isolated-runner.ts # Python 独立进程执行器
│   └── python-bootstrap.py       # Python 单次执行 bootstrap
└── utils/
    ├── sandbox-http.ts        # 父进程 HTTP 代理与 SSRF/资源限制
    └── semaphore.ts           # 信号量（通用并发控制）

native/
├── js-sandbox/                # JS N-API chroot/降权/seccomp 模块
└── python-sandbox/            # Python native chroot/降权/seccomp 模块

test/
├── unit/                      # 单元、安全与资源边界测试
├── integration/               # API 与真实 Docker 集成测试
├── compat/                    # 兼容性测试（旧版代码格式）
├── helpers/                   # 真实 runner/进程测试辅助代码
└── benchmark/                 # 压测脚本
```

## 添加 JS 包

沙盒内的 JS 代码通过 `require()` 加载包，但仅允许白名单内的包。

### 当前白名单

`lodash`、`dayjs`、`moment`、`uuid`、`crypto-js`、`qs`、`url`、`querystring`

### 添加新包步骤

1. **安装包**：

```bash
cd projects/code-sandbox
pnpm add <package-name>
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
- 不应放行 `child_process`、`worker_threads`、`cluster`；Linux native seccomp 也会从内核层拒绝创建进程或线程

## 添加 Python 包

### 当前预装包

`numpy`、`pandas`、`matplotlib`（通过 `requirements.txt` 安装）

### 添加新包步骤

1. **编辑 `requirements.txt`**：

```
numpy
pandas
your-new-package
```

2. **加入白名单**（环境变量 `SANDBOX_PYTHON_ALLOWED_MODULES`）：

在逗号分隔列表中添加包名。用户代码能否直接 import 某个模块完全由 `SANDBOX_PYTHON_ALLOWED_MODULES` 控制；第三方包和标准库内部依赖会按调用栈放行，避免误伤包自身初始化。

3. **重新构建 Docker 镜像**。

### 注意事项

- Python 的模块黑名单通过 `__import__` 拦截实现，只拦截用户代码的直接 import
- 标准库和第三方包的内部间接 import 不受影响
- 默认白名单不包含 `os`、`sys`、`subprocess`、`socket` 等高危模块；显式加入环境变量只会放开语言层 import，不会放开 native seccomp 已拒绝的进程、线程和网络 syscall
- Python 固定 one-shot：无论导入哪些模块，每个进程最多执行一个用户任务；Linux 下即使通过间接引用或 CPython C 扩展绕过 import/audit 限制，chroot、独立 UID/GID 与 default-deny seccomp 仍是最终进程边界

## 安全机制

### JS

- `require()` 白名单，非白名单模块直接拒绝
- 危险全局对象（`process`、`globalThis`、`global`、`Bun` 等）通过函数参数遮蔽，用户代码无法访问
- `Function` 构造器冻结，阻止 `constructor.constructor` 逃逸
- `process.env` 清理，仅保留必要变量
- `fetch`、`XMLHttpRequest`、`WebSocket` 禁用
- Linux 下固定 chroot 到只读 rootfs，降权到 JS 专用 UID/GID，并以 TSYNC seccomp 拒绝网络、进程和执行类 syscall
- 每个子进程只执行一个用户任务，任务完成后不返回 idle 池

### Python

- `__import__` 白名单控制：默认不允许用户代码 import `os`、`sys`、`subprocess` 等高危模块；显式加入 `SANDBOX_PYTHON_ALLOWED_MODULES` 后按配置放行
- `exec()`/`eval()` 内的 import 同样被拦截（基于调用栈帧检测）
- `builtins.__import__` 通过代理对象保护，用户无法覆盖
- `signal.SIGALRM` 超时保护
- Linux 下固定 chroot、降权到 Python 专用 UID/GID，并以 native default-deny seccomp 拒绝网络、进程、线程和执行类 syscall
- 每个 Python 子进程也只执行一个用户任务；语言层限制被绕过时，不会继承父服务的文件系统视图和系统调用能力

### 网络

- 所有网络请求通过 `httpRequest()` 收口
- 内网 IP 黑名单：`10.0.0.0/8`、`172.16.0.0/12`、`192.168.0.0/16`、`127.0.0.0/8`、`169.254.0.0/16`
- 仅允许 `http:` / `https:` 协议
- 单次执行请求数、响应体大小、超时均有限制

## 内置函数

### JS（全局可用）

| 函数                                   | 说明                                                  |
| -------------------------------------- | ----------------------------------------------------- |
| `SystemHelper.httpRequest(url, opts?)` | HTTP 请求（opts: `{method, headers, body, timeout}`） |

### Python（全局可用）

| 函数                                   | 说明                                                  |
| -------------------------------------- | ----------------------------------------------------- |
| `SystemHelper.httpRequest(url, opts?)` | HTTP 请求（opts: `{method, headers, body, timeout}`） |

## 测试

```bash
# 全部测试
pnpm test

# 单个文件
pnpm exec vitest run test/unit/security.test.ts

# 带详细输出
pnpm exec vitest run --reporter=verbose

# 压测（需先启动服务）
bash test/benchmark/bench-sandbox.sh
bash test/benchmark/bench-sandbox-python.sh
```

Vitest 测试文件串行执行，避免不同 suite 的真实 JS/Python 进程池、原生包冷启动和资源限制用例互相争抢；单个 suite 内仍会覆盖并发与排队行为。Linux native 用例需要 root 与已编译的隔离库，Docker 集成用例需要设置 `CODE_SANDBOX_URL` 指向真实运行中的镜像，条件不满足时会显式跳过。

测试覆盖进程池生命周期与恢复、API、JS/Python 兼容性、资源边界、模块拦截、
沙箱逃逸、SSRF，以及 Linux 容器中的真实 UID/chroot/seccomp 隔离。用例数量以
当前测试运行结果为准，避免文档中的固定计数随新增回归测试失真。
