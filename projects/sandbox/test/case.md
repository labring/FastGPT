# Sandbox 测试用例清单

> 344 passed | 8 skipped | 0 failed
> 生成时间: 2026-02-21

---

## 1. 单元测试 (unit)

### 1.1 JsRunner (`test/unit/js-runner.test.ts`)

| # | 用例 | 说明 |
|---|------|------|
| 1 | 执行基本代码并返回结果 | 基础执行能力 |
| 2 | 超时返回错误 | 超时机制 |
| 3 | 空代码返回错误 | 输入校验 |
| 4 | SystemHelper.countToken 可用 | 内置工具 |
| 5 | SystemHelper.strToBase64 可用 | 内置工具 |
| 6 | SystemHelper.createHmac 可用 | 内置工具 |
| 7 | SystemHelper.delay 可用 | 内置工具 |
| 8 | console.log 输出收集到 log | 日志捕获 |
| 9 | 向后兼容全局函数 countToken | 兼容性 |
| 10 | 变量正确传入 | 变量传递 |
| 11 | 语法错误返回失败 | 错误处理 |
| 12 | 运行时错误返回失败 | 错误处理 |
| 13 | 纯空白代码返回错误 | 输入校验 |
| 14 | 代码中包含反引号和模板字符串 | 边界 |
| 15 | 代码中包含 ${ 转义边界 | 边界 |
| 16 | 返回原始字符串值 | 返回值类型 |
| 17 | 返回数字 0 | 返回值类型 |
| 18 | 返回布尔 false | 返回值类型 |
| 19 | 返回空数组 | 返回值类型 |
| 20 | 返回空对象 | 返回值类型 |
| 21 | Unicode 变量和返回值 | 编码 |
| 22 | 变量值为 null 的处理 | 边界 |
| 23 | 多种 console 输出混合 | 日志 |
| 24 | limits 参数部分指定时使用默认值 | 配置 |
| 25 | 大量变量传入 | 性能 |
| 26 | 缺少 main 函数报错 | 输入校验 |
| 27 | main 不是函数报错 | 输入校验 |

### 1.2 PythonRunner (`test/unit/python-runner.test.ts`)

| # | 用例 | 说明 |
|---|------|------|
| 1 | 执行基本代码并返回结果 | 基础执行能力 |
| 2 | 超时返回错误 | 超时机制 |
| 3 | 空代码返回错误 | 输入校验 |
| 4 | system_helper.count_token 可用 | 内置工具 |
| 5 | system_helper.str_to_base64 可用 | 内置工具 |
| 6 | system_helper.create_hmac 可用 | 内置工具 |
| 7 | print 输出收集到 log | 日志捕获 |
| 8 | 向后兼容全局函数 count_token | 兼容性 |
| 9 | 多参数 main 函数 | 函数签名 |
| 10 | 无参数 main 函数 | 函数签名 |
| 11 | 运行时错误返回失败 | 错误处理 |
| 12 | 纯空白代码返回错误 | 输入校验 |
| 13 | 代码中包含三引号字符串 | 边界 |
| 14 | 返回字符串值 | 返回值类型 |
| 15 | 返回数字 0 | 返回值类型 |
| 16 | 返回布尔 False | 返回值类型 |
| 17 | 返回空列表 | 返回值类型 |
| 18 | 返回空字典 | 返回值类型 |
| 19 | Unicode 变量和返回值 | 编码 |
| 20 | 变量值为 null 的处理 | 边界 |
| 21 | 多种 print 输出混合 | 日志 |
| 22 | limits 参数部分指定时使用默认值 | 配置 |
| 23 | 大量变量传入 | 性能 |
| 24 | system_helper.delay 可用 | 内置工具 |
| 25 | 缺少 main 函数报错 | 输入校验 |
| 26 | main 不是函数报错 | 输入校验 |
| 27 | 除零错误 | 错误处理 |

### 1.3 BaseRunner (`test/unit/base-runner.test.ts`)

- 配置初始化、默认值、limits 合并等

### 1.4 Semaphore (`test/unit/semaphore.test.ts`)

| # | 用例 | 说明 |
|---|------|------|
| 1 | acquire 在未满时立即返回 | 基础 |
| 2 | release 减少 current 计数 | 基础 |
| 3 | stats 返回正确的 current/queued/max | 状态 |
| 4 | 超出 max 后排队等待，release 唤醒下一个 | 排队 |
| 5 | release 按 FIFO 顺序唤醒 | 顺序 |
| 6 | max=1 时保证串行执行 | 串行 |
| 7 | 大量并发请求排队后依次完成 | 并发 |
| 8 | max=1 大量并发严格串行 | 并发 |
| 9 | release 无排队时 current 不会变为负数 | 边界 |
| 10 | max 为很大的数时不排队 | 边界 |
| 11 | acquire 返回的 Promise 是 void | 类型 |

### 1.5 Semaphore 竞态条件 (`test/unit/semaphore-race.test.ts`)

| # | 用例 | 说明 |
|---|------|------|
| 1 | release 过多后 acquire 仍能正常工作 | 竞态 |
| 2 | 快速交替 acquire/release 不丢失状态 | 竞态 |
| 3 | 异步任务异常后 release 仍被调用 | 异常恢复 |
| 4 | max=0 时所有 acquire 都排队 | 边界 |
| 5 | 并发 acquire 后批量 release | 批量 |

---

## 2. 基础样例 (examples)

### 2.1 JS 基础样例 (`test/examples/basic-examples.test.ts`)

| # | 用例 | 说明 |
|---|------|------|
| 1 | 字符串处理 | 基础运算 |
| 2 | 数组操作 (map/filter/reduce) | 基础运算 |
| 3 | JSON 解析和构造 | 基础运算 |
| 4 | 正则表达式提取 | 基础运算 |
| 5 | lodash 数据处理 | 白名单模块 |
| 6 | dayjs 日期处理 | 白名单模块 |
| 7 | crypto-js 加密 | 白名单模块 |
| 8 | uuid 生成 | 白名单模块 |
| 9 | countToken 计算 | 内置工具 |
| 10 | strToBase64 编码 | 内置工具 |
| 11 | async/await + Promise | 异步 |
| 12 | 访问未定义变量 | 错误处理 |
| 13 | 无限递归 | 错误处理 |
| 14 | 类型错误 | 错误处理 |

### 2.2 Python 基础样例 (`test/examples/basic-examples.test.ts`)

| # | 用例 | 说明 |
|---|------|------|
| 1 | 字符串处理 | 基础运算 |
| 2 | 列表推导式 | 基础运算 |
| 3 | 字典操作 | 基础运算 |
| 4 | 正则表达式提取 | 基础运算 |
| 5 | datetime 日期处理 | 安全模块 |
| 6 | json 处理 | 安全模块 |
| 7 | hashlib 哈希计算 | 安全模块 |
| 8 | collections 使用 | 安全模块 |
| 9 | count_token 计算 | 内置工具 |
| 10 | str_to_base64 编码 | 内置工具 |
| 11 | main() 无参数 | 函数签名 |
| 12 | main(a, b) 多参数展开 | 函数签名 |
| 13 | 访问未定义变量 | 错误处理 |
| 14 | 无限递归 | 错误处理 |
| 15 | 类型错误 | 错误处理 |
| 16 | 除零错误 | 错误处理 |
| 17 | 索引越界 | 错误处理 |

---

## 3. 边界测试 (boundary)

### 3.1 JS 边界 (`test/boundary/boundary.test.ts`)

| # | 用例 | 说明 |
|---|------|------|
| 1 | 空代码（无 main 函数） | 输入校验 |
| 2 | 语法错误 | 错误处理 |
| 3 | 运行时异常 | 错误处理 |
| 4 | main 不是函数 | 输入校验 |
| 5 | main 返回 undefined | 返回值 |
| 6 | main 返回 null | 返回值 |
| 7 | 超时被终止 | 资源限制 |
| 8 | 大量 console.log 输出 | 性能 |
| 9 | 大对象返回 | 性能 |
| 10 | 空变量 | 变量 |
| 11 | 特殊字符变量 | 变量 |
| 12 | 嵌套对象变量 | 变量 |
| 13 | 数组变量 | 变量 |

### 3.2 Python 边界 (`test/boundary/boundary.test.ts`)

| # | 用例 | 说明 |
|---|------|------|
| 1 | 空代码 | 输入校验 |
| 2 | 语法错误 | 错误处理 |
| 3 | 运行时异常 | 错误处理 |
| 4 | main 不是函数 | 输入校验 |
| 5 | main 返回 None | 返回值 |
| 6 | 超时被终止 | 资源限制 |
| 7 | 大量 print 输出 | 性能 |
| 8 | 大列表返回 | 性能 |
| 9 | 空变量 | 变量 |
| 10 | 特殊字符变量 | 变量 |
| 11 | 嵌套字典变量 | 变量 |
| 12 | 列表变量 | 变量 |
| 13 | 返回非 JSON 可序列化对象（set） | 序列化 |
| 14 | 返回 datetime 对象（default=str） | 序列化 |
| 15 | 超长变量字符串 | 边界 |
| 16 | 变量包含特殊 JSON 字符 | 边界 |
| 17 | 返回浮点数精度 | 精度 |
| 18 | 返回非常大的整数 | 精度 |
| 19 | 缺少必需参数的 main 函数 | 输入校验 |

### 3.3 JS 补充边界 (`test/boundary/boundary.test.ts`)

| # | 用例 | 说明 |
|---|------|------|
| 1 | 超长变量字符串 | 边界 |
| 2 | 变量包含特殊 JSON 字符 | 边界 |
| 3 | 返回浮点数精度 | 精度 |
| 4 | Promise.reject 被正确捕获 | 异步 |
| 5 | setTimeout 在沙盒中可用 | 定时器 |
| 6 | JSON 循环引用返回错误 | 序列化 |
| 7 | 缺少 main 函数 | 输入校验 |
| 8 | async 函数中 try/catch 正常工作 | 异步 |

---

## 4. 安全测试 (security)

### 4.1 JS 模块/API 拦截 (`test/security/security.test.ts`)

| # | 用例 | 说明 |
|---|------|------|
| 1 | 阻止 require child_process | 模块拦截 |
| 2 | 阻止 require fs | 模块拦截 |
| 3 | 阻止 require net | 模块拦截 |
| 4 | 阻止 require http | 模块拦截 |
| 5 | 阻止 require https | 模块拦截 |
| 6 | 阻止 require axios | 模块拦截 |
| 7 | 阻止 require node-fetch | 模块拦截 |
| 8 | Bun.spawn 被禁用 | API 拦截 |
| 9 | Bun.spawnSync 被禁用 | API 拦截 |
| 10 | Bun.serve 被禁用 | API 拦截 |
| 11 | Bun.write 被禁用 | API 拦截 |
| 12 | process.binding 被禁用 | API 拦截 |
| 13 | process.dlopen 被禁用 | API 拦截 |
| 14 | process._linkedBinding 被禁用 | API 拦截 |
| 15 | process.kill 被禁用 | API 拦截 |
| 16 | process.chdir 被禁用 | API 拦截 |
| 17 | process.env 被冻结不可修改 | 环境隔离 |
| 18 | process.env 敏感变量已清理 | 环境隔离 |
| 19 | fetch 被禁用 | 网络拦截 |
| 20 | XMLHttpRequest 被禁用 | 网络拦截 |
| 21 | WebSocket 被禁用 | 网络拦截 |
| 22 | Error.stack 不泄露宿主路径 | 信息泄露 |
| 23 | globalThis 篡改不影响安全机制 | 防篡改 |

### 4.2 JS 逃逸攻击 (`test/security/security.test.ts`)

| # | 用例 | 说明 |
|---|------|------|
| 1 | constructor.constructor 无法获取 Function | 原型链逃逸 |
| 2 | constructor 链逃逸到 Function | 原型链逃逸 |
| 3 | __proto__ 访问被阻止 | 原型链逃逸 |
| 4 | 原型链污染不影响沙盒安全 | 原型链污染 |
| 5 | eval 无法访问外部作用域 | 动态执行 |
| 6 | new Function 构造器被 _SafeFunction 拦截 | 动态执行 |
| 7 | Reflect.construct(Function, ...) 被阻止 | 动态执行 |
| 8 | Symbol.unscopables 逃逸尝试 | 作用域逃逸 |
| 9 | Proxy 构造器不能绕过安全限制 | 代理逃逸 |
| 10 | import("child_process") 动态导入被拦截 | 动态导入 |
| 11 | AsyncFunction 构造器绕过（env 已清理） | 构造器逃逸 |
| 12 | GeneratorFunction 构造器绕过 | 构造器逃逸 |

### 4.3 JS SSRF 防护 (`test/security/security.test.ts`)

| # | 用例 | 说明 |
|---|------|------|
| 1 | httpRequest 禁止访问 127.0.0.1 | 内网 |
| 2 | httpRequest 禁止访问 10.x.x.x | 内网 |
| 3 | httpRequest 禁止访问 172.16.x.x | 内网 |
| 4 | httpRequest 禁止访问 192.168.x.x | 内网 |
| 5 | httpRequest 禁止访问 169.254.169.254 | 云元数据 |
| 6 | httpRequest 禁止访问 0.0.0.0 | 特殊地址 |
| 7 | httpRequest 禁止 ftp 协议 | 协议限制 |
| 8 | httpRequest 禁止 file 协议 | 协议限制 |
| 9 | httpRequest GET 公网地址正常 | 正常放行 |
| 10 | httpRequest POST 带 body | 正常放行 |
| 11 | 全局函数 httpRequest 可用 | 兼容性 |

### 4.4 Python 模块拦截 (`test/security/security.test.ts`)

| # | 用例 | 说明 |
|---|------|------|
| 1 | 阻止 import os（预检） | 危险模块 |
| 2 | 阻止 import subprocess（预检） | 危险模块 |
| 3 | 阻止 import sys（预检） | 危险模块 |
| 4 | 阻止 import shutil（预检） | 危险模块 |
| 5 | 阻止 import pickle（预检） | 危险模块 |
| 6 | 阻止 import multiprocessing（预检） | 危险模块 |
| 7 | 阻止 import threading（预检） | 危险模块 |
| 8 | 阻止 import ctypes（预检） | 危险模块 |
| 9 | 阻止 import signal（预检） | 危险模块 |
| 10 | 阻止 import gc（预检） | 危险模块 |
| 11 | 阻止 import tempfile（预检） | 危险模块 |
| 12 | 阻止 import pathlib（预检） | 危险模块 |
| 13 | 阻止 import importlib（预检） | 危险模块 |
| 14 | 阻止 from os import path（预检） | 危险模块 |
| 15 | 阻止 from subprocess import Popen（预检） | 危险模块 |
| 16 | 阻止 from importlib import import_module（预检） | 危险模块 |
| 17 | 阻止 import socket | 网络模块 |
| 18 | 阻止 import urllib.request | 网络模块 |
| 19 | 阻止 import http.client | 网络模块 |
| 20 | 阻止 import requests（预检） | 网络模块 |
| 21 | 运行时动态 __import__("subprocess") 被拦截 | 动态导入 |
| 22 | 条件块内 import os 被运行时拦截 | 动态导入 |
| 23 | 允许 import json | 安全模块 |
| 24 | 允许 import math | 安全模块 |
| 25 | 允许 from datetime import datetime | 安全模块 |
| 26 | 允许 import re | 安全模块 |

### 4.5 Python 逃逸攻击 (`test/security/security.test.ts`)

| # | 用例 | 说明 |
|---|------|------|
| 1 | 无法通过异常恢复原始 __import__ | import hook |
| 2 | 无法通过 __builtins__ 恢复原始 __import__ | import hook |
| 3 | builtins.__import__ 恢复被阻止 | import hook |
| 4 | globals()["__builtins__"] 获取 __import__ | import hook |
| 5 | __builtins__ 篡改不能恢复危险 import | import hook |
| 6 | exec 中导入危险模块被拦截 | 动态执行 |
| 7 | exec 字符串拼接绕过预检（运行时兜底） | 动态执行 |
| 8 | eval + __import__ 被拦截 | 动态执行 |
| 9 | compile + exec 导入危险模块被拦截 | 动态执行 |
| 10 | 无法访问 _os 模块 | 内部模块 |
| 11 | 无法访问 _socket 模块 | 内部模块 |
| 12 | 无法访问 _urllib_request | 内部模块 |
| 13 | globals() 不泄露内部变量 | 信息泄露 |
| 14 | __subclasses__ 逃逸尝试 | 类继承逃逸 |
| 15 | type() 动态创建类不能绕过安全 | 动态类型 |
| 16 | getattr 动态访问不能绕过模块限制 | 动态属性 |

### 4.6 Python SSRF 防护 (`test/security/security.test.ts`)

| # | 用例 | 说明 |
|---|------|------|
| 1 | http_request 禁止访问 127.0.0.1 | 内网 |
| 2 | http_request 禁止访问 10.x.x.x | 内网 |
| 3 | http_request 禁止访问 169.254.169.254 | 云元数据 |
| 4 | http_request 禁止 file 协议 | 协议限制 |
| 5 | http_request GET 公网地址正常 | 正常放行 |
| 6 | http_request POST 带 body | 正常放行 |
| 7 | 全局函数 http_request 可用 | 兼容性 |

### 4.7 文件系统隔离 (`test/security/security.test.ts`)

| # | 用例 | 说明 |
|---|------|------|
| 1 | open() 读取 /proc/self/environ（env 已清理） | 环境隔离 |
| 2 | delay 超过 10s 报错 | 资源限制 |

### 4.8 变量注入攻击 (`test/security/security.test.ts`)

| # | 用例 | 说明 |
|---|------|------|
| 1 | [JS] 变量值包含恶意 JSON 不影响解析 | 注入防护 |
| 2 | [JS] 变量 key 包含特殊字符 | 注入防护 |
| 3 | [Python] 变量值包含 Python 代码注入 | 注入防护 |

### 4.9 API 输入校验 (`test/security/security.test.ts`)

| # | 用例 | 说明 |
|---|------|------|
| 1 | 空代码被拒绝 | 输入校验 |
| 2 | 非字符串代码被拒绝 | 输入校验 |

---

## 5. 集成测试 (integration)

### 5.1 JS 功能测试 (`test/integration/functional.test.ts`)

| 分类 | 用例 |
|------|------|
| 基础运算 | 返回简单对象、数学运算、字符串操作、数组操作、JSON 解析与序列化、正则表达式、Date 操作、Promise.all 并发、Map 和 Set |
| 变量传递 | 接收字符串变量、接收数字变量、接收复杂对象变量、空变量对象、多个变量 |
| 日志输出 | console.log 被捕获 |
| 白名单模块 | require crypto-js、require moment、require lodash |
| 错误处理 | 语法错误、运行时异常、未定义变量、超时 |
| SystemHelper | delay 正常延迟、strToBase64 编码 |
| 网络请求 | httpRequest GET、httpRequest POST JSON |

### 5.2 Python 功能测试 (`test/integration/functional.test.ts`)

| 分类 | 用例 |
|------|------|
| 基础运算 | 返回简单字典、数学运算、字符串操作、列表操作、字典推导式、列表推导式、try/except 异常处理 |
| 变量传递 | 接收字符串变量、接收数字变量、多个变量 |
| 安全模块 | import json、import math、import re、from datetime import datetime、import hashlib、import base64 |
| system_helper | str_to_base64 编码、delay 正常延迟 |
| 错误处理 | 语法错误、运行时异常、未定义变量、超时 |
| 网络请求 | http_request GET、http_request POST JSON |
| 复杂场景 | 数据处理管道（CSV→过滤→聚合）、递归斐波那契、类定义和使用 |

### 5.3 API 集成测试 (`test/integration/api.test.ts`) [SKIPPED - 需启动服务]

| # | 用例 | 说明 |
|---|------|------|
| 1 | GET /health 返回 200 | 健康检查 |
| 2 | POST /sandbox/js 正常执行 | JS API |
| 3 | POST /sandbox/python 正常执行 | Python API |
| 4 | 无 Token 返回 401 | 认证 |
| 5 | 错误 Token 返回 401 | 认证 |
| 6 | POST /sandbox/js 带 limits 参数 | 参数 |
| 7 | POST /sandbox/js 安全拦截 | 安全 |
| 8 | POST /sandbox/python 安全拦截 | 安全 |

---

## 统计

| 分类 | 数量 |
|------|------|
| 单元测试 | 101 |
| 基础样例 | 31 |
| 边界测试 | 40 |
| 安全测试 | 102 |
| 集成测试 | 70 |
| **合计** | **344 (passed) + 8 (skipped)** |
