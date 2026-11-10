---
case_version: 1
id: FG-APP-WORKFLOW-053
title: 内联 MCP 与 HTTP 工具集从配置到调用
business: app/workflow/execution
category: basic
types: [ui, api, e2e, integration]
scenario: success
priority: P0
status: ready
tags: [pr-8074, inline-toolset, mcp, http, toolcall, 覆盖基础场景, 覆盖异常场景, 覆盖边界场景]
evidence: [ui, response, database, log]
sources:
  - .agents/test/support/toolset-fixture.mjs
  - packages/global/core/workflow/template/system/mcpToolSet.ts
  - packages/global/core/workflow/template/system/httpToolSet.ts
  - packages/global/core/workflow/type/node.ts
  - packages/global/core/app/jsonschema.ts
  - packages/global/core/app/tool/httpTool/utils.ts
  - packages/global/core/app/tool/runtime.ts
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/components/NodeTemplates/list.tsx
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodeToolSet.tsx
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/components/ToolSetList.tsx
  - projects/app/src/pageComponents/app/detail/Edit/HTTPTools/SchemaConfigModal.tsx
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/hooks/toolSetDebug.ts
  - projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/hooks/useDebug.tsx
  - projects/app/src/pages/api/core/app/mcpTools/getTools.ts
  - projects/app/src/pages/api/core/app/httpTools/getApiSchemaByUrl.ts
  - projects/app/src/pages/api/core/workflow/debug.ts
  - packages/service/core/workflow/dispatch/utils/index.ts
  - packages/service/core/workflow/dispatch/ai/toolcall/hooks/useToolCatalog.ts
  - packages/service/core/workflow/dispatch/child/runTool.ts
  - packages/service/core/ai/llm/request/requestBody.ts
  - packages/service/core/app/version/schema.ts
  - packages/service/common/response/index.ts
routes:
  - POST /api/core/app/mcpTools/getTools
  - POST /api/core/app/httpTools/getApiSchemaByUrl
  - POST /api/core/app/version/publish
  - POST /api/core/workflow/debug
  - POST /api/v1/chat/completions
related: [FG-APP-WORKFLOW-003, FG-APP-WORKFLOW-040, FG-APP-WORKFLOW-054, FG-APP-WORKFLOW-055]
baseline: 346deb76c7fb8f7d961f0312d57bdea3d541180a
---

# 内联 MCP 与 HTTP 工具集从配置到调用

## 用例简介

工作流作者直接在工具调用节点旁配置 MCP 或 HTTP 工具集，无需先创建独立工具集 App。配置保存后能够重载、选择单个工具调试，并在完整对话中由 AI 生成参数调用；远端定义更新后，可用工具和参数以当次远端定义为准，本地只覆盖同名描述。

## 前置准备

