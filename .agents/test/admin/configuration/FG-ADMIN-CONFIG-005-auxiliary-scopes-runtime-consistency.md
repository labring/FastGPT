---
case_version: 1
id: "FG-ADMIN-CONFIG-005"
title: "辅助配置 scope：发布、独立更新与真实运行消费"
business: "admin/configuration"
types: [api, ui, integration, e2e]
category: boundary
scenario: special
priority: P0
status: ready
tags: [instance-config, auxiliary-scopes, operations, pro-env, license, instance-id, model-status-probe, moderation-policy, 覆盖基础场景, 覆盖异常场景, 覆盖边界场景]
evidence: [response, ui, database, log, storage]
sources:
  - ".agents/design/common/admin-instance-config-env-boundary.md"
  - "packages/global/common/system/config/schema.ts"
  - "packages/global/common/system/config/scopes.ts"
  - "packages/global/common/system/config/proEnv.ts"
  - "packages/global/common/system/config/teamMode.ts"
  - "packages/global/common/system/config/modelStatus.ts"
  - "packages/global/openapi/admin/license/api.ts"
  - "packages/global/openapi/admin/system/inform/api.ts"
  - "packages/global/openapi/admin/system/model/status.ts"
  - "packages/global/openapi/core/plugin/admin/moderation/api.ts"
  - "packages/global/core/plugin/moderation/type.ts"
  - "packages/service/common/system/systemInstanceConfig/controller.ts"
  - "packages/service/common/system/systemInstanceConfig/polling.ts"
  - "packages/service/common/system/systemInstanceConfig/runtime.ts"
  - "packages/service/common/system/systemInstanceConfig/secrets.ts"
  - "packages/service/core/ai/modelStatus/service.ts"
  - "packages/service/core/ai/modelStatus/schema.ts"
  - "packages/service/core/plugin/moderation/service.ts"
  - "packages/service/core/plugin/moderation/entity.ts"
  - "packages/service/core/plugin/moderation/checker.ts"
  - "packages/service/core/workflow/dispatch/index.ts"
  - "projects/app/src/pages/api/admin/system/model/status/config.ts"
  - "projects/app/src/pages/api/admin/system/model/status/testWebhook.ts"
  - "projects/app/src/pages/api/admin/system/model/status/probe.ts"
  - "projects/app/src/pages/api/core/plugin/admin/moderation/policy.ts"
  - "projects/app/src/pages/api/proApi/[...path].ts"
  - "projects/app/src/pages/api/common/system/getInitData.ts"
  - "projects/app/src/service/common/system/cron.ts"
  - "projects/app/src/pageComponents/admin/config/ModelProvider.tsx"
  - "projects/app/src/pageComponents/model/ModelStatus/index.tsx"
  - "projects/app/src/web/core/ai/model/statusApi.ts"
  - "projects/app/src/web/admin/system/inform/api.ts"
  - "pro/admin/src/service/init.ts"
  - "pro/admin/src/service/common/system/config.ts"
  - "pro/admin/src/service/common/system/envConfig.ts"
  - "pro/admin/src/service/common/system/operations.ts"
  - "pro/admin/src/service/common/license/auth.ts"
  - "pro/admin/src/service/common/license/verify.ts"
  - "pro/admin/src/service/common/license/instanceId.ts"
  - "pro/admin/src/pages/api/admin/license/active.ts"
  - "pro/admin/src/pages/api/admin/license/auth.ts"
  - "pro/admin/src/pages/api/admin/license/instanceId.ts"
  - "pro/admin/src/pages/api/admin/system/inform/updateSystemModal.ts"
  - "pro/admin/src/pages/api/admin/system/inform/updateOperationalAd.ts"
  - "pro/admin/src/pages/api/admin/system/inform/updateActivityAd.ts"
  - "pro/admin/src/pages/api/support/user/inform/getSystemMsgModal.ts"
  - "pro/admin/src/pages/api/support/user/inform/getOperationalAd.ts"
  - "pro/admin/src/pages/api/support/user/inform/getActivityAd.ts"
  - "packages/service/common/system/systemInstanceConfig/frontend.ts"
  - "projects/app/src/web/support/user/login/utils.ts"
  - "projects/app/src/pageComponents/login/index.tsx"
  - "packages/service/support/user/account/password/service.ts"
  - "packages/global/common/system/config/frontendProjection.ts"
  - "pro/admin/src/service/support/user/account/cancellation/eligibility.ts"
  - "pro/admin/src/service/support/user/account/login/verification/service.ts"
  - "pro/admin/src/service/support/user/account/password/verification/service.ts"
  - "pro/admin/src/service/support/user/inform/sendMessage.ts"
  - "pro/admin/src/service/support/user/inform/templates/smsTemplates.ts"
  - "pro/admin/src/service/support/user/account/verification/wechat/service.ts"
  - "pro/admin/src/service/support/user/login/wx.ts"
  - "pro/admin/src/service/support/user/account/verification/oauth/providers/github.ts"
  - "pro/admin/src/service/support/user/account/verification/oauth/providers/google.ts"
  - "pro/admin/src/service/support/user/account/verification/oauth/providers/microsoft.ts"
  - "pro/admin/src/service/support/wecom/accessToken/suite.ts"
  - "pro/admin/src/service/support/wecom/controllers/pay.ts"
  - "pro/admin/src/service/support/wecom/const.ts"
  - "pro/admin/src/service/support/wecom/accessToken/provider.ts"
  - "pro/admin/src/service/support/wecom/controllers/invoice.ts"
  - "pro/admin/src/service/support/wecom/controllers/license.ts"
  - "pro/admin/src/service/support/wecom/handler/payment.ts"
  - "pro/admin/src/pages/api/support/wecom/suite/receive.ts"
  - "pro/admin/src/service/support/wallet/bill/pay/base.ts"
  - "pro/admin/src/pages/api/support/wallet/bill/create.ts"
  - "pro/admin/src/pages/api/support/wallet/bill/pay/updatePayment.ts"
  - "pro/admin/src/service/support/wallet/bill/pay/checkPayResult.ts"
