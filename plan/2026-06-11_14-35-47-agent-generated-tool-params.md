<!-- /autoplan restore point: /Users/finleyge/.gstack/projects/FinleyGe-FastGPT/HEAD-autoplan-restore-20260611-143829.md -->
---
mode: plan
cwd: /Users/finleyge/.codex/worktrees/e2cf/FastGPT
task: 工具调用参数支持显式指定由 Agent 生成或由开发者配置
complexity: medium
tool: gstack-autoplan
total_thoughts: 7
created_at: 2026-06-11 14:35:47 Asia/Shanghai
---

# 工具调用参数最终类型与默认输入方式

## 任务概述

当前工具参数只有隐式语义：`input.toolDescription` 有值时，该字段会进入工具调用 schema，由模型生成；没有值时，该字段被视为需要开发者或用户配置。这个模型能运行，但把“当前最终输入类型”和“工具首次加入时的默认输入方式”混在一起，导致 Agent 配置页和工作流编排页都无法清楚表达“这个参数最终由 Agent 生成，还是由开发者配置”。

目标是把工具参数拆成两层：

- 最终输入类型：用户在页面上选择并保存的当前类型，是运行时和配置校验的权威状态。
- 默认输入方式：工具第一次加入工作流或 Agent 时的初始化值，只负责决定初始状态。

- 工作流编排中，节点作为工具被 ToolCall 节点连接时，节点卡片入参类型选择增加“Agent 生成”选项。
- Agent 配置页面，每个工具都需要进入配置能力，工具参数同样可以选择“Agent 生成”或开发者配置值，UI 参考工作流节点入参配置。
- 运行时只把“Agent 生成”的参数暴露给模型；开发者配置的参数继续作为固定值传入工具执行。
- 当前默认值逻辑：如果未来存在 `isToolParam === true`，默认 Agent 生成；`isToolParam === false`，默认开发者配置；在该字段落地前，`toolDescription` 有值默认 Agent 生成，否则默认开发者配置。

## 现有代码入口

- 工作流自定义工具输入编辑：`projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodePluginIO/InputEditModal.tsx`
- 工作流自定义工具输入展示：`projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodePluginIO/PluginInput.tsx`
- 输入类型选项配置：`packages/web/components/common/InputTypeSelector/configs`
- Agent 工具选择列表：`projects/app/src/pageComponents/app/detail/Edit/FormComponent/ToolSelector/ToolSelect.tsx`
- Agent 工具参数配置弹窗：`projects/app/src/pageComponents/app/detail/Edit/component/ConfigToolModal.tsx`
- 工具配置状态判断：`packages/global/core/app/formEdit/utils.ts`
- ToolCall 节点工具 schema：`packages/service/core/workflow/dispatch/ai/toolcall/hooks/useToolCatalog.ts`
- Agent 运行时工具 schema：`packages/service/core/workflow/dispatch/ai/agent/sub/tool/utils.ts`
- 工具参数类型定义：`packages/global/core/workflow/type/io.ts`

## 执行计划

1. 数据语义
   - 复用输入类型表达最终状态，新增 `FlowNodeInputTypeEnum.agentGenerated`（名称可在实现时微调）表示该字段最终由 Agent 生成。
   - 最终输入类型优先：只要用户已经选择并保存了具体 input type，运行时和配置状态都按该类型处理。
   - 默认输入方式只用于初始化：新增 `getDefaultToolInputType(input)` 一类 helper。未来按 `isToolParam` 初始化；当前在 `isToolParam` 缺失时按 `!!toolDescription` 初始化。
   - 旧数据兼容通过“缺失最终类型时先解析默认类型”完成。`toolDescription` 不再持续覆盖用户已选择的最终类型。
   - 保留 `toolDescription` 作为模型可见参数描述；选择开发者配置时，即使保留描述，也不能让该字段进入模型工具 schema。

2. 工作流编排 UI
   - 在节点被 ToolCall 节点连接、作为工具使用时，为可配置输入增加“Agent 生成”选项。
   - 选择“Agent 生成”时，将当前输入的 `renderTypeList` 设置为 `[FlowNodeInputTypeEnum.agentGenerated]`，并确保 `toolDescription` 有可用描述。
   - 选择手动输入、变量引用、其他输入控件时，按现有 `renderTypeList` 表达固定值或引用输入；保存时不能继续依赖 Agent 生成类型。
   - 节点卡片列表中继续用工具标识展示 Agent 生成字段，但判断逻辑改为最终类型 helper。

3. Agent 配置页
   - `ToolSelect` 中所有工具都可打开配置入口，已配置/待配置状态继续显示。
   - `ConfigToolModal` 从“只渲染非 toolDescription 字段”改为渲染全部可配置字段，并为每个字段增加来源选择。
   - 选择“Agent 生成”时不要求填写固定值；选择开发者配置时按原表单规则校验必填。
   - 对系统密钥、文件、模型选择等特殊字段保持原限制，不开放 Agent 生成。

4. 运行时与配置状态
   - 新增共享 helper，例如 `isAgentGeneratedToolInput(input)`，统一替代散落的 `!!input.toolDescription` 判断。
   - helper 需要区分两件事：`getDefaultToolInputType(input)` 只负责首次加入/旧数据缺失最终类型时的初始化；`isAgentGeneratedToolInput(input)` 只判断解析后的最终类型是否为 Agent 生成。
   - `useToolCatalog.createToolSchema` 和 `getAgentRuntimeTools.formatSchema` 只收集 Agent 生成参数。
   - 工具执行时保留开发者配置值：`tool.config` 继续合并到工具 params，Agent 生成 params 覆盖同名字段或按现有执行顺序处理。
   - `checkNeedsUserConfiguration` 与 `getToolConfigStatus` 使用最终类型 helper，Agent 生成字段不进入配置必填检查。

