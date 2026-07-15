# 身份验证组件首轮接入开发文档

状态：已完成（本轮范围）  
上游方案：`/Users/sealos/Desktop/docs/账号注销/身份验证组件技术方案.md`  
范围：登录、注册、找回密码

## 1. 本轮目标

按上游方案把现有认证代码拆成“验证材料 create/consume、可信身份、业务编排”三层，并在不改变公开成功响应的前提下接入：

- 密码登录；
- 微信扫码登录；
- GitHub、Google、Microsoft、Wecom、SSO 登录；
- 邮箱或手机号验证码注册；
- 邮箱或手机号验证码找回密码。

## 2. 明确不做

- 修改密码、过期密码重置；
- 用户或团队联系方式绑定；
- 账号注销及其它敏感业务验证分派；
- fastLogin 下线；
- `{ key, type }` 唯一索引上线和生产数据清理；
- 尚无发布条件的 SSO Provider 协议升级。

未纳入范围的旧调用方继续使用旧入口。只有全部旧调用方迁移完成后，后续需求才能删除旧 `support/user/auth` 路径。

## 3. 兼容约束

1. `auth_codes` collection、已有 type 值和公开路由保持不变。
2. 登录成功响应仍为 `{ user, token }`，Cookie、Session、推广转化和登录埋点保持原成功时序。
3. 注册和找回密码的请求及成功响应保持不变。
4. 迁移后的材料读取必须显式检查 `expiredTime > now`，消费使用 `findOneAndDelete`。
5. 普通验证码采用 upsert，使同一账号和 scene 只有最新验证码有效；本轮不直接创建唯一索引。
6. 验证组件不创建用户、团队、Session、Cookie，也不写业务埋点。
7. API 边界统一使用 global Zod schema 和 `parseApiInput`；Provider 响应在内部用普通 schema 解析。
8. 主仓和 `pro` 子模块配套改动；保留用户已移动的子模块基线，不回退指针。
9. 微信 callback token 沿用既有源码常量 `WX_AUTH_TOKEN`，后台只配置 AppID 和 AppSecret，不新增 token 配置入口。

## 4. 目标调用关系

```text
API
  -> AccountVerification.create/consume
  -> Local/External/Contact identity
  -> 登录、注册或找回密码应用编排
  -> Session/Cookie/track
```

材料层位于 `packages/service/support/user/account/verification/`，前后端共享契约位于 `packages/global/support/user/account/verification/`。Pro Provider 实现位于 `pro/admin/src/service/support/user/account/verification/`。

## 5. 发布策略

- 先提交并验证 Pro 代码，再更新主仓共享包、App 和子模块指针。
- OAuth V2 需要服务端 create state 与前端 callback 同步切换，不允许长期兼容可选 state。
- Admin 调用 SSO 获取授权地址时始终传入服务端生成的 state，回调仍必须携带并消费该 state。
- SSO 授权响应缺少 `oauthVerificationV2` 时按已能透传 state 的旧协议兼容；仅当该字段显式为 `false` 时拒绝登录。无法回传 state 的 Provider 仍会在回调校验阶段失败，不放宽安全校验。
- 唯一索引必须在生产重复数据 dry-run/清理后单独发布，本轮 schema 只保留非唯一索引。

## 6. TODO

- [x] 阅读上游技术方案、仓库规范并盘点主仓/Pro 现有调用方。
- [x] 增加共享 method、capabilities、identity scene schema 与 username resolver。
- [x] 增加 verification material schema/entity/service，覆盖显式过期与原子消费。
- [x] 实现 PasswordAccountVerification 和 loginLocalAccount，迁移密码登录 API。
- [x] 实现 CaptchaChallengeService、CodeAccountVerification，迁移发送验证码、注册和找回密码 API。
- [x] 实现 WechatAccountVerification、OAuth 基类与 Provider adapter。
- [x] 实现 loginExternalAccount，迁移微信/OAuth 登录 API。
- [x] 前端 OAuth 改为服务端 create state，callback 必填 state。
- [x] 补 resolver、材料、密码、验证码、Provider 和 API 定向测试。
- [x] 运行 Global/Service/App/Admin 定向测试与 App/Admin typecheck。
- [x] 最终运行 lint、仓库全量测试和 `git diff --check`。

## 7. 验收重点

- 验证材料过期后即使 TTL 尚未清理也不能消费；并发消费最多一个成功。
- 密码错误和用户不存在保持统一错误；Wecom 仍不能通过密码登录创建 Session。
- 注册与找回密码验证码 scene 不可串用，重发后旧码失效。
- 微信同一 scene 最多创建一个登录 Session。
- OAuth state 短期、一次性，并绑定 Provider 与 callback；第三方 token/secret 不进入日志或响应。
- 外部登录拒绝 forbidden 用户，同时保持既有用户创建、团队和联系方式行为。

## 8. 最终验证

- `TURBO_CONCURRENCY=1 pnpm test`：App、Global、Admin、Service 四个 workspace 全部通过，共 6312 个测试通过；Service 按既有配置跳过 35 个测试。
- `pnpm --filter @fastgpt/sso test`：5 个测试文件、9 个测试全部通过。
- `pnpm --filter @fastgpt/app typecheck`、`pnpm --filter @fastgpt/admin typecheck`：通过。
- `pnpm --filter @fastgpt/sso build`：通过；仅保留第三方 `@protobufjs/inquire` 的 direct-eval 构建警告。
- 本次变更文件定向 ESLint：0 error、13 warning；warning 均为既有 React Hook Form、未使用变量或表达式风格告警。
- `git diff --check`、`git -C pro diff --check`：通过。

仓库级 `pnpm lint` 仍受既有门禁问题阻断：`@fastgpt/marketplace` 使用当前 Next.js 已不支持的 `next lint` 命令；单独执行 App/Admin 全量 lint 还会分别命中 176/230 个范围外历史错误。本轮没有扩大范围修复这些基线问题，以定向 ESLint 结果作为本次改动的 lint 证据。
