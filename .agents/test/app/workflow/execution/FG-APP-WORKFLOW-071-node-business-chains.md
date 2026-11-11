---
case_version: 1
id: "FG-APP-WORKFLOW-071"
title: "常用节点的真实业务链路与下游消费"
business: "app/workflow/execution"
types: [api, integration]
category: basic
scenario: success
priority: P0
status: ready
tags: [workflow-foundation, http, code-sandbox, llm, dataset, workflow-tool, interactive, 覆盖基础场景, 覆盖异常场景, 覆盖边界场景]
evidence: [response, database]
sources:
  - packages/service/core/workflow/dispatch/tools/http468.ts
  - packages/service/core/workflow/dispatch/tools/codeSandbox.ts
  - packages/service/thirdProvider/codeSandbox/index.ts
  - packages/service/core/workflow/dispatch/ai/chat/index.ts
  - packages/service/core/workflow/dispatch/ai/chat/dispatchChatCompletion.ts
  - packages/service/core/workflow/dispatch/ai/chat/chatMessages.ts
  - packages/service/core/workflow/dispatch/dataset/search.ts
  - packages/service/core/workflow/dispatch/dataset/concat.ts
  - packages/global/core/dataset/search/utils.ts
  - packages/service/core/workflow/utils/index.ts
  - packages/service/core/workflow/dispatch/plugin/run.ts
  - packages/service/core/workflow/dispatch/plugin/runInput.ts
  - packages/service/core/workflow/dispatch/plugin/runOutput.ts
  - packages/service/core/workflow/dispatch/child/runApp.ts
  - packages/service/core/workflow/dispatch/interactive/userSelect.ts
  - packages/service/core/workflow/dispatch/interactive/formInput.ts
  - packages/service/core/workflow/dispatch/interactive/dynamicOptions.ts
  - packages/global/core/workflow/template/system/interactive/userSelect.ts
  - packages/global/core/workflow/runtime/utils.ts
  - projects/app/src/pages/api/v2/chat/completions.ts
routes: ["POST /api/v2/chat/completions"]
related: [FG-APP-WORKFLOW-060, FG-APP-WORKFLOW-066, FG-APP-WORKFLOW-067, FG-APP-WORKFLOW-068, FG-APP-WORKFLOW-069, FG-APP-WORKFLOW-070, FG-APP-AGENTV2-001, FG-PERMISSION-RESOURCE-004]
automation:
  - runner: node
    script: .agents/test/app/workflow/execution/FG-APP-WORKFLOW-071.mjs
    items: [C1, C2, C3, C4, C5, C6, C7]
baseline: "37b271c759eda4e3134c88d98939f81f053a8553"
---

# 常用节点的真实业务链路与下游消费

## 用例简介

单个节点返回成功，不代表它的请求、输出映射和后继节点都正常。本例把 HTTP、代码、AI、知识库、个人工具及交互节点放入可消费结果的完整工作流，验证真实依赖参与、正常结果可以向后传递，以及依赖失败或暂停不会被当作成功继续执行。

## 前置准备