5. 国际化与文案
   - 新增中文、英文、日文等现有语言 key：`Agent 生成`、`开发者配置`、参数来源提示。
   - 文案直接表达行为：选择 Agent 生成后，该字段会作为工具调用参数交给模型生成；选择开发者配置后，该字段由当前配置固定传入。

6. 测试
   - `packages/global/test/core/workflow/utils.test.ts` 或新增 global test 覆盖默认初始化 helper：当前 `toolDescription` 有值默认 Agent 生成，无值默认开发者配置；未来 `isToolParam` 落地后覆盖 true/false 优先级。
   - `packages/service` 相关测试覆盖 ToolCall 与 Agent runtime schema：Agent 生成字段进入 schema，开发者配置字段不进入 schema。
   - 前端至少补充纯函数测试；如现有前端组件无测试基础，则用类型检查和局部 lint 兜底。

## 风险与注意事项

- `toolDescription` 目前同时承载“是否进入工具 schema”和“参数描述”两个职责；本次通过 input type 表达最终类型，同时把 `toolDescription` 降级为当前阶段的默认初始化信号和参数描述。
- Agent 配置页当前过滤掉 `toolDescription` 字段，改成全量配置后要避免系统密钥、文件上传、模型选择等特殊字段被误暴露。
- MCP/HTTP 工具从 JSON Schema 生成输入时，目前会自动填充 `toolDescription`，首次加入时默认仍应初始化为 Agent 生成；未来插件侧默认输入方式字段由 `fastgpt-plugin/sdk-client` 承接，本仓暂不实现。
- 必填校验要跟来源联动：Agent 生成字段不要求固定值，开发者配置字段维持原必填规则。
- UI 需要避免所有工具都显示“等待配置”的回归：没有开发者配置字段、全部由 Agent 生成的工具应为 `noConfig` 或 `configured`。

## 验收标准

- 工作流节点作为工具连接时，入参类型选择器能选择“Agent 生成”。
- Agent 配置页每个工具都有配置入口，参数可指定 Agent 生成或开发者配置。
- 运行时模型只看到 Agent 生成参数。
- 首次加入工具时，当前 `toolDescription` 有值的参数默认初始化为 Agent 生成，无值默认初始化为开发者配置；未来 `isToolParam` 接管该默认值逻辑。
- 局部测试和类型检查通过，无法运行的验证项要记录原因。

<!-- AUTONOMOUS DECISION LOG -->
## Decision Audit Trail

| # | Phase | Decision | Principle | Rationale | Rejected |
|---|-------|----------|-----------|-----------|----------|
| 1 | CEO | 将问题 framing 从“UI 增加 Agent 生成选项”提升为“工具参数是否暴露给模型的 ownership 显式化” | P1 completeness | 现有 `toolDescription` 同时承载来源和描述，长期会污染插件生态与运行时信任边界 | 只在两个 UI 弹窗里加选项 |
| 2 | CEO | 当前 PR 只落 `Agent 生成 / 开发者配置` 两态，并用 input type 表达来源 | P3 pragmatic | 两态覆盖当前需求，复用现有 `renderTypeList` 模型，避免新增并行字段 | 一次性做完整参数来源枚举 |
| 3 | CEO | 不新增 `toolInputSource`；新增 Agent 生成输入类型，`toolDescription` 只做当前默认初始化信号和模型描述 | P5 explicit | 用户确认复用 input type 更贴合现有模型；最终行为应由用户选择的 input type 决定 | 新增独立来源字段 |
| 3.1 | CEO | 明确两层模型：最终输入类型权威，工具默认输入方式只初始化首次加入状态 | P5 explicit | 用户澄清页面上选择的是最终类型；默认值只影响工具第一次加入工作流或 Agent 的初始状态 | 让 `toolDescription` 在运行时持续覆盖已选类型 |
| 4 | CEO | Codex 外部 voice 被审批拒绝后按 `[subagent-only]` 降级继续 | P6 bias toward action | 审批拒绝原因是外部数据发送风险，安全限制应保留；本地代码审阅和 subagent 足够推进计划审阅 | 绕过审批或停止 autoplan |
| 5 | CEO | fastgpt-plugin/sdk-client 默认输入方式字段不进入本仓当前 PR | P3 pragmatic | 用户明确后续会去插件侧修改，本仓只保留兼容读取和 UI/runtime 支撑 | 在本 PR 中跨仓实现插件 SDK 字段 |
| 6 | Design | Agent 配置弹窗采用“工具状态 -> 参数列表 -> 单参数来源/值”的层级 | P5 explicit | 所有字段直接平铺会淹没用户，参数来源是信任边界，需要先看到状态和待配置数量 | 直接复用现有纵向表单 |
| 7 | Design | 来源切换保留已有固定值，Agent 生成时禁用固定值输入而不是清空 | P1 completeness | 切换来源不应制造丢数据焦虑，保存时再按来源决定是否参与校验/运行时 schema | 切换 Agent 生成时清空 value |
| 8 | Design | 对不可 Agent 生成字段显示锁定来源和原因 | P5 explicit | 系统密钥、文件、模型、内部字段是信任边界，隐藏选项会让用户以为功能缺失 | 直接隐藏这些字段或静默禁用 |
| 9 | Eng | 新增 `agentGenerated` input type 后，所有 runtime 判断通过 `isAgentGeneratedToolInput` helper | P5 explicit | 直接检查 enum 或 `toolDescription` 会在不同模块漂移，helper 是兼容和安全边界 | 在每个 runtime 各自写判断 |
| 10 | Eng | Agent 配置入口需要覆盖 `ToolSelect` 和 `useSkillManager` 两条 UI 路径 | P1 completeness | SimpleApp/ChatAgent 卡片路径和 PromptEditor skill manager 路径都能选择工具，漏一条会造成行为不一致 | 只改 ToolSelect 卡片 |
| 11 | Eng | 测试优先覆盖 global helper、ToolCall schema、Agent runtime schema、configStatus | P1 completeness | 这些是行为边界，组件视觉可在实现后用类型检查和浏览器 QA 验证 | 只做前端手测 |
| 12 | Eng | 最终输入类型优先于 `toolDescription` 默认初始化信号 | P5 explicit | 用户切回开发者配置后可能仍保留描述，继续用 `!!toolDescription` 会泄露到模型 schema | `agentGenerated || !!toolDescription` 无条件兼容 |
| 13 | Eng | 抽出 `buildModelVisibleToolSchema(inputs, jsonSchema)` 并裁剪 raw JSON Schema | P1 completeness | MCP/HTTP raw schema 会绕过 input 过滤，是安全和 token 成本双重风险 | 只过滤非 jsonSchema 工具 |
| 14 | Eng | Chat Setting 工具选择入口纳入同一 helper/status 体系 | P1 completeness | `projects/app/src/pageComponents/chat/ChatSetting/ToolSelectModal.tsx` 仍直接用 `toolDescription` 判断，漏改会造成首页工具配置不一致 | 只改应用编辑页 |
| 15 | Eng | fixed config 合并用 key existence，保留 `false`、`0`、空字符串、空数组 | P5 explicit | `if (value)` 会丢合法配置值，Agent runtime 当前已有该风险 | 继续用 truthy 判断 |

