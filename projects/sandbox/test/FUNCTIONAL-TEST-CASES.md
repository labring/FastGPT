# 功能测试用例清单

> 测试目标：localhost:3000 | 方式：curl 黑盒测试

## 一、服务基础

| # | 用例 | 方法 | 路径 | 预期 |
|---|------|------|------|------|
| 1.1 | 健康检查 | GET | /health | status=ok, jsPool/pythonPool 各 20 worker |
| 1.2 | 模块列表 | GET | /sandbox/modules | 返回 JS 白名单 + Python 黑名单 |
| 1.3 | 不存在的路由 | GET | /sandbox/notfound | 404 |

## 二、JS 执行

### 2.1 基础功能

| # | 用例 | 代码 | 变量 | 预期 |
|---|------|------|------|------|
| 2.1.1 | 简单返回 | `async function main() { return { hello: 'world' }; }` | 无 | success=true, codeReturn={hello:'world'} |
| 2.1.2 | 数学运算 | `async function main() { return { sum: 1+2, product: 3*4 }; }` | 无 | sum=3, product=12 |
| 2.1.3 | 字符串操作 | `async function main() { return { upper: 'hello'.toUpperCase(), len: 'hello'.length }; }` | 无 | upper='HELLO', len=5 |
| 2.1.4 | JSON 解析 | `async function main() { const obj = JSON.parse('{"a":1}'); return obj; }` | 无 | {a:1} |
| 2.1.5 | 正则表达式 | `async function main() { return { match: 'abc123'.match(/\d+/)[0] }; }` | 无 | match='123' |
| 2.1.6 | Promise.all | `async function main() { const r = await Promise.all([1,2,3].map(x => Promise.resolve(x*2))); return { r }; }` | 无 | r=[2,4,6] |
| 2.1.7 | Map/Set | `async function main() { const s = new Set([1,1,2,3]); return { size: s.size }; }` | 无 | size=3 |

### 2.2 变量传递

| # | 用例 | 变量 | 预期 |
|---|------|------|------|
| 2.2.1 | 字符串变量 | `{name:"Alice"}` | greeting='Hello, Alice!' |
| 2.2.2 | 数字变量 | `{num:21}` | doubled=42 |
| 2.2.3 | 数组变量 | `{items:[1,2,3,4,5]}` | sum=15 |
| 2.2.4 | 嵌套对象 | `{user:{name:"Bob",age:30}}` | 正确读取嵌套字段 |
| 2.2.5 | 空变量 | `{}` | 正常执行不报错 |
| 2.2.6 | 特殊字符变量 | `{text:"hello\n\"world\""}` | 正确传递含转义字符 |

### 2.3 console.log 捕获

| # | 用例 | 预期 |
|---|------|------|
| 2.3.1 | 单行 log | log 字段包含输出内容 |
| 2.3.2 | 多行 log | log 字段包含多行，\n 分隔 |
| 2.3.3 | log 对象 | 对象被 JSON.stringify |

### 2.4 白名单模块

| # | 模块 | 预期 |
|---|------|------|
| 2.4.1 | lodash | _.chunk, _.uniq 正常 |
| 2.4.2 | moment | moment().format() 正常 |
| 2.4.3 | dayjs | dayjs().format() 正常 |
| 2.4.4 | crypto-js | CryptoJS.MD5() 正常 |
| 2.4.5 | uuid | uuid.v4() 返回 UUID 格式 |
| 2.4.6 | qs | qs.stringify() 正常 |

### 2.5 内置函数

| # | 函数 | 预期 |
|---|------|------|
| 2.5.1 | countToken("hello world") | 返回数字 (≈3) |
| 2.5.2 | strToBase64("Hello") | 返回 'SGVsbG8=' |
| 2.5.3 | strToBase64("Hello", "data:,") | 返回 'data:,SGVsbG8=' |
| 2.5.4 | createHmac("sha256", "secret") | 返回 {timestamp, sign} |
| 2.5.5 | delay(100) | 延迟约 100ms 后返回 |
| 2.5.6 | httpRequest("https://www.baidu.com") | status=200, data 非空 |
| 2.5.7 | SystemHelper.httpRequest(...) | 同上，命名空间方式调用 |

