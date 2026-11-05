# 应用 Key 脚本配置

第三阶段使用现有临时报告及 `pnpm test:cases`，仅按需手动执行，不接入 CI 或默认测试。

| 用例 | Node 完整执行项 | 其他执行项 |
| --- | --- | --- |
| FG-PERMISSION-RESOURCE-002 | A1–A6 | A3 使用真实服务进程与 Mongo，其他项通过 HTTP |
| FG-INTEGRATION-OPENAPI-002 | M1–M7 | M1/M5 在 Node 入口中启动无头 Playwright，操作真实页面 |
| FG-CHAT-HISTORY-FEEDBACK-003 | D1–D7 | D4 为真实 HTTP gate 与 SSE，D5/S3/Sandbox 使用真实服务 |

## 准备

复用 `support/fixtures.example.json` 的版本、入口、主库/日志库、私有 marker、服务环境文件及角色配置。`actors.owner/A/B/N` 需要本次真实登录态，A/B 还要有效个人 Key；A/B 均为普通 active 成员。管理用例中 actors.B 对应管理员 M；脚本由独立 owner 持有应用，再给 A/B 管理权限，因此两者都不依赖 owner 身份通过管理断言。每个子场景自动建立独立的 W/X，需跨团队时另建真实第二团队、用户、应用与登录态。

只读凭证不能完成这些用例的权限/历史夹具准备。写连接必须指向 `fg_it_*` 私有库并匹配环境 ID/nonce；不接受仅 `isolated:true` 的共享开发库。不会查找默认浏览器 Cookie，也不会读取生产凭证。

专用环境可复用已配置插件服务的实际 dev 环境文件：

```bash
node .agents/test/support/environment.mjs --source-env /实际开发环境/.env.local \
  --mongo-binary /实际路径/mongod --port 3107 --profile app-key \
  --directory /仓库外/本轮私有目录
```

此 profile 不生成历史列表用例的 201 份无关数据，设置专用实例 `OPENAPI_KEY_MAX_COUNT=3`。默认不宣称商业版已启用；需要商业限制或 Pro 图表时另准备连接同一私有 Mongo/Redis 的真实 Pro，并核实被测版本。复制开发实例授权配置时，License 和 instanceId 必须配套，由 Pro 实际验签，不能只依赖快照中的 isPlus。环境目录包含私有 `secrets.json` 和 `fixture.json`，不作为报告证据。执行时在父进程按该 secrets 文件安全注入环境变量，不将其内容打印或提交。

额外配置位于 fixture.appKeys：

- `templateAppId`：私有库内已发布的固定回显工作流；`echoTemplate` 同时含问题和 userId。模板应开启实际文件上传，脚本为新应用再次发布，不修改共享应用。
- `maxKeyCount`：已在该实例实际生效的数量上限，范围 3～10；M4/M6 逐条验证真实上限，不 mock 计数。
- `commercial:true`：仅在已核实商业版有效期/额度限制时填写，用于 A6；无效、过期、超额都调用真实 completions 和 health。
- `datasetId/skillId`：可选的真实同团队资源，A 能读取知识库，owner 能访问 Skill 调试。省略时，A4 在已验证的私有库用当前 Mongo Model 创建最小真实资源、授予 A 读取权限，先跑正向对照再检查应用 Key 拒绝，结束精确回收资源及 ACL；预置资源由提供方回收。
- `apps.historySwitch`、`gate`、`redis`：D4 复用既有 HTTP gate 模板；不以 sleep 或单纯 stop 成功替代真实生成中、恢复流和后台终态。

D2 必须有真实日志库及 Pro 图表接口。D5/D6 必须有可上传下载的真实 S3；D5 还需真实 App Sandbox。文件逐字节比较 SHA-256；签名 URL 和 Key 不写入公开证据。沙盒产品态通过本轮应用版本的 capability 夹具切换，不能借网络断开冒充关闭产品态。

## 运行与清理

先使用 report.mjs init 选择本轮完整子场景，填写实际入口和部署版本，再执行 `pnpm test:cases --report <HTML> --timeout-ms 1800000`。可用 --plan 检查脚本与 AI 分工。每个结果只代表实际执行的选中项；配置不足记录 blocked，不把单测、准备成功或退出码替代业务通过。

每项在 finally 中按创建清单删除本轮应用及 Key，等待会话、消息、统计和绑定 Key 回收；还原原团队 ACL。跨团队会话通过该团队真实登录态删除，之后回收测试账号和团队。S3 用原有效签名验证对象已不可读取；Sandbox 随正常应用删除流程回收，再由私有服务进程只读检查远端 getInfo 为空及本地实例记录为零。清理失败使该项无法通过，保留失败证据再由 AI 复核；不自动重试写请求。

服务子进程仅支持认证开关检查、A4 资源准备及 Sandbox 清理验证三个固定操作，重新核验独立库 marker，凭证从 stdin 进入，不写命令行、进程输出或报告。UI 与服务型断言沿用原用例，不能只调用接口就标记 UI 子场景通过。
