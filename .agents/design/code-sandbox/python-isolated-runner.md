# Python Code Sandbox 隔离执行方案

## 背景

改造前，`projects/code-sandbox` 的 Python 执行路径使用长驻 `PythonProcessPool`
和 `worker.py`。同一个 Python 进程会多次执行用户代码，主要依赖
`__import__` 白名单、受限 `open`、AST 检查、替换 builtin 等进程内限制。

GHSA-5jmh-5f2m-89jg 证明该模型存在结构性缺陷：Python 反射链可以绕过
进程内 denylist，并最终获得容器内 OS 命令执行能力。继续补 AST 或字符串
拦截只能覆盖已知 payload，不能作为多租户安全边界。

当前方案已经落地为 Python isolated one-shot warm pool：

- 旧 `worker.py` 和 `PythonProcessPool` 已删除；
- `/sandbox/python` 统一使用 `PythonIsolatedRunner`；
- Python 进程最多执行一次用户代码，执行后销毁；
- Linux/Docker 环境固定启用 `chroot`、`no_new_privs`、`seccomp`、`setgid/setuid`；
- 网络请求统一走父进程 HTTP 代理，不允许 Python 子进程直接网络 syscall。

## 目标

- 保持 `/sandbox/python` API 兼容：成功返回 `{ success, data: { codeReturn, log } }`，失败返回 `{ success:false, message }`。
- 兼容历史 Python Code 写法：`main()`、`main(variables)`、`main(a,b)`、全局变量注入、`print` 收集、内置 helper。
- 多租户安全边界不依赖用户代码所在 Python 进程内的软限制。
- 保留已有安全能力：模块白名单、文件限制、SSRF 防护、请求次数/大小限制、超时、输出限制、RSS 监控。
- 降低冷启动延迟，但不复用执行过用户代码的 Python 解释器。

## 非目标

- 不移除 JS `ProcessPool`。
- 不提供 Python pool 回滚模式。
- 不把 AST 检查作为主要安全边界；它只作为纵深防御和兼容性辅助。
- 不声称完整容器逃逸防护；OS 级隔离只约束当前 Python 执行进程的 syscall、根目录和权限。

## 总体架构

```text
POST /sandbox/python
  -> queueIdLimiter.run(queueId, ...)
  -> PythonIsolatedRunner.execute({ code, variables })
  -> 获取干净的 one-shot 预热 Python 进程
     -> 无空闲进程时按需 spawn
  -> 预热进程已完成 chroot + no_new_privs + seccomp + setgid/setuid
  -> bootstrap 注入 helper、variables、受限 builtins
  -> exec 用户代码并调用 main
  -> stdout 输出 JSON line result/http_request
  -> 父进程解析结果、处理 HTTP 代理、监控超时/RSS/输出大小
  -> 该 Python 进程销毁，不归还池中
  -> 异步补充新的干净预热进程
```

`/sandbox/modules` 仍返回 `env.SANDBOX_PYTHON_ALLOWED_MODULES`，表示 Python
用户可直接 import 的白名单模块，不暴露底层 runner 类型。

## 核心模块

### `src/isolated/python-isolated-runner.ts`

`PythonIsolatedRunner` 负责父进程侧调度和资源控制：

- 维护 one-shot warm pool，默认预热 `SANDBOX_POOL_SIZE` 个空闲 Python 进程；
- 预热进程只执行 `init` 协议，不执行用户代码；
- `execute()` 优先使用空闲预热进程，没有空闲进程时按需创建；
- 每个 Python 进程最多接受一条用户任务，任务结束后销毁；
- 执行完成后异步补充新的干净预热进程；
- 使用 `Semaphore` 控制 Python 任务最大并发，复用 `SANDBOX_POOL_SIZE`；
- 监控超时、输出大小和进程树 RSS；
- 清理整个进程树，避免子进程残留；
- 处理 Python 发起的 `http_request` IPC，并由父进程统一执行网络请求。

### `src/isolated/python-bootstrap.py`

`python-bootstrap.py` 是 Python 子进程入口：

- 支持两种协议：
  - 兼容模式：直接读取一条 task JSON 并执行；
  - 预热模式：先读取 `type:"init"`，完成 native 隔离后输出 `type:"ready"`，再等待一条 task JSON；