- 版本：部署 PR #8074 基线或其修复版本，记录实际 commit；用例格式取自 upstream/main `dd3cc357757bfb7c11a607c279a69a5f73a48c74`。仅部署该 main 不包含本需求，不能据此判断功能缺失为失败。
- 身份：独立测试团队及有工作流创建、编辑、发布、运行和删除权限的账号；记录 `BASE_URL`、`teamId`、`appId` 和 `RUN_ID=pr8074-<唯一后缀>`。
- 协议夹具：提供通过现有地址安全检查、可从服务端访问的 HTTPS MCP 服务与 OpenAPI 文档/HTTP 服务。测试依赖替代的是远端工具和模型，FastGPT 的 UI、API、工作流引擎、MongoDB 使用真实实例，不通过 mock handler 代替业务入口。
- 可复用 `.agents/test/support/toolset-fixture.mjs`：通过 `FASTGPT_FIXTURE_TLS_KEY` 和 `FASTGPT_FIXTURE_TLS_CERT` 指定仅用于测试的私钥、证书后启动；证书须受 dev 服务信任。默认本机 9446 为控制端和模型网关，9447/9448 为两个 HTTPS 服务端。控制端接受 `version`、`reverse`、`plan` 等测试状态，审计包含模型消息，所有数据和鉴权值均须使用本轮合成值。
- MCP M0：工具 `echo`，描述 `remote-echo-v1`，参数为 object，必填字符串 `q`、可选整数 `limit`；`tools/call` 返回文本中的 JSON `{fixture:"mcp",q,limit}`。另有 `fail`，调用时返回 MCP `isError: true`；协议端允许将目录临时切换为无效响应并恢复。
- HTTP H0：公开 OpenAPI 3.0 文档，`servers[0].url=HTTP_ORIGIN_A`；`GET /echo` 的 `operationId=echo`、描述 `remote-echo-v1`，query 参数同 M0；接口返回 `{fixture:"http-A",q,limit}`。`HTTP_ORIGIN_B` 同路由返回 `fixture:"http-B"`。另有 `GET /fail`，返回 HTTP 500。原始文档不含 FastGPT 扩展 `isToolParam`。
- 两种协议的 v2 夹具：保留 `echo`，新增必填字符串 `locale`，描述改为 `remote-echo-v2`；新增工具 `lookup`（HTTP 为 GET /lookup、operationId=lookup），参数为必填字符串 q，返回 `{fixture:"对应协议标记",operation:"lookup",q}`。远端调用审计记录 `RUN_ID`（来自 q）、工具/方法/路径、参数、结果和开始/结束时间，不能记录真实凭据。
- 命名边界夹具：同一图同时挂载 M0 和 H0，两者都有 echo，但描述分别明确 MCP/HTTP；MCP 另提供一个长度为 64、仅字母和下划线的工具名，返回该远端原名标记。用正常非空父节点 ID，不以超长非法导入节点制造问题。
- 模型：选择原生 ToolCall 模式。使用可控的 OpenAI 兼容测试网关：记录脱敏请求，校验所有 `tools[].function.name` 满足 `^[a-zA-Z0-9_-]{1,64}$` 且唯一；按指定工具的能力描述返回对应名称及确定性参数，下一轮收到工具结果后结束，不依赖自然语言逐字一致。非法名称必须拒绝，不能由网关悄悄改名。
- UI 基线 D0：新建工作流 `Start → ToolCall → Reply`，ToolCall 通过菱形工具边挂载本次内联工具集；使用真实模板创建节点，保存实际 nodeId 和边四元组。挂载通用规则复用 003，不重复遍历所有连线边界。每个独立子场景从对应 D0 副本开始，连续更新仅在注明承接时使用。
- 证据：浏览器 Network 保存实际请求/响应；读取测试库 `app_versions` 的权限限于本例 appId；收集工具夹具和模型网关脱敏审计。发现/调试最多等待 40 秒，完整对话最多 90 秒，以返回目录、结果或明确错误为终态，超时保存现场并判失败；不盲目重发对话。
- 清理：导出脱敏证据后，通过应用更多菜单或 `DELETE /api/core/app/del?appId=<本例appId>` 删除本例工作流；清除 RUN_ID 对应夹具审计，不修改其他测试资源。缺少部署、网关或夹具时记录对应场景阻塞，不标记通过。
- 当前基线已知回归：派生子节点 ID 被直接作为模型函数名。C1/C2 的模型契约断言应暴露该问题；不把现有非法名称写成正确预期。HTTP 请求头保存、引用凭据和交互恢复分别在 054/055 验收。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 基础；D0 + M0，无鉴权 | 从工具调用分类添加 MCP 节点，填写服务 URL 并解析；将 echo 描述改为 `local-echo`，保存并发布、刷新。选择 echo 单工具调试，传 `q=RUN_ID, limit=2`；另起完整对话令 ToolCall 调用同一工具，模型生成这两个业务参数。 |
| C2 | 基础；独立 D0 + H0，无鉴权 | 添加 HTTP 节点，按 URL 导入整个 OpenAPI；确认 Schema 只读、可改工具描述。base URL 留空时执行 echo；再将 base URL 改为 B、保存发布，重新调试和完整对话。 |
| C3 | 边界；分别承接 C1/C2 的已保存 v1 配置 | 不刷新节点、不保存工作流，远端切换 v2；新建对话令 echo 带 `locale=zh-CN` 调用，再令模型选择新增 lookup。记录实际目录与模型请求。 |
| C4 | 异常与恢复；独立 D0，分 MCP/HTTP 两个变体 | 目录解析成功前使用无效的 MCP 目录响应/非法 OpenAPI 文档，观察错误；修复远端后重新解析。另在目录可用时调试 fail，随后选择 echo 重试业务调用。 |
| C5 | 边界；独立 HTTP D0，已保存 A 与 local-echo | 弹窗编辑为 B 后取消，保存工作流并刷新；重新打开，发起 A 的慢解析，紧接着切换到 B 并完成快解析，再释放 A；保存当前有效结果。两次远端响应通过测试夹具控制先后，不用固定 sleep 猜测完成顺序。 |
| C6 | 异常；独立 D0，分 MCP URL 为空与 HTTP 文档 URL 未配置两个变体 | 挂载未配置节点，尝试运行/发布，记录节点诊断与实际网络请求；补全有效配置后再次尝试。 |
| C7 | 命名边界；独立 D0 + 命名边界夹具 | 同时挂载两个都有 echo 的工具集，并提供上述长名工具；模型按协议能力依次选择 MCP echo、HTTP echo 和长名工具，每次回填确定性参数。 |