### 2.6 错误处理

| # | 用例 | 预期 |
|---|------|------|
| 2.6.1 | 语法错误 | success=false, message 含错误描述 |
| 2.6.2 | 运行时异常 (throw) | success=false, message 含 'boom' |
| 2.6.3 | 未定义变量 | success=false |
| 2.6.4 | 无 main 函数 | success=false |
| 2.6.5 | 超时 (死循环, 2s) | success=false, message 含 'timed out' |

## 三、Python 执行

### 3.1 基础功能

| # | 用例 | 预期 |
|---|------|------|
| 3.1.1 | 简单返回字典 | success=true, {hello:'world'} |
| 3.1.2 | 数学运算 | sum=3, power=1024 |
| 3.1.3 | 字符串操作 | upper='HELLO', split 正确 |
| 3.1.4 | 列表推导式 | evens=[0,2,4,6,8] |
| 3.1.5 | 字典推导式 | {a:1, b:4, c:9} |
| 3.1.6 | try/except | caught=True |

### 3.2 变量传递

| # | 用例 | 预期 |
|---|------|------|
| 3.2.1 | 字符串变量 | f-string 拼接正确 |
| 3.2.2 | 数字变量 | 计算正确 |
| 3.2.3 | 列表变量 | sum/len 正确 |
| 3.2.4 | 空变量 | 正常执行 |

### 3.3 print 捕获

| # | 用例 | 预期 |
|---|------|------|
| 3.3.1 | print 输出 | log 字段包含内容 |
| 3.3.2 | 多次 print | log 字段多行 |

### 3.4 安全模块

| # | 模块 | 预期 |
|---|------|------|
| 3.4.1 | import json | ✅ 允许 |
| 3.4.2 | import math | ✅ 允许 |
| 3.4.3 | import re | ✅ 允许 |
| 3.4.4 | from datetime import datetime | ✅ 允许 |
| 3.4.5 | import hashlib | ✅ 允许 |
| 3.4.6 | import base64 | ✅ 允许 |
| 3.4.7 | import collections | ✅ 允许 |

### 3.5 内置函数

| # | 函数 | 预期 |
|---|------|------|
| 3.5.1 | count_token("hello world") | 返回数字 |
| 3.5.2 | str_to_base64("Hello") | 返回 'SGVsbG8=' |
| 3.5.3 | create_hmac("sha256", "secret") | 返回 {timestamp, sign} |
| 3.5.4 | delay(100) | 延迟约 100ms |
| 3.5.5 | http_request("https://www.baidu.com") | status=200 |
| 3.5.6 | system_helper.http_request(...) | 同上 |

### 3.6 错误处理

| # | 用例 | 预期 |
|---|------|------|
| 3.6.1 | 语法错误 | success=false |
| 3.6.2 | 运行时异常 (raise) | success=false, message 含错误 |
| 3.6.3 | 除零错误 | success=false, 'division by zero' |
| 3.6.4 | 未定义变量 | success=false |
| 3.6.5 | 无 main 函数 | success=false |
| 3.6.6 | 超时 (死循环, 2s) | success=false, 'timed out' |

### 3.7 main 函数签名兼容

| # | 签名 | 预期 |
|---|------|------|
| 3.7.1 | main() 无参 | 正常执行 |
| 3.7.2 | main(v) 单参数 | v 为 variables 字典 |
| 3.7.3 | main(a, b) 多参数 | 从 variables 展开 |
| 3.7.4 | main(a, b=10) 默认参数 | 缺省时用默认值 |

## 四、安全防护

### 4.1 JS 模块拦截

