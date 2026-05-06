# projects/code-sandbox 潜在 Bug 分析

## 范围

分析范围包括 `projects/code-sandbox` 的 Hono API、JS/Python worker 进程池、沙箱隔离、文件系统限制、鉴权、资源限制和健康检查。

## Findings

### 严重：Python 文件系统隔离可被标准库间接绕过

- 位置：`projects/code-sandbox/src/pool/worker.py:390`
- 函数：`_restricted_open`

#### 问题

Python worker 的 `_restricted_open` 只禁止用户代码直接调用 `open()`。它根据直接调用栈判断调用者，如果直接调用者来自 stdlib、site-packages 或 worker 自身，就允许打开文件：

```py
if caller_fn in ('<string>', '<test>', '<module>'):
    raise PermissionError(...)
if not _is_stdlib_frame(caller_fn) and not _is_site_packages_frame(caller_fn) and caller_fn != __file__:
    raise PermissionError(...)
return _original_open(*args, **kwargs)
```

但用户代码可以调用标准库函数，让标准库间接调用 `open()`，从而绕过直接调用栈检查。

#### 触发场景

用户代码可以通过类似方式触发：

```py
import tokenize
tokenize.open('/etc/hosts')
```

或通过 `gzip.open`、`pathlib.Path.open`、`fileinput.input` 等间接读写文件。

#### 影响

沙箱内用户可读取容器可访问文件，或写入可写路径，破坏文件系统隔离。若容器内存在配置、临时文件或挂载目录，可能造成敏感信息泄露。

#### 建议修复

- 不要基于“直接调用者是否来自 stdlib”来放行文件访问。
- 用户任务执行期间所有文件打开默认拒绝，或只允许明确临时工作目录和只读资源白名单。
- 对 `tokenize.open`、`gzip.open`、`pathlib.Path.open`、`fileinput.input` 增加回归测试。

### 严重：Python 长驻 worker 的 builtins 状态可跨请求污染

- 位置：`projects/code-sandbox/src/pool/worker.py:535`
- 函数：`main_loop`

#### 问题

Python worker 是长驻进程。每次任务结束时只恢复 `_PROTECTED_MODULES` 和 `print`：

```py
finally:
    signal.alarm(0)
    _builtins.print = _orig_print
    _restore_modules(_mod_snapshots)
```

但未恢复 `builtins` 的其他属性。用户代码可以修改 `builtins.sorted`、`builtins.len` 等内建函数，污染同一 worker 后续任务。

#### 触发场景

第一次请求执行：

```py
import builtins
builtins.sorted = lambda x: ['polluted']
```

后续请求落到同一 worker 时，`sorted([3, 1, 2])` 返回污染结果。

#### 影响

多请求/多租户隔离失效。前一个用户可以影响后续用户执行结果，甚至破坏安全拦截辅助逻辑。

#### 建议修复

- 每次任务前后完整快照并恢复 `builtins`。
- 或每个任务使用独立解释器/子解释器，避免长驻进程共享全局状态。
- 至少保护常见 builtins 和安全相关函数，并添加连续两次任务污染测试。

### 高：生产环境 SANDBOX_TOKEN 为空时仍开放代码执行接口

- 位置：`projects/code-sandbox/src/index.ts:98`

#### 问题

`SANDBOX_TOKEN` 为空时服务只打印 warning，不启用鉴权：

```ts
if (config.token) {
  app.use('/sandbox/*', bearerAuth({ token: config.token }));
} else {
  apiLogger.warn('WARNING: SANDBOX_TOKEN is not set...')
}
```

#### 触发场景

生产部署漏配 `SANDBOX_TOKEN`，但网络上仍可访问 code-sandbox 服务。

#### 影响

任何能访问服务的人都能提交 JS/Python 代码执行。即使沙箱有限制，也会造成资源消耗、网络探测，并放大沙箱隔离绕过后的影响。

#### 建议修复

- `NODE_ENV=production` 且 token 为空时直接拒绝启动。
- 仅允许 test/dev 显式无 token。
- 在部署模板中将 `SANDBOX_TOKEN` 标为必填。

### 高：内网地址拦截默认关闭，沙箱网络请求可访问私有网段服务

- 位置：
  - `projects/code-sandbox/src/env.ts:50`
  - `projects/code-sandbox/src/utils/ipCheck.util.ts:121`
  - `projects/code-sandbox/src/utils/ipCheck.util.ts:161`

#### 问题