routes:
  - "POST /api/admin/system/config/update"
  - "GET /api/common/system/getInitData"
  - "POST /api/proApi/admin/system/inform/updateSystemModal"
  - "POST /api/proApi/admin/system/inform/updateOperationalAd"
  - "POST /api/proApi/admin/system/inform/updateActivityAd"
  - "GET /api/proApi/support/user/inform/getSystemMsgModal"
  - "GET /api/proApi/support/user/inform/getOperationalAd"
  - "GET /api/proApi/support/user/inform/getActivityAd"
  - "GET /api/proApi/admin/license/auth"
  - "POST /api/proApi/admin/license/active"
  - "GET /api/proApi/admin/license/instanceId"
  - "GET /api/admin/system/model/status"
  - "PUT /api/admin/system/model/status/config"
  - "POST /api/admin/system/model/status/testWebhook"
  - "POST /api/admin/system/model/status/probe"
  - "GET /api/core/plugin/admin/moderation/policy"
  - "POST /api/core/plugin/admin/moderation/policy"
  - "POST /api/core/plugin/admin/moderation/config"
  - "POST /api/core/workflow/debug"
related:
  - "FG-ADMIN-CONFIG-001"
  - "FG-ADMIN-CONFIG-002"
  - "FG-ADMIN-CONFIG-003"
  - "FG-ADMIN-CONFIG-004"
  - "FG-TOOL-SYSTEM-PLUGIN-001"
automation: []
baseline: "897611e5cdd2b4d5617c5104d0d9bb5b9ebd8a6c"
---

# 辅助配置 scope：发布、独立更新与真实运行消费

## 用例简介