## GSTACK AUTOPLAN REVIEW

### Phase 1: CEO Review

#### 0A. Premise Challenge

| Premise | Evaluation | Decision |
|---|---|---|
| 当前核心问题是“模型不该生成所有工具参数” | 成立。`useToolCatalog.createToolSchema` 和 `getAgentRuntimeTools.formatSchema` 都把 `input.toolDescription` 字段收集进模型可见 schema；目前 UI 用户只能通过间接字段控制模型参数。 | 接受 |
| `agent/config` 两态足够覆盖当前 PR | 基本成立。当前需求只要求“Agent 生成”和开发者指定之间切换；变量引用、文件、密钥、模型选择仍由已有 `renderTypeList` 和特殊输入处理。 | 接受，但写明边界 |
| 参数来源是否需要新增字段 | 用户确认无需新增字段，优先复用 input type；`toolDescription` 被 set 时表示默认输入方式为 Agent 生成。 | 修正为 input type 方案 |
| Agent 配置页“每个工具都需要进行配置”表示每个工具都应打开同一套参数配置能力 | 部分成立。所有工具应有配置入口或可查看配置，但没有开发者配置项的工具应低干扰展示，避免所有工具都变成“等待配置”。 | 接受并约束 UI 状态 |
| MCP/HTTP/OpenAPI 导入生成的参数默认仍由 Agent 生成 | 成立。`jsonSchema2NodeInput` 当前会从 schema description 或 `x-tool-description` 生成 `toolDescription`，历史行为应兼容。 | 接受 |

**Premise gate:** passed by user clarification on 2026-06-11. The plan now uses input type for source, not a new field.

#### 0B. Existing Code Leverage

| Sub-problem | Existing code | Reuse plan |
|---|---|---|
| 参数类型和兼容 schema | `packages/global/core/workflow/node/constant.ts`, `packages/global/core/workflow/type/io.ts` | 新增 Agent 生成输入类型，并导出 helper |
| 工作流工具输入编辑 | `projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodePluginIO/InputEditModal.tsx` | 复用 `InputTypeSelector`，增加 Agent 生成选项/状态写入 |
| 工作流工具输入展示 | `projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodePluginIO/PluginInput.tsx` | `isTool` 判断改为最终类型 helper |
| 输入类型列表 | `packages/web/components/common/InputTypeSelector/configs.ts` | 给 plugin input 增加条件化 Agent 生成选项 |
| Agent 工具配置弹窗 | `projects/app/src/pageComponents/app/detail/Edit/component/ConfigToolModal.tsx` | 复用 `InputRender`，新增每字段来源选择 |
| Agent 工具卡片状态 | `projects/app/src/pageComponents/app/detail/Edit/FormComponent/ToolSelector/ToolSelect.tsx` | 所有工具保留配置入口，状态由 helper 判定 |
| 配置状态判断 | `packages/global/core/app/formEdit/utils.ts` | `checkNeedsUserConfiguration` 和 `getToolConfigStatus` 改用 `isAgentGeneratedToolInput` |
| ToolCall schema 生成 | `packages/service/core/workflow/dispatch/ai/toolcall/hooks/useToolCatalog.ts` | `toolParams` 只取 Agent 生成字段 |
| Agent runtime schema 生成 | `packages/service/core/workflow/dispatch/ai/agent/sub/tool/utils.ts` | `formatSchema` 只取 Agent 生成字段 |

#### 0C. Dream State Mapping

```
CURRENT
  toolDescription != empty
    ├─ means "show this field to model"
    └─ also means "description shown in tool schema"

THIS PLAN
  final input type
    ├─ agentGenerated: expose to model schema, use toolDescription as parameter description
    └─ existing form/reference types: developer/runtime configured value, hide from model schema
  default input mode
    └─ only initializes first-add or missing-final-type state; current fallback uses toolDescription until isToolParam exists

12-MONTH IDEAL
  Tool Parameter Ownership
    ├─ agent generated
    ├─ developer configured
    ├─ runtime context injected
    ├─ user interactive input
    ├─ secret/system managed
    └─ manifest/schema/source-of-truth declared across SDK, MCP, HTTP, workflow tools
```

#### 0C-bis. Implementation Alternatives

