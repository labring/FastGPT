---
case_version: 1
id: "FG-ADMIN-CONFIG-002"
title: "Admin 配置页面：跨域保存、冲突恢复与动态菜单"
business: "admin/configuration"
types:
  - "ui"
  - "e2e"
category: "boundary"
scenario: "special"
priority: "P1"
status: "ready"
tags:
  - "instance-config"
  - "admin-ui"
  - "dynamic-menu"
  - "edition-boundary"
  - "saas-admin-config"
  - "revision-conflict"
  - "覆盖基础场景"
  - "覆盖异常场景"
  - "覆盖边界场景"
evidence:
  - "ui"
  - "response"
  - "database"
  - "storage"
sources:
  - "projects/app/src/pages/admin/settings/core.tsx"
  - "projects/app/src/pages/admin/settings/site.tsx"
  - "projects/app/src/pages/admin/settings/feature.tsx"
  - "projects/app/src/pages/admin/settings/auth.tsx"
  - "projects/app/src/pages/admin/settings/security.tsx"
  - "projects/app/src/pages/admin/settings/limits.tsx"
  - "projects/app/src/pages/admin/settings/providers.tsx"
  - "projects/app/src/pages/admin/settings/pay.tsx"
  - "projects/app/src/pages/admin/subservice/code-sandbox.tsx"
  - "projects/app/src/pages/admin/subservice/mcp.tsx"
  - "projects/app/src/pages/admin/subservice/agent-sandbox.tsx"
  - "projects/app/src/pageComponents/admin/settings/core/index.tsx"
  - "projects/app/src/pageComponents/admin/settings/providers/index.tsx"
  - "projects/app/src/pageComponents/admin/settings/AdminSecretInput.tsx"
  - "projects/app/src/components/common/secret/SecretValueInput.tsx"
  - "packages/service/common/system/systemInstanceConfig/secrets.ts"
  - ".agents/design/common/admin-instance-config-env-boundary.md"
  - "projects/app/src/pageComponents/admin/settings/site/index.tsx"
  - "projects/app/src/pageComponents/admin/settings/commercial/index.tsx"
  - "projects/app/src/pageComponents/admin/settings/commercial/PlansSettingSection.tsx"
  - "projects/app/src/pageComponents/admin/subservice/mcp/index.tsx"
  - "projects/app/src/pageComponents/admin/useAdminPermission.ts"
  - "projects/app/src/pageComponents/admin/useAdminMenu.ts"
  - "projects/app/src/pageComponents/admin/utils.ts"
  - "projects/app/src/pageComponents/admin/AdminContainer.tsx"
  - "projects/app/src/web/common/system/useDomainConfig.ts"
  - "projects/app/src/web/common/system/useAdminConfigSaveRequest.ts"
  - "projects/app/src/service/common/system/syncSiteAvatarLifecycle.ts"
  - "packages/global/common/system/config/pageFields.ts"
  - "packages/global/common/system/config/frontendProjection.ts"
  - "packages/global/common/system/config/registry.ts"
  - "packages/global/common/system/config/permission.ts"
  - "projects/app/src/service/common/system/index.ts"
routes:
  - "GET /api/admin/system/config/get"
  - "POST /api/admin/system/config/update"
  - "GET /api/common/system/getInitData"
related:
  - "FG-ADMIN-CONFIG-001"
  - "FG-ADMIN-CONFIG-003"
  - "FG-ADMIN-CONFIG-004"
baseline: "afc92e5f5d8cd3978e5d3865a5770119e00908da"
---

# Admin 配置页面：跨域保存、冲突恢复与动态菜单

## 用例简介

管理员在新版配置中心修改站点、核心策略、商业套餐或子服务配置时，页面应按版本与可见控件构造局部修改、保留未展示的嵌套值和敏感值，并在 revision 冲突时提示刷新而不是静默覆盖。菜单需要根据部署版本、SaaS 展示开关和 License 状态自动隐藏无可见字段的页面及空父级，不能留下可点击但无内容的入口。

## 前置准备