管理员维护公告、部署能力、授权和后台策略时，同集合内的辅助配置应与11个管理域组成一致快照，独立更新不能覆盖其他配置。通过真实保存入口、App/Pro重启和业务消费验证 operations、proEnv、license、instanceId、modelStatusProbe、moderationPolicy 六个 scope；commercial.subPlans 同时作为跨 scope 保留对照，不重复套餐字段归一化与插件安装用例。

## 前置准备

- 环境与版本：沿用本轮授权的 dev 环境，App 连接 Pro 且二者使用同一 Mongo/Redis；记录两个进程实际 commit、BASE_URL、Pro URL、License 模式和轮询/cron日志位置。需可单独重启本轮 Pro/App 并修改其 ENV，不停止其他任务。常规 License 场景使用普通RSA验签部署；Sangfor模式使用其既有专用激活流程，不能向普通 active 接口提交 .lic 内容冒充覆盖。
- 身份与隔离：root真实登录态和独立测试团队；所有公告、广告图片、Webhook、模型、App/chat、插件及文本带 RUN_ID。Pro routes 从 App `/api/proApi/` 代理真实转发至 Pro `/api/`；记录 HTTP status 与业务 code/data，前端静默降级空列表不算成功。
- 基线 D0：主库只读查询 `db.system_instance_configs.find({domain:{$in:["site","auth","security","feature","commercial","resource","performance","storage","vector","providers","subservice","proEnv","license","instanceId","modelStatusProbe","moderationPolicy","operations"]}})`，记录各 `_id/revision`、完整加密快照及缺失项。缺失scope由Schema默认合成，不要求强行生成17条文档；特别记录 commercial.subPlans、operations三子项、已启用审核插件及本轮模型状态记录起始时间。旧 systemconfigs 只做不再写入的对照。
- C1/C2夹具：准备两张本轮上传的独立头像对象及受控广告链接；保存可恢复的套餐副本，使用合法 `planDescriptionUrl` 作标识差异。Pro ENV矩阵使用 TEAM_MODE=single/multi/sync、LOGIN_2FA_ENABLED=true/false，sync对照使用本轮受控外部用户系统地址或明确未配置；保留其他Pro部署能力原值。
- C3/C4夹具：取得当前实例可验签、未过期的测试License原文与公钥配置，仅保存在仓库外受限文件；非法字符串用于拒绝对照。实例不匹配变体需要可验签但绑定另一测试instanceId的授权，没有该材料则仅该变体阻塞。不得为测试覆盖真实生产公钥或重新生成现有部署身份。
- C5夹具：受控Webhook A/B记录事件与Authorization是否匹配的布尔结果，绝不转发外部通知；模型消费使用已启用的零价受控模型M，能切换确定的成功/失败响应。若还有会真实外呼的其他启用模型，先取得本轮配置独占并记录/恢复它们，无法隔离时自动/手动全模型探测变体阻塞。需观察真实每分钟cron与5分钟探测边界，不导入内部函数伪造定时任务。
- C6夹具：复用关联插件用例准备的两个可实际调用、已配置的本轮审核插件P/Q，不重复市场安装覆盖；两者分别对RUN_ID标记词返回可区分的pass/block结果。使用本轮固定输出、无外部模型费用的工作流W，从真实workflow debug入口发起正常文本/标记词输入。没有可调用插件时，缺省策略读取/拒绝变体仍可执行，互斥与业务生效变体阻塞。
- 复位与清理：各行从D0开始，行内顺序承接，C4复用C3记录的身份。通过真实API恢复业务配置、关闭本轮自动探测/审核、还原ENV并重启；operations需要恢复原值及图片引用，不能误删共享图片。API无法恢复原本缺失scope时，仅在独占授权夹具对本轮写入做完整BSON比对后CAS清理，保留其他写者结果；revision不得回退。删除本轮模型/App/chat/插件/状态记录/图片并核对清单，保留失败证据。无法精确恢复则保留现场并说明，不盲目重放写请求。
- 快照与比较：遵循 FG-ADMIN-CONFIG-001 的加密 BSON类型保留、公共配置锁与精确 CAS约定，不能用普通 JSON往返替代恢复基线。Pro正常定时验签在长 UI/重启窗口可能只更新 license.revision/updatedAt；仅这两字段可单独记录单调变化，其他完整业务 BSON必须精确不变，不回滚正常验签结果。C3短非法激活窗口仍要求 license业务与 revision精确零写；遇并发验签则记录并重新安排可归因的窗口，不能自动放宽拒绝断言。
- 执行方式与条件：本例无自动化映射，AI执行真实HTTP/UI与只读Mongo核对，不接CI。每次保存后每250ms观察消费结果，正常环境等待≤5秒；进程启动先确认就绪。cron变体每秒轮询至下一个满足 `minute % 5 === 0` 的分钟边界后30秒（总上限6分钟），超时结合cron锁/日志判失败或环境阻塞。没有必需凭据、重启、对象存储、受控模型/插件或cron观测能力时逐变体记录阻塞，不能只读DB后整行通过。

