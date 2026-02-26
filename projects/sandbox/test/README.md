# 测试报告

> 生成时间：2026-02-23 | 测试框架：Vitest 3.x | 运行环境：Bun + Sealos Devbox

## 总览

| 指标 | 数值 |
|------|------|
| 测试文件 | 11 个，全部通过 ✅ |
| 测试用例 | 315 通过 / 3 跳过 / 0 失败 |
| 总耗时 | ~34s |

## 按模块统计

### 单元测试 (`test/unit/`)

| 文件 | 用例数 | 状态 | 覆盖内容 |
|------|--------|------|----------|
| `process-pool.test.ts` | 18 | ✅ 全通过 | JS/Python 进程池生命周期、worker 崩溃恢复、超时 respawn、并发排队、ping/pong 健康检查 |
| `base-runner.test.ts` | 9 | ✅ 全通过 | SubprocessRunner 基类逻辑、undefined/null 序列化、并发执行、非零退出码、输入校验、limits 截断 |
| `semaphore.test.ts` | 11 | ✅ 全通过 | Semaphore 基础功能、FIFO 唤醒、串行保证、大量并发、边界条件 |
| `semaphore-race.test.ts` | 5 | ✅ 全通过 | Semaphore 竞态条件、过度 release、快速交替、异常后 release、max=0 |

### 集成测试 (`test/integration/`)

| 文件 | 用例数 | 状态 | 覆盖内容 |
|------|--------|------|----------|
| `api.test.ts` | 7 + 3 跳过 | ✅ 全通过 | HTTP API 路由（health/js/python/modules）、Token 鉴权（需 SANDBOX_TOKEN 环境变量，未设置时跳过） |
| `functional.test.ts` | 46 | ✅ 全通过 | JS/Python 基础运算、变量传递、日志输出、白名单模块、错误处理、SystemHelper、网络请求、复杂场景 |

### 安全测试 (`test/security/`)

| 文件 | 用例数 | 状态 | 覆盖内容 |
|------|--------|------|----------|
| `security.test.ts` | 102 | ✅ 全通过 | 见下方详细分类 |

安全测试细分：

| 分类 | 用例数 | 内容 |
|------|--------|------|
| JS 模块/API 拦截 | 22 | require 黑名单、Bun API 禁用、process 冻结、fetch/XHR/WebSocket 禁用、env 清理、Error.stack 脱敏 |
| JS 逃逸攻击 | 11 | constructor.constructor、__proto__、原型链污染、eval、new Function、Reflect.construct、Symbol.unscopables、Proxy、动态 import、AsyncFunction/GeneratorFunction |
| JS SSRF 防护 | 11 | 内网 IP 黑名单（127/10/172.16/192.168/169.254/0.0.0.0）、协议限制（ftp/file）、公网 GET/POST 正常 |
| Python 模块拦截 | 26 | import 黑名单（os/subprocess/sys/shutil/pickle/multiprocessing/threading/ctypes/signal/gc/tempfile/pathlib/importlib/socket/urllib/http/requests）、from...import、运行时 __import__、条件块 import、白名单放行 |
| Python 逃逸攻击 | 13 | __import__ 恢复、__builtins__ 篡改、globals() 泄露、exec/eval 内 import、compile+exec、_os/_socket 访问、__subclasses__、type() 动态创建、getattr 绕过 |
| Python SSRF 防护 | 7 | 内网 IP 黑名单、file 协议、公网 GET/POST 正常 |
| 文件系统隔离 | 2 | /proc/self/environ 读取（env 已清理）、delay 上限 |
| 变量注入攻击 | 3 | JS/Python 恶意 JSON、特殊字符 key、Python 代码注入 |
| API 输入校验 | 2 | 空代码、非字符串代码 |

### 边界测试 (`test/boundary/`)

| 文件 | 用例数 | 状态 | 覆盖内容 |
|------|--------|------|----------|
| `boundary.test.ts` | 58 | ✅ 全通过 | JS/Python 空代码、语法错误、运行时异常、非函数 main、undefined/null 返回、超时终止、大量输出、大对象、空/特殊/嵌套变量、超长字符串、JSON 特殊字符、浮点精度、Promise.reject、setTimeout、循环引用、set/datetime 序列化、大整数 |

### 兼容性测试 (`test/compat/`)

| 文件 | 用例数 | 状态 | 覆盖内容 |
|------|--------|------|----------|
| `legacy-js.test.ts` | 18 | ✅ 全通过 | 旧版 JS 写法兼容：两参数/解构/无参/非 async、全局函数（delay/countToken/strToBase64/createHmac）、require 白名单包、典型旧版代码模式 |
| `legacy-python.test.ts` | 21 | ✅ 全通过 | 旧版 Python 写法兼容：单参数/多参数/无参/默认参数/全局变量访问、返回类型（列表/字典/布尔/None）、print 捕获、import 拦截/放行、典型旧版代码模式 |

### 示例测试 (`test/examples/`)

| 文件 | 用例数 | 状态 | 覆盖内容 |
|------|--------|------|----------|
| `basic-examples.test.ts` | 31 | ✅ 全通过 | JS/Python 常用场景：字符串/数组/JSON/正则、lodash/dayjs/crypto-js/uuid、hashlib/collections/datetime、内置函数、错误场景 |

## 跳过的测试（3 个）

均在 `api.test.ts` 的 "API Auth" 分组，需要设置 `SANDBOX_TOKEN` 环境变量才能运行：

- 无 Token 返回 401
- 错误 Token 返回 401
- 正确 Token 返回 200

## 测试覆盖维度

```
✅ 功能正确性    — 基础运算、变量传递、模块加载、网络请求、内置函数
✅ 安全防护      — 模块拦截、逃逸攻击、SSRF 防护、文件隔离、注入攻击
✅ 边界条件      — 空输入、超时、大数据、特殊字符、类型边界
✅ 向后兼容      — 旧版 JS/Python 代码格式全部兼容
✅ 进程池管理    — 生命周期、崩溃恢复、并发排队、健康检查
✅ 并发控制      — Semaphore 正确性、竞态条件、FIFO 保证
✅ API 层        — 路由、鉴权、输入校验
```