## 预期结果

公共断言：保存接口成功为 HTTP 200、JSON `code=200, data=null`；目录/调试接口除 HTTP 状态外还验证业务 code/data。完整聊天按实际流式事件和工具结果验收，不能套普通 JSON 成功包。临时子工具只存在运行态，Version 中仍是一个 toolSet 节点及原挂载边；UI、模型请求与远端审计通过 appId、RUN_ID 和时间窗对应。失败调用可能已产生模型用量，不要求费用为零。

| 子场景 | 验证方式 | 特有预期 | 证据获取方式 |
| --- | --- | --- | --- |
| C1 | UI + API + DB + 远端审计 | 刷新后 URL、摘要、local-echo 和挂载关系保留；内联节点无外部 pluginId，toolList 仅有 name/description。单工具调试返回 MCP 原结果；完整对话生成业务参数，实际 MCP 调用工具名仍为 echo。所有模型函数名合法且唯一，返回名称可反查到正确工具；无逐字段“是否 AI 生成”配置要求。 | 保存/调试响应、重载 UI、模型请求及结果、MCP 审计、下述 Version 查询。 |
| C2 | UI + API + DB + 远端审计 | URL 导入整份定义；无 override 调用 A，有 override 调用 B，调试与正式执行一致；参数 Schema 来自 OpenAPI，原文缺少 isToolParam 不影响 AI 生成参数。HTTP 原结果进入标准工具响应；Version 不保存完整 OpenAPI 和展开后的 httpTool 子节点。 | 夹具实际 host/method/path 与 JSON、模型参数、Version 配置；不只看请求成功提示。 |
| C3 | 模型网关 + 远端审计 + DB | 当次 echo 参数包含 locale；同名 echo 仍用 local-echo，本地未保存的 lookup 也可调用。本地摘要不充当允许列表；原 Version 不因远端变化自动写入完整定义。 | 网关记录目录/parameters/description，分别比对 v1/v2 及只读 Version 前后快照。 |
| C4 | UI + 响应 + 远端审计 | 解析失败可见且可重试，不展示成功目录；修复后可用。MCP isError 与 HTTP 500 均呈现标准工具错误/详情，不能伪装成成功；后续 echo 能成功。这里只验证各自协议错误语义，不要求两个原始结果结构完全相同。 | Network、调试错误与后续成功结果、夹具次数和时间。 |
| C5 | UI + DB + 响应 | 取消后仍为 A；旧 A 请求晚到不能覆盖 B 的有效结果或在关闭后写回。最终保存重载与用户最后确认的 B 一致。此处不要求 MCP 使用与 HTTP 完全相同的弹窗提交时机。 | 操作前后配置、受控响应顺序和最终 Version，记录 HTTP 弹窗实际可见/关闭状态。 |
| C6 | UI + 响应 | 明确指出未配置节点，运行/发布前校验不能把它当作有效工具；补全后相同图通过。没有远端地址时不得发起业务工具调用。草稿保存规则复用 040，不要求所有未完成配置都禁止存草稿。 | 节点诊断、校验结果、Network 与夹具调用审计。 |
| C7 | 模型请求 + 远端审计 | 模型函数名均合法、唯一且不超过 64 字符；不能因远端同名而合并/覆盖工具，也不能直接截断造成冲突。三个模型名称均反查到正确节点；MCP 最终仍以完整远端原名调用，HTTP 仍按正确 method/path 调用。 | 模型函数名与实际调用一一对照，检查三个远端结果标记和调用次数。 |

只读 Version 查询，使用本例隔离库及已记录 appId；v2 对照复用同一查询：

```js
db.app_versions.find(
  { appId: ObjectId("<appId>") },
  { nodes: 1, edges: 1, isPublish: 1, isAutoSave: 1, time: 1 }
).sort({ time: -1 }).limit(3);
```