- 环境与版本：商业版部署 B 设置 `PRO_URL` 且 License 处于有效状态，`ENABLE_SAAS_ADMIN_CONFIG=false`；准备同一实例切换 `ENABLE_SAAS_ADMIN_CONFIG=true` 的重启能力。社区版部署 A 不设置 `PRO_URL`。再准备一个商业版但 License 未激活/已过期的实例 C（或同一独占实例分阶段切换，记录每阶段环境和重启）。B 的 License 需含支付能力；providers 入口另由已有非空外部提供商变量列表决定。
- 身份与权限：root 账号登录三个实例；另有一个非 root 成员确认 `/admin/*` 会被重定向到个人中心。浏览器使用真实 Cookie，不使用接口伪造 root。
- 测试数据：核心页记录 site/providers/auth/feature/storage 五域当前 revision；站点页准备两张可上传图片 A/B，并允许把 A 同时设为 favicon 和导航项头像；支付配置页准备一份可读取的套餐配置；core 页的文档解析区准备一个已保存密钥及合法 URL；记录 `system_instance_configs` 的 commercial revision、`overrides.subPlans` 与旧 systemconfigs 只读快照。准备可恢复的已有非空外部提供商变量夹具以覆盖 providers 页面；新实例空列表不通过 API 重建该弃用功能。
- 复位约定：C2 保存后通过页面或 API 恢复 D0；C3 使用独立站点/公共存储桶并记录对象 URL，避免影响真实品牌资源；C6 在本轮 dev 实例注入只影响套餐读取的可控失败，成功路径保存前记录 commercial 套餐快照。
- 验证能力：浏览器可观察侧栏菜单、页面字段、Toast 和网络请求；Mongo 只读查询 `system_instance_configs`（包括 commercial.subPlans）及旧 `systemconfigs` 对照；对象存储可查询 favicon/navbar 头像对象是否存在。
- 阻塞项：C3 若不慎删除共享测试图片会影响其他页面，必须使用本次 run 专属对象；后台生命周期失败分支在本轮独立实例中使用仅阻断 TTL 排程的数据库权限/受控转发故障注入，保存提交必须不受影响；缺少该注入能力时明确记录相应变体阻塞。C6c 需要在有效 License 的支付页中仅拦截 `/proApi/admin/system/getConfig` 读取并令其失败，保存入口保持真实可达；不再通过未激活 License 绕过支付页门禁。C9 需要未激活 License 的商业版实例，无法准备时记录该项阻塞。

