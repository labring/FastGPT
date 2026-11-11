---
case_version: 1
id: "FG-APP-WORKFLOW-054"
title: "父子流程文件的最小传递、登记与限额"
business: "app/workflow/execution"
types: [api, ui, integration]
category: boundary
scenario: special
priority: P0
status: ready
automation:
  - runner: node
    script: .agents/test/app/workflow/execution/FG-APP-WORKFLOW-054.mjs
    items: [C1, C2, C3, C4, C5]
tags: [pr-7992, pr-1193, workflow-context, file-context, private-file, workflow-builder, 覆盖基础场景, 覆盖异常场景, 覆盖边界场景]
evidence: [response, ui, database, storage]
sources:
  - packages/service/core/workflow/dispatch/context/index.ts
  - packages/service/core/workflow/dispatch/context/file.ts
  - packages/service/core/workflow/dispatch/context/variables.ts
  - packages/service/core/workflow/utils/fileLimits.ts
  - packages/service/core/workflow/dispatch/interactive/formInput.ts
  - packages/service/core/workflow/dispatch/ai/fileContext.ts
  - packages/service/core/workflow/dispatch/ai/readFiles.ts
  - projects/app/src/pageComponents/app/detail/useChatTest.tsx
  - projects/app/src/pages/api/core/workflow/debug.ts
  - packages/service/core/chat/chatSchema.ts
  - pro/admin/src/service/core/ai/workflowBuilder/handler.ts
  - pro/admin/src/service/core/ai/workflowBuilder/sandbox/files.ts
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/WorkflowBuilder/api.ts
  - packages/global/openapi/core/workflow/builder/api.ts
routes:
  - "POST /api/core/workflow/debug"
  - "POST /api/core/chat/chatTest"
  - "POST /api/v2/chat/completions"
  - "POST /api/proApi/core/workflow/builder/chat"
related: [FG-APP-WORKFLOW-060, FG-APP-AGENTV2-001, FG-PERMISSION-RESOURCE-003]
baseline: "37b271c759eda4e3134c88d98939f81f053a8553"
---

# 父子流程文件的最小传递、登记与限额

## 用例简介

用户上传的私有文件应通过已授权的运行上下文进入子流程，而不是因为共享运行能力就把所有父文件交给子流程。交互新增文件、文件变量更新及 Builder 附件同样需要保持文件身份、归属与入口自己的额度规则。

## 前置准备

- 本轮 JSON 拓扑基线：file-reader、file-form、child-leaf/child-parent；统一绑定说明见 `.agents/test/app/workflow/execution/fixtures/README.md`。资源、权限、失败和并发变体须完成真实绑定并保存最终 JSON，不能将模板校验算作业务通过。

- 主仓库及 Pro 使用本轮 PR 实际代码基线。Mongo 和 Redis 使用 Mac Mini 的独立测试库及 Redis DB；对象存储使用本轮专用前缀，不得新建本机数据库或清理 Dev 业务数据。准备真实私有对象存储、文件读取节点及外部 HTTP 文件源；Builder 另需开启 workflow builder/agent sandbox 并具备可用沙箱。普通 Workflow 的额度断言不直接套用到 Builder 的独立常量/私有读取上限。未列入 automation 的场景由执行方逐项取证。
- D0：专用 W/U/CHAT，通过对应页面上传 A、B 两个含不同 RUN 文本的 PDF；保存真实 key、name、type 与运行 URL。另准备同用户不同会话文件 X、他人文件 Y、公网 U1、U2。不要手工拼造一个实际上不存在的上传 key。
- 普通 Workflow 固定有效文件数 N=2 和单文件上限 L，记录团队配置及系统回退值；子流程 A1 的 query 只传 A，显式文件变量传 U1，历史含 B。模型/HTTP 消费者记录真正收到的文件列表，不能只看父请求 body。对数值 0 的变体，在隔离服务集成入口调用真实 `prepareWorkflowFileContext`，显式传 `maxFileAmount: 0`，不给公开 API 增加不存在的限额字段。
- 私有读取保留对象 key 与读取内容散列，公网源记录 HEAD/GET。大小变体分别提供 L、L+1 字节内容，以及 HEAD 声称不超限但 GET chunked 实际为 L+1 的源；不修改全站网络策略。证据不保存完整签名 URL 或其他人的内容。
- 每行复建独立会话、文件及额度基线；C3 表单两字段在一次合法交互中提交。调试文件上传使用调试抽屉生成的 chatId，不能混用普通聊天 chatId；最终存储检查限定 teamId/sourceType/appId/chatId。
- Builder 的 D1 独立上传：从编辑器辅助生成界面抓取真实 `/api/proApi/core/workflow/builder/chat` 请求，保留 `workflowContext.document/checksum` 及当前 Builder chatId；先验证文档 checksum 与选用模型合法，避免用不相关的校验失败代替附件鉴权结果。
- 单次解析最长 120 秒，轮询文件消费者/工作流终态而不是固定等待后宣称成功。结束后用原上传、会话和应用管理入口清理本例资源；保留清理前后的本轮对象清单。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 基础/边界；D0 | 根 query/history/文件变量重复引用 A；调用 A1，传 A 与 U1、保留含 B 的历史。读取子 query、文件变量及模型请求，验证真实可用的 A 内容。 |
| C2 | 异常；各变体复建 D0 | 子文件输入分别传未在父登记的 X/Y 私有 key，或携带 key=X 但 url=A 的冲突对象；另把 sourceId、uid 或 chatId 换成真实不匹配的上传归属。 |
| C3 | 边界；父与子初始仅有 A，额度为 2 | 子流程暂停于含两个 fileSelect 字段的表单；两个字段各提交一个不同的新合法文件，再尝试新增一个不同文件。读取此次交互后子流程实际可见列表。 |
| C4 | 边界；已登记 A | 文件变量依次更新为 `[A运行URL,U1]`，再用相对 URL/非 HTTP(S) 输入独立重试。用真实服务集成读取 fileContext 登记表，对照变量的 runtime/store 值；不得 mock register/set。 |
| C5 | 异常/边界；每个大小变体独立 | 让真实文件节点读取经过实际上传鉴权的私有对象，确认可信 metadata 的读取边界；公网源分别为 L、L+1 和 HEAD/GET 不一致，每批再放一个正常小文件。L 为运行期外链读取上限，不据此伪造私有上传入口的大小限制。另验证 N=0 的根 query 文件和文本筛选结果。 |
| C6 | 基础/异常；D1 | Builder 分别使用无附件、本会话私有 PDF、正常公网文件运行一次；以其他 Builder 会话的真实私有签名链接替换附件重试。普通 Workflow 的 AI/ToolCall 使用同一 A 再作文件类型对照。 |

