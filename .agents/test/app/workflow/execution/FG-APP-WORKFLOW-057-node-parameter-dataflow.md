---
case_version: 1
id: "FG-APP-WORKFLOW-057"
title: "节点参数解析、类型与输出传递"
business: "app/workflow/execution"
types: [api, integration]
category: basic
scenario: success
priority: P0
status: ready
tags: [workflow-foundation, node-parameters, dataflow, dynamic-input, default-value, 覆盖基础场景, 覆盖边界场景]
evidence: [response, database]
sources:
  - packages/service/core/workflow/dispatch/utils/runtime.ts
  - packages/service/core/workflow/dispatch/utils/replaceEditorVariable.ts
  - packages/service/core/workflow/dispatch/queue.ts
  - packages/global/core/workflow/runtime/utils.ts
  - packages/global/common/workflow/reference.ts
  - packages/service/core/workflow/dispatch/tools/codeSandbox.ts
  - packages/service/core/workflow/dispatch/tools/http468.ts
  - packages/service/core/workflow/dispatch/plugin/run.ts
  - packages/service/core/workflow/dispatch/plugin/runInput.ts
  - packages/service/core/workflow/dispatch/plugin/runOutput.ts
  - packages/global/core/app/tool/workflowTool/utils.ts
  - projects/app/src/pages/api/v2/chat/completions.ts
routes: ["POST /api/v2/chat/completions"]
related: [FG-APP-WORKFLOW-060, FG-APP-WORKFLOW-056, FG-APP-WORKFLOW-058, FG-APP-WORKFLOW-059]
automation: []
baseline: "37b271c759eda4e3134c88d98939f81f053a8553"
---

# 节点参数解析、类型与输出传递

## 用例简介

用户把字面量、全局变量及上游输出配置为节点输入，节点应接收到正确的值和类型，而不是引用标记或旧数据。通过真实代码节点回显输入、HTTP 节点提取输出及个人工作流工具调用，验证参数解析到下游消费的完整链路。

## 前置准备

- 在运行本 PR 的主站和 Pro 上执行，记录实际代码基线、服务地址及版本；不能用另一个分支的服务证明本 PR。Mongo/PG/Redis 使用 Mac Mini 的独立测试库、schema 或 Redis DB，不创建本机数据库或清理 Dev 业务数据。使用有创建/发布权限的测试团队及 `FG-TEST-<RUN>` 独立应用，凭证仅从仓库外环境变量读取，不修改共享模型、SSRF 或资源权限配置。
- 导入同目录 `fixtures/basic-parameters.json`、`basic-http.json` 和 `basic-tool-child.json` / `basic-tool-parent.json`。子工具以工作流工具类型创建并发布，再绑定父图 `__CHILD_TOOL_ID__`；其他图以工作流类型创建发布。默认变量 `a=A0,n=9,text=seed,obj={items:[1]}`。
- C1～C4 需要真实代码沙箱；C3～C4 使用 `workflow-fixture-server.mjs` 的 `/echo`，绑定 `__GATE_URL__` 为主站按现有出站安全策略可访问的测试地址。不可为测试关闭 SSRF；无法访问时阻塞对应场景。该服务只回显外部 HTTP，不模拟节点执行、鉴权或上下文。
- 每个独立变体使用新 chatId，问题为 `fgtest-<RUN>-<场景>-<变体>`。每轮先保存实际绑定 JSON；请求 `POST /api/v2/chat/completions`，使用真实 owner 登录态、appId、chatId、messages、stream=true、detail=true。SSE 最长等待 120 秒，完成后再取最终消息和节点详情；不能只检查 HTTP 200。
- 以节点执行详情及下游回显作为主要证据。必要时只读查询 `chats`、`chatitems`、`chat_item_responses`，限定 `teamId/sourceType=app/appId/chatId`，不得用全库数量作断言；响应树按 id/parentId 合并，同一响应的增量记录不算重复执行。
- 每个变体恢复模板配置，不继承前一轮会话变量。只通过正常业务删除入口清理本轮应用及测试数据；应用软删除和异步物理清理分别核验，不删除已有 dev 数据。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 基础；`basic-parameters` 原图 | 完整执行 Start → Source → Probe → Reply。对照 literal、question、source、mixed：Source 的输出 `id=source-output-id`，但 `key=system_text`，Probe 使用输出 ID 引用；mixed 同时包含节点插值与 `{{a}}`。 |
| C2 | 类型边界；每变体恢复原图 | 读取 Probe 的 num、flag、obj、arr、pair、refs 的实际类型。再把 obj 改为对全局 obj 的 reference，arr 改为 JSON 文本 `[0,false,""]`，num 改为字符串 `"0"`。普通二元素数组 pair 保持手输模式，refs 保持引用模式。 |
| C3 | 基础；恢复原图，随后使用 `basic-http` | 给 Probe 增加可编辑输入 extra，选 reference 指向 Source 输出；增加同名自定义输入 `userSelectOptions`，也引用 Source 输出，Probe 的 main 原样回显。HTTP 变体传 `text` 含中文、双引号、反斜杠及换行，n=7、obj={items:[1,2]}；执行 Echo → Observe → Reply，读取外部实际收到的 body/header/query。 |
| C4 | 输出边界；恢复 `basic-http` | `/echo` 返回 nil=null、zero=0、flag=false、empty=""，不返回 absent/optional。保持 Echo 中 required absent 的默认 FALLBACK、非 required optional 的默认 MUST-NOT-FILL；Observe 通过不同输出 ID 引用各 JSONPath 结果，回显到 Reply。追加可选 any 全局变量 missing、不设置默认值，Observe 增加 any 输入引用它；main 返回 `{observed:{...inputs,missingIsUndefined:inputs.missing===undefined}}`。 |
| C5 | 工具输入边界；两图已发布，每变体新会话 | 父 Tool 原图传 label=当前问题、amount=0、enabled=false；再移除父 Tool 的这三个输入，使用子 Input 的 defaultValue；最后父 Tool 显式传 label=""、amount=0、enabled=false。记录子 Input、Output、父 Tool 与最终 Reply。 |