- C7/C8 为账号/通知/支付的消费者协议增量，不改变 C1–C6 的真实 Dev API验收：只用私有完整快照、合成身份/证书/模板和不转发的 loopback HTTP/SMTP/TLS。导航、账号分类、持久化或缓存采用受控内存边界时逐项写明；SMTP使用合成CA且保留证书校验，OAuth/企微固定厂商域名只在 transport层映射本轮 receiver，未知目标拒绝。通知不向真实用户投递；支付只测合成 NOTPAY、签名/验签/解密，不提交真实订单、结算或余额变更。C7复用 FG-ADMIN-CONFIG-003/C9 已定义的短信重试分类，C8复用其C10支付宝证书协议，不重复宣称实际注销/计费事件覆盖。
- C7/C8清理：finally恢复进程快照、ENV mock与客户端 adapter，关闭 HTTP/SMTP/TLS server和agent，删除仅本轮 nonce 缓存键或销毁内存缓存；真实Dev登录态、root会话、账单、余额、公共配置与外部账户不变。没有受控transport或合成证书时相应变体阻塞，不用静态getter替代。
## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 基础/边界；D0，operations与套餐独占 | 用统一update的commercial item及专用 `subPlans/subPlansExpectedRevision` 保存套餐副本，只改planDescriptionUrl。依次通过三个Pro update入口保存systemMsgModal.content、operationalAdImage/link、activityAdImage/link，每次用三个前台GET读取并查询commercial/operations。再只更新公告，随后并发更新两种广告；最后逐一清空公告内容和广告图片。每次记录两域与其他15scope精确差集。 |
| C2 | 边界；D0，Pro可单独重启 | 先以single与2FA关闭启动Pro，读DB和登录态getInitData；同ENV再重启，比较revision。改为multi与2FA开启再重启，记录proEnv字段diff、App回读与版本标记；再测sync无外部用户系统、sync有本轮外部用户系统的两种状态。保存一个普通管理域字段并重启App，确认不会将旧auth.teamMode或App ENV反写proEnv；最后恢复ENV。 |
| C3 | 基础/拒绝；已有合法license D0 | 调用license/auth并记录App公开授权状态；用当前合法测试License调用active后回读。再分别提交空串、被篡改签名、可验签但绑定其他实例的License，每次检查业务拒绝及DB/授权状态。重新GET并分别重启Pro/App，确认原合法授权保持；不得将激活响应当作所有功能均获授权，按原functions/有效期核对。 |
| C4 | 边界；已记录instanceId，承接C3 | 并发真实GET instanceId 10次；完成一次成功及一次失败License操作、一次普通配置保存后再次读取；重启Pro/App后重读并查scope `_id/revision`。只核对既有身份稳定，不删除身份模拟首次安装，不复跑迁移或修改绑定字段。 |
| C5 | 基础/边界；模型状态页、Webhook与受控模型 | 在`/admin/resources/model`“模型状态→探测配置”填Webhook B/新Token草稿并点“测试Webhook”，随后取消；核对DB和重新打开的已存值。再PUT保存enabled/intervalMinutes=5/Webhook A与合成Token，调用不带草稿的testWebhook，再省略Token只改interval=10，最后用clearWebhookToken=true清空；验证interval=4/61及clear与非空Token同时提交被拒绝。另以受控M启用5分钟自动探测，观察真实cron写记录/告警；关闭后跨下一合法边界核对无新增自动记录；关闭时通过真实POST probe检查手动探测仍执行。 |
| C6 | 基础/边界；缺省或D0策略，P/Q可调用 | 缺失moderationPolicy时先GET并查库；POST完整disabled策略，再提交enabled=true但无activePluginId验证拒绝。分别启用P、切换Q，并发提交P/Q的策略请求，逐次读取策略与全部本地插件启用集合。策略设hooks.userInput=true、modelInput/finalOutput=false，用W的标记词/正常文本验证当前插件在userInput hook真正生效；关闭该hook重复，再关闭总开关重复。最后恢复D0的policy和插件状态。 |