| # | 代码 | 预期 |
|---|------|------|
| 4.1.1 | require("fs") | 拒绝 |
| 4.1.2 | require("child_process") | 拒绝 |
| 4.1.3 | require("net") | 拒绝 |
| 4.1.4 | require("http") | 拒绝 |
| 4.1.5 | require("axios") | 拒绝 |

### 4.2 JS 逃逸攻击

| # | 攻击方式 | 预期 |
|---|----------|------|
| 4.2.1 | constructor.constructor 获取 Function | 拦截 |
| 4.2.2 | new Function("return process") | 拦截 |
| 4.2.3 | Bun.spawn(["ls"]) | 拦截 |
| 4.2.4 | Bun.write("/tmp/evil", "data") | 拦截 |
| 4.2.5 | process.env 读取敏感变量 | 已清理 |
| 4.2.6 | process.env 修改 | 冻结，不可修改 |

### 4.3 Python 模块拦截

| # | 代码 | 预期 |
|---|------|------|
| 4.3.1 | import os | 拒绝 |
| 4.3.2 | import subprocess | 拒绝 |
| 4.3.3 | import sys | 拒绝 |
| 4.3.4 | import socket | 拒绝 |
| 4.3.5 | from os import path | 拒绝 |
| 4.3.6 | __import__("os") | 运行时拒绝 |

### 4.4 Python 逃逸攻击

| # | 攻击方式 | 预期 |
|---|----------|------|
| 4.4.1 | exec("import os") | 拦截 |
| 4.4.2 | eval("__import__('os')") | 拦截 |
| 4.4.3 | builtins.__import__ 篡改 | 无效 |
| 4.4.4 | globals() 泄露内部变量 | 无 _original_import |

### 4.5 SSRF 防护

| # | URL | JS | Python | 预期 |
|---|-----|:--:|:------:|------|
| 4.5.1 | http://127.0.0.1/ | ✓ | ✓ | 拒绝 |
| 4.5.2 | http://10.0.0.1/ | ✓ | ✓ | 拒绝 |
| 4.5.3 | http://172.16.0.1/ | ✓ | ✓ | 拒绝 |
| 4.5.4 | http://192.168.1.1/ | ✓ | ✓ | 拒绝 |
| 4.5.5 | http://169.254.169.254/ | ✓ | ✓ | 拒绝 |
| 4.5.6 | ftp://example.com/ | ✓ | ✓ | 拒绝 |
| 4.5.7 | file:///etc/passwd | ✓ | ✓ | 拒绝 |
| 4.5.8 | https://www.baidu.com | ✓ | ✓ | 允许 |

## 五、API 输入校验

| # | 用例 | 预期 |
|---|------|------|
| 5.1 | code 为空字符串 | 400, 'Too small' |
| 5.2 | code 为数字 | 400, 'expected string' |
| 5.3 | 缺少 code 字段 | 400 |
| 5.4 | 非 JSON body | 400 |

## 六、进程池与并发

| # | 用例 | 预期 |
|---|------|------|
| 6.1 | 10 个并发 JS 请求 | 全部正确返回 |
| 6.2 | 10 个并发 Python 请求 | 全部正确返回 |
| 6.3 | 超时后 worker 恢复 | 后续请求正常 |
| 6.4 | 超时后池状态 | /health 显示 20/20 |
| 6.5 | JS + Python 混合并发 | 互不影响 |

## 七、复杂场景

| # | 用例 | 预期 |
|---|------|------|
| 7.1 | JS: lodash + crypto-js 数据处理 | groupBy + MD5 正确 |
| 7.2 | Python: math + datetime 统计分析 | avg/std/max/min 正确 |
| 7.3 | JS: 多步 async/await | 顺序执行正确 |
| 7.4 | Python: 类定义 + 方法调用 | OOP 正常 |
| 7.5 | Python: 递归 (斐波那契) | fib(20)=6765 |

---

总计：约 110 个测试用例