## 预期结果

公共断言：同时核对生产节点的输入详情、声明输出被下游实际消费的值及最终消息，不能以最终回答含某个词代替类型验证。结构比较使用 JSON 深比较，不依赖键顺序、空格或 Answer 自动添加的前导换行；截图/证据不得记录真实密码、cookie 或私有签名 URL。本例不重复 WORKFLOW-060 的变量隔离、提交/回滚规则及 WORKFLOW-056 的协议与 catchError 矩阵。

| 子场景 | 特有预期 | 证据获取方式 |
| --- | --- | --- |
| C1 | Probe 收到 literal=LITERAL、question=本轮问题、source=SOURCE、mixed=`q=本轮问题\|a=A0`。输出按 ID 解析、按 key 接收 callback 数据，ID 与 key 不同也能正确传递；Reply 中没有引用二元组或未替换标记。 | Probe.customInputs/customOutputs、最终消息解析后的对象、实际 JSON。 |
| C2 | 原图 num 为数字 7、flag 为布尔 false、obj 为对象、arr 为 `[0,false,""]`，不变成整段字符串；pair 保持 `["left","right"]`，不被误判成节点引用；refs 为 `[本轮问题,"SOURCE"]`。变体中 num 为数字 0，引用 obj 与输入对象深相等，JSON 数组与原图数组相同。 | 回显对象及类型断言；引用/手输配置前后差异。不要把布尔字符串 `"false"` 等同原生 false。 |
| C3 | extra 和自定义 userSelectOptions 均是 SOURCE；只对真正用户选择节点特殊处理选项，不能让其他节点的同名参数漏出动态输入聚合。Echo 收到的 text 与输入逐字符一致，n 为数字、obj 为对象、arr 为混合数组；header/query 中 RUN 正确，JSON 有效，无二次转义或对象 `[object Object]`。 | Probe.customInputs、沙箱实际回显、限定 RUN 的外部 observation 及 Echo 请求详情。 |
| C4 | Observe 收到 fallback=FALLBACK；optional 为 undefined（JSON 对象中省略），nil=null、zero=0、flag=false、empty="" 不被默认值覆盖。echo-object 为原对象，echo-array 与 wildcard 结果为 `[0,false,""]`；字段按输出 ID 绑定，不把 JSONPath 当普通对象键查找。缺失普通变量为 undefined，不能读到其他会话值；本例不要求所有普通节点输入都统一应用 defaultValue。 | Observe.customInputs/customOutputs、Reply JSON、外部原始响应；对 undefined 使用 `value === undefined` 断言，不把 null 当等价结果。 |
| C5 | 原图输出 `{label:本轮问题,amount:0,enabled:false}`；省略输入时为 `{label:"TOOL-DEFAULT",amount:8,enabled:true}`；显式空/假值仍为 `{label:"",amount:0,enabled:false}`。父 Reply 使用 label-id 取得 label，工具参数名、输出 key 和输出 ID 不串位。 | 子/父节点详情的 toolInput、pluginOutput、最终消息及每变体绑定 JSON。 |