- 使用包含 Pro 的隔离测试环境，记录主站/Pro 实际版本与运行图。Mongo/PG/Redis 使用 Mac Mini 的独立测试库、schema 或 Redis DB；不创建本机数据库或清理 Dev 业务数据。使用本轮独立应用、工作流工具、知识库集合和会话，不修改共享模型、供应商密钥、SSRF 或系统工具配置。
- C1 使用 `basic-http.json`，C2 使用 `basic-parameters.json`；绑定现有真实代码沙箱及可访问的 `workflow-fixture-server.mjs /echo`。HTTP 受控服务仅模拟外部供应商，沙箱执行必须是真实 JS/Python，不可把预期结果直接塞回 callback。
- C3 使用 `basic-model-chain.json`，C4 使用 `basic-dataset-chain.json`。`__MODEL_ID__` 选择测试团队已授权且可用的模型；受控外部模型可用于确定性消息/引用断言，但必须保留真实模型资源鉴权、客户端请求、usage 和队列，不向共享 dev 全站安装临时模型。记录采用真实模型还是受控模型，不能把自由输出质量测试与运行正确性混为一谈。
- C4/C7 通过正常知识库 UI 创建本轮独立集合，录入唯一关键词 `FGTEST<RUN>` 对应答案 `FOUND<RUN>`，等待训练完成后先用知识库搜索确认可召回，再绑定 `__DATASET_ID__`。模板使用全文检索、关闭扩展与重排；空结果对照使用本轮另一空知识库，或经预检确认无结果的唯一关键词，不能仅调高随机相似度阈值猜测无命中。C7 用同一命中片段构造两路有重叠 ID 的真实检索结果，并保存两路原始详情作为合并前快照。
- C5 先以工作流工具类型发布 `basic-tool-child`，再将其 ID 绑定 `basic-tool-parent`；子应用对照复用 `child-leaf` / `child-parent`。C6 发布 `basic-interactive`，选项和表单输入由真实界面/聊天协议提交，不伪造 entryNodeIds、memoryEdges 或已完成输出。
- 公共调用为 owner 真实登录态下的 `POST /api/v2/chat/completions`，使用 appId、chatId、messages、stream=true、detail=true。每个独立变体新 chatId；C3 的第二轮及 C6 的选择/表单恢复沿用原 chatId。完整阶段最长 120 秒，每秒轮询；暂停以真实交互事件/记录为终态，不能等超时后算通过。
- 同时保存请求、逐事件响应、最终消息及真实节点详情，数据库证据只按 teamId/sourceType/appId/chatId 读取。外部模型/HTTP 证据仅保留本轮 RUN，模型 Authorization、cookie 和私有 URL 脱敏；清理只通过正常业务入口删除本轮创建的资源。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | HTTP 协议；每变体恢复 `basic-http` | 依次执行原图 POST JSON、GET（只传 query/header）、POST x-www-form-urlencoded、POST raw。GET 的 RUN 放 query；表单设置键 runId/text，raw 设置含本轮 RUN 的文本。每组读取 Echo 实际出站请求、供应商回显和 Observe 消费结果。 |
| C2 | 代码节点；每变体恢复 `basic-parameters` | JS 原图运行后，改 codeType=py 且代码为 `def main(inputs): return {"result": inputs}`，输入/输出声明不变。Python 沙盒将整个输入对象作为单个位置参数传入。另以 JS 抛出 `Error("FG-TEST sandbox failure")`，开启 catchError，连接唯一 Caught Answer，正常 Reply 仍保留；错误端口使用 `Probe-source_catch-right`。 |
| C3 | AI 输入与输出；`basic-model-chain` | 以唯一问题 Q 执行，模板 Model.history=0、isResponseAnswerText=false。同会话第二轮问题 Q2，将 Model.history 改 2 并发布（或在有写权限的编辑测试中传入同一图）；另以新会话开启 isResponseAnswerText=true。记录实际模型请求或节点 historyPreview/query，消费 Model.answerText 的 Reply 始终保留。 |
| C4 | 检索到 AI；`basic-dataset-chain` | 使用唯一关键词命中本轮知识库；读取 Search.quoteQA / quoteList、Model 收到的引用上下文及最终 Reply。再恢复新会话使用预检无结果的对照，保持 Search 到 Model 到 Reply 拓扑及真实资源授权。 |
| C5 | 工作流工具与子应用结果 | 完整执行 `basic-tool-parent`，令 label 为本轮问题，核对 Input → Output → 父 Tool → Reply。随后执行 `child-parent`：父传 a=child-input，子更新 a=child-output 并回复，父读取自己的 a 和子 answerText。此处只验证结构与输出消费，默认值矩阵复用 057/C5。 |
| C6 | 交互节点正常生命周期；每变体新会话 | `basic-interactive` 首轮停在 Select；分别以 A/B 恢复，停在 Form；再提交 `{"name":"FG-TEST","count":0}` 到最终 Reply。动态选项对照将 Select.userSelectOptions 设 reference 指向全局 options=[A,B]，只保留 Select → SelectedA 的 ref_default 出口，删除 SelectedB 及其到 Form 的边，并把 SelectedA 文本改为 Select.selectResult；选 B。另用 options=[] 对照无可选项错误。 |
| C7 | 引用合并；独立图与新会话 | 将两个真实检索节点输出连接到知识库引用合并节点，再由下游代码节点消费结果。先使用足够大的 limit 验证重叠 ID；再让其中一路为预检空结果；最后把 limit 设为 0，分别记录输入和输出。 |

