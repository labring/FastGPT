---
case_version: 1
id: FG-APP-WORKFLOW-072
title: 工作流引用历史随草稿与发布版本保留
business: app/workflow/management
category: boundary
types: [api, ui, integration]
scenario: special
priority: P1
status: ready
tags: [workflow-editor, reference-snapshots, 覆盖基础场景, 覆盖边界场景]
evidence: [ui, response]
sources:
  - packages/global/core/workflow/type/io.ts
  - packages/global/common/workflow/editor/runtime/documentRules.ts
  - packages/global/common/workflow/editor/runtime/referenceModule.ts
  - packages/global/common/workflow/reference.ts
  - packages/global/core/workflow/template/system/datasetSearch.ts
  - packages/global/core/workflow/template/system/sandbox.ts
  - packages/global/core/workflow/template/system/textEditor.ts
  - packages/global/openapi/core/app/version/api.ts
  - packages/service/core/app/version/controller.ts
  - packages/service/core/app/version/schema.ts
  - packages/service/core/workflow/dispatch/utils/runtime.ts
  - projects/app/src/pages/api/core/app/detail.ts
  - projects/app/src/pages/api/core/app/create.ts
  - projects/app/src/pages/api/core/app/copy.ts
  - projects/app/src/pages/api/core/app/transitionWorkflow.ts
  - projects/app/src/pages/api/core/app/version/publish.ts
  - projects/app/src/pages/api/core/app/version/list.ts
  - projects/app/src/pages/api/core/app/version/detail.ts
  - projects/app/src/pages/api/core/app/version/latest.ts
  - projects/app/src/pages/api/v2/chat/completions.ts
  - projects/app/src/pageComponents/app/detail/PublishHistoriesSlider.tsx
  - projects/app/src/pageComponents/app/detail/ExportConfigPopover.tsx
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/ImportSettings.tsx
  - projects/app/src/web/core/workflow/editor/codec.ts
  - projects/app/src/web/core/workflow/editor/WorkflowFieldScope.tsx
routes:
  - POST /api/core/app/create
  - GET /api/core/app/detail
  - POST /api/core/app/copy
  - POST /api/core/app/transitionWorkflow
  - POST /api/core/app/version/publish
  - POST /api/core/app/version/list
  - GET /api/core/app/version/detail
  - GET /api/core/app/version/latest
  - POST /api/v2/chat/completions
related: [FG-APP-WORKFLOW-040]
automation:
  - runner: playwright
    script: .agents/test/app/workflow/management/FG-APP-WORKFLOW-072.browser.spec.ts
    items: [C1, C2, C3, C4, C5, C6, C7, C8]
baseline: 9b0128032da5c30749d579d04e4c26e86bca99f7
---

# 工作流引用历史随草稿与发布版本保留

## 用例简介

工作流中的引用来源被删除后，草稿、正式发布、JSON 导入导出、复制与转换保留仍有消费者的原有引用及来源名称。正式运行将可选的失效输入视为空。存量知识库整项筛选引用在编辑器中绑定实际输出 ID，导出和保存草稿后仍指向同一输出。

## 前置准备

- 本地 dev、Chromium 中文界面、可创建/编辑/删除本例工作流的测试成员。为每行分别创建 `FG-TEST-` 前缀的应用，记录 `teamId`、`appId`、运行时间。测试文本固定，无模型调用或发布到外部渠道。
- G0 包含开始节点 Start、文本拼接节点 Source 和文本拼接节点 Consumer。Start 分别连接 Source 和 Consumer，Source 连到 Consumer。Consumer 文本引用 Source 的拼接结果和 Start 的用户问题。D 在 G0 上删除 Source 与它的相关连线，保留 Consumer 文本；H 是 D 的快照，`reference` 为 `["Source", "system_text"]`，来源标签使用固定名称 `Historical Origin`。C1、C2 使用该来源的固定历史输出标签 `Historical Output`，C3 使用从画布导出读到的实时输出标签验证捕获。
- 准备一个没有任何消费者的缺失来源 U，以及一个仍可解析的开始节点输出 L。分别在 `referenceSnapshots` 中添加其条目作为压缩对照，保留输入中的真实引用。不要在日志里保存令牌或认证状态。
- C4、C5 在源应用创建时使用 G0 作为原始正式版本；再仅保存 D 和 H。C5 用 `type: simple` 的兼容夹具，验证真实转换 API，分别准备新建与原地转换两份源应用。
- C6 独立创建 Start → Code → Search 图。代码节点输出键为 `result`，输出 ID 为 `ref123`。知识库搜索使用旧版文本控件配置，`collectionFilterMatch` 保存 `['Code', 'result']`，加载和保存过程无需运行节点或实际查询知识库。
- C7 使用可用的本地代码沙箱。两个文本处理节点的可选输入分别引用已删除的输出和值为 `true` 的全局开关。Source 的新输出沿用旧 key `system_text`，实际 ID 为 `current-text-id`，并保留旧 ID 的快照 H。Code 读取两个文本结果、布尔开关和 Source 的实际输出，Reply 转发代码结果。
- C8 保留 G0 的节点 ID 与边，将 Source 换为代码节点，输出 key 为 `system_text`，ID 为 `replacement-output-id`。Consumer 文本同时引用旧 ID `system_text` 与新 ID `replacement-output-id`。用 API 保存草稿并带上旧 ID 的快照 H。
- 发布接口统一响应应为 HTTP 200、`code:200`、`data:null`。从详情接口读回工作副本，从版本列表按本例唯一版本名定位历史记录，再通过 detail 校验。latest 单独核对正式版本。保存、页面刷新、导出各等待真实业务响应和界面就绪，最长 30 秒。
- 用例完成后通过本轮登录态删除刚创建的应用。复制、新建转换返回的派生 appId 也登记后清理，确认删除结果只含本轮应用 ID。