- 当前行为约定：商业版登录防护字段存于 security 域，auth 页一次事务提交 auth/security；社区版 auth 页整体隐藏，密码过期/登录限流/会话数固定为 null/10/10。teamMode 只来自 Pro ENV，不在任何配置表单；图片保存使用独立复制对象并在失去全部引用后延迟回收，测试不要求立即物理删除。敏感凭据以“已配置”状态展示，编辑时使用空草稿，确认后才替换；取消编辑不改变原值。
- 执行入口：本例尚无完整 Playwright 自动化映射，C1–C10 由 AI 操作真实页面并核对网络/数据库证据。缺少历史 providers 夹具、生命周期故障注入或 License 切换能力，仅阻塞对应变体，不能删除验收项。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 基础；商业版 B、D0 | 依次打开 `/admin/settings/core`、`/admin/settings/site`、`/admin/settings/feature`、`/admin/settings/auth`、`/admin/settings/security`、`/admin/settings/limits`、`/admin/settings/pay` 和 `/admin/subservice/code-sandbox`、`/admin/subservice/mcp`、`/admin/subservice/agent-sandbox`。逐页记录可见字段、是否报错、敏感字段配置状态；不改值直接保存一次。`/admin/settings/providers` 分为空列表时入口隐藏/直达受限、已有非空历史列表时可见并可保存两种变体，分别记录。 |
| C2 | 基础；core 页 D0 | 在核心配置页修改 `site.publicUrl`、`feature.multipleDataToBase64`、`storage.downloadMode`（改为 short-proxy 或当前 vendor 可用的合法模式），并修改文档解析 URL 或 SMTP 中一个可见非敏感字段；记录对应标签与控件。保存并刷新页面，核对 site/providers/auth/feature/storage 五域 revision 及未修改字段。确认核心页无 teamMode/openApiPrefix 控件；openApiPrefix 归站点页。 |
| C3 | 边界；site 页 D0，上传 A/B | 3a：上传 A，设为 favicon，并在导航项使用头像 A，保存。3b：仅把 favicon 改为 B，保存。3c：清空 favicon 并删除引用 A 的导航项，保存。每步记录 API 返回的独立复制对象 URL、S3 对象、TTL 和 DB 引用；3c 后仅对本轮已记录对象将 TTL 设为到期并触发真实清理任务（不等待自然 24h），核对无引用对象回收及仍被引用对象保留。 |
| C4 | 边界；core 文档解析区已有密钥 | 打开 `/admin/settings/core` 的文档解析区，确认已保存密钥呈“已配置”状态；只改 URL 保存。点击密钥编辑，输入替换草稿后取消，再保存；随后重新编辑空草稿并点击确认，保存。最后填写新合成密钥并确认保存，刷新核对状态。比较各步请求、DB 密文与配置路径标记。 |
| C5 | 异常；auth 页两标签页 revision=r | 标签页 1 修改 `security.maxLoginSession` 并保存；标签页 2 仍用旧 revision 修改另一字段并保存。记录标签页 2 的 Toast、网络响应、当前草稿和 revision；再按提示手动刷新页面，重新编辑并保存。 |
| C6 | 基础/异常；pay 页 D0 | 6a：修改一个合法套餐字段并保存，记录 commercial revision 与 `overrides.subPlans`。6b：恢复 D0 后，把套餐必填项改成页面校验拒绝的值并保存，记录是否发出请求、是否有成功 Toast。6c：在 License 有效的商业版实例只阻断套餐 getConfig 读取，确认套餐区读取失败；修改支付配置并保存。 |
| C7 | 边界；社区版 A | 登录 root，记录侧栏一级/二级菜单；打开仍可见的配置页；特别检查 `/admin/settings/site`、`/admin/settings/feature`、`/admin/settings/auth`、`/admin/settings/pay` 和三项子服务入口；直接访问隐藏路由核对门禁，记录 core/security/limits 仍可用。 |
| C8 | 边界；商业版 B，SaaS 开关两种状态 | 8a：`ENABLE_SAAS_ADMIN_CONFIG=false` 打开 pay、auth、subservice 页面，记录 coupon/discount/payForm/freeClean 和企微服务商字段是否出现。8b：重启为 true 后重复记录。 |
| C9 | 边界；商业版实例 C，License 未激活/过期 | 访问 `/admin`，记录默认落地页和侧栏；再直接打开普通配置页、`/admin/settings/pay` 和一个商业业务页，观察是否被重定向/拦截。 |
| C10 | 基础；pay 页 D0，所有支付渠道未配置 | 在支付配置页只填写对公转账说明并保存；调用 `GET /api/common/system/getInitData` 并刷新前台支付入口。再清空该说明并保存，重复读取。 |

## 预期结果

公共断言：页面只产生当前版本允许的修改，隐藏字段可从既有 overrides 合并保留，不将隐藏字段的默认值当新修改提交，保存请求携带各 domain 当前 revision；成功 Toast 为 `保存配置成功`，失败不得出现成功 Toast。revision 冲突只提示保留草稿并手动刷新，不自动 refetch、不静默替换用户正在编辑的表单。除用户明确清空的字段外，其他 overrides、敏感值和未展示的 SaaS 字段必须保持原值。菜单按字段可见数自动推导，父级没有任何可见子项时整体隐藏。