| Approach | Effort | Risk | Pros | Cons | Decision |
|---|---:|---|---|---|---|
| UI-only wrapper around `toolDescription` | Low | High | 最快交付，改动少 | 继续让描述字段决定行为，Agent 配置和 runtime 容易漂移 | Reject |
| Add Agent generated input type with default initializer helper | Medium | Medium | 复用现有 input type 模型，当前需求闭环完整，首次加入默认态兼容旧数据 | 需要同时改 UI、schema、配置状态、测试 | Accept |
| Full ownership enum and manifest/SDK migration now | High | Medium | 12 个月理想模型一次成型 | 当前 PR 变成跨仓库/跨生态迁移，验证面过大 | Defer |
| Runtime-only whitelist, UI 不表达 | Low | High | 后端简单 | 用户仍无法理解/配置参数来源 | Reject |

#### 0D. Mode-Specific Analysis

Mode: SELECTIVE EXPANSION.

Accepted scope:

- 将字段最终类型显式化为 Agent 生成 input type，并提供默认初始化 helper。
- 工作流编排 UI 和 Agent 配置页都使用同一语义。
- ToolCall 与 Agent 两条运行时 schema 生成路径统一过滤 Agent 生成字段。
- 新增局部测试覆盖首次加入默认态、缺失最终类型兼容和 schema 过滤。

Deferred scope:

- 完整 ownership enum，如 runtime context、interactive user、secret managed。
- 跨 SDK/manifest 的完整迁移。
- 官方插件仓批量补充 manifest 参数来源。

#### 0E. Temporal Interrogation

| Time | Likely reality | Plan adjustment |
|---|---|---|
| Hour 1 | UI 能看到“Agent 生成”选项，但 runtime 若未改仍会错误暴露字段 | runtime helper 是 P0 |
| Hour 6 | Agent 配置页输入类型、必填校验和工具卡片状态可能互相打架 | 配置状态判断必须与 input type 同源 |
| Day 2 | MCP/HTTP/OpenAPI 导入的历史 `toolDescription` 行为被用户依赖 | 首次加入/缺失最终类型时的默认初始化兼容必须保留 |
| Month 6 | 新插件希望在 SDK/manifest 层声明参数默认输入方式 | 本 plan 为 `isToolParam` 预留默认初始化入口，插件 SDK 字段由后续跨仓任务处理 |

#### 0F. Mode Selection

SELECTIVE EXPANSION is confirmed for review purposes: complete the current product loop, accept low-cost improvements inside blast radius, defer cross-ecosystem migration to TODO.

#### CODEX SAYS (CEO - strategy challenge)

Unavailable. `codex exec` failed inside sandbox because the local Codex state database was read-only, and the escalated retry was rejected by the approval reviewer due to external data exfiltration risk. Degradation mode: `[subagent-only]`.

#### CLAUDE SUBAGENT (CEO - strategic independence)

The independent CEO voice agreed that the direction is correct, but flagged the plan as too UI-shaped. It recommended reframing the feature as Tool Parameter Ownership and keeping the current PR to `agent/config`. The user then clarified that this repo should reuse input type instead of adding `toolInputSource`, while `toolDescription` is only the current fallback for default input mode until `isToolParam` exists. SDK/manifest default input mode is deferred to the plugin-side work.

#### CEO Dual Voices - Consensus Table

| Dimension | Subagent | Codex | Consensus |
|---|---|---|---|
| Premises valid? | Mostly valid with framing fix | N/A | N/A |
| Right problem to solve? | Yes, but name it ownership | N/A | N/A |
| Scope calibration correct? | Current PR okay, future ownership deferred | N/A | N/A |
| Alternatives sufficiently explored? | Needs rejected alternatives | N/A | N/A |
| Competitive/product risks covered? | Needs stronger SDK/manifest path | N/A | N/A |
| 6-month trajectory sound? | Sound if input type becomes final state and `isToolParam` later replaces `toolDescription` as default initializer | N/A | N/A |

#### CEO Review Sections 1-10

1. Architecture Review: Examined `FlowNodeInputItemTypeSchema`, `FlowNodeInputTypeEnum`, UI edit paths, Agent config modal, `useToolCatalog`, and Agent runtime `formatSchema`. Main issue is duplicated `!!toolDescription` checks; accepted fix is shared final-type/default-initializer helpers and Agent-generated input type.
2. Error & Rescue Map: Main rescue path is first-add and missing-final-type compatibility. Old/default records with `toolDescription` should initialize to Agent generated; new records should express final behavior through input type.
3. Security & Threat Model: Agent-generated input type is a trust boundary. Developer-configured secrets, headers, file selectors, and system key inputs must not become model-generated.
4. Data Flow & Interaction Edge Cases: Empty description, switching final type, required config, and MCP/HTTP imported schema need explicit behavior.
5. Code Quality Review: Avoid scattering another boolean; use helper and tests.
6. Test Review: Need tests for helper compatibility, config status, ToolCall schema, and Agent runtime schema.
7. Performance Review: No N+1 or hot-path expansion expected; schema filtering is linear over existing inputs.
8. Observability & Debuggability Review: Existing tool call previews should still show generated params; developer-configured params should not appear as model arguments.
9. Deployment & Rollout Review: Backward-compatible optional field, no data migration required.
10. Long-Term Trajectory Review: Reversibility is 4/5 if Agent-generated input type is added as optional enum member and helper gates all new logic.

#### NOT in Scope

| Item | Rationale |
|---|---|
| Full ownership enum | Bigger product/platform design; current PR only needs model-visible vs configured |
| SDK/manifest full migration | Cross-repo blast radius; add TODO and optional schema extension only |
| Official plugin backfill | Requires plugin inventory and separate release |
| End-to-end browser automation | Can be added after implementation when UI exists |

#### What Already Exists

