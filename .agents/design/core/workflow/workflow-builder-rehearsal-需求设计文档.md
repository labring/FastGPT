# Workflow Builder 方案预演阶段（Mermaid 前自查）需求设计文档

## 0. 文档标识

- 文档状态：需求沟通中（决策已按推荐项占位，待用户确认）
- 关联需求文档：`workflow-cli-builder-需求设计文档.md`
- 关联功能文档：`workflow-cli-builder-功能开发文档.md`（第 7.4 节 PR5 流程）
- 关联决策文档：`workflow-builder-preview-ask-sync.md`（前端确认卡片样式，不在本次范围）

## 1. 背景与问题

### 1.1 现状

当前 Workflow Builder 生命周期（`pro/admin/src/service/core/ai/workflowBuilder/runner.ts` 系统提示词）：

```text
1. 需求建模 → 2. 事实核对 → 3. 能力与依赖解析 → 4. 需求闭合(ask)
→ 5. 流程预览(Mermaid) → 6. 实现(stage) → 7. 校验修复(draft validate) → 8. 原子交付(commit)
```

### 1.2 问题

AI 在出 Mermaid 之前**不做任何草稿操作**，系统提示词明确禁止：

> "预览未确认前不得调用 workflow_cli_stage、workflow_cli_commit 或任何工作流修改工具"（runner.ts:141）

因此 AI 可能提交一个"会导致节点不可用"的方案（例如：删除工具调用节点下唯一的工具、删除条件循环最后一个 break、删除被其他节点引用的输出节点）。这类问题要等到用户确认 Mermaid、进入搭建阶段的 draft validate 才会暴露：

- 暴露时已越过用户确认，AI 只能自行修复；若修复涉及改变已确认的业务拓扑，又违反"不得擅自改变已确认 Mermaid 中的业务拓扑"约束，形成死结。
- 用户在 Mermaid 上看到的是一个注定无法通过校验的方案，体验差。

### 1.3 目标

在"需求闭合"与"流程预览"之间插入**简单预演阶段**（内置静默，用户只见结论）：

1. AI 出 Mermaid 前，把本次修改涉及的 ChangeSet 提交预演（内存 apply + validate，毫秒级，不碰画布）。
2. 只筛业务后果类诊断（节点不可用：删除 toolCall 唯一工具 `WORKFLOW_TOOL_REQUIRED`、引用失效、条件循环唯一 break 被删等常见问题）：
   - Agent 能自修的（调整引用来源、补替代工具等）→ 静默自修，**不**问用户。
   - 需要用户业务决策的 → 用业务语言通过 ask_agent 展示结论（需要补什么 / 哪些节点不允许修改）。
3. 配置类诊断（schema、输入模式、值类型等）预演**不深查**，留到正式搭建 draft validate 处理。
4. 预演通过（无业务后果类 error）后才调用 `workflow_builder_present_preview` 出 Mermaid。

## 2. 方案设计

### 2.1 生命周期调整

```text
1. 需求建模 → 2. 事实核对 → 3. 能力与依赖解析 → 4. 需求闭合(ask)
→ 4.5 方案预演(新, 内部) → 5. 流程预览(Mermaid) → 6. 实现(stage) → 7. 校验修复 → 8. 原子交付(commit)
```

### 2.2 预演是内置静默功能，用户只见结论

**预演全程对用户不可见**：暂存分片、draft validate、技术问题自主修复都是 Agent 内部动作，不向用户展示任何"预演""诊断""校验"过程，也不新增 UI 阶段。用户对预演的唯一感知是**结论**：

| 预演结果 | 用户感知 |
| --- | --- |
| 预演通过（无业务后果问题） | 无感知，Agent 直接出 Mermaid 预览 |
| 预演发现需要用户决策的业务后果 | 一次 ask 提问，只展示结论（见 2.3） |

### 2.3 预演阶段行为（内部，简单预演）

**定位：只查"修改/删除现有节点导致的业务后果"，不深查配置完整性。**

- 预演引擎 `planWorkflowChangeSet`（`packages/workflow-core/src/command/applyChangeSet.ts:75`）是纯内存操作（内存副本 apply + validate + checksum），毫秒级，不 stage、不写草稿、不启动 CLI 子进程，**不构成正式搭建前置**。
- 预演**只筛选业务后果类诊断**（节点不可用、引用失效等），配置类诊断（schema、输入模式、值类型、必填输入缺失等）**不返回给用户**，也不在预演阶段处理——配置完整性留到正式搭建的 draft validate（有 10 次修复预算兜底）。
- 修改类任务（涉及删除/卸载/重配现有节点）的命令量通常很小（如"删除一个工具"仅 1-2 条命令），Agent 生成变更集的开销可控；新建任务不触发"节点不可用"，可跳过预演。

预演步骤：