- 初始化 Python helper：`SystemHelper`、`system_helper`、`http_request`、`count_token`、`str_to_base64`、`create_hmac`、`delay`；
- 注入 `variables` 和历史全局变量写法；
- 安装受限 builtins、import 白名单、受限 `open`、危险属性拦截、audit hook；
- 捕获 `print` 到内存 log，避免污染 stdout JSON line 协议；
- 执行 `main()` / `main(variables)` / `main(a,b)`；
- 通过 stdout 输出 `result` 或 `http_request` JSON line。

### `native/python-sandbox`

Go shared library `fastgpt_python_sandbox.so` 负责 Linux native 隔离：

- `chroot` 到固定 Python sandbox root；
- `chdir("/")`；
- `setgroups([])`；
- `setgid(65537)` / `setuid(65537)`；
- `PR_SET_NO_NEW_PRIVS`；
- 安装 seccomp filter；
- 危险 syscall 默认拒绝，`execve/execveat`、`ptrace`、`mount` 等不能落地。

## 配置

Python 隔离相关配置已经收敛为内部安全默认，不提供运行时环境变量关闭或改弱：

| 配置 | 当前值 | 说明 |
| --- | --- | --- |
| Python 最大并发 | `SANDBOX_POOL_SIZE` | 复用现有进程池大小配置 |
| 预热空闲进程数 | `SANDBOX_POOL_SIZE` | 与 Python 最大并发保持一致 |
| 直接网络 syscall | `false` | 统一走父进程 `http_request` 代理 |
| chroot 根目录 | `/tmp/fastgpt-python-sandbox` | Docker 构建阶段准备 |
| 用户代码 uid/gid | `65537:65537` | native 初始化后降权 |
| native seccomp/chroot/setuid | Linux 固定开启 | 缺少 native 库或 chroot root 时 fail-closed |

保留的 Python 业务配置：

| 变量 | 说明 |
| --- | --- |
| `SANDBOX_PYTHON_ALLOWED_MODULES` | 用户代码可直接 import 的 Python 模块白名单 |
| `SANDBOX_MAX_TIMEOUT` | 单次执行最大超时 |
| `SANDBOX_MAX_MEMORY_MB` | 子进程树 RSS 软限制 |
| `SANDBOX_MAX_OUTPUT_MB` | stdout/log 输出上限 |
| `SANDBOX_REQUEST_*` | 父进程 HTTP 代理的次数、超时、请求体和响应体限制 |

## 网络代理

Python 子进程不允许直接使用网络 syscall。用户代码如需请求外部网络，必须调用：

```python
http_request(url, method='GET', headers=None, body=None, timeout=None)
# 或
system_helper.http_request(...)
SystemHelper.httpRequest(...)
```

Python bootstrap 向父进程写出：

```json
{
  "type": "http_request",
  "id": "http-1",
  "payload": {
    "url": "https://example.com",
    "method": "GET",
    "headers": {},
    "body": null,
    "timeout": null
  }
}
```

父进程执行：

- URL 协议限制；
- SSRF / 内网地址检查；
- DNS pinning；
- 请求次数限制；
- 请求体大小限制；
- 响应体大小限制；
- 超时控制。

父进程再通过 stdin 返回：

```json
{
  "type": "http_response",
  "id": "http-1",
  "success": true,
  "payload": {}
}
```

每个 Python 进程只执行一次任务，因此请求次数计数天然按单次执行归零。

## 安全边界

### 语言层边界

语言层限制用于减少误用和拦截已知危险能力，但不是主安全边界：

- `__import__` 白名单；
- `open` 受限；
- `eval` / `exec` / `compile` / `globals` / `locals` / `vars` / `dir` 等禁用；
- `__class__`、`__base__`、`__subclasses__`、`__globals__` 等危险属性拦截；
- `object` builtin 替换；
- audit hook 拦截 `os.system`、`subprocess`、`socket`、`ctypes` 等事件；
- AST 检查作为纵深防御。

### OS 层边界

OS 层是多租户核心安全边界：

- 每个 Python 子进程最多执行一次用户代码；
- 执行用户代码前已经 chroot、降权、安装 seccomp；
- 执行完成后整个进程树销毁；
- 不复用执行过用户代码的解释器；
- seccomp 不允许命令执行和高危系统调用；
- chroot 只包含 Python 运行所需 stdlib、site-packages、动态库、证书、DNS 配置和 sandbox runtime 文件。

### 资源边界

