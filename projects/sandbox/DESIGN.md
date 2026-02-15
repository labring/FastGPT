# FastGPT Sandbox v5 — 技术设计报告

## 1. 概述

FastGPT Sandbox v5 是对原有代码沙盒的完全重写，从 **NestJS + isolated-vm** 架构迁移到 **Bun + Hono + 统一子进程模型**。

核心目标：
- **统一执行模型**：JS 和 Python 共享同一套子进程执行引擎，降低维护成本
- **多层安全防御**：从宿主预检到运行时 shim，层层拦截
- **资源可控**：所有限制参数均可通过环境变量配置
- **向后兼容**：保留旧版 API 路由和代码模式

### 1.1 技术选型

| 维度 | 旧版 | v5 |
|------|------|-----|
| 运行时 | Node.js | Bun |
| HTTP 框架 | NestJS + Fastify | Hono |
| JS 执行 | isolated-vm (V8 隔离) | Bun 子进程 + 安全 shim |
| Python 执行 | python3 子进程 | python3 子进程（增强安全） |
| 依赖数量 | ~15 个 | 2 个核心（hono + zod） |

### 1.2 代码规模

- 核心源码：**1,287 行**（11 个文件）
- 测试代码：**4,608 行**（15 个测试文件，331 个测试用例）
- 测试覆盖：323 passed / 8 skipped（跳过的为需要运行服务的集成测试）

---

## 2. 架构设计

### 2.1 整体架构

```
┌─────────────────────────────────────────────────┐
│                   Hono HTTP Server               │
│              (src/index.ts, 69 行)               │
├──────────┬──────────────────────────┬────────────┤
│  /health │  /sandbox/js             │ /sandbox/py│
│  (公开)  │  (Bearer Auth)           │ (Bearer)   │
└──────────┴──────────┬───────────────┴────────────┘
                      │
              ┌───────▼────────┐
              │   Semaphore    │  ← 全局并发控制
              │  (最大 50 并发) │
              └───────┬────────┘
                      │
         ┌────────────▼────────────┐
         │   SubprocessRunner      │  ← 抽象基类
         │   (src/runner/base.ts)  │
         ├─────────────────────────┤
         │ • 临时目录创建/销毁      │
         │ • 子进程生命周期管理      │
         │ • 超时控制 + SIGKILL     │
         │ • 输出收集 + 结果解析    │
         └────────┬───────┬────────┘
                  │       │
        ┌─────────▼─┐ ┌──▼──────────┐
        │ JsRunner  │ │PythonRunner │
        │ (41 行)   │ │ (74 行)     │
        └─────┬─────┘ └──────┬──────┘
              │               │
     ┌────────▼────────┐ ┌───▼──────────────┐
     │ js-template.ts  │ │python-template.ts│
     │ (354 行)        │ │ (374 行)         │
     │ 安全 shim 生成   │ │ 安全 shim 生成    │
     └─────────────────┘ └──────────────────┘
```

### 2.2 请求生命周期

```
HTTP Request
  → Bearer Auth 校验（可选）
  → Semaphore.acquire()（排队等待并发许可）
  → 创建临时目录 /tmp/sandbox_XXXX
  → 子类 preCheck()（宿主侧预检）
  → 子类 generateScript()（生成带安全 shim 的脚本）
  → spawn 子进程（bun/python3）
  → stdin 传入 variables（JSON）
  → 收集 stdout/stderr + 超时监控
  → 解析 __SANDBOX_RESULT__ 前缀标记
  → Semaphore.release()
  → rm -rf 临时目录
  → 返回 JSON 响应
```

### 2.3 文件结构

