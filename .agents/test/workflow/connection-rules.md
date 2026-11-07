# 工作流连线用例入口

按业务验收目标收敛为 **11 份用例**，公共准备和断言各写一次，多个相关场景通过矩阵覆盖。主类型用于归档，子场景可以同时包含基础、异常和边界行为。

| 用例 | 合并前编号（FG-APP-WORKFLOW- 前缀） |
| --- | --- |
| [FG-APP-WORKFLOW-001 主流程、工具流程与嵌套工具的连接隔离](../app/workflow/editor/FG-APP-WORKFLOW-001-main-and-tool-flow-isolation.md) | 001、002、038 |
| [FG-APP-WORKFLOW-003 工具入口的挂载、独占归属与更换调用者](../app/workflow/editor/FG-APP-WORKFLOW-003-tool-entry-ownership-lifecycle.md) | 003、004、005、006、039 |
| [FG-APP-WORKFLOW-007 普通连线的允许、拒绝与拓扑变化](../app/workflow/editor/FG-APP-WORKFLOW-007-ordinary-connection-rules.md) | 007、008、009、010、011、012 |
| [FG-APP-WORKFLOW-013 条件出口的受控回流与串行旁路](../app/workflow/editor/FG-APP-WORKFLOW-013-conditional-feedback-rules.md) | 013、015、017、022、023 |
| [FG-APP-WORKFLOW-014 旧分支与旧方向 Handle 的导入兼容](../app/workflow/editor/FG-APP-WORKFLOW-014-legacy-connection-import.md) | 014、029 |
| [FG-APP-WORKFLOW-016 分支与选项编辑时的稳定标识和精确边清理](../app/workflow/editor/FG-APP-WORKFLOW-016-branch-option-editing.md) | 016、018、019、020、021、044、045、046 |
| [FG-APP-WORKFLOW-024 报错捕获切换与自定义 source 出口](../app/workflow/editor/FG-APP-WORKFLOW-024-catch-and-custom-output-lifecycle.md) | 024、025、026、027、028、047 |
| [FG-APP-WORKFLOW-030 循环与并行容器的连接范围和节点限制](../app/workflow/editor/FG-APP-WORKFLOW-030-container-connection-scope.md) | 030、031、032、033、034 |
| [FG-APP-WORKFLOW-035 工具参数与终止节点的可用连接上下文](../app/workflow/editor/FG-APP-WORKFLOW-035-special-node-connection-context.md) | 035、036、037 |
| [FG-APP-WORKFLOW-040 运行发布校验与草稿保存恢复](../app/workflow/editor/FG-APP-WORKFLOW-040-workflow-validation-and-draft-lifecycle.md) | 040、041、042、043 |
| [FG-APP-WORKFLOW-049 画布交互中的端口几何与连线保留](../app/workflow/editor/FG-APP-WORKFLOW-049-canvas-handle-geometry-and-state.md) | 049、050、051、052 |

- 代表用例保留原 ID，合并前编号在上表查询；退役编号不重新分配。旧路径仅作查找入口，不另计用例。
- 自连、重复边与串行回环集中在 007；流程隔离、工具归属、分支编辑等仅保留特有变化和必要对照。
- 048 因缺少已确认的产品需求依据移除，编号退役，不重新分配。
- 数据准备、复位或承接关系、子场景编号与特有预期均在各用例内说明。保存/刷新按语义四元组比较，容器系统节点和固定边保留真实模板配置。
- ready 表示定义可执行，不代表通过；执行结果和证据保存在仓库外的临时报告中。本组用例的分析基线为 `5a5211f70998f5311cd40b0e5362a1414be6fbdf`。

## 自动回归参考

- [Core 连线判定](../../../packages/workflow-core/test/edge/validation.test.ts)、[整图校验](../../../packages/workflow-core/test/validation/validation.test.ts)。
- [ReactFlow Handle 组件](../../../projects/app/test/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/Handle/index.test.ts)。
- [问题分类分发](../../../packages/service/test/core/workflow/dispatch/ai/classifyQuestion.test.ts)、[用户选择分发](../../../packages/service/test/core/workflow/dispatch/interactive/userSelect.test.ts)。

分发函数测试中的模型响应含 mock，其结果不作为本组真实 UI/API 场景的执行证据。按所选用例执行并记录本轮观察，不沿用历史通过数量。
