---
case_version: 1
id: "FG-APP-WORKFLOW-058"
title: "工作流拓扑、调度顺序与版本入口"
business: "app/workflow/execution"
types: [api, integration]
category: basic
scenario: success
priority: P0
status: ready
tags: [workflow-foundation, scheduling, fan-in, branch, cycle, draft-publish, 覆盖基础场景, 覆盖边界场景]
evidence: [response, database]
sources:
  - packages/service/core/workflow/dispatch/index.ts
  - packages/service/core/workflow/dispatch/queue.ts
  - packages/service/core/workflow/utils/tarjan.ts
  - packages/service/core/workflow/dispatch/tools/runIfElse.ts
  - packages/service/core/workflow/dispatch/tools/runUpdateVar.ts
  - packages/service/core/workflow/dispatch/tools/textEditor.ts
  - packages/service/core/workflow/dispatch/init/workflowStart.tsx
  - packages/global/common/workflow/condition.ts
  - packages/global/core/workflow/runtime/utils.ts
  - projects/app/src/pages/api/core/chat/chatTest.ts
  - projects/app/src/pages/api/core/app/version/publish.ts
  - projects/app/src/pages/api/v2/chat/completions.ts
routes: ["POST /api/core/chat/chatTest", "POST /api/core/app/version/publish", "POST /api/v2/chat/completions"]
related: [FG-APP-WORKFLOW-013, FG-APP-WORKFLOW-040, FG-APP-WORKFLOW-060, FG-APP-WORKFLOW-056, FG-APP-WORKFLOW-057]
automation:
  - runner: node
    script: .agents/test/app/workflow/execution/FG-APP-WORKFLOW-058.mjs
    items: [C1, C2, C3, C4, C5, C6]
baseline: "37b271c759eda4e3134c88d98939f81f053a8553"
---

# 工作流拓扑、调度顺序与版本入口

## 用例简介

工作流需要按连线和条件执行，而不是碰巧返回正确文本。通过有外部计数和门控证据的串行、分叉汇合、条件嵌套及有出口回环，验证节点不会提前执行、重复执行或执行未选路径；再对照编辑测试入口和发布版本，确认运行的是用户选择的图。

## 前置准备

- 使用真实主站和 Pro，记录运行目录及 commit，确认确实包含本 PR。Mongo/PG/Redis 使用 Mac Mini 的独立测试库、schema 或 Redis DB，不创建本机数据库或清理 Dev 业务数据；仅创建本轮独立测试团队内的应用、版本和会话，不改共享并发上限/SSRF/模型配置。
- 导入 `basic-dataflow`、`basic-fan-in`、`basic-branch`、`basic-cycle` JSON，绑定 `__GATE_URL__` 为主站可访问的 `workflow-fixture-server.mjs` 地址。计数 `/count` 记录 body.node、runId；`/fast`、`/slow` 分别以 `<RUN>-Fast`、`<RUN>-Slow` 占位，通过 `POST /release` 的 body.runId 单独放行。
- C2 记录实际团队节点并发能力；需要至少两个 HTTP 分支能同时到达 gate，否则该并发变体阻塞，不能通过调高共享 dev 配置解决。release 在 finally 中执行，避免失败后遗留占位连接。
- 问题使用 `fgtest-<RUN>-<场景>-<变体>`，每变体新 chatId；C6 对同一 App 连续切换版本，但每次聊天也用新 chatId，排除历史变量影响。先保存实际发布图及版本 ID。
- 主调用使用真实 `POST /api/v2/chat/completions`，stream=true、detail=true；编辑测试使用 `POST /api/core/chat/chatTest`，传实际 appId、nodes、edges、chatConfig、messages、chatId 和独立 responseChatItemId。它执行请求图，需要写权限，不能当节点 Debug 接口调用。
- gate 到达每秒轮询、最长 30 秒，完整运行最长 120 秒。持续读取 gate observations、SSE 和节点详情，按当前 RUN 精确筛选；需要库证据时限定 teamId/sourceType/appId/chatId，响应按 id/parentId 合并后比较执行次数，不统计物理增量行数。
- 每变体恢复相应模板并清空本轮 gate 计数（或使用新 RUN 隔离）。结束后通过正常删除入口清理本轮应用和会话，等待其自身异步清理，不删除已有数据。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 基础；发布 `basic-dataflow` | 传问题 Q，执行 Start → Compose → Remember → Reply。分别读取 Compose 输出、Remember 更新结果、Reply 和最终会话变量；同一 App 新会话再传不同问题 Q2。 |
| C2 | 并发汇合；`basic-fan-in`，两个门控均到达 | 只放行 Fast，等待 FastValue 完成后检查当前事件和 gate 记录；再放行 Slow。恢复原图和新 RUN，反向先放行 Slow，再放行 Fast。Merge 只有一个实例，Unreachable 无入口连线。 |
| C3 | 条件与首个命中；`basic-branch` | 原图 n=5/15/25，flag=true，各自新会话；n=5 同时符合 low 与 mid，观察首个分支。再将 low 条件改成 `n<10 AND flag==true`，以 n=5,flag=false 对照；将 AND 改 OR，以 n=15,flag=true 对照。 |
| C4 | 嵌套跳过传播；恢复 `basic-branch` | 分别传 n=5,flag=false 和 n=15,flag=true；在第二组中 Nested 整段被跳过。观察四条候选路径到 Merge 的最终状态、外部计数和未连接 Unreachable。 |
| C5 | 有出口回环；`basic-cycle`，n 初始 0 | 执行 Start → Increment(+1) → Count → Continue；n<3 时回到 Increment，否则到 Reply。再以新会话 n=2 对照。模板有合法条件出口；若编辑器拒绝合法图，记录产品失败，不绕过校验伪造发布成功。 |
| C6 | 版本切换；恢复 `basic-dataflow` | 发布 Compose 前缀 V1，记录版本；编辑测试请求体把 Compose 改 V2，但不发布，分别执行 chatTest 和正式聊天。然后通过正常发布接口发布 V2，再执行正式聊天。三次正式/测试运行均保存其实际图/版本与各自 chatId。 |