```
projects/sandbox/
├── src/
│   ├── index.ts              # Hono 服务入口，路由定义
│   ├── env.ts                # dotenv + zod 环境变量校验
│   ├── config.ts             # 配置导出（env 的别名）
│   ├── types.ts              # TypeScript 类型定义
│   ├── runner/
│   │   ├── base.ts           # SubprocessRunner 抽象基类 + Semaphore 集成
│   │   ├── js-runner.ts      # JS 执行器（模块白名单）
│   │   └── python-runner.ts  # Python 执行器（危险模块黑名单 + 预检）
│   ├── sandbox/
│   │   ├── js-template.ts    # JS 安全 shim 模板生成
│   │   ├── python-template.ts# Python 安全 shim 模板生成
│   │   └── network-config.ts # 网络安全配置（IP 黑名单、请求限制）
│   └── utils/
│       └── semaphore.ts      # 信号量实现
├── test/                     # 15 个测试文件，331 个用例
├── Dockerfile                # 多阶段构建
├── README.md                 # 使用文档
├── DESIGN.md                 # 本文档
├── package.json
├── bun.lock
├── tsconfig.json
└── vitest.config.ts
```

---

## 3. 安全设计

### 3.1 四层防御模型

```
┌──────────────────────────────────────────────┐
│  Layer 1: 宿主侧预检                          │
│  • Python: 正则检测 import/from/__import__    │
│  • 在 spawn 子进程之前拦截，零开销              │
├──────────────────────────────────────────────┤
│  Layer 2: 进程级隔离                           │
│  • 独立子进程（非线程/协程）                    │
│  • 最小化 env（仅 SANDBOX_TMPDIR/PATH 等）     │
│  • 超时 SIGKILL 强杀                          │
│  • Semaphore 并发控制（防 fork bomb 效果）      │
├──────────────────────────────────────────────┤
│  Layer 3: 运行时 Shim                         │
│  • JS: 原型链冻结 + Function 构造器覆盖        │
│  •     + Bun API 禁用 + require 白名单代理     │
│  •     + 全局网络 API 删除                     │
│  • Python: __import__ 拦截（stdlib 帧检测）    │
│  •         + builtins.open 路径限制            │
│  •         + resource 限制（CPU/内存/磁盘）     │
├──────────────────────────────────────────────┤
│  Layer 4: 文件系统隔离                         │
│  • 每次执行独立临时目录                        │
│  • 路径遍历检查（realpath + relative 验证）     │
│  • 符号链接追踪防护                            │
│  • 磁盘配额（写入前检查累计大小）               │
│  • 执行后自动清理                              │
└──────────────────────────────────────────────┘
```

### 3.2 JS 安全 Shim 详解

**原型链冻结**：覆盖 `Object.getPrototypeOf`、`Reflect.getPrototypeOf`、`Object.setPrototypeOf`、`Reflect.setPrototypeOf`，阻止通过原型链逃逸到宿主对象。

**Function 构造器覆盖**：
```
用户代码 → constructor.constructor → 被覆盖的 SafeFunction → 抛出异常
内部代码 → _OriginalFunction（闭包保存） → 正常工作
```
这是防止 `({}).constructor.constructor('return process')()` 类攻击的关键。

**require 白名单**：通过 Proxy 拦截 require 调用，仅允许以下模块：
- `lodash`, `dayjs`, `moment`, `uuid`, `crypto-js`, `qs`, `url`, `querystring`

**Bun API 禁用**：删除 `Bun.write`、`Bun.spawn`、`Bun.serve` 等危险 API，保留 `Bun.file`（内部 fs 依赖）。

**网络隔离**：删除 `fetch`、`XMLHttpRequest`、`WebSocket`，所有网络请求必须通过 `SystemHelper.httpRequest()`。

### 3.3 Python 安全 Shim 详解

**`__import__` 拦截**：
- 维护危险模块黑名单（os, sys, subprocess, socket 等 25 个模块）
- 通过调用栈帧检测区分用户代码和标准库间接导入
- 标准库内部的间接导入（如 json 内部 import os）放行
- 用户代码直接 import 或通过 exec/eval 的 import 拦截

**resource 限制**：
- `RLIMIT_AS`：内存上限
- `RLIMIT_CPU`：CPU 时间上限
- `RLIMIT_FSIZE`：文件大小上限

