---
name: workflow-builder-evaluation
description: 运行和维护 FastGPT Workflow Builder 自动生成测评系统。用户要求制作或检查 WBE 案例、运行部分或全部案例、计算五项指标、定位案例失败或卡住阶段、查看测评报告、归档某个版本 Benchmark 结果时使用。
---

# Workflow Builder 测评

## 唯一入口

先完整读取 `pro/admin/test/core/ai/workflowBuilder/README.md`，再根据任务读取其中直接链接的对应文档。指标和案例规则以该目录为唯一事实源，不在 Skill 内复述或自行扩展评分口径。

## 任务路由

- 制作或修改案例：读取 `docs/case-authoring.md` 和 `docs/evaluation-standard.md`，修改后执行案例校验。
- 执行测评：读取 `docs/runbook.md`，依次执行案例校验、Preflight 和 Runner。
- 解读结果：读取 `docs/reporting.md`，以运行目录内 `report.json` 为事实源，使用 `summary.md` 和逐案例报告定位问题。
- 归档版本结果：仅在用户明确要求归档时读取 `docs/benchmark-archive.md` 并执行归档命令。

## 标准执行顺序

1. 检查 `config/eval.local.yaml` 是否存在，但不得输出其中的 Cookie、Token 或其他凭证。
2. 运行 `pnpm --filter @fastgpt/admin workflow-builder:eval:lint`。
3. 运行 `pnpm --filter @fastgpt/admin workflow-builder:eval:preflight`。失败时停止正式计分并报告环境问题。
4. 运行 `pnpm --filter @fastgpt/admin workflow-builder:eval:run`。用户指定案例时先确认本地配置的 `run.caseIds` 与请求一致。
5. 读取新生成的 `report.json`，汇报五项指标的分子、分母、待完成数和无法评价数。
6. 列出每个问题案例的最后完成阶段、失败阶段或卡住阶段、失败代码、原因和证据位置。
7. 不自动归档。只有用户明确要求后才运行 `workflow-builder:eval:archive`。

## 约束

- 不允许自行计算、覆盖或手工修正 `report.json` 中的自动评分。
- 不把环境错误、凭证问题或输入映射问题算成产品失败。
- 不因节点数量、节点命名或汇聚结构不同，判定行为等价的工作流失败，除非用户需求明确规定这些结构。
- 只运行部分案例时，必须说明这是子集结果，不能表述为完整数据集结论。
- 不删除自动创建的 Workflow 应用或运行证据，除非用户明确要求清理并确认目标。
- 归档前检查运行是否完整；使用 `--allow-incomplete` 必须得到用户明确指示。