## 预期结果

公共断言：节点输入、外部请求、输出映射、下游实际消费四者必须对应同一 RUN。需要的依赖未启用/不可读时记录受影响变体阻塞，不用内部 mock 或其他场景成功补充证据；没有执行不标通过。通用 catchError 传播、SSE 关闭、文件大小/权限、变量隔离、容器重试、Agent 子流程、模型资源鉴权分别关联 054～056、060、AGENTV2-001 和 PERMISSION-RESOURCE-003，不在这里复制同一矩阵。

| 子场景 | 特有预期 | 证据获取方式 |
| --- | --- | --- |
| C1 | 四组外部 method、query、header、Content-Type、body 与实际配置一致；GET 不发送 JSON body，表单为解码后的键值，raw 为原文本。HTTP 结果进入 httpRawResponse 并由 Observe 消费，不把供应商对象隐式转为 `[object Object]`；JSONPath/默认值的精确规则复用 057/C4。 | 外部 `/echo` observation、Echo 请求与 httpResult、Observe.customInputs 和最终消息；不把 HTTP 200 本身算成功。 |
| C2 | JS/Python 均返回结构相同且类型正确的 result，动态输入均进入真实 main；JS 原图保存可见 FG-TEST 日志。抛错变体节点记录真实错误且只运行 Caught，正常 Reply 不运行，不套用成功输出默认值；不要求已执行的外部代码副作用回滚。 | 沙箱生产调用结果、Probe.customInputs/customOutputs/codeLog/errorText、Caught/Reply 实际执行集合。 |
| C3 | 模型收到 Prompt 生成的 QUESTION:Q；history=0 不带过往问答，history=2 时保留本会话允许范围内的首轮记录，最新问题不被旧问题替换。关闭直接回复只隐藏 Model 的用户可见正文，不删除其 answerText 输出，Reply 仍为 FINAL:模型结果；开启后 Model 正文可见，Reply 仍正常消费。usage 记录来自实际请求，真实模型不要求逐字输出固定答案。 | 模型外部请求（若可控）或 historyPreview/query、Model.answerText 的下游回显、三轮消息与 usage；只观察 FINAL 不足以证明模型参数正确。 |
| C4 | 命中结果属于本轮 dataset/collection/data，内容含对应关键词和答案；Model 的引用输入为真实 quoteQA 数组而非 `["Search","quoteQA"]`，上下文可定位到本轮片段；Reply 消费本轮模型输出。空结果为 [] 而非失败/旧引用，Model 和 Reply 仍按配置执行，不声称自由回答必然包含某种文案或必然显示引用角标。 | Search.quoteList/节点输出、Model 的引用/历史预览或受控供应商请求、关联资源 ID 和最终响应。 |
| C5 | 工具的 label、amount=0、enabled=false 完整通过输入和输出节点，被父按声明输出 ID 消费；子应用 answerText 为子实际回复，父可读该输出而不能把子变量当父变量。`child-parent` 最终父 a 仍为父值，子回复含 child-output；具体隔离规则由 060/C6 验证。 | 工具 pluginOutput / 父 Tool 输出、子/父响应树、两个入口最终消息及绑定图。 |
| C6 | 首轮 Once 恰好 1 次、无 Selected/Form/Reply 后继成功执行；选择 A/B 后只执行对应 Selected 节点并返回 Form 交互，不重跑 Once；表单提交后 Reply 消费 `{name:"FG-TEST",count:0}`，0 不丢失，两个交互均结束。动态 B 只走 ref_default 一次并输出 B，不按静态选项端口路由；空 options 返回节点错误/提示而非空交互挂起，Form/Reply 不执行。 | 每阶段实际交互 params/type、选择及表单提交请求、节点执行集合、Once 外部次数、最终持久化消息；不以手造恢复快照代替。 |
| C7 | 两路非空时同一 data ID 合并为一个结果，重叠片段按实际排序分数参与融合；单路为空时保留非空结果。`limit=0` 不回退成默认值，非空输入仍按现有限额算法至少返回首项；上游两路原始结果的分数对象不因合并被改写。 | 两路原始 quoteList、合并结果的 ID/score/顺序、下游消费值及每组实际 limit。 |