1. **提交变更集**：Agent 出 Mermaid 前，把本次修改涉及的 `WorkflowChangeSet` 通过 `workflow_cli_query` 新增 action（`rehearse`）一次性提交给 Gateway（只读查询，不改任何状态）。
2. **内存校验**：Gateway 调用 `planWorkflowChangeSet`（复用 `validateWorkflowBuilderPlanResult` 的内存路径）→ 拿 diagnostics，**只保留业务后果类**。
   - apply 阶段若因配置类错误失败（如值类型不符）→ 返回结构化错误给 Agent 内部修复，不打扰用户。
3. **分类处理**：
   - 业务后果类 → 合并为一次 ask_agent 提问，**只呈现结论**，例如：
     - "这个方案需要删除工具调用节点「xxx」唯一的工具，删除后该节点将无法执行任何工具调用。**需要你决定**：保留其中一个工具，还是把整个工具调用节点也删除？"
     - "「xxx」节点当前被「yyy」节点引用，方案中准备删除它会导致引用失效。**该节点不允许删除**，除非你确认调整引用来源：由我改用其他节点的输出，还是保留这个节点？"
   - Agent 能自修的业务后果（如调整引用来源、补一个替代工具）→ 直接改变更集重新 rehearse，不打扰用户。
4. **用户回答** → 按回答调整变更集 → 重新 rehearse，直到无业务后果类 error。
5. **出口**：预演通过才出 Mermaid；未通过不得调用 preview 工具。
6. **变更集复用**：预演通过的变更集直接作为用户确认后正式 stage 分片的来源（拆分成片 + stage），**不重复生成命令**。

**结论呈现原则**：
- 只讲"需要补什么 / 哪些东西不准修改"，把决策权交给用户。
- 不得暴露预演过程、诊断码、校验机制、分片等内部细节。
- 结论必须合并为单次 ask，不得逐条追问。

### 2.3 诊断分类表（预演阶段）

**预演只关心业务后果类（"节点不可用"），配置类不深查、不返回给用户：**

| 诊断码 | 类别 | 预演处理 |
| --- | --- | --- |
| `WORKFLOW_TOOL_REQUIRED`（删除 toolCall 唯一工具） | 业务后果 | ask 用户（保留工具 or 删节点） |
| 引用失效类（删除节点/输出导致悬空引用） | 业务后果 | ask 用户（保留节点 or 改引用来源）；Agent 能自修则自修 |
| `WORKFLOW_CONDITIONAL_LOOP_BREAK_REQUIRED`（条件循环唯一 break 被删） | 业务后果 | ask 用户 |
| 删除容器节点（级联删除全部子节点） | 业务后果 | 告知用户"会连带删除 N 个子节点"，由用户决定 |
| 删除 workflowStart / systemConfig / 容器系统子节点（apply 直接拒绝） | 业务后果 | Agent 改变更集自修（换方案），不问用户 |
| 删除容器导致子节点级联（破坏业务拓扑） | 业务后果 | 视情况 ask 用户 |
| `WORKFLOW_SCHEMA_INVALID` / `WORKFLOW_INPUT_VALUE_*` / `WORKFLOW_EDGE_INVALID` / `WORKFLOW_REQUIRED_INPUT_MISSING` 等配置类 | 配置 | **预演不深查**，留到正式搭建 draft validate（10 次修复预算兜底）；若 apply 因配置失败则返回结构化错误由 Agent 内部修复 |

分类原则（与现有"交互边界"一致）：**AI 能安全推断的技术细节自己修；只有 AI 无法安全推断、需要用户业务决策的后果才 ask 用户**。不得把诊断码、schema 错误等技术细节暴露给用户。

### 2.4 约束调整

| 现状约束（runner.ts:597-618） | 调整后 |
| --- | --- |
| 预览未确认前禁止 stage / commit（硬校验） | **原样保留**，无需放开。预演走 `workflow_cli_query` 新增只读 action（`rehearse`），不违反"预览前禁 stage"约束 |

### 2.5 草稿生命周期（确认后）

- 预演不产生草稿。
- 用户 confirm 后：直接把预演通过的变更集拆分成片 → stage → draft validate → commit（现有正式流程，一次完成）。
- 用户 revise → 按修改意见调整变更集 → 重新 rehearse → 再出新版 Mermaid。预演变更集始终是内存态，无清理负担。

### 2.6 Gateway 硬兜底（防模型漏执行）

- `workflow_builder_present_preview` 工具执行时，服务端用"最近一次 rehearse 缓存的变更集"重跑一次内存 plan（ms 级）：若存在业务后果类 error 诊断，**拒绝注入 preview 交互**，返回结构化警告要求 Agent 先处理。
- 仅作兜底，不替代预演流程本身。

## 3. 交互方式

