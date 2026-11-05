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
status: "draft"
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
  - "projects/app/src/pages/admin/subservice/plugin.tsx"
  - "projects/app/src/pages/admin/subservice/code-sandbox.tsx"
  - "projects/app/src/pages/admin/subservice/ai-proxy.tsx"
  - "projects/app/src/pages/admin/subservice/mcp.tsx"
  - "projects/app/src/pages/admin/subservice/agent-sandbox.tsx"
  - "projects/app/src/pageComponents/admin/settings/core/index.tsx"
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
baseline: "27d88d71f44614d89aef7d7d04fe65431ea19288"
---

# Admin 配置页面：跨域保存、冲突恢复与动态菜单

## 用例简介

管理员在新版配置中心修改站点、核心策略、商业套餐或子服务配置时，页面应只提交当前可见字段、保留未展示的嵌套值和敏感值，并在 revision 冲突时提示刷新而不是静默覆盖。菜单需要根据部署版本、SaaS 展示开关和 License 状态自动隐藏无可见字段的页面及空父级，不能留下可点击但无内容的入口。

## 前置准备

- 环境与版本：商业版部署 B 设置 `PRO_URL` 且 License 处于有效状态，`ENABLE_SAAS_ADMIN_CONFIG=false`；准备同一实例切换 `ENABLE_SAAS_ADMIN_CONFIG=true` 的重启能力。社区版部署 A 不设置 `PRO_URL`。再准备一个商业版但 License 未激活/已过期的实例 C（或可切换 License 的实例）。
- 身份与权限：root 账号登录三个实例；另有一个非 root 成员确认 `/admin/*` 会被重定向到个人中心。浏览器使用真实 Cookie，不使用接口伪造 root。
- 测试数据：核心页记录 auth/feature/storage/site 当前 revision；站点页准备两张可上传图片 A/B，并允许把 A 同时设为 favicon 和导航项头像；支付配置页准备一份可读取的套餐配置；providers 页准备一个已保存密钥；记录 `system_configs` 中 fastgpt 最新文档的 createTime 和 subPlans。
- 复位约定：C2 保存后通过页面或 API 恢复 D0；C3 使用独立站点/公共存储桶并记录对象 URL，避免影响真实品牌资源；C6 在独立实例执行套餐失败路径，成功路径保存前记录旧套餐快照。
- 验证能力：浏览器可观察侧栏菜单、页面字段、Toast 和网络请求；Mongo 只读查询 `system_instance_configs` 与 `system_configs`；对象存储可查询 favicon/navbar 头像对象是否存在。
- 阻塞项：C3 若不慎删除共享测试图片会影响其他页面，必须使用本次 run 专属对象；S3 删除失败注入需要可控制对象存储权限，缺失时该失败分支阻塞。C9 需要未激活 License 的商业版实例，无法准备时保持 draft。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 基础；商业版 B、D0 | 依次打开 `/admin/settings/core`、`site`、`feature`、`auth`、`security`、`limits`、`providers`、`pay` 和 `/admin/subservice/plugin`、`code-sandbox`、`ai-proxy`、`mcp`、`agent-sandbox`。逐页记录可见字段、是否报错、敏感字段显示值；不改值直接保存一次。 |
| C2 | 基础；core 页 D0 | 在核心配置页修改 teamMode、`feature.multipleDataToBase64`、`storage.downloadMode`（改为 short-proxy 或当前 vendor 可用的合法模式）、`site.openApiPrefix` 四项，保存并刷新页面；再查四个 domain 的 revision 和未修改字段。 |
| C3 | 边界；site 页 D0，上传 A/B | 3a：上传 A，设为 favicon，并在导航项使用头像 A，保存。3b：仅把 favicon 改为 B，保存。3c：清空 favicon 并删除引用 A 的导航项，保存。每步记录 S3 对象是否存在及 DB 引用。 |
| C4 | 边界；providers 页已有密钥 | 打开 providers 页，确认密钥显示为掩码；只改 URL 保存。再次打开并把密钥输入框显式清空后保存。比较 DB 密钥和页面回显。 |
| C5 | 异常；auth 页两标签页 revision=r | 标签页 1 修改 `auth.maxLoginSession` 并保存；标签页 2 仍用旧 revision 修改另一字段并保存。记录标签页 2 的 Toast、网络响应、当前草稿和 revision；再按提示手动刷新页面，重新编辑并保存。 |
| C6 | 基础/异常；pay 页 D0 | 6a：修改一个合法套餐字段并保存，记录 commercial revision 与 `system_configs`。6b：恢复 D0 后，把套餐必填项改成页面校验拒绝的值并保存，记录是否发出请求、是否有成功 Toast。6c：在 License 未激活导致套餐读取失败的商业版实例修改支付配置并保存。 |
| C7 | 边界；社区版 A | 登录 root，记录侧栏一级/二级菜单；打开仍可见的配置页；特别检查 `/admin/settings/auth`、`/admin/settings/pay` 和子服务分组是否存在。 |
| C8 | 边界；商业版 B，SaaS 开关两种状态 | 8a：`ENABLE_SAAS_ADMIN_CONFIG=false` 打开 pay、auth、subservice 页面，记录 coupon/discount/payForm/freeClean 和企微服务商字段是否出现。8b：重启为 true 后重复记录。 |
| C9 | 边界；商业版实例 C，License 未激活/过期 | 访问 `/admin`，记录默认落地页和侧栏；再直接打开一个配置页和一个商业业务页，观察是否被重定向/拦截。 |
| C10 | 基础；pay 页 D0，所有支付渠道未配置 | 在支付配置页只填写对公转账说明并保存；调用 `GET /api/common/system/getInitData` 并刷新前台支付入口。再清空该说明并保存，重复读取。 |