**builtins.open 拦截**：所有文件操作限制在临时目录内。

### 3.4 网络安全（SSRF 防护）

所有 HTTP 请求通过 `SystemHelper.httpRequest()` / `system_helper.http_request()` 收口：

1. **协议白名单**：仅允许 `http:` 和 `https:`
2. **DNS 解析后校验**：先解析域名得到 IP，再检查是否命中内网段
3. **DNS Rebinding 防护**：使用 resolved IP 发起连接，设置 Host header 为原始域名
4. **内网 IP 黑名单**：
   - `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`（RFC 1918）
   - `169.254.0.0/16`（link-local，含云厂商 metadata）
   - `127.0.0.0/8`（loopback）
   - `::1/128`, `fc00::/7`, `fe80::/10`（IPv6 内网）
5. **请求频率限制**：单次执行最多 30 次请求
6. **响应大小限制**：默认 2MB
7. **请求超时**：默认 10s

### 3.5 已验证的攻击向量

以下攻击在测试中均被成功拦截：

| 攻击类型 | 手法 | 防御层 |
|---------|------|--------|
| 原型链逃逸 | `constructor.constructor('return process')()` | Layer 3 - Function 构造器覆盖 |
| 模块逃逸 | `require('child_process')` | Layer 3 - require 白名单 |
| Python import 绕过 | `exec("import os")` | Layer 3 - 栈帧检测 |
| Python `__import__` | `__import__('subprocess')` | Layer 1 预检 + Layer 3 拦截 |
| 路径遍历 | `../../etc/passwd` | Layer 4 - realpath 检查 |
| 符号链接攻击 | symlink → /etc/passwd | Layer 4 - realpath 追踪 |
| SSRF | 请求 169.254.169.254 | 网络层 - IP 黑名单 |
| DNS Rebinding | 域名先解析公网再解析内网 | 网络层 - resolved IP 连接 |
| 资源耗尽 | 无限循环 / 大量内存分配 | Layer 2 - 超时 SIGKILL + resource 限制 |
| Fork Bomb | 大量并发请求 | Semaphore 并发控制 |

---

## 4. 并发控制

### 4.1 Semaphore 信号量

```typescript
Semaphore(maxConcurrency=50)
  ├── acquire() → 计数 < max 则立即通过，否则排队
  ├── release() → 唤醒队列头部，或减少计数
  └── stats    → { current, queued, max }
```

- 所有 Runner 共享同一个全局 Semaphore
- 超出并发上限的请求排队等待（不拒绝）
- `/health` 端点暴露并发状态，便于监控

### 4.2 资源隔离

每次执行创建独立临时目录，执行完毕后 `rm -rf`。子进程环境变量最小化，仅传入：
- `SANDBOX_TMPDIR`：临时目录路径
- `SANDBOX_MEMORY_MB`：内存限制
- `SANDBOX_DISK_MB`：磁盘限制
- `PATH`：系统路径

---

## 5. 配置系统

### 5.1 环境变量

所有配置通过环境变量注入，使用 **zod** 做类型转换和校验：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `SANDBOX_PORT` | 3000 | 服务端口 |
| `SANDBOX_TOKEN` | (空) | Bearer Token，空则不启用认证 |
| `LOG_LEVEL` | info | 日志级别 |
| `SANDBOX_TIMEOUT` | 10000 | 默认超时 (ms) |
| `SANDBOX_MAX_TIMEOUT` | 60000 | 最大超时上限 (ms) |
| `SANDBOX_MEMORY_MB` | 64 | 默认内存限制 (MB) |
| `SANDBOX_MAX_MEMORY_MB` | 256 | 最大内存上限 (MB) |
| `SANDBOX_DISK_MB` | 10 | 默认磁盘限制 (MB) |
| `SANDBOX_MAX_DISK_MB` | 100 | 最大磁盘上限 (MB) |
| `SANDBOX_MAX_CONCURRENCY` | 50 | 最大并发数 |
| `SANDBOX_MAX_REQUESTS` | 30 | 单次执行最大 HTTP 请求数 |
| `SANDBOX_REQUEST_TIMEOUT` | 10000 | HTTP 请求超时 (ms) |
| `SANDBOX_MAX_RESPONSE_SIZE` | 2097152 | HTTP 响应大小上限 (bytes, 2MB) |

