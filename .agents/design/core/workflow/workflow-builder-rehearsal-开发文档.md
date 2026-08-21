# Workflow Builder 方案预演阶段 开发文档（阶段一：纯提示词 + SKILL）

## 0. 文档标识

- 文档状态：开发中
- 关联需求文档：`workflow-builder-rehearsal-需求设计文档.md`
- 实施阶段：阶段一（零代码，仅提示词 + SKILL + references）
- 实施原则：检查清单式预演，让模型按清单执行，不自由发挥

## 1. 改动总览

| 文件 | 改动 |
| --- | --- |
| `pro/admin/src/service/core/ai/workflowBuilder/runner.ts` | `WORKFLOW_BUILDER_SYSTEM_PROMPT`：生命周期插入"方案预演"阶段（原第 4、5 阶段之间），含破坏性操作检查清单、自修/ask 规则 |
| `pro/admin/src/service/core/ai/skill/builtin/workflow-builder/SKILL.md` | 新增"方案预演"章节 + 参考资料路由补充 |
| `pro/admin/src/service/core/ai/skill/builtin/workflow-builder/references/workflow-inspection.md` | 补充预演检查所需的查询指引（tool_list 用法、references 读取） |

## 2. runner.ts 系统提示词改动

### 2.1 生命周期调整

`WORKFLOW_BUILDER_SYSTEM_PROMPT`（runner.ts:127-165）的 `<工作生命周期>` 列表在阶段 4（需求闭合）与阶段 5（流程预览）之间插入新阶段"方案预演"，后续阶段编号顺延：

```text
1. 需求建模
2. 事实核对
3. 能力与依赖解析
4. 需求闭合
5. 方案预演（新增）
6. 流程预览（原 5）
7. 工作流实现（原 6）
8. 校验修复（原 7）
9. 原子交付（原 8）
```

### 2.2 新增阶段 5 文案（草案）

```markdown
5. 方案预演：出 Mermaid 前，对方案中涉及现有节点的每个破坏性操作（node.remove、tool.detach、
   node.move、删除输出、清空必填输入）逐个核查后果，只解决"会让现有节点不可用"的问题，
   不深查配置完整性。按以下清单执行：
   - 删除工具节点 → 用 tool_list 查所属 toolCall 剩余工具数；剩余 0 且该节点不使用
     Agent Sandbox 时，该 toolCall 将无法执行任何工具调用。
   - 删除或重配节点/输出 → 用 inspect 的 references 或 input_available 查是否有其他节点引用；
     有则引用将失效。
   - 删除 loop-run-break 且父节点是条件循环 → 用 container children 查 break 数量；
     数量为 0 时循环将无法终止。
   - 删除容器节点（循环、并行等嵌套父节点）→ 用 container children 查子节点清单；
     子节点非空时删除会连带删除全部子节点，须告知用户并由用户决定是否继续。
   处置规则：
   - 你能安全修复（调整引用来源、补一个替代工具等）→ 直接修复方案后继续。
   - 需要用户业务决策（如"保留工具还是删除整个 toolCall 节点"）→ 合并为一次 ask_agent，
     用业务语言说明"需要补什么 / 哪些节点不允许修改"，不得暴露诊断码或内部细节。
   - 配置类问题（schema、输入模式、值类型、必填缺失）不在此阶段处理，留到实现后的校验修复。
   预演全部通过后才能调用 workflow_builder_present_preview。
```

### 2.3 其他提示词同步

- `<交互边界>` 段（150 行）：补充一句"方案预演发现的问题只以结论形式提问（需要补什么 / 哪些节点不允许修改），不暴露预演过程"。
- `<完成标准>` 段（162 行）：把"Mermaid 确认前发现关键业务意图或必要外部依赖缺失才回到需求闭合"扩展为"预演发现业务后果问题需用户决策时回到方案预演/需求闭合阶段"（保持兼容，不改语义）。

## 3. SKILL.md 改动

### 3.1 新增"方案预演"章节

在 SKILL.md 的"参考资料路由"之后、"必须执行的流程"之前（或作为"必须执行的流程"第 2.5 步）插入：

```markdown
## 方案预演（出 Mermaid 前必做）

对方案中涉及现有节点的每个破坏性操作（`node.remove` / `tool.detach` / `node.move` /
删除输出 / 清空必填输入），用现有只读查询逐个核查后果。只解决"会让现有节点不可用"的问题，
不深查配置完整性（配置问题留到 draft validate 阶段修复）。

1. 删除工具节点 → `tool_list` 查所属 toolCall 剩余工具数；剩余 0 且该节点不使用
   Agent Sandbox → 该 toolCall 将无法执行任何工具调用。
2. 删除或重配节点/输出 → `inspect` 的 references 或 `input_available` 查是否有其他节点
   引用；有 → 引用将失效。
3. 删除 `loop-run-break` 且父节点是条件循环 → `container children` 查 break 数量；
   数量为 0 → 循环将无法终止。
4. 删除容器节点（循环、并行等嵌套父节点）→ `container children` 查子节点清单；
   子节点非空时，删除会连带删除全部子节点，须告知用户并由用户决定是否继续。

处置：
- 能安全修复（调整引用来源、补替代工具）→ 直接修复方案后继续。
- 需要用户业务决策 → 合并为一次 `ask_agent`，用业务语言说明"需要补什么 / 哪些节点不允许
  修改"，不得暴露诊断码、节点 ID、引用结构等内部细节。
- 全部通过后才允许调用 `workflow_builder_present_preview`。
```

### 3.2 参考资料路由

SKILL.md 的"参考资料路由"中"检查工作流状态、元数据或校验结果"一行补充 `tool_list` / `input_available` 预演用途说明（或不动，让模型按需读取）。

## 4. references/workflow-inspection.md 改动

在"Builder-safe query commands"表中补充两行（`tool_list`、`input_available` 已在 CLI 中存在，文档未列全），并新增"预演检查"小节，说明如何用这些查询核查删除/卸载影响。

## 5. 验证方案

1. 类型检查：`pnpm tsc`（或项目对应 typecheck 命令）。
2. 手工验证场景（编辑器辅助生成）：
   - 删除 toolCall 唯一工具 → Agent 应 ask 用户（保留工具 or 删节点）。
   - 删除被引用节点 → Agent 应 ask 用户（保留 or 改引用来源）。
   - 删除条件循环唯一 break → Agent 应 ask 用户。
   - 纯新建任务 → 无预演打扰，直接出 Mermaid。
   - 预演通过的修改任务 → 正常出 Mermaid，确认后正常搭建。
3. 观察点：预演是否增加明显延迟、ask 是否合并为单次、是否暴露技术细节。

## 6. TODO

- [ ] runner.ts 系统提示词：插入阶段 5 方案预演 + 交互边界/完成标准同步
- [ ] SKILL.md：新增方案预演章节
- [ ] references/workflow-inspection.md：补充 tool_list/input_available 与预演检查指引
- [ ] 类型检查
- [ ] 手工验证（编辑器辅助生成全流程）