## 预期结果

公共断言：页面只提交当前可见且当前版本允许的字段，保存请求携带各 domain 当前 revision；成功 Toast 为 `保存配置成功`，失败不得出现成功 Toast。revision 冲突只提示保留草稿并手动刷新，不自动 refetch、不静默替换用户正在编辑的表单。除用户明确清空的字段外，其他 overrides、敏感值和未展示的 SaaS 字段必须保持原值。菜单按字段可见数自动推导，父级没有任何可见子项时整体隐藏。

| 子场景 | 验证方式 | 特有预期 | 证据获取方式 |
| --- | --- | --- | --- |
| C1 | UI + response | 商业版基线下列出的页面均正常渲染且无 500；字段值与 GET 的 effectiveConfig 一致，敏感值显示 `******`；未改值保存仍返回成功，且只递增该页涉及 domain 的 revision。若某页未出现，记录是版本、SaaS 还是 License 导致，并转到 C8/C9 验证，不能当作通过。 | 页面截图/可访问性树、每页网络请求与 DB revision。 |
| C2 | UI + response + DB | 四个 domain 各 revision+1；`auth/feature/storage/site` 中未修改的嵌套字段保留；刷新后四项新值回显；不存在只提交部分 domain 的半写状态。 | 四个 update item 的响应、四个 domain 文档。 |
| C3 | UI + DB + storage | 3a：A 被引用，TTL 移除；3b：B 成为新 favicon 并移除 TTL，A 因仍被导航项引用不得删除；3c：A/B 都不再被引用后删除，DB 中 favicon 为空/导航项已移除。若注入 S3 删除失败，保存仍成功、页面收到成功 Toast，服务日志记录清理失败；不能因此回滚已保存配置。 | DB 引用集合、S3 对象存在性、保存响应和错误日志。 |
| C4 | UI + DB | 改 URL 时掩码原样提交，DB 密钥保持第一次保存的真实值；显式清空后 DB 密钥变为空串（或按 Schema 默认值生效），页面回显为空而不是再次显示掩码。 | providers 文档、页面输入框回显、update 请求体。 |
| C5 | UI + response + DB | 标签页 2 收到 warning Toast `配置已被他人修改，请先保留当前修改，再刷新页面重新编辑并保存。`；不自动 refetch、不自动更新 revision，标签页 2 的草稿保持可见，DB 只有标签页 1 的结果。手动刷新后表单显示标签页 1 的最新值，用户重新编辑后可用新 revision 成功保存；刷新前不得把旧草稿静默写入。 | 两个标签页截图、update 409 响应、刷新前后表单值、DB revision。 |
| C6 | UI + response + DB | 6a：commercial revision+1，`system_configs` 新增一条 fastgpt 文档且 subPlans 为嵌套存储形状。6b：页面校验失败时不发 update 请求、不出现成功 Toast、commercial 与 system_configs 均不变。6c：套餐未读取成功时保存请求不带 `subPlans` 键，commercial 保存成功且旧套餐文档不变；不得把读取失败写成清空套餐。 | 网络请求列表、Toast、commercial 文档、system_configs 前后快照。 |
| C7 | UI | 社区版菜单保留 License、版本升级、系统资源（模型/工具）和系统配置中至少有一个可见字段的页面；隐藏数据面板、运营管理、用户与团队、商业化、应用模板、子服务、支付配置和审计日志。`/admin/settings/auth` 因安全域仍可见，`/admin/settings/pay` 因全为商业字段而隐藏；不出现空父级。 | 侧栏文本/层级截图与页面路由。 |
| C8 | UI | 8a：pay 页因支付通道字段仍可见，但 coupon/discount/payForm/freeClean 控件不出现；auth 页企微服务商凭据字段不出现；subservice（含 mcp）页面仍可见。8b：上述 SaaS 运营字段出现，页面无空白/布局断裂。隐藏只影响展示，不能据此断言 API 拒绝这些字段；API 边界由 FG-ADMIN-CONFIG-001 验证。 | 两状态页面截图与字段列表。 |
| C9 | UI | 默认落到 `/admin/license`；数据面板、用户与团队、应用/知识库管理、商业化业务页、审计日志被隐藏；配置页、子服务页、系统模型/工具、版本升级仍可进入。该行为表示 License 只限制商业业务页，不限制按部署版本开放的配置页；不应出现配置页误拦截或商业业务页绕过。 | 访问 `/admin` 的落地 URL、侧栏和页面响应。 |
| C10 | API + DB + UI | 保存对公说明后 `feConfigs.show_pay=true`、`payConfig.bank=true`，前台出现支付入口；清空后 `show_pay=false`、bank=false，入口消失。投影必须来自当前 commercial 实例配置而不是旧 `feConfigs.payConfig`；微信/支付宝字段删除后对应入口也不能残留。 | `getInitData` 响应、支付页/前台入口、commercial 文档。 |