### 5.2 请求级覆盖

API 请求可通过 `limits` 字段覆盖默认值（不超过 MAX 上限）：

```json
{
  "code": "...",
  "variables": {},
  "limits": {
    "timeoutMs": 30000,
    "memoryMB": 128,
    "diskMB": 50
  }
}
```

---

## 6. API 设计

### 6.1 端点

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| GET | `/health` | 无 | 健康检查 + 并发状态 |
| POST | `/sandbox/js` | Bearer | 执行 JS 代码 |
| POST | `/sandbox/python` | Bearer | 执行 Python 代码 |

### 6.2 请求格式

```json
{
  "code": "function main(variables) { return variables.a + variables.b; }",
  "variables": { "a": 1, "b": 2 },
  "limits": { "timeoutMs": 5000 }
}
```

### 6.3 响应格式

成功：
```json
{
  "success": true,
  "data": {
    "codeReturn": 3,
    "log": "console.log output here"
  }
}
```

失败：
```json
{
  "success": false,
  "message": "Script execution timed out after 10000ms"
}
```

### 6.4 向后兼容

- **路由不变**：`/sandbox/js` 和 `/sandbox/python`
- **JS 全局函数保留**（deprecated）：`countToken`、`strToBase64`、`createHmac`、`delay`、`httpRequest`
- **Python 全局函数保留**：`count_token`、`str_to_base64`、`create_hmac`、`delay`、`http_request`
- **main 函数签名兼容**：
  - `main()` — 无参数
  - `main(variables)` — 单参数（变量字典）
  - `main(a, b, c)` — 多参数（从 variables 中按名取值）
- **Python 全局变量注入**：variables 中的键值对展开为全局变量（旧版行为）

---

## 7. 内置函数（SystemHelper）

JS 通过 `SystemHelper.xxx()` 调用，Python 通过 `system_helper.xxx()` 调用。

| 函数 | 说明 |
|------|------|
| `countToken(text)` / `count_token(text)` | 估算 token 数（字符数 / 4） |
| `strToBase64(str, prefix?)` / `str_to_base64(text, prefix)` | 字符串转 Base64 |
| `createHmac(algorithm, secret)` / `create_hmac(algorithm, secret)` | HMAC 签名 |
| `delay(ms)` / `delay(ms)` | 延迟（上限 10s） |
| `httpRequest(url, opts)` / `http_request(url, ...)` | 安全 HTTP 请求（SSRF 防护） |
| `fs.writeFile(path, content)` / `fs.write_file(path, content)` | 写文件（沙盒内） |
| `fs.readFile(path)` / `fs.read_file(path)` | 读文件（沙盒内） |
| `fs.readdir(path?)` / `fs.readdir(path)` | 列目录 |
| `fs.mkdir(path)` / `fs.mkdir(path)` | 创建目录 |
| `fs.exists(path)` / `fs.exists(path)` | 检查文件是否存在 |
| `fs.tmpDir` / `fs.tmp_dir` | 获取临时目录路径 |

---

## 8. 测试体系

### 8.1 测试分类

| 类别 | 文件数 | 用例数 | 说明 |
|------|--------|--------|------|
| 单元测试 | 5 | 87 | Runner 逻辑、Semaphore |
| 安全测试 | 5 | 126 | 逃逸攻击、网络安全、覆盖缺口 |
| 兼容测试 | 2 | 40 | 旧版代码模式（JS 18 + Python 22） |
| 边界测试 | 1 | 41 | 超时、内存、大数据 |
| 示例测试 | 1 | 35 | 常见用户代码模式 |
| 集成测试 | 1 | 8 | API 端到端（需运行服务） |
| **合计** | **15** | **331** | |