## 预期结果

公共断言：判断“传入子流程”以实际 query/history/变量与已登记 Ref 为准；不把全部父文件可见当作正确预期，也不把动态公网读取能力误写成“所有未知 URL 一律拒绝”。私有身份仍以 key 及完整根归属校验为准。

| 子场景 | 特有预期 | 证据获取方式 |
| --- | --- | --- |
| C1 | 重复 A 不重复占用子文件额度；子流程只选择 A、U1，超额历史 B 不残留在实际 payload。A 继承可信私有身份并可读取，PDF 使用 document 分类；父原始消息/文件对象内容不被改写。 | 父输入前后快照、子实际请求、解析内容散列；服务集成可核对 inherited Ref，不能仅凭 HEAD/GET 次数推断所有签名缓存行为。 |
| C2 | 伪造 key 不能通过冲突 URL 命中 A 来降级放行；未知私有 key 或错误根归属被拒绝，不能泄漏 X/Y 内容。错误明确关联当前输入，不伪装为其他资源故障。 | 被拒输入形态、真实业务错误、无受保护内容返回及对象读取记录。 |
| C3 | 当前子登记表去重后的不同文件总数不超过 2；已有 A 复用，新两个文件最多接受一个，不要求竞争时固定哪一个胜出。合法新增经父 register 鉴权并进入当前子作用域，额度满后新增不再获得子 Ref。 | 表单提交、子解析列表、限定作用域的登记结果；不能只检查单字段 maxFiles。 |
| C4 | A 仍保存原始私有 metadata；U1 可作为绝对外链变量保存，但变量 set 本身不扩展 fileContext。相对/非 HTTP(S) 更新被拒绝，不部分改写该次文件变量；后续动态公网读取按读取器自己的准入规则判断。 | `get/toStoreRecord/resolve` 的真实服务结果与会话 variables；拒绝结果后复查原值。 |
| C5 | 可信私有 S3 来源沿用已完成的上传鉴权与 metadata，不重复施加运行期外链限额；公网 L 可读、L+1 同时受响应头和实际流字节限制，HEAD 很小也不能放过超量 GET。同批小文件按既有逐项错误语义继续，非整批回滚。N=0 不回退默认值，实际 query 保留文本、无文件。 | 实际上传/可信大小、逐文件字节与结果、消费请求及筛选后的 payload；N=0 服务变体保留真实入口调用与持久化差集。 |
| C6 | 无附件也有可用的完整 Context；合法 Builder 附件在本轮可读，私有临时 URL 不成为永久文件身份，其他 Builder 会话私有文件被拒绝。普通 Workflow 与 Builder 均不因新路径缺失而报 Context unavailable；大小限额按各自入口核验，不将 Builder 现有特例当作统一团队额度保证。 | Builder 原始 SSE/读取结果、最终聊天记录和上传归属；不同消费者的类型/文件名对照。 |
