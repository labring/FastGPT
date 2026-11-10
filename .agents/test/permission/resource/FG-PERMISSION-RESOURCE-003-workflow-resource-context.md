---
case_version: 1
id: "FG-PERMISSION-RESOURCE-003"
title: "工作流资源快照与动态引用的权限边界"
business: "permission/resource"
types: [api, integration]
category: boundary
scenario: special
priority: P0
status: ready
tags: [pr-7992, workflow-context, resource-context, model-auth, child-workflow, 覆盖基础场景, 覆盖异常场景, 覆盖边界场景]
evidence: [response, database]
sources:
  - packages/service/core/workflow/dispatch/context/resource.ts
  - packages/service/core/workflow/dispatch/context/index.ts
  - packages/service/core/workflow/resource/service.ts
  - packages/service/core/workflow/dispatch/child/runApp.ts
  - packages/service/core/workflow/dispatch/plugin/run.ts
  - packages/service/core/app/version/schema.ts
  - projects/app/src/pages/api/core/workflow/debug.ts
  - packages/global/openapi/core/workflow/api.ts
routes:
  - "POST /api/v2/chat/completions"
  - "POST /api/core/workflow/debug"
related: [FG-APP-WORKFLOW-054, FG-APP-AGENTV2-001]
baseline: "37b271c759eda4e3134c88d98939f81f053a8553"
---

# 工作流资源快照与动态引用的权限边界

## 用例简介

已发布工作流使用所选版本的资源快照，动态引用则仍需要运行人的权限，进入子应用后也必须切换到子版本的资源范围。Context 重构不能把父级快照变成全局白名单，也不能把显式模型的权限拒绝降级为默认模型成功。

## 前置准备

- 本轮 JSON 拓扑基线：model-resource、child-leaf/child-parent；统一绑定说明见 `.agents/test/app/workflow/execution/fixtures/README.md`。资源、权限、失败和并发变体须完成真实绑定并保存最终 JSON，不能将模板校验算作业务通过。

- 两个隔离团队 T1/T2，Mongo/PG/Redis 使用 Mac Mini 的独立测试库、schema 或 Redis DB；不创建本机数据库或清理 Dev 业务数据。T1 内发布者 P、运行者 R，R 有权运行 W 但对动态资源分别有/无 use 权限；另备 root 跨团队反例。资源为 T1 的静态模型 M1、动态模型 M2、知识库 D1/D2 和子应用 A，以及 T2 的私有模型/知识库。先完成合法发布，再通过管理界面撤去 R 的独立动态权限；确认目录/权限缓存已反映新配置后开始，不能用缓存尚未刷新当权限结论。
- D0：固定 W 的发布 Version V1 及其 `resources`，A 使用独立发布版本 VA、独立资源快照；R 可以调用 A。抓取真实 completions/debug 请求，不在 body 伪造可信 resourceContext。记录执行实际选中的 Version ID，草稿编辑不得默认为已经更新 V1 快照。
- 动态资源若没有对应的公开可配置引用入口，使用真实服务集成：在完整 `runWithContext` 中调用 `loadWorkflowModelResource`/`loadWorkflowDatasetResource`，上下文通过真实文件准备、变量工厂和 entry sink 构造；使用真实团队 ModelHandle、Mongo、权限与缓存，禁止 mock assertAuthModels 或直接返回“已授权”。该变体不是 HTTP 覆盖，不捏造路由字段。
- 损坏快照反例只允许在隔离测试库克隆本例 `app_versions` 或构造该次真实服务 Context，保存并恢复 resources 快照；明确区分故意损坏夹具与正常发布途径。禁止修改共享应用或生产权限。
- 受控模型服务记录实际收到的 model 身份和调用次数，知识库返回带 D1/D2 唯一标记；失败时验证受保护正文未返回。预期只固定权限结果/实际资源身份，不臆造统一 HTTP 错误码；流式失败检查节点错误和终态而非仅 HTTP 200。
- 每行新 chatId、恢复权限与 V1/VA 基线；完成后清理本例应用、资源及会话并恢复目录配置。模型执行最长 120 秒，授权拒绝在同请求终态确认；没有可信目录和权限数据时记为阻塞。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 基础；D0 | R 运行已合法发布且命中 V1 快照的 M1/D1，再调试当前草稿选择的新资源，记录两种入口实际快照。 |
| C2 | 基础/异常；D0 | 未命中快照的 M2/D2，分别以有权限、无权限 R 执行；知识库再以 `[D1,D2]` 混合列表且 D2 无权作为一组变体。 |
| C3 | 边界；D0 | 让父 W 与子 A 的静态资源不同，父同轮调用 A 和自己的普通节点；另从 A 请求一个只在父快照中、R 又无动态权限的资源。 |
| C4 | 异常；隔离的损坏快照副本 | 在标记 teamId=T1 的普通应用快照放入 T2 私有模型/知识库，分别以 R 和 root 运行；不使用不携带 teamId 的系统工具特例替代普通应用。 |
| C5 | 异常/兼容；真实服务集成 | 对 `fallbackToDefault=true` 的模型加载，分别使用已删除/停用的配置模型与“存在但无 use 权限”的显式模型；对照仅按当前运行人可用系统模型选择默认值。 |

## 预期结果

公共断言：资源上下文按应用/版本及本次运行隔离；静态快照只承接发布时合法授权，不授予跨团队私有资源权限。拒绝后不得更改应用的资源快照、暴露正文或声称执行了替代模型；已发生的正常前置日志/用量不要求全为零。

| 子场景 | 特有预期 | 证据获取方式 |
| --- | --- | --- |
| C1 | 发布运行使用所选 Version 的快照；调试使用当前请求已鉴权的临时快照。两者均能消费各自合法静态资源，不受另一运行的 Context 覆盖。 | Version/resources 只读快照、请求、模型身份/知识库标记。 |
| C2 | 动态引用有权允许、无权拒绝；混合列表必须校验全部未命中项，不能因首项 D1 可读而泄漏 D2。权限主体为实际运行人，而不是直接沿用应用发布者。 | R 的授权证据、真实返回与受控模型调用记录；失败场景无 D2 正文。 |
| C3 | A 使用 VA 范围，返回父流程后仍是 V1；父快照不得自动授权 A 的动态引用，失败不污染父及兄弟节点后续资源选择。 | 父/子版本快照、节点结果顺序、实际加载资源身份。 |
| C4 | 普通应用中的跨团队私有模型/知识库均拒绝，root 或快照命中本身也不能绕过团队限制。系统工具内部静态资源例外不被错误泛化为普通应用规则。 | 损坏夹具前后快照、错误及未调用目标模型/未返回目标正文的证据。 |
| C5 | 只有模型配置错误在允许回退的调用点尝试运行人可用的系统默认模型；显式权限错误原样拒绝，不回退，不能按应用团队目录偷偷选其他模型。 | 服务真实入参/结果、默认模型可用集合和模型请求清单。 |
