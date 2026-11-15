---
case_version: 1
id: FG-PERMISSION-ACCOUNT-001
title: 双 Token 会话续约、并发和撤销
business: permission/account
baseline: "会话方案：稳定 Session、AT/RT 轮换、60 秒预刷新、页内合并与服务端幂等"
category: boundary
scenario: special
status: ready
priority: P0
types: [api, ui, integration]
tags: [登录, 双Token, 自动续约, 并发, 覆盖基础场景, 覆盖异常场景, 覆盖边界场景]
evidence: [response, cache, database, ui, log]
sources:
  - packages/dal/redis/caches/sessionToken.ts
  - packages/service/support/user/session.ts
  - packages/service/support/permission/auth/common.ts
  - projects/app/src/web/common/api/request.ts
  - projects/app/src/web/common/api/fetch.ts
  - cli/src/domain/auth/auth-service.ts
routes:
  - POST /api/support/user/account/session/refresh
  - POST /api/support/user/account/session/logout
  - GET /api/support/user/account/whoami
related: []
---

## 用例简介

用户登录后以稳定 Session 绑定短期 Access 和轮换 Refresh，客户端在 Access 临近到期时先刷新。
多个页面与服务实例同时刷新、网络丢包、退出或团队切换时，不能产生分叉会话、复活已撤销登录或重复执行业务。

## 前置准备

- 沿用本轮工作区 dev 服务，记录实际构建版本、端口和进程；Pro / CLI 验证使用本轮代码。
- 数据库统一连接 Mac Mini Dev 服务的独立测试库 / Redis DB；从受控环境读取凭据，禁止输出凭据和清空业务 DB。
- 创建本轮唯一标识的用户、团队及 Session；保存资源 ID 清单，所有清理严格按清单。
- 时间边界在隔离数据上通过受控时钟或精确修改本轮会话到期时间验证；不改变共享系统时钟。
- 原始 AT / RT、Cookie、凭证对和加密缓存不进入报告，仅输出摘要、代次、时间及相等性断言。
- 浏览器使用两个按 Session / 上下文隔离的认证 Cookie，以及一个无认证能力的公开定位 Cookie；刷新不改定位，退出保留已失效的公开定位，避免迟到退出响应清掉新登录。
- 业务与刷新请求绑定发起时的 Session / 上下文版本；跨标签页切换身份时，旧请求在执行业务前被拒绝，页面重新加载完整身份。
- 服务集成使用真实 Redis，账户守卫集成使用真实 Mongo；单元 mock 结果不能替代对应集成证据。

## 测试步骤

| 编号 | 初态 / 输入差异 | 操作 |
| --- | --- | --- |
| C1 | 基础 / 边界；新设备会话 | 创建会话、重复创建相同 ID、枚举设备；校验数据库 TTL、摘要存储、原始创建时间和稳定 ID。 |
| C2 | 并发 / 异常；AT 临近到期 | 多缓存实例同时用同一 RT 刷新；丢弃首次响应后重试；携带新 AT / RT 再次请求刷新；窗口外重放已消费 RT，并提交随机无效 RT 对照。 |
| C3 | 撤销 / 上下文；独立会话副本 | 分别验证刷新与退出、改密、禁用、设备淘汰并发；切团队和 Root 代管；验证旧上下文 AT / RT 和在途请求归属。 |
| C4 | API / Cookie；本轮用户 | 真实 HTTP 登录、刷新、Access 缺失后的恢复及 Refresh-only 退出；校验双认证 Cookie 和公开定位 Cookie 属性、CSRF、方法限制、错误分类和无缓存；延迟旧认证错误响应。 |
| C5 | UI / 请求恢复；浏览器双页面 | 操作登录页进入认证页面；将 AT 调至阈值内，发并发业务请求；恢复前台、重载、断网再恢复；验证页内请求合并、跨标签幂等、取消、有限重试及 SSE 握手和输出后行为。 |
| C6 | Pro / CLI；本轮凭证 | Pro 登录和切团队经过 App 代理，验证多 Set-Cookie；CLI 登录、续约、并发进程、切团队、退出及凭据脱敏和持久化。 |
| C7 | 兼容 / 权限边界；隔离旧会话与 API Key | 旧 Session 按原期限调用；验证新旧会话混合计数和全部撤销；使用 RT 访问业务、AT 调刷新、公开 sessionId 冒充凭证；API Key 与 rootkey 路径对照。 |

## 预期结果

| 编号 | 必需断言 | 证据 |
| --- | --- | --- |
| C1 | 重复 ID 不覆盖记录；一条稳定 Session 算一个设备；只存 Token 摘要，生命周期边界正确；不清理本轮外记录。 | 真实 Redis 调用、字段脱敏快照及 TTL。 |
| C2 | 相同 RT 只产生一个后继，幂等重试返回同一凭证对；当前 AT 足够有效时不再次续期；超过边界不能刷新；确认重放撤销整会话，随机无效值不踢人。 | 多实例并发结果、代次集合、凭证相等性、撤销后实际鉴权。 |
| C3 | 撤销先提交则刷新失败，之后所有凭证均失效；普通续约不使改密授权失效，改密保留会话也废弃旧凭证；切团队不重置绝对上限，旧上下文不进入新团队。 | 真实服务和存储前后快照、并发时序和 Root 身份。 |
| C4 | 登录写入独立双认证 Cookie 和公开定位；Refresh 只用于指定会话接口，Access 失效不清新 Cookie；刷新未被 Access 鉴权拦住；非法来源和方法拒绝；网络 / Redis 故障不冒充凭证失效。 | 实际 HTTP 状态 / code / statusText、脱敏 Set-Cookie 属性和业务响应。 |
| C5 | 阈值内先刷新再发业务；同页共享刷新，跨标签不加锁仍一致；旧响应不误退出；原请求最多重试一次，取消后不发送；SSE 输出后不重提生成或扣费。 | 浏览器请求时序、页面观察、请求计数与实际生成 / 持久化副作用。 |
| C6 | Pro 代理完整转发两条 Cookie；CLI 安全保存并更新凭证对，可刷新会话不被本地旧过期检查拦截；并发更新不丢凭据，退出后均失效。 | 实际 Pro HTTP、CLI 命令结果和脱敏存储观察。 |
| C7 | 旧登录不被自动提升为长期 RT；混合计数 / 撤销正确；凭证用途互斥，知道 ID 不能认证；API Key / rootkey 原有认证语义不变。 | 真实兼容调用、设备精确集合及拒绝响应。 |