| 子场景 | 验证方式 | 特有预期 | 证据获取方式 |
| --- | --- | --- | --- |
| C1 | UI + response | 商业版基线下列出的页面均正常渲染且无 500；字段值与 GET 的 effectiveConfig 一致（core 的 publicUrl 为空时先显示当前浏览器 origin 草稿，只有保存后才成为 DB 配置），敏感字段不显示明文/密文/掩码，只显示“已配置”状态，GET 和保存响应不含敏感叶子；未改值保存仍返回成功，且只递增该页涉及 domain 的 revision。providers 页空列表时应隐藏且直接访问受限；历史非空列表时应可编辑，清空最后一项保存后入口同步关闭且 API 不得重新新增。其余页面如未出现，记录是版本、SaaS、License 还是历史状态导致，并核对对应变体，不能当作通过。 | 页面截图/可访问性树、每页网络请求与 DB revision。 |
| C2 | UI + response + DB | 一次 update 按 site/providers/auth/feature/storage 顺序提交五个 item，各域 revision+1；未修改的嵌套字段、SMTP 注册开关、密钥与隐藏价格保留；刷新后编辑值回显；无 auth.teamMode 写入、无部分 domain 半写。 | 五个 update item 的响应、五个 domain 文档、core 控件标签与刷新结果。 |
| C3 | UI + DB + storage | 3a：A 被引用，TTL 移除；3b：B 成为新 favicon 并移除 TTL，A 因仍被导航项引用不得删除；3c：A/B 的独立复制对象不再被引用后写入约 24 小时延迟删除 TTL，当前仍存在，DB 中 favicon 为空/导航项已移除；随后仅对本轮对象执行到期清理，确认无引用对象被回收。若注入后台 TTL 排程失败，保存仍成功、页面收到成功 Toast，服务日志记录生命周期失败；不能因此回滚已保存配置。 | DB 引用集合、S3 对象存在性、保存响应和错误日志。 |
| C4 | UI + DB | 改 URL 或取消替换草稿时，请求省略敏感叶子，DB 原密文不变且保持已配置；确认空草稿才提交空串并清空，configuredSecretKeys 移除该路径；确认新字符串才加密替换并恢复已配置。GET/保存响应均不回传敏感值；进程内解密比较正确，报告只保留布尔结果。 | providers 文档的加密形态/等值布尔结果、编辑/取消/确认截图、脱敏 update 请求及响应。 |
| C5 | UI + response + DB | 标签页 2 收到 warning Toast `配置已被他人修改，请先保留当前修改，再刷新页面重新编辑并保存。`；不自动 refetch、不自动更新 revision，标签页 2 的草稿保持可见，DB 只有标签页 1 的结果。手动刷新后表单显示标签页 1 的最新值，用户重新编辑后可用新 revision 成功保存；刷新前不得把旧草稿静默写入。 | 两个标签页截图、update 409 响应、刷新前后表单值、DB revision。 |
| C6 | UI + response + DB | 6a：commercial revision+1，`commercial.overrides.subPlans` 为提交后的嵌套存储形状，旧 systemconfigs 不新增/修改。6b：页面校验失败时不发 update 请求、不出现成功 Toast，commercial 与旧集合均不变。6c：套餐未读取成功时保存请求不带 `subPlans/subPlansExpectedRevision`，支付配置保存成功且同文档旧 subPlans 不变；不得把读取失败写成清空套餐。 | 网络请求列表、Toast、commercial 文档、旧 systemconfigs 前后快照及只读失败注入记录。 |
| C7 | UI | 社区版菜单保留 系统概览（License）、版本升级、系统资源（模型/工具）和系统配置中至少有一个可见字段的页面；隐藏数据面板、运营管理、用户与团队、商业化、应用模板、支付配置和审计日志；子服务分组同时保留 Code Sandbox、Agent Sandbox、MCP SSE 服务。site/feature/auth/pay 页面均隐藏且不能直接进入；core/security/limits 仍可进入，providers 仅按允许版本及已有历史列表决定；不出现空父级。 | 侧栏文本/层级截图与页面路由。 |
| C8 | UI | 8a：pay 页因支付通道字段仍可见，但 coupon/discount/payForm/freeClean 控件不出现；auth 页企微服务商凭据字段不出现；subservice（含 mcp）页面仍可见。8b：上述 SaaS 运营字段出现，页面无空白/布局断裂。隐藏只影响展示，不能据此断言 API 拒绝这些字段；API 边界由 FG-ADMIN-CONFIG-001 验证。 | 两状态页面截图与字段列表。 |
| C9 | UI | 默认落到 `/admin/license`；数据面板、用户与团队、应用/知识库管理、商业化业务页、审计日志被隐藏；普通配置页、子服务页、系统模型/工具、版本升级仍可进入；支付配置属于商业化分组，未激活/过期时菜单隐藏且直接访问同样被拦截。不得用普通配置页规则绕过支付页和商业业务页授权。 | 访问 `/admin` 的落地 URL、侧栏和页面响应。 |
| C10 | API + DB + UI | 保存对公说明后 `feConfigs.show_pay=true`、`payConfig.bank=true`，前台出现支付入口；清空后 `show_pay=false`、bank=false，入口消失。投影必须来自当前 commercial 实例配置而不是旧 `feConfigs.payConfig`；微信/支付宝字段删除后对应入口也不能残留。 | `getInitData` 响应、支付页/前台入口、commercial 文档。 |