`CHECK_INTERNAL_IP` 默认是 `false`。网络检查始终拦截 loopback、unspecified 和云 metadata，但对 10/8、172.16/12、192.168/16、fc00::/7 等私有网段只有在 `CHECK_INTERNAL_IP=true` 时才拦截：

```ts
const checkFullInternal = process.env.CHECK_INTERNAL_IP === 'true';
if (checkFullInternal && isInternalIPAddress(addr)) return true;
```

#### 触发场景

默认部署下，用户代码通过 `SystemHelper.httpRequest()` 请求容器网络内的私有地址服务，例如同一 Docker/K8s 网络中的内部 HTTP 服务。

#### 影响

代码沙箱可被用作内网探测或访问内部服务的跳板。虽然 metadata 被单独拦截，但普通私有网段服务仍暴露。

#### 建议修复

- 生产环境默认启用完整内网拦截，或者由 allowlist 显式放行需要访问的内部域名。
- 文档和部署模板中把 `CHECK_INTERNAL_IP=true` 作为安全默认值。
- 增加私有网段、IPv6 unique local、DNS 解析到私网的回归测试。

### 高：进程池等待队列无上限，可能被低成本 DoS

- 位置：`projects/code-sandbox/src/pool/base-process-pool.ts:236`
- 相关：`projects/code-sandbox/src/index.ts:19`

#### 问题

当所有 worker 忙碌时，`acquire` 会把请求无限加入 `waitQueue`：

```ts
return new Promise<PoolWorker>((resolve, reject) => {
  this.waitQueue.push({ resolve, reject });
});
```

没有队列上限，也没有排队超时。请求体中 `variables: z.record(z.string(), z.any()).default({})` 对结构复杂度和序列化大小也没有明确限制。

#### 触发场景

攻击者或异常调用方提交大量长任务，使 pool 被占满后继续发送请求。

#### 影响

主进程内存增长，请求长期挂起，服务可能被拖垮。

#### 建议修复

- 增加全局/按语言队列上限。
- 增加排队等待超时，超过后返回 429 或 503。
- 在 JSON parse 前加请求体大小限制，并限制 `variables` 序列化大小、对象深度和字段数量。

### 中：健康检查无法反映 worker 忙满、队列堆积或容量退化

- 位置：`projects/code-sandbox/src/index.ts:44`

#### 问题

`/health` 只判断 JS 和 Python worker 总数是否大于 0：

```ts
const isReady = jsStats.total > 0 && pyStats.total > 0;
return c.json({ status: isReady ? 'ok' : 'degraded' }, isReady ? 200 : 503);
```

没有判断 `busy`、`queued`、`idle`、`total < poolSize` 等状态。

#### 触发场景

所有 worker 忙满且队列堆积，或 poolSize=20 但只剩 1 个 worker 存活。

#### 影响

编排系统和负载均衡仍认为实例健康，继续转发流量到严重退化的节点。

#### 建议修复

- `/health` 返回 js/python stats。
- 区分 liveness 与 readiness。
- 当 `total < poolSize`、`queued` 超阈值或长时间无 idle 时返回 degraded/503。

### 中：Python worker 日志大小和超时阶段未真正重置，状态会跨请求残留

- 位置：
  - `projects/code-sandbox/src/pool/worker.py:489`
  - `projects/code-sandbox/src/pool/worker.py:530`
  - `projects/code-sandbox/src/pool/worker.py:532`
  - `projects/code-sandbox/src/pool/worker.py:533`

#### 问题

`main_loop()` 只声明了：

```py
global _allowed_modules, _request_count, _logs
```

但每次任务开始时又赋值 `_log_size = 0`、`_timeout_stage = 0`。由于没有把这两个变量声明为 global，这两次赋值只会创建局部变量，无法重置 `_safe_print()` 和 `_timeout_handler()` 实际使用的全局 `_log_size/_timeout_stage`。

#### 触发场景

同一个 Python worker 连续执行多次任务。前一次任务打印接近日志上限，或发生一次 timeout。

#### 影响

日志额度可能跨请求累积，后续任务提前丢日志；一次超时后的 `_timeout_stage` 残留，还可能让后续超时任务直接进入强制超时路径。这属于长驻 worker 状态隔离不完整。

#### 建议修复

- 在 `main_loop()` global 声明中加入 `_log_size` 和 `_timeout_stage`。
- 或把每次任务状态封装成局部 context，避免依赖模块级全局变量。
- 增加连续任务日志额度重置、连续 timeout 阶段重置的回归测试。