| C7 | 边界；合成账号与通知协议，逐渠道独立复位 | 由生产登录组件/选择逻辑核对SSO标题、图标、自动跳转及root逃生入口，生产密码策略核对SSO用户禁用与普通身份对照；切换email.register与注销enabled执行真实guard/handler或eligibility。SMTP A/B分别使用明文与验证TLS，切换host/port/user/pass/secure后由真实Nodemailer发送至本轮sink；14种短信模板用互异标识经真实sendMessage分派到receiver。对WeChat/GitHub/Google/Microsoft执行真实provider授权/交换/身份返回，核对各自当前凭据与Microsoft tenant。 |
| C8 | 边界；本轮企微与微信支付协议，合成未支付状态 | 企微真实suite/provider/corp token链及cache类使用私有缓存，核对suite/corp、buyer、基础/高级版本与HMAC参数；用合成签名和AES回调核对有效/无效内容。微信支付对六配置字段做A/B，真实controller/SDK发送到owned协议服务，独立验证商户RSA签名、平台证书AES解密、notify地址、NOTPAY查询；对合法回调/伪造签名/错误AES分别验收。不调用最终账户结算入口。 |
## 预期结果

公共断言：成功入口同时满足HTTP/业务成功及对应消费结果；拒绝不能仅凭HTTP200识别。每次只允许目标scope及明确的业务副作用变化，其他scope、套餐、授权和身份不得被整份快照覆盖；save响应与消费快照分别留证。凭据不进入响应或日志，modelStatusProbe.webhookToken非空时存为`{secret:cipher}`，对外只返回webhookTokenConfigured。Pro ENV、License和instanceId不允许通过11管理域API直接修改；所有场景最终恢复D0或明确留下可追踪的本轮现场。