## 测试步骤

| 子场景 | 起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 新应用，D | 仅保存带 `[H,U,L]` 的 D；随后两次用旧客户端形态保存 D，依次为普通草稿和 `autoSave:true`，均省略 `referenceSnapshots`；最后普通保存 D 并传 `referenceSnapshots:[]`。 |
| C2 | 新应用，D | 通过实际发布 API 为临时工作流发布带 H 的版本 V1；保存显式清空快照的草稿。再打开“团队云端”并切换回 V1，随后导出。 |
| C3 | 新应用，G0 | 在画布删除 Source，导出 JSON；重新导入 G0 复位，再导入刚导出的 D。检查 Consumer 的失效引用提示，重复导出。 |
| C4 | 工作流应用，正式 G0，草稿 D/H | 调用复制接口，以返回的 appId 读回新应用工作副本与正式版本，分别复查源应用的两份版本。 |
| C5 | 简易应用，正式 G0，草稿 D/H，测试成员是所有者 | 对独立源应用分别以 `createNew:true` 和 `createNew:false` 转换，读回源应用、目标工作副本及正式版本。 |
| C6 | 新应用，旧筛选输入按输出 key 引用整项 | 创建后读回旧值，打开编辑器导出 JSON，选择“仅保存”并读回草稿。刷新编辑器，再导出配置。 |
| C7 | 新应用，文本处理节点的可选输入引用已删除来源 | 保存带 H 的草稿。执行 CLI `app pull`，修改欢迎语并从本地 JSON 省略快照字段。依次运行 `app save`、`workflow diff` 和 `app publish`。在本地显式写空快照数组，再运行一次 `workflow diff`。读回草稿和正式版本，并发起一次非流式正式对话。 |
| C8 | 新应用，旧输出 ID 等于有效输出的 key | 打开编辑器检查历史标签并导出，选择“仅保存”并读回草稿。刷新后检查历史标签，再次导出。 |

## 预期结果

公共断言：C1 至 C5 比较精确的 `reference`、标签和 Consumer 引用值，删除来源和清空快照均保留消费者的原有引用。缺失来源继续显示失效。C6 对比真实输出 ID 和筛选输入值。

| 子场景 | 特有预期 | 证据 |
| --- | --- | --- |
| C1 | 初次保存之后只保留 H；省略字段的手动及自动保存均继承 H；显式空数组清空。普通和自动保存不改变正式版本指针。 | 四笔请求、统一成功响应及每次工作副本读回。 |
| C2 | 工作副本快照为空，`latest` 与 V1 的 `detail` 保留 H。切换后导出包含 H；只查看历史，不改变正式版本或已存工作副本。 | V1 的 ID、版本接口和切换后的导出 JSON。 |
| C3 | 删除 Source 后只剩 H；JSON 往返保留 H 和原引用值。Consumer 中可见的失效标签保留 `Historical Origin` 并显示本地化输出名“拼接结果”。悬停提示变量已删除。 | 删除和导入后的配置快照、标签及可见提示截图。 |
| C4 | HTTP 200、`code:200`，响应返回不同的 appId。副本初始工作副本和正式版本包含 D/H，团队归属与源相同。源应用保留 D/H 工作副本及 G0 正式版本，发布指针不变。 | 源和副本 ID、发布指针、工作副本和正式版本 API 读回。 |
| C5 | 两个变体 HTTP 200、`code:200`。新建时返回新 ID，目标为工作流、工作副本和正式版均为 D/H，源仍为简易应用。原地转换返回 `data:null`，原 ID 的类型变为工作流、工作副本保留 D/H、正式版为 G0。两种转换都保留源应用原有发布指针。 | 两个响应、类型、版本图与快照、发布指针和派生 ID。 |
| C6 | 首次读回值是 `['Code', 'result']`。首次导出、仅保存请求、草稿读回和刷新后再导出的输入均为 `['Code', 'ref123']`，代码输出 ID 仍为 `ref123`。草稿请求成功，正式发布指针保持不变。 | 创建后的详情、两次导出的真实 JSON、保存请求与统一响应、草稿详情。 |
| C7 | CLI 命令均成功。省略时 `diff` 显示已同步且无快照变更，显式空数组显示快照变更。草稿和正式版本保留新欢迎语、彼此独立的新旧引用与 H。正式执行 HTTP 200，代码读取到两个空文本、布尔 `true` 和 Source 的固定文本，回复为 `empty`。 | 两次 CLI 差异结果、草稿与正式版本回读及真实对话响应。 |
| C8 | 历史引用继续显示 H 的来源和输出名称。两次导出、保存请求及草稿分别保留旧引用、新引用和 H，正式发布指针保持不变。 | 页面历史标签、导出 JSON、保存请求、草稿接口。 |