- 预演本身**不产生任何用户交互**，是 Agent 内部静默动作（一次只读工具调用 + 内存计算）。
- 仅当预演发现业务后果问题时，复用 `ask_agent`（agentPlanAskQuery）展示**结论**：需要补什么 / 哪些节点不准修改 / 需要用户做哪个决策。不新增交互类型、不改前端。
- 理由：预演问题是业务决策问题，与需求闭合的 ask 语义一致；用户在 ask 卡片上选择/输入即可。
- `createWorkflowBuilderAskValidator` 当前在 previewConfirmed 后拒绝一切提问，预演阶段发生在 confirm 前，不受影响。

## 4. 改动范围（预估）

| 文件 | 改动 |
| --- | --- |
| `pro/admin/src/service/core/ai/workflowBuilder/cliGateway.ts` | `workflow_cli_query` 增加 `rehearse` action：接收变更集 → 内存 `planWorkflowChangeSet` → 返回分类诊断；缓存最近一次预演结果供 preview 兜底 |
| `pro/admin/src/service/core/ai/workflowBuilder/runner.ts` | 系统提示词插入预演阶段（生命周期 4.5）、诊断分类规则、变更集复用说明；preview 分支接入兜底检查 |
| `pro/admin/src/service/core/ai/skill/builtin/workflow-builder/SKILL.md` | 预演流程、诊断分类、ask 边界、变更集复用 |
| `pro/admin/src/service/core/ai/skill/builtin/workflow-builder/references/*.md` | 按需补充 rehearse 与诊断分类参考 |
| 测试 | cliGateway rehearse 单测、runner 预演流程测试、Skill 流程测试 |

**不需要改动**：`runner.ts` 的 stage/commit 硬校验（原样保留）、workflow-core、前端。

## 5. 落地策略（两阶段）

**阶段一（先行，零代码）**：纯提示词 + SKILL 最简预演。

- 改动仅限 `runner.ts` 系统提示词（生命周期插入"方案预演"步骤、破坏性操作检查清单、诊断分类规则、ask 边界）与 `SKILL.md`（预演流程 + references 补充）。
- 预演方式：LLM 对方案中每个破坏性操作（`node.remove` / `tool.detach` / `node.move` / 删输出 / 清必填输入）用现有只读查询工具（`tool_list` / `inspect` references / `container children` / `node_show`）逐一核查后果，能自修则自修，需决策则 ask 用户（结论式）。
- 验证目标：真实场景中预演流程是否有效、漏检率、token 开销。

**阶段二（按需）**：验证后发现模型漏检明显（尤其复杂工作流）时，补代码硬校验。

- `cliGateway.ts`：`workflow_cli_query` 增加 `rehearse` action（接收变更集 → 内存 `planWorkflowChangeSet` → 按诊断码静态表只筛业务后果类返回）；缓存最近预演结果。
- `runner.ts`：preview 工具执行时用缓存变更集重跑内存 plan，存在业务后果类 error 则拒绝注入预览交互（Gateway 硬兜底）。
- 诊断码筛选表（业务后果类白名单）：`WORKFLOW_TOOL_REQUIRED`、引用失效类、`WORKFLOW_CONDITIONAL_LOOP_BREAK_REQUIRED` 等；配置类不拦截。
- 职责分工：诊断产生与筛选 = 代码（确定性）；自修判断与业务语言呈现 = LLM。

## 6. 已确认决策（推荐项占位，待用户确认）

1. **预演形态**：简单预演（`rehearse` action + 内存 plan），**只查修改/删除现有节点导致的业务后果**（节点不可用、引用失效等常见问题），不 stage、不写草稿、不启动 CLI，**不深查配置完整性**。
2. **触发范围**：修改类任务（涉及删/卸/重配现有节点）预演；纯新建任务不触发"节点不可用"，可跳过。
3. **诊断边界**：业务后果类 ask 用户（结论式："需要补什么 / 哪些节点不允许修改"）；配置类留到正式搭建阶段处理，不打扰用户。
4. **变更集复用**：预演通过的变更集直接作为确认后正式 stage 分片来源，不重复生成。
5. **约束强度**：prompt 引导 + Gateway 兜底（preview 时用缓存变更集重跑内存 plan 校验业务后果类）。

## 6. 边界

- 不新增交互类型、不改前端组件；用户全程只感知到"结论"（ask 提问），不感知预演过程。
- 预演只发生在用户确认 Mermaid 前；确认后仍按现有连续执行阶段（不得再次打断用户）。
- 业务后果问题必须合并为单次 ask，不得逐条追问。
- 预演草稿是服务端私有状态，不向用户暴露分片、chunkId、checksum 等内部细节。
- 技术类诊断由 Agent 静默自修，任何情况下不得以技术诊断形式打扰用户。

## 7. TODO（开发文档阶段细化）

- [ ] 与用户确认 5 节四项决策
- [ ] 编写开发文档（runner 提示词、Gateway 兜底、SKILL 改动）
- [ ] 实现并测试
