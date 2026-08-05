# Rate Limit 模块拆分设计

## 背景

当前限流由 `packages/service/common/system/frequencyLimit/redisFixedWindow.ts` 暴露
`group + id` 通用接口。虽然公共函数补充了统一前缀，但业务调用方仍然负责拼装
`id`，导致 Redis key 结构、动作隔离、主体口径和故障策略泄漏到 API 层。

本次改造将限流基础能力收口到 `packages/service/common/rateLimit`，并通过场景接口
向业务层暴露语义函数。业务层只传账号、团队、成员或 IP 等业务标识，不维护 key。

## 模块边界

### DAL

`packages/dal/redis/caches/rateLimit.ts` 提供 Redis 限流 Cache：

- 校验额度、窗口和增量。
- 原子递增计数并设置固定窗口 TTL。
- 返回当前计数、剩余额度和窗口重置时间。
- 不识别业务场景，不处理业务错误。

固定窗口仍是 Redis adapter 的内部算法，因此 adapter 的 `consumeFixedWindow` 命名保留。

### Service Rate Limit Core

`packages/service/common/rateLimit` 负责：

- 使用 `rate-limit` 作为统一逻辑 key namespace。
- 使用 `createRedisLogicalKey` 编码所有 key segment。
- 统一执行 Cache 调用和故障策略。
- 不向业务层暴露任意字符串 key。
- 不依赖 HTTP request/response、NextAPI 或中间件启停配置。

### 场景接口

`packages/service/common/rateLimit/interface` 按场景维护 key 和限流策略：

- `ip.ts`
- `accountVerification.ts`
- `enterpriseAuth.ts`
- `outLink.ts`
- `upload.ts`
- `member.ts`
- `team.ts`

每个文件使用 `type.ts` 中的统一定义创建接口，保证场景、动作、主体和执行结果的
结构一致。API 和业务 Service 只能调用这些语义接口。

`ip.ts` 只导出通用 IP 限流接口，接收接口标识、已解析 IP、额度和窗口。真实 IP
解析、环境开关、强制启用和 HTTP 429 响应继续由
`packages/service/common/middle/reqFrequencyLimit.ts` 封装，不能下沉到 rateLimit 模块。

## Key 规则

逻辑 key：

```text
rate-limit:<scene>:<policy/action>:<subject-type>:<subject-id...>
```

DAL 写入 Redis 后的物理 key：

```text
fastgpt:rate-limit:<scene>:<policy/action>:<subject-type>:<subject-id...>
```

示例：

```text
rate-limit:ip:wechat-login-qrcode:ip:192.0.2.1
rate-limit:account-verification:captcha-create:register:account:user@example.com
rate-limit:enterprise-auth:start:team:team-id
rate-limit:out-link:request:out-link:out-link-id:uid:visitor-id
rate-limit:upload:presign:identity:member-id
rate-limit:member:export-dataset:member:member-id
```

动作层不能省略。账号验证的生成、消费和不同材料必须使用独立计数窗口。

## 接口约束

`type.ts` 定义：

- `RateLimitScene`：允许的一级场景。
- `RateLimitFailureMode`：Redis 故障时放行或拒绝。
- `RateLimitInterfaceDefinition<TInput>`：场景接口定义。
- `RateLimitInterface<TInput>`：统一的 `consume`、`check` 和 `assert` 执行接口。
- `defineRateLimitInterface`：创建强类型场景接口，集中生成 key。

`check` 原子增加计数并返回是否允许；`assert` 使用同一次消费结果判断并抛出定义的
错误。禁止把“增加统计”和“读取校验”拆成两次 Redis 操作，避免并发竞态。

成员限流的 policy、额度和窗口由 `member.ts` 集中维护，业务层只传 `policy` 和
`memberId`，不能在路由中重复声明额度。

| Member policy | 额度 | 窗口 |
| --- | ---: | ---: |
| `get-llm-request-record` | 1 | 1 秒 |
| `chat-agent-helper-completions` | 10 | 60 秒 |
| `transcriptions` | 1 | 1 秒 |
| `redeem-coupon` | 1 | 1 秒 |
| `refund-bill` | 1 | 1 秒 |
| `create-bill` | 1 | 1 秒 |
| `export-members` | 1 | 60 秒 |
| `check-pay-result` | 60 | 60 秒 |
| `export-usage` | 1 | 60 秒 |
| `export-dataset` | 1 | 60 秒 |
| `export-chat-logs` | 1 | 60 秒 |

`search-test` 不创建独立 policy，复用团队 `chat-qpm`，与聊天请求共同消费团队套餐 QPM。

## 故障策略

故障策略在场景接口定义时固定，调用方不能临时选择：

- 迁移自历史 Mongo 限流的普通业务保持 fail-open。
- 明确要求保护认证或成本资源的场景可以定义为 fail-closed。
- 非法限额、窗口或增量属于配置错误，始终抛出。

本次迁移先保持各调用方现有行为，不借重构改变产品策略。

## 迁移映射

| 当前调用 | 新接口 |
| --- | --- |
| `useIPFrequencyLimit({ id })` | 中间件保持不变，内部改用通用 IP rateLimit 接口 |
| 账号验证 `group + action + scene + account` | 账号验证语义接口 |
| 企业认证手写 group/id | 企业认证 start/verifyAmount 接口 |
| 上传手写 member id | 按身份限制每分钟签发上传 URL 次数 |
| 外链 `_id + ip` | 按 `outLinkId + outLinkUid` 限制外链 QPM |
| 成员接口把 action 写入 id | 强类型 member policy 接口 |

## TODO

- [x] 重命名 DAL Cache 文件、类型和导出。
- [x] 新建 Service rateLimit core、type 和 interface 目录。
- [x] 迁移主仓库和 Pro 调用方。
- [x] 删除旧 frequencyLimit 通用实现和无效类型。
- [x] 更新 Redis mock、单元测试和 key 断言。
- [x] 运行 DAL、Service、App 和 Pro 相关测试。