| 子场景 | 验证方式 | 特有预期 | 证据获取方式 |
| --- | --- | --- | --- |
| C1 | API + DB + storage | 套餐只存commercial.subPlans；operations仅一个domain文档，三项分别存于overrides.systemMsgModal/operationalAd/activityAd，更新任一项不丢兄弟项或套餐。每个成功操作对应revision递增，新id只改变目标子项；并发不同广告更新最终两项均保留，无Mongo路径冲突。清空某项后其前台GET不再展示内容，其余项仍原样可读；旧集合不新增写入。 | 每次update/前台GET、commercial与operations前后BSON差集、并发响应、图片存在性与引用。 |
| C2 | ENV + API + DB | 同ENV重启不改proEnv revision/updatedAt；有差异时仅变化字段写入且revision+1，App在轮询后feConfigs.teamMode/login2faEnabled一致。sync无外部用户系统时Pro/App统一降为single，具备外部系统时均为sync。普通管理保存/App重启不覆盖ProEnv，commercial.subPlans/operations及有效License保持。 | 每阶段ENV非敏感摘要、Pro启动日志、proEnv字段diff及revision、App getInitData/version、其他scope差集。 |
| C3 | API + DB + UI | 合法激活保存原文及已验签归一化data，Pro auth与App公开license/isPlus及functions一致；空串为400输入拒绝，签名/绑定无效为非成功业务响应（当前active验签拒绝为code500，不强行要求400）。非法激活不修改当前license BSON/revision、instanceId或已授权能力；之后正常读取与重启不清除原合法授权，也不从未验证的raw生成新能力。 | 脱敏激活/auth响应、有效期/能力等值布尔结果、license/instanceId差集、App回读与重启证据；不保存raw License/公钥文件内容。 |
| C4 | API + DB | 所有并发及重启后的instanceId相同且非空，与DB及License绑定一致；已有身份只读不递增revision，不新增第二个instanceId文档。普通配置与失败License激活不会生成替代身份；缺少绑定License时只验证稳定部分，绑定变体仍需材料。 | 10次响应与操作后/重启后响应、scope计数及`_id/revision`、License绑定比较布尔结果。 |
| C5 | UI + API + DB + model/Webhook | 草稿测试只向B依次发送model_status_error/recovered两事件，使用草稿Token但不写配置或revision；取消后恢复已存表单。保存后A/当前Token供无草稿测试与真实自动探测消费，省略Token保留原密文，显式清空后配置标志false且后续请求无Authorization；非法输入拒绝且scope不变。启用5分钟配置后真实cron在匹配边界产生M记录，关闭后无新增自动记录；手动probe即使关闭也可执行并生成M记录。告警失败/恢复需切换M确定状态，不能用模拟testWebhook事件代替自动告警证据。 | UI草稿/取消/保存网络、脱敏config/status响应、Token加密与保持布尔结果、M请求计数、按modelId/时间窗限定的model_status_probe_records、Webhook事件和cron锁/日志。 |
| C6 | API + workflow + DB | 缺失scope时GET返回默认disabled而不写库；保存后policy只写system_instance_configs.moderationPolicy，不写旧system_configs。未选择插件开启被拒绝、policy和插件均无变化；P/Q切换及并发最终最多一个非deleted插件enabled=true，policy.activePluginId与实际启用插件一致。W的标记词随当前P/Q裁决通过/拦截，关闭userInput hook或总开关后该入口不再送审，不能只凭后台check测试证明策略已生效。 | policy/config响应、scope与全部插件启用集合、并发结果、W请求/输出/节点审核记录、本轮插件调用计数、system_moderation_records按App/chat/requestId查询及恢复清单。 |
| C7 | component/policy + native SMTP/OAuth/SMS protocol | SSO显示和导航按当前配置，禁用SSO密码策略不影响普通身份；register/注销关闭在投递/写入前拒绝，single版注销限制仍保持。SMTP实际连接/认证/MIME随A/B变化且TLS验证未关闭；每个短信事件使用对应独特模板，英文按既定中文回退。四OAuth provider分别在请求URL/header/body消费当前配置，返回确定身份；旧凭据不抢占。 | DOM/导航与真实policy断言、SMTP握手/认证匹配布尔/MIME、14模板分派请求、OAuth交换/身份结果；区分组件/内存边界/原生协议，不宣称新Dev登录/改密/注销、真实邮件短信、第三方授权或全部计费事件触发。 |
| C8 | native HTTP + real cryptography + controlled cache | 企微各token层和suite/corp/buyer/version/paySecret使用当前独特值，签名/AES有效分支成功、篡改拒绝；不得用一个token接口代替其他字段消费。微信六字段改变实际SDK请求/签名/通知参数，平台证书可解密并独立验签；NOTPAY保持未支付，伪造签名和错误AES拒绝。 | 合成协议的逐字段请求匹配、独立密码学断言、NOTPAY结果和owned缓存清理；缓存为内存时注明，不声称真实企微租户动作、真实支付回调HTTP入站、账单结算/余额变化或厂商可用性。 |