### 8.2 安全测试覆盖

- **escape-attacks.test.ts**（30 用例）：原型链逃逸、constructor.constructor、Bun API 访问、模块逃逸、环境变量泄露、进程信号、eval/Function 注入
- **js-security.test.ts**（23 用例）：JS 特有攻击向量
- **python-security.test.ts**（27 用例）：Python 特有攻击向量（exec import、`__import__`、builtins 篡改）
- **network-security.test.ts**（30 用例）：SSRF、内网访问、协议限制、DNS rebinding
- **coverage-gaps.test.ts**（16 用例）：补充覆盖（边界条件、组合攻击）

### 8.3 运行测试

```bash
# 单元/安全/兼容测试（不需要运行服务）
bun run test

# 集成测试（需要先启动服务）
SANDBOX_URL=http://localhost:3000 bun run test
```

---

## 9. 部署

### 9.1 Docker 构建

三阶段构建：
1. **python_base**：Python 3.11 + pip 依赖
2. **builder**：Bun + npm 依赖安装
3. **runner**：最终镜像（Bun + Python 3.11 + 源码）

```dockerfile
FROM oven/bun:1-alpine AS runner
# + python3 + 用户可用 npm 包
# 最终镜像约 ~150MB
```

### 9.2 启动

```bash
# 直接运行
SANDBOX_PORT=3000 SANDBOX_TOKEN=your-secret bun run src/index.ts

# Docker
docker run -p 3000:3000 -e SANDBOX_TOKEN=your-secret sandbox:v5
```

---

## 10. 性能基准

在 Sealos Devbox 环境下的测试结果：

| 场景 | 耗时 | 说明 |
|------|------|------|
| JS 简单代码 | ~48ms | 主要是子进程启动开销 |
| Python 简单代码 | ~78ms | Python 解释器启动较慢 |
| JS fibonacci(30) | ~58ms | 计算密集 |
| Python fibonacci(30) | ~233ms | Python 计算约 4x 慢 |
| JS require lodash | ~1.3s | 包加载开销 |
| JS 并发吞吐 (c=10) | ~27 QPS | |
| Python 并发吞吐 (c=10) | ~18 QPS | |

对于 FastGPT 的使用场景（LLM 生成代码执行，非高频调用），性能完全满足需求。

---

## 11. 扩展性

新增语言只需：

1. 继承 `SubprocessRunner`
2. 实现 `getCommand(scriptPath)` — 返回解释器命令
3. 实现 `generateScript(tempDir, code, limits)` — 生成带安全 shim 的脚本
4. 可选覆盖 `preCheck(code)` — 宿主侧预检

```typescript
class RubyRunner extends SubprocessRunner {
  getCommand(scriptPath: string) {
    return { command: 'ruby', args: [scriptPath] };
  }
  async generateScript(tempDir, code, limits) {
    // 生成 Ruby 安全脚本...
  }
}
```

---

## 12. 与旧版对比

| 维度 | 旧版 (NestJS + isolated-vm) | v5 (Bun + Hono + subprocess) |
|------|---------------------------|------------------------------|
| 依赖数 | ~15 个（含 native 编译） | 2 个核心 + 7 个用户包 |
| 构建时间 | 慢（isolated-vm 需编译） | 快（纯 JS，无 native） |
| JS 隔离 | V8 Isolate（强隔离） | 子进程 + 多层 shim |
| Python 隔离 | 子进程（基础） | 子进程 + resource + import 拦截 |
| 安全层数 | 1-2 层 | 4 层纵深防御 |
| 网络安全 | 无 SSRF 防护 | 完整 SSRF 防护 |
| 测试覆盖 | 少量 | 331 个用例 |
| 并发控制 | 无 | Semaphore 信号量 |
| 配置灵活性 | 硬编码 | 全部环境变量可配 |
| 代码量 | ~3000 行 | ~1300 行（减少 57%） |
