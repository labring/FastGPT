# AI Agent 当前架构索引

状态：当前实现

最后核对：2026-07-16

## 文档目的

本目录只维护当前代码仍然遵循的设计约束。已经完成的迁移步骤、旧目录方案、阶段性修复方案和完成态 TODO 不再保留在主文档中，需要追溯时使用 Git 历史。

## 文档导航

| 文档 | 说明 |
| --- | --- |
| [Agent Loop](./agent-loop/index.md) | 统一模型循环、工具、事件、暂停恢复、上下文和计费协议 |
| [辅助生成](./auxiliary-generation.md) | Chat Agent Helper 等非 workflow 生成场景的通用生命周期 |
| [Agent Sandbox](./sandbox/index.md) | 沙盒实例、provider、工具、Skill 部署、entrypoint 和归档 |
| [Agent Skill](./skill/index.md) | 空白工作区、发布约束和内置辅助生成 Skill |

## 总体关系

```text
业务入口
  |-- Workflow Agent / ToolCall
  |     `-- agentLoopCore
  |            `-- runAgentLoop
  |
  |-- Auxiliary Generation
  |     `-- runAuxiliaryGenerationAgentLoop
  |            `-- runAgentLoop
  |
  `-- Skill Edit / Agent runtime
        `-- Sandbox runtime + Skill deployment

runAgentLoop
  |-- fastAgent provider
  `-- piAgent provider

Sandbox
  |-- runtime client and lifecycle
  |-- sandbox system tools
  `-- published and builtin Skills
```

## 稳定边界

1. 模型循环统一从 `packages/service/core/ai/llm/agentLoop/interface` 进入，业务调用方不直接依赖 provider 实现。
2. Workflow 特有的 `assistantResponses`、`nodeResponse`、interactive 和账单展示由 `agentLoopCore` 适配，不能下沉到通用 Agent Loop。
3. 辅助生成复用 Agent Loop，但不隐式获得 workflow 工具、Sandbox 或 Skill 能力。
4. Sandbox 业务归属统一使用 `sourceType/sourceId`，`sandboxId` 仅用于定位物理实例。
5. Skill 文件和内置 Skill 的部署由 Sandbox runtime 完成，Skill 模块不接管 Sandbox 生命周期。

## 文档维护规则

- 文档描述当前状态，不重复提交记录。
- 已完成的实施 TODO 从文档删除；未完成且已确认要做的事项才保留 TODO。
- 路径、类型和协议以当前代码为准，重构后同步修改对应主题文档。
- 一次性数据迁移留在迁移脚本和测试中，主设计文档只记录仍存在的兼容边界。