## 预期结果

公共断言：用“已执行节点集合、每节点业务调用次数、依赖完成先后及最终输出”共同验收，不依赖两条独立分支的绝对启动顺序。未选分支不能发生真实 HTTP 副作用；被 skip 的节点不产生成功执行详情。普通成功调用最终应完成，不能以无输出或超时当作跳过。错误路由、容器空值/break/retry、预算/深度和单步 Debug 复用 WORKFLOW-060/056，不再复制矩阵。

| 子场景 | 特有预期 | 证据获取方式 |
| --- | --- | --- |
| C1 | 四节点各执行一次；Compose=V1:Q，Remember 后 a=V1:Q，Reply 为 `a=V1:Q\|node=V1:Q`。Q2 得到对应 Q2 的结果，不读到 Q 的节点输出；Reply 在 Remember 完成后才解析参数。 | 节点输出/更新详情、最终响应及 chats.variables.a。 |
| C2 | 单独一侧完成时，Merge 和 Reply 尚未执行；两侧完成后 Merge 外部调用恰好 1 次，Reply=FAST\|SLOW。反向完成也相同；Unreachable 调用始终为 0。不能要求 Merge 等待所有入边都 active：条件跳过的对照由 C4 验证。 | 两次释放前后 observations 快照、FastValue/SlowValue/Merge/Reply 节点实例与完成事件；保留门控时间线。 |
| C3 | 原图依次只执行 LowTrue、Mid、High，Merge 各 1 次。n=5 首个 low 命中，不能再执行 mid；AND 对照只执行 Mid，OR 对照只执行 LowTrue。Choose 输出展示标签 IF / ELSE IF 1 / ELSE，但连线按稳定 branchId low/mid 激活，不能混用标签作端口。 | 各组 Choose.ifElseResult、真实外部 node 计数精确集合、发布 JSON。 |
| C4 | n=5,false 只执行 LowFalse；n=15,true 只执行 Mid，Nested/LowTrue/LowFalse 均无实际执行，High 也无副作用。Merge 不因跳过分支永久 waiting，也不因多条 skipped 边重复运行，恰好 1 次；Unreachable=0。 | 分支节点详情和 gate 精确调用集合，终态与最终 Reply。 |
| C5 | 初值 0 时 Count 依次收到数字 n=1,2,3，Increment/Count/Continue 各执行 3 次，Reply 仅 1 次且 DONE:3；初值 2 时这三节点各 1 次。没有同一节点重叠执行、过早结束、额外第四轮或读取旧输出。 | Count 的有序 body.n、同 nodeId 的独立响应实例、最终变量及 Reply；不把多次合法迭代误报重复执行。 |
| C6 | 未发布 V2 时 chatTest 返回 V2，正式聊天仍 V1；发布 V2 后正式聊天变 V2。两个入口均按实际图完成参数传递，不是只显示编辑器状态；测试聊天不能暗中切换 App 发布版本。 | 发布接口返回、版本 ID/实际图、三阶段请求响应与各会话证据。 |