- 父进程定时采样子进程树 RSS，超过 `SANDBOX_MAX_MEMORY_MB + RUNTIME_MEMORY_OVERHEAD_MB` 后杀进程树；
- 父进程控制总超时；
- stdout JSON line 和收集到的 log 受 `SANDBOX_MAX_OUTPUT_MB` 限制；
- 进程树清理由 `killProcessTree()` 处理，优先杀 descendant 和 process group。

## Docker 和构建

Docker 镜像使用 Debian bookworm/glibc。Alpine/musl 下 Go c-shared `.so`
存在兼容风险，不能作为当前 Python native isolation 运行基线。

构建流程：

- `SANDBOX_BUILD_NATIVE_PYTHON=true pnpm build` 构建 Go shared library；
- `build.sh` 复制 `python-bootstrap.py` 和 `fastgpt_python_sandbox.so` 到 `dist`；
- Docker runner 阶段安装 Python、numpy、pandas、matplotlib 和 native 依赖；
- Docker 构建阶段准备 `/tmp/fastgpt-python-sandbox` chroot root；
- code-sandbox 主进程保留 root，以便 Python 子进程在 native 初始化阶段执行 chroot/setuid；用户代码进程会降权到 sandbox 用户。

## 测试覆盖

### 兼容性

- `main()`；
- `main(variables)`；
- `main(a,b)`；
- 全局变量注入；
- `print` log；
- 历史 helper；
- 旧 Python Code 节点写法。

### 安全

- GHSA-5jmh-5f2m-89jg 相关 `__base__` / `__subclasses__` 逃逸；
- 动态 `getattr`；
- import `os` / `sys` / `subprocess`；
- 文件系统访问；
- `os.system` / `subprocess` / `socket` / `ctypes`；
- 直接网络能力；
- 父进程 HTTP 代理 SSRF 防护；
- 请求大小、响应大小、请求次数、超时。

### 生命周期和资源

- init 后存在干净预热进程；
- 预热进程执行一次后销毁，不归还池中；
- 执行后自动补充新的干净预热进程；
- 并发超过上限时排队；
- 超时后可恢复；
- 内存超限后可恢复；
- shutdown 清理 running / idle / warming 子进程。

### Docker/Linux

- native `.so` 加载；
- setuid/setgid 降权；
- chroot 生效；
- seccomp 阻断命令执行；
- numpy/pandas/matplotlib 在 chroot/seccomp 下可用；
- Docker 包可用性测试覆盖 Python 和 JS 白名单包。

## 性能和资源

one-shot warm pool 的收益主要在低并发和空闲命中场景：

- 空闲预热进程命中时，省去 Python spawn/bootstrap/native init 的一部分延迟；
- 高并发短任务下，预热池可以覆盖 `SANDBOX_POOL_SIZE` 以内的首批请求，但每个进程执行一次后仍需销毁并补充，因此稳态吞吐仍不会接近旧长驻 pool；
- 预热进程不提前 import pandas/numpy，避免 idle 内存过高；
- 当前 Docker/seccomp 下，单个 idle Python bootstrap 进程 RSS 约 18.7MB；
- `SANDBOX_POOL_SIZE=20` 时，Python idle 进程 RSS 粗略约 374MB；实际容器 RSS 还包含 JS worker、Node 主进程、共享页和系统库统计口径。

安全优先级高于短任务吞吐。如果未来需要继续优化，应优先评估：

- 是否为重包场景做专门的 package page-cache 预热，而不是让 idle 进程提前 import；
- 是否引入 clean forkserver。forkserver 父进程必须永不执行用户代码，且子进程在执行前完成 fd 清理、chroot、setuid 和 seccomp。

## 验收标准

- 旧 Python pool/worker 代码删除；
- `/sandbox/python` 只使用 `PythonIsolatedRunner`；
- Linux 缺少 native `.so` 或 chroot root 时 fail-closed；
- Python 子进程直接网络 syscall 固定关闭；
- 执行过用户代码的 Python 进程不会复用；
- 原有 Python 兼容用例通过；
- 原有安全边界测试迁移并通过；
- Docker/seccomp 下 Python 包可用性和 OS 隔离测试通过。

## 当前验证命令

```bash
pnpm --filter @fastgpt/code-sandbox exec tsc --noEmit
SANDBOX_MAX_MEMORY_MB=256 pnpm --filter @fastgpt/code-sandbox exec vitest run --coverage.enabled=false
pnpm --filter @fastgpt/code-sandbox build
docker build --build-arg proxy=1 -f projects/code-sandbox/Dockerfile -t fastgpt-code-sandbox-warm-pool .
```
