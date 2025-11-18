# FastGPT Agent V1 设计

## 需求

1. 工作流增加一个 Agent 节点，包含以下配置：
   1. 模型和模型的参数
   2. 提示词
   3. 问题输入
   4. Plan 模式配置
   5. Ask 模式配置
2. 增加 3 类 Human interaction 节点，包含以下配置：
   1. plan check：确认 plan
   2. plan ask: plan 阶段触发的信息采集
3. 增加 Agent 节点的处理函数

## Agent 节点的处理函数

1. Plan 模式

**进入 Plan 阶段条件**
1. 首次开始 Agent 节点
2. 包含 Plan check/ Plan ask 交互的节点被触发

Plan 阶段结束后进入任务运行阶段。

2. 非 Plan 模式

直接进入任务原阶段。

### 前置阶段

1. 解析 subApp，获取模型可用的工具列表

### Plan 的数据结构

```ts
export type AgentPlanStepType = {
  id: string; // 步骤唯一 ID
  title: string; // 步骤标题，通常不超过 20 字。
  description: string; // 步骤详细任务描述
  depends_on?: string[]; // 依赖的步骤 ID（用于获取前置步骤的响应）
  response?: string; // 步骤的响应
};
export type AgentPlanType = {
  task: string;
  steps: AgentPlanStepType[];
  replan?: string[]; // 重新规划依赖的步骤 ID
};

```

### Plan 阶段

**首次进入处理逻辑：**
1. 组合系统 prompt、用户对话历史记录、当前任务内容成 messages
2. 调用 LLM 请求内容：
   1. 直接生成 plan（一个数组）,返回 Check 信息
   2. 调用 Ask 工具：返回 Ask 信息

**Check 进入处理逻辑：**
1. 如果用户点击的是确认，则直接返回完整 Plan。
2. 如果用户输入的修改要求，则继续拼接 messages，调用 LLM。（与首次进入处理逻辑类似）

**Ask 进入处理逻辑：**
1. 拼接 Ask 结果到 messages 后
2. 调用 LLM 请求内容（与首次进入处理逻辑一致）
3. 可能会出现多次 Ask 的循环情况，暂时预设最大 3 次，如果进入 3 次后，则本轮 messages 不再携带 Ask 工具，只会输出 Plan


### 任务调度阶段

如果没有 Plan，则直接利用模型工具调用能力完成即可。
Plan 是一个数组，包含多个阶段的任务，会通过数组遍历来逐一完成每一步的任务。

```ts
for(const step from steps) {
   const response = await runStep(xxx)
   context[step.id] = response
}
```

### 数据持久存储

1. memory 中需要存储：
   1. planMessages: plan 阶段传递给模型的 messages
   2. plan: 本轮任务的 plan，以及响应值。