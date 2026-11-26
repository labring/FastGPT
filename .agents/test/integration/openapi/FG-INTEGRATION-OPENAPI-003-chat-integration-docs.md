---
case_version: 1
id: "FG-INTEGRATION-OPENAPI-003"
title: "会话身份文档与第三方应用接入实践"
business: "integration/openapi"
types: [ui, api, e2e, integration]
category: basic
scenario: success
priority: P1
status: ready
automation:
  - runner: node
    script: .agents/test/integration/openapi/FG-INTEGRATION-OPENAPI-003.mjs
    items: [U1, U2, U3, U4, U5]
tags: [customUid, authProxy, OpenAPI, Scalar, 覆盖基础场景, 覆盖异常场景, 覆盖边界场景]
evidence: [ui, response, database]
sources:
  - packages/global/openapi/core/chat/identity.ts
  - packages/global/openapi/core/chat/api.ts
  - packages/global/openapi/generation.ts
  - packages/global/openapi/requiredExamples.ts
  - packages/global/openapi/unionPresentation.ts
  - projects/app/src/pageComponents/apidoc/ScalarOpenApiPage.tsx
  - projects/app/src/pageComponents/apidoc/UnionParameterCard.ts
  - document/content/openapi/best-practices/app-integration.mdx
  - document/content/openapi/best-practices/app-integration.en.mdx
  - document/script/check-doc-publication.mjs
  - document/middleware.ts
routes:
  - GET /api/apidoc/systemopenapi.json
  - GET /api/apidoc/devapi.json
  - POST /api/v1/chat/completions
  - POST /api/core/chat/history/getHistories
  - POST /api/core/chat/record/getPaginationRecords
  - PUT /api/core/chat/history/updateHistory
  - DELETE /api/core/chat/history/delHistory
  - DELETE /api/core/chat/history/clearHistories
related: [FG-CHAT-HISTORY-FEEDBACK-003, FG-PERMISSION-RESOURCE-002]
baseline: "feed8765429044a2f630358441e584d50f068a20"
---

# 会话身份文档与第三方应用接入实践

## 用例简介

第三方开发者需要从 API 文档选择正确的会话身份与分页方式，按教程用自己的用户系统接入应用。本例验证文档交互及中英文教程中的参数形态与真实接口一致，使用者范围不会因引用、文档示例或管理操作丢失。

## 前置准备

- 复用本地主站 dev `BASE_URL`、已有文档 dev（夹具 `docsBaseUrl`，缺省 `http://localhost:3005`）及已有 Mongo/Redis；不启动独立数据库。两份 API 文档分别为 `/apidoc/systemopenapi` 与 `/apidoc/devapi`。
- U1–U4 通过无头 Chromium 操作真实页面，不注入组件状态，不移动 Scalar DOM；各行独立页面，从默认选项开始。截图、实际可见字段、接口返回的文档 JSON 是证据，不能只看 Schema 或元素存在。
- U5 使用本轮临时团队的应用 Key 和已发布固定回显应用；U1/U2 为含中文及特殊字符的两个外部 UID。只创建本轮资源，不暴露 Key 明文、Cookie 或签名 URL。
- 复用脚本公共成功判断；真实响应、Chat/item 白名单快照和删除差集共同判定，HTTP 200 本身不代表通过。接口的全部负向/边界矩阵复用 HISTORY-FEEDBACK-003，不在教程中复制。
- 每行记录本轮 DOM/截图或 HTTP/数据库证据。页面 JS 异常失败；单页等待最长 120 秒。U5 应用、会话、Key 随本轮清单通过正常业务入口回收。配图为明确占位，不能按缺图判失败。
- U4 按教程当前 frontmatter 验收发布状态：`draft: true` 时导航不含教程、直接访问 404；移除标记或设为 false 后，继续执行完整双语正文、导航、刷新和站内链接验收。不能把页面因错误意外不可用判成草稿通过。
- U4 必须先确认两种语言的 `/openapi/intro` 均为 HTTP 200 且正文标题正确。`docsBaseUrl` 指向独立文档服务；未部署或误指向主站时不得判为通过。可先执行 `node document/script/check-doc-publication.mjs --base-url <文档服务地址>`，核对真实路由、导航、搜索、sitemap、静态索引和 LLM 导出。

## 测试步骤

| 子场景 | 起始状态与操作 |
| --- | --- |
| U1 | 两份 API 文档的 v1/v2 completions：默认身份 → 自定义使用者 → 代理团队成员；再切应用 Key、省略 appId 的分支。切换回默认，刷新重新进入，记录显示字段和必填标记。 |
| U2 | 两份文档的 getHistories：依次切自定义使用者、代理，切 offset/页码两种分页；检查当前身份参数、分页参数分组、字段唯一性及相邻业务字段，最后回到默认身份。 |
| U3 | 通过真实文档 JSON 和 Query 接口页面确认 init 的 authProxy 为 JSON 字符串，Body 为对象；外链、Skill、直接资源分支不展示不可用身份；batchDelete 不包含身份选择或字段。 |
| U4 | 先读取教程当前发布标记；未发布时在中英文导航查不到，直接访问返回 404。已发布时打开「最佳实践 → 应用对接」，检查创建 Key、用户映射、多轮对话、按用户列表/清空、消息读取及管理步骤，示例不要求 appId；验证英文站内链接与刷新。 |
| U5 | 按教程用应用 Key 免 appId：为 U1 新建并续聊、为 U2 建会话；按 U1 分页列出、读取消息、改标题、删除；再创建 U1 两会话并按 U1 清空。每步查询真实数据，保留 U2 负对照。 |

## 预期结果

| 子场景 | 特有预期 | 证据 |
| --- | --- | --- |
| U1 | 普通应用有三种身份；customUid/代理参数只在对应选择中可见，代理成员 ID 实际展开；应用 Key 无代理模式且无需 appId。stream/detail 等可省略字段不误标必填。切换、回退及重载不重复字段、不残留旧分支，无 JS 错误。 | 实际 JSON、分支可见字段、截图与重载对照。 |
| U2 | 当前身份参数和当前分页参数各自清晰展示；offset 模式只展示 offset，页码模式只展示 pageNum，pageSize 可选且默认 20；切换后参数只有一份，业务筛选仍在，无 JS 错误。 | 两份页面的切换记录、可见字段及截图。 |
| U3 | Query 的 authProxy.type=string 且有 JSON 示例；Body 使用对象，解析规则与 API 约定一致。unsupported 分支与物理删除不错误提示可用身份参数；Query 仍为 form/explode 平铺键，不引入实际 query 包裹字段。 | 文档接口返回的完整相关参数及真实 Query 页面字段。 |
| U4 | 发布状态与 frontmatter 一致，草稿不出现于导航且不可直接访问。已发布时双语正文明确列表/清空的 customUid 范围、续聊不可改绑、省略 UID 的范围和物理删除不处理代理；三处配图占位可见，站内英文链接有效。 | 发布标记、HTTP 状态、导航、双语正文与截图；已发布时实际打开英文链接。 |
| U5 | 工作流输出 UID 原值，U1 两轮恰有 4 条消息；列表/内容/改名/软删除及清空符合教程。所有请求省略 appId；U2 的主表、消息与正文保持不变，不因清空 U1 改变。 | 实际请求、返回和精确白名单差集。 |
