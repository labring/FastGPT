# JS one-shot 原生隔离设计

## 1. 背景与目标

改造前，`projects/code-sandbox` 的 JavaScript worker 会跨任务复用进程。语言运行时层虽然限制了 `eval`、动态导入、模块白名单和危险全局对象，但同一进程内的状态污染，以及运行时绕过后的宿主文件、网络、进程能力，仍不能由 JavaScript 自身形成安全边界。

本次改造目标：

1. 每个 JS worker 最多执行一个用户任务，结果返回后立即销毁；池中只预热尚未接触用户代码的干净进程。
2. Linux 容器内固定启用 chroot、独立 UID/GID、`no_new_privs` 和 seccomp；初始化条件不满足时服务启动失败。
3. 用户进程没有网络 syscall。兼容的 `SystemHelper.httpRequest` 通过 stdin/stdout RPC 交给父 Node 进程执行，复用统一 SSRF、DNS pinning、次数、超时和大小限制。
4. 不要求修改 Docker 宿主机运行时，不依赖 gVisor、nsjail、特权容器或额外 capability。
5. 保持 `/sandbox/js` API、JS 代码调用方式、模块白名单和返回结构兼容。

## 2. 威胁模型与边界

防御对象是可提交任意 JavaScript 的恶意租户。容器本身仍是最终外层边界；本方案在同一容器内增加进程级纵深防御，目标是即使语言层限制被绕过，也无法：

- 读取 chroot 外的容器文件或父进程环境；
- 创建进程、执行二进制或创建新的线程；
- 直接创建 socket 绕过 SSRF 代理；
- 以 root 身份运行，或恢复原 UID/GID；
- 将内存全局、模块缓存、定时器或后台任务污染传给下一次执行。

不声称 chroot/seccomp 等价于虚拟机边界。内核漏洞、Node/V8 原生内存安全漏洞和容器逃逸仍由容器运行时、内核补丁与部署策略承担。

## 3. 架构

### 3.1 one-shot 预热池

保留 `BaseProcessPool` 的并发、排队、健康检查、超时和 RSS 监控。JS 池固定 `recycleAfterTask=true`：

1. 服务启动时创建 N 个 worker。
2. worker 加载所有运行时依赖和允许模块，进入原生隔离后回复 `ready`。
3. worker 接收恰好一个任务。
4. 父进程收到结果后将 worker 从池中移除并杀死，异步补充新的 `ready` worker。

因此预热降低冷启动延迟，但任何执行过用户代码的进程都不会回到 idle 池。

### 3.2 Linux 原生隔离初始化

新增 Node N-API 原生模块。worker 在回复 `ready` 前调用其初始化函数：

1. 父进程以 chroot 根目录作为 worker `cwd` 启动。
2. worker 预加载白名单模块及 Node 运行时所需对象。
3. 原生模块执行 `chroot(".")`，随后 `chdir("/app/code-sandbox")`。
4. 设置 `PR_SET_NO_NEW_PRIVS`。
5. 清空附加组，切换到 JS 专用 UID/GID 65538，并校验真实/有效身份；随后设置并校验 `PR_SET_DUMPABLE=0`，避免凭据切换重置该标志。
6. 加载 default-deny（EPERM）的 seccomp 规则，并以 TSYNC 同步到 Node 已有线程。

JS 与 Python 使用不同 UID/GID，防止两个语言沙箱通过 UID 所有权互相访问资源或发送信号。网络、`execve`、`fork`、`vfork`、`clone`、`clone3` 不进入 allowlist。

Linux 下缺少原生模块、chroot 根目录或任一步初始化失败时，worker 不得回复 `ready`，进程退出，进而使进程池初始化失败。macOS/Windows 只保留本地开发兼容路径，不声明具有 OS 隔离。

### 3.3 HTTP 父进程代理

worker 的 `SystemHelper.httpRequest` 不再导入和调用 `http`、`https`、`dns`：

- worker 输出 `{"type":"http_request","id":...,"payload":...}`；
- 父进程调用 `runSandboxHttpRequest`；
- 父进程向同一 worker stdin 返回 `http_response`；
- worker 用请求 ID 解析 Promise。

父进程按单个任务创建请求计数状态和 `AbortController`。任务完成、超时或进程异常退出时，中止尚未完成的代理请求，避免用户通过“不 await 即返回”让网络请求脱离 one-shot 生命周期。worker 直接 socket 即使通过语言层逃逸也会被 seccomp 拒绝。

### 3.4 chroot 文件布局

新增 `/tmp/fastgpt-js-sandbox`，由 root 持有且不可由 JS UID 写入。内部复制 `/app/code-sandbox`（bundle、原生模块和运行时白名单包）以及 Node 运行必需的设备节点。JS 任务默认没有可写目录；这与当前 JS API 不提供文件写入能力一致。

## 4. 验证策略

测试必须在本地真实 Linux Docker 容器中执行，不 mock 原生模块、进程、网络或文件系统：

1. one-shot：连续任务 PID 不同，模块/全局状态不泄漏，完成后池恢复预热容量。
2. 身份与文件：用户代码视角 UID/GID 为 65538；不能读取宿主 `/etc/passwd`、父进程环境或写 chroot 根。
3. syscall：原生探针验证 socket、execve、fork/clone 返回 EPERM；正常 Promise、timer、crypto、白名单 npm 包仍工作。
4. 网络：直接 `net`/间接 socket 被内核拒绝；`httpRequest` 仍经父进程代理，并保持 SSRF/次数/体积/超时与任务结束取消限制。
5. fail-closed：删除原生模块或 chroot 根时，Linux 池初始化失败。
6. 回归：运行已有 JS 安全、兼容、资源限制、Docker packages、API 测试，最后运行 code-sandbox 全量测试。
7. 生命周期：在 worker 尚未回复 `ready` 时关闭进程池，确认初始化 Promise 失败、预热计数归零且真实子进程已退出。
8. Python 公告回归：通过真实 `/sandbox/python` API 执行 GHSA-q6ww-4c5x-j2pg 的 `_posixsubprocess.fork_exec` PoC，确认由 native seccomp 返回 EPERM。

## 5. TODO

- [x] 新增 one-shot 与真实 Linux 原生隔离安全测试。
- [x] 实现 JS 原生 N-API 隔离模块及双架构 seccomp allowlist。
- [x] 接入 JS worker 初始化、父进程 HTTP RPC 与固定 one-shot 回收。
- [x] 更新镜像构建和 JS chroot 文件布局（不修改部署 YAML）。
- [x] 运行本地 Docker 局部安全/兼容/资源测试并修正规则。
- [x] 运行 code-sandbox 全量测试与最终安全审计。