- `renderTypeList` already expresses form control and variable-reference affordance.
- `toolDescription` already feeds model-visible JSON schema in both ToolCall and Agent runtime paths.
- `ConfigToolModal` already persists fixed config values into selected tool inputs.
- `getToolConfigStatus` already computes `waitingForConfig` vs configured.

#### Dream State Delta

This plan gets FastGPT from implicit source-by-description to explicit final input type, with a separate default input mode for first-add initialization. It leaves full ecosystem ownership declarations, SDK documentation, and plugin manifest migration as future work.

#### Error & Rescue Registry

| Error / Rescue | Cause | Planned rescue | Severity |
|---|---|---|---|
| Old/default tool stops exposing params to model | Only old `toolDescription` exists and no final type has been saved | Default initializer treats `!!toolDescription` as Agent generated only while final type is missing | Critical |
| Developer-configured param leaked to model | Runtime still checks `toolDescription` directly | Replace runtime checks with helper | High |
| Required field blocks config after choosing Agent generated | Config status ignores final type | `getToolConfigStatus` skips Agent generated fields | High |
| Secret/system field exposed as Agent generated | UI opens Agent-generated final type for unsupported input | Disallow Agent generated final type for system key, file, model, internal fields | Critical |

#### Failure Modes Registry

| Failure mode | Impact | Detection | Decision |
|---|---|---|---|
| Helper not used in one runtime path | ToolCall and Agent behavior diverge | Unit tests for both schema builders | Fix in scope |
| Final type switch clears useful description | Model schema loses parameter semantics | Preserve `toolDescription` as description where possible | Fix in scope |
| All tools show noisy config modals | Agent page becomes harder to scan | Design pass to separate status and action | Fix in scope |
| JSON Schema imported tools cannot express future default input mode | All imported fields can only use `toolDescription` fallback today | Defer full extension to plugin/sdk field; reserve helper seam for `isToolParam` | Defer with TODO |

#### CEO Completion Summary

| Section | Result |
|---|---|
| Step 0A Premises | 5 premises evaluated, 1 requires user confirmation |
| Step 0B Existing code | 9 reuse points mapped |
| Step 0C Dream state | Current/plan/12-month diagram produced |
| Step 0C-bis Alternatives | 4 approaches compared |
| Section 1 Architecture | 1 core issue: duplicated implicit source checks |
| Section 2 Errors | 4 rescue paths mapped |
| Section 3 Security | 2 critical trust-boundary risks |
| Section 4 Data/UX | 4 edge cases flagged |
| Section 5 Quality | Helper abstraction accepted |
| Section 6 Tests | 4 test families required |
| Section 7 Performance | No material risk |
| Section 8 Observability | Param preview behavior must stay intentional |
| Section 9 Rollout | Backward compatible, no migration |
| Section 10 Future | Reversibility 4/5 |
| Section 11 Design | UI scope detected; pass to Design Review |
| Failure modes | 4 total, 2 critical gaps |

**Phase 1 complete.** Codex external voice: unavailable due approval rejection. Claude subagent: 7 strategic findings. Consensus: 0/6 confirmed because only one outside voice was available, 0 model disagreements. Passing to Phase 2.

### Phase 2: Design Review

#### 0A. Initial Design Rating

Initial rating: 6/10. The technical path is specific, but UI state, hierarchy, switching behavior, and special-field explanation were underspecified.

#### 0B. DESIGN.md Status

No repo-level `DESIGN.md` was found in the current worktree. Existing Chakra/FastGPT patterns are used as the design system source: `MyModal`, `FormLabel`, `InputRender`, `MyTag`, `MyIconButton`, `QuestionTip`, `InputTypeSelector`, and compact card rows in `ToolSelect`.

#### 0C. Existing Design Leverage

| UI need | Existing pattern | Reuse plan |
|---|---|---|
| Compact source selection in workflow node | `InputTypeSelector` and `InputTypeConfig` | Add `Agent 生成` as a plugin input type when node is tool-callable |
| Tool configuration modal | `ConfigToolModal` | Keep modal shell, replace flat filtered form with parameter list rows |
| Tool card status | `MyTag` in `ToolSelect` | Add count-aware tags for待配置/部分配置/已配置/无需配置 |
| Field explanation | `QuestionTip`, info row in modal | Add source-specific inline hint near segmented control |
| Fixed value rendering | `InputRender` | Disable/hide value input when Agent-generated, preserve value in form state |

#### 0D. Focus Areas

All 7 design dimensions are relevant because the feature changes existing UI controls, modal state, and user-visible trust boundaries.

#### Design Dual Voices

CODEX SAYS (design - UX challenge): unavailable for the same approval reason as Phase 1.

CLAUDE SUBAGENT (design - independent review): The design voice flagged missing hierarchy, missing state design, ambiguous partial configuration, source-switching data-loss anxiety, insufficient special-field explanation, and no post-save visibility into which params are model-visible.

#### Design Litmus Scorecard

| Dimension | Subagent | Codex | Consensus |
|---|---|---|---|
| Information hierarchy clear? | No | N/A | N/A |
| Interaction states specified? | No | N/A | N/A |
| Source switching safe? | No | N/A | N/A |
| Special fields understandable? | No | N/A | N/A |
| Workflow/Agent consistency balanced? | Partially | N/A | N/A |
| Accessibility/responsive covered? | Partially | N/A | N/A |
| Implementation-specific enough? | No | N/A | N/A |

#### Pass 1: Information Architecture

Score: 6/10 -> 8/10 after fixes.

Agent config modal structure must be:

1. Header: tool icon/name, config status tag, optional guide link.
2. Summary row: counts for Agent-generated params, developer-configured params, locked/system params, and missing required config count.
3. Parameter list: one row per configurable or locked-visible parameter. Each row shows required marker, name, value type, current source, short description.
4. Expanded row/body: source selector, source-specific hint, fixed value input when source is developer config.
5. Footer: model-visible params summary and Cancel/Confirm.

Workflow node card keeps the existing compact input type selector; it should not inherit the heavier Agent modal layout.

#### Pass 2: Interaction State Coverage

Score: 4/10 -> 8/10 after fixes.

| State | Required UI |
|---|---|
| Loading tool params | Modal body skeleton or spinner inside existing modal |
| No configurable params | Empty state: “该工具无需开发者配置”，still show model-visible params summary |
| All Agent generated | Status `无需配置` or `已配置`, no waiting tag |
| Some developer config missing | Status `待配置`, show count such as `1 项待配置` |
| Mixed configured + Agent generated | Status `部分配置` only if optional fixed values exist; required missing still `待配置` |
| Save success | Close modal and update card status/counts |
| Save error | Keep modal open, field-level errors plus toast |
| Unsupported special field | Row locked with reason, such as system/platform configured |
| History compatibility | Light hint: “根据参数描述默认设为 Agent 生成”，首次保存最终类型后按 input type 判断 |

#### Pass 3: User Journey & Emotional Arc

Score: 5/10 -> 8/10 after fixes.

The desired journey is: user chooses a tool, sees whether it needs configuration, opens the modal, understands which params the Agent will generate, fixes only missing developer values, confirms, and sees the card status update. The main break point is source switching. Rule: switching to Agent-generated preserves existing fixed value in form state but disables the fixed-value input and excludes it from validation; switching back restores the prior value.

#### Pass 4: AI Slop Risk

Score: 5/10 -> 8/10 after fixes.

Avoid generic “配置来源” labels without behavior. The copy must state behavior:

- Agent 生成: “运行时由模型填写，会进入工具调用参数。”
- 开发者配置: “使用当前固定值，模型不可见。”
- Locked field: “系统字段，由平台配置。”

No visible in-app explainer paragraph is needed beyond short inline hints and tooltips.

#### Pass 5: Design System Alignment

Score: 7/10 -> 8/10 after fixes.

Use existing Chakra/FastGPT primitives. Cards remain compact with `MyTag` for status. Modal rows should use existing border, spacing, and `InputRender`. Source selection can be a compact segmented control or select-style input matching `InputTypeSelector`; final implementation should pick the local component that already exists in this area.

#### Pass 6: Responsive & Accessibility

Score: 6/10 -> 8/10 after fixes.

The modal should remain usable at `90vw`; parameter rows must wrap source selector and fixed-value input vertically on narrow widths. Source controls need text labels, not color-only state. Locked fields need disabled styling plus textual reason.

#### Pass 7: Unresolved Design Decisions

Resolved by auto-decision:

- Use parameter list rows in Agent config modal.
- Preserve fixed values while toggling source.
- Show locked special fields when user-visible; hide only fully internal fields.
- Show model-visible params summary in modal footer.

Deferred:

- Full plugin SDK/manifest source display after plugin-side field exists.

#### Design NOT in Scope

| Item | Rationale |
|---|---|
| New visual design system | Existing Chakra/FastGPT modal/card patterns are enough |
| Screenshot-based visual QA | Implementation not yet built |
| Full onboarding/tutorial copy | Inline hints cover the behavior |

#### Design Completion Summary

| Pass | Result |
|---|---|
| Pass 1 Info Arch | 6/10 -> 8/10 |
| Pass 2 States | 4/10 -> 8/10 |
| Pass 3 Journey | 5/10 -> 8/10 |
| Pass 4 AI Slop | 5/10 -> 8/10 |
| Pass 5 Design Sys | 7/10 -> 8/10 |
| Pass 6 Responsive/A11y | 6/10 -> 8/10 |
| Pass 7 Decisions | 4 resolved, 1 deferred |

**Phase 2 complete.** Codex external voice: unavailable. Claude subagent: 10 design findings. Consensus: 0/7 confirmed because only one outside voice was available, 0 disagreements. Passing to Phase 3.

### Phase 3: Eng Review

#### Step 0: Scope Challenge

Actual code read:

- `packages/global/core/workflow/node/constant.ts`
- `packages/global/core/workflow/type/io.ts`
- `packages/global/core/app/formEdit/utils.ts`
- `packages/global/test/core/app/formEdit/utils.test.ts`
- `projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodePluginIO/InputEditModal.tsx`
- `projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodePluginIO/InputTypeConfig.tsx`
- `projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodePluginIO/PluginInput.tsx`
- `projects/app/src/pageComponents/app/detail/Edit/component/ConfigToolModal.tsx`
- `projects/app/src/pageComponents/app/detail/Edit/FormComponent/ToolSelector/ToolSelect.tsx`
- `projects/app/src/pageComponents/app/detail/Edit/ChatAgent/hooks/useSkillManager.tsx`
- `projects/app/src/pageComponents/app/detail/Edit/ChatAgent/utils.ts`
- `projects/app/src/pageComponents/chat/ChatSetting/ToolSelectModal.tsx`
- `packages/service/core/workflow/dispatch/ai/toolcall/hooks/useToolCatalog.ts`
- `packages/service/core/workflow/dispatch/ai/agent/sub/tool/utils.ts`
- `packages/service/test/core/workflow/dispatch/ai/toolcall/hooks/useToolCatalog.test.ts`

Complexity check: medium. This touches more than 8 files, but the blast radius is a narrow vertical slice: shared enum/helper, two UI configuration paths, and two runtime schema builders. Scope reduction would risk leaving inconsistent behavior, so full slice remains in scope.

#### Eng Dual Voices

CODEX SAYS (eng - architecture challenge): unavailable for the same approval reason as Phase 1.

CLAUDE SUBAGENT (eng - independent review): returned after the first Eng draft. It flagged three hard gates: final input type must win over default initialization, JSON Schema cropping, and all configuration entrances using one helper. It also flagged falsy fixed config merge and Chat Setting as missing scope.

#### Eng Consensus Table

| Dimension | Subagent | Codex | Consensus |
|---|---|---|---|
| Architecture sound? | Critical gaps: final type precedence + schema crop | N/A | N/A |
| Test coverage sufficient? | Missing hard-gate cases | N/A | N/A |
| Performance risks addressed? | JSON Schema crop needed | N/A | N/A |
| Security threats covered? | Special fields need server denylist | N/A | N/A |
| Error paths handled? | Falsy config merge missing | N/A | N/A |
| Deployment risk manageable? | Backward compatible if final input type wins after initialization | N/A | N/A |

#### Section 1: Architecture Review

```
packages/global/core/workflow/node/constant.ts
  └─ FlowNodeInputTypeEnum.agentGenerated
       │
       ▼
packages/global/core/app/formEdit/utils.ts
  ├─ isAgentGeneratedToolInput(input)
  ├─ canInputBeAgentGenerated(input)
  ├─ validateToolConfiguration(...)
  ├─ checkNeedsUserConfiguration(...)
  └─ getToolConfigStatus(...)
       │
       ├─────────────── UI ─────────────────────────────┐
       ▼                                                ▼
Workflow Node Input UI                         Agent Tool Config UI
InputEditModal/InputTypeConfig                 ToolSelect + ConfigToolModal
PluginInput table                              useSkillManager / ChatAgent utils
       │                                                │
       └─────────────── runtime ────────────────────────┘
                       ▼
        useToolCatalog.createToolSchema
        agent/sub/tool/utils.formatSchema
                       ▼
        LLM tool schema only contains Agent-generated params
```

Findings:

1. Final input type precedence is P0. The compatibility rule must be: if the input has a saved final input type, use it; only first-add or legacy inputs without final type use the default initializer. Current initializer uses `!!toolDescription` until `isToolParam` exists. Otherwise a developer-configured field that keeps description text will leak to model schema. Severity critical.
2. `jsonSchema` tools currently bypass `toolParams` in `useToolCatalog.createToolSchema` and `agent/sub/tool/utils.formatSchema`. Add `buildModelVisibleToolSchema(inputs, jsonSchema)` that crops `properties` and `required` to model-visible inputs; ToolCall, Agent runtime, MCP, and HTTP should share it. Severity critical.
3. `ToolSelect`, `useSkillManager`, `ChatAgent/utils`, and `projects/app/src/pageComponents/chat/ChatSetting/ToolSelectModal.tsx` all participate in selected tool configuration. All must use the same helper/status logic. Severity high.
4. `packages/service/core/workflow/dispatch/ai/agent/sub/tool/utils.ts` currently writes config values back with `if (value)`, which drops `false`, `0`, `''`, and `[]`. Use `hasOwnProperty` or `value !== undefined`, then define merge precedence. Severity high.
5. `FlowNodeInputTypeEnum.agentGenerated` requires `FlowNodeInputMap` icon mapping and InputRender handling. It should not render as a value input; it is a final-type marker. Severity medium.

#### Section 2: Code Quality Review

The plan should avoid introducing ad hoc checks such as `renderTypeList[0] === agentGenerated || toolDescription` in many files. Add helpers in global app/workflow utilities and consume them everywhere. Naming should express behavior, for example `isAgentGeneratedToolInput`, not vague `isToolInput`.

Helper contract must distinguish final type and default initializer:

- `getDefaultToolInputType(input)`: returns the initial type when a tool is first added or legacy data has no final type. Future priority is `isToolParam`; current fallback is `!!toolDescription`.
- `hasFinalToolInputType(input)`: true when input type UI has been saved by the new feature.
- `isAgentGeneratedToolInput(input)`: true when the resolved final input type is Agent generated.
- `canAgentGenerateToolInput(input)`: server-side allowlist/denylist gate that must be applied before schema generation.
- `buildModelVisibleToolSchema({ inputs, jsonSchema })`: builds/crops final LLM-visible schema.

DRY risk: `formRenderTypesMap` is duplicated inside `checkNeedsUserConfiguration` and `getToolConfigStatus`. This task can either extract a small local constant or leave existing duplication if edits are scoped; if touched, prefer one shared module-level constant with function-level comment.

#### Section 3: Test Review

Test diagram:

```
NEW UX FLOW
  Workflow input type selector
    ├─ choose Agent generated
    ├─ choose developer-configured input
    └─ first-add/default initializer from isToolParam or toolDescription fallback

NEW DATA FLOW
  FlowNodeInputTypeEnum.agentGenerated
    ├─ helper returns true
    ├─ configStatus skips fixed-value validation
    ├─ ToolCall schema includes param
    └─ Agent runtime schema includes param

NEW CODEPATHS
  validateToolConfiguration
    ├─ agentGenerated valid
    ├─ reference without toolDescription remains invalid unless converted
    └─ unsupported special fields invalid/locked

  checkNeedsUserConfiguration / getToolConfigStatus
    ├─ all Agent generated -> noConfig
    ├─ required developer config missing -> waitingForConfig
    └─ mixed values -> configured or waiting with count

  useToolCatalog.createToolSchema
    ├─ agentGenerated param included
    ├─ developer-configured param excluded
    └─ missing-final-type legacy param initialized from toolDescription
    └─ jsonSchema properties/required cropped

  agent/sub/tool/utils.formatSchema
    ├─ same include/exclude behavior
    ├─ tool.config still passed as fixed params
    └─ false/0/''/[] fixed config values preserved
```

Coverage mapping:

| Path | Test type | Existing test | Gap |
|---|---|---|---|
| `isAgentGeneratedToolInput` helper | unit | none | add global unit cases |
| `validateToolConfiguration` with agentGenerated | unit | `packages/global/test/core/app/formEdit/utils.test.ts` | extend |
| `checkNeedsUserConfiguration` skips agentGenerated | unit | same file | extend |
| `getToolConfigStatus` required agentGenerated noConfig | unit | same file | extend |
| ToolCall schema filter | unit | `useToolCatalog.test.ts` | extend |
| Agent runtime schema filter | unit | no direct util test found | add test around exported or newly extracted formatter |
| JSON Schema crop | unit | none | add schema builder tests for MCP/HTTP/raw schema |
| Explicit developer config with retained description | unit | none | must ensure not model-visible |
| Falsy fixed config merge | unit | none | add `false`, `0`, `''`, `[]` cases |
| Chat Setting tool selection | unit/component/manual | `ToolSelectModal.tsx` exists | add helper usage or pure logic test |
| Config modal source switching | component/integration | none | implementation may need RTL or manual QA |
| Workflow input selector condition | component/manual | none | typecheck + browser QA after implementation |

Test plan artifact written: `/Users/finleyge/.gstack/projects/FinleyGe-FastGPT/finleyge-HEAD-test-plan-20260611-152546.md`.

#### Section 4: Performance Review

No material performance risk. All new checks are O(inputs) over existing small tool input arrays. The only caution is avoiding repeated deep schema rebuilds in render loops; compute derived counts with `useMemo` in UI.

#### Security Review

Agent-generated input type controls model-visible schema and must be treated as a trust boundary. Disallow or lock Agent generation for:

- `NodeInputKeyEnum.systemInputConfig`
- `FlowNodeInputTypeEnum.fileSelect`
- `FlowNodeInputTypeEnum.selectLLMModel`
- `FlowNodeInputTypeEnum.settingLLMModel`
- `FlowNodeInputTypeEnum.hidden`
- `FlowNodeInputTypeEnum.customVariable`
- any secret/password/system-managed input unless explicitly allowed by future product design

Required fixed developer values must never be serialized into LLM tool schema. Tool execution may still receive them through existing `tool.config` / input value merge paths.

Server-side schema builder must apply `canAgentGenerateToolInput(input)` even if persisted data is tampered with. UI locks are helpful, but the runtime schema builder is the security boundary.

#### Eng NOT in Scope

| Item | Rationale |
|---|---|
| Plugin SDK default input field implementation | User will modify fastgpt-plugin/sdk-client separately |
| Migration script for old apps | Optional enum/input type and helper compatibility avoid migration |
| Full component test harness | Existing tests are mostly unit/service; visual QA can follow implementation |
| External Codex review | Blocked by approval policy |

#### Eng What Already Exists

- `FlowNodeInputTypeEnum` and `FlowNodeInputMap` provide the right extension point for input type.
- `renderTypeList` already drives UI/rendering and is persisted on inputs.
- `toolDescription` is already carried across workflow/tool preview/runtime.
- `getToolConfigStatus` is already the central Agent config status helper.
- `useToolCatalog.test.ts` and `formEdit/utils.test.ts` already cover nearby behavior.

#### Eng Failure Modes Registry

| Failure mode | Severity | Mitigation |
|---|---|---|
| Raw `jsonSchema` bypasses input filtering | Critical | `buildModelVisibleToolSchema(inputs, jsonSchema)` crops properties/required |
| Developer config final type still has `toolDescription` | Critical | Saved final input type wins over default initializer |
| One UI path cannot open config | High | Update `ToolSelect`, `useSkillManager`, `ChatAgent/utils`, and Chat Setting |
| Falsy fixed config values dropped | High | Use key-existence merge and tests for false/0/empty values |
| Required Agent-generated field marked waitingForConfig | High | Extend `getToolConfigStatus` tests |
| Secret/file/model field exposed to model | Critical | `canInputBeAgentGenerated` deny list and locked UI |
| Legacy `toolDescription` stops working | Critical | Helper compatibility tests |
| Final type switch loses fixed value | Medium | Preserve value in form state and test/manual QA |

#### Eng Completion Summary

- Architecture Review: 5 issues found, 2 critical.
- Code Quality Review: 2 issues found.
- Test Review: diagram produced, 11 gaps identified.
- Performance Review: 0 issues found.
- Security Review: 1 critical trust-boundary class with explicit deny list.
- Failure modes: 8 total, 4 critical gaps flagged.

**Phase 3 complete.** Codex external voice: unavailable. Claude subagent: 8 engineering findings. Consensus: 0/6 confirmed because only one outside voice was available; 0 model disagreements.

### Cross-Phase Themes

| Theme | Phases | Signal |
|---|---|---|
| Model-visible final type is a trust boundary | CEO, Design, Eng | High confidence |
| `toolDescription` must remain current default initializer and parameter description | CEO, Eng | High confidence |
| Saved final input type must beat default initializer | Eng | Critical hard gate |
| Agent config UI needs explicit state model | Design, Eng | High confidence |
| Plugin SDK/manifest source should be separate future work | CEO, Eng | Confirmed by user |

### Deferred to TODOS.md

| Item | Reason |
|---|---|
| fastgpt-plugin/sdk-client default input mode field | User will handle in plugin repo |
| Full ownership enum beyond Agent/config | Larger platform design |
| Official plugin backfill | Cross-repo inventory and release |
| Visual/browser QA | Depends on implementation |

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | DONE_WITH_CONCERNS | Reframed as input-type based Agent generation; SDK field deferred |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | BLOCKED | External Codex voice rejected by approval policy |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | DONE_WITH_CONCERNS | jsonSchema filtering risk, two UI paths, tests required |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | DONE_WITH_CONCERNS | State model, source switching, locked fields added |
