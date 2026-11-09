# 内容审查运行时业务调用锚点与流式拦截 (P2) — 设计方案与实施规划

mode: plan
task: FastGPT 接入内容审查插件运行时调用锚点与拦截策略
ui_design: https://www.figma.com/design/KcAmeVQkIsXRuR9CsFTa1N/%E8%B4%A6%E5%8F%B7?node-id=2743-1139&p=f&m=dev (内容审核插件，node-id: 2743-1139)
status: DRAFT（已对齐需求，准备进入实现）

## 1. 概述与设计原则

在 Phase 1 已完成的配置管理能力（全局开关、生效环节勾选、流式间隔与处理策略、单插件互斥启用、管理端配置 UI）基础上，Phase 2 核心将内容审核插件接入 FastGPT 真实运行链路中，覆盖**信息接入平台（Entry Guard）**、**信息进入模型（Model Input Guard）**、**输出检查（Output / Stream Guard）**三大环节，并建立统一的**审查记录持久化（Audit Records）**机制。

同时，**旧 censor 链路完全移除并替换**，不再保留历史过渡代码。

### 核心设计原则
1. **策略联动**：严格遵循用户在管理后台配置的全局策略（`hooks.userInput`、`hooks.modelInput`、`hooks.finalOutput`、`strategy.streamInterval`、`strategy.suspectedRiskAction`、`strategy.serviceExceptionAction`）。如果审核总开关关闭或对应环节未勾选，直接放行，不产生任何审查开销。
2. **面向用户输出统一化原则**：所有准备交付给用户的最终输出（AI 文本、指定回复、用户选择选项、表单默认值等），违规一律判定为拦截失败（非流式整次报错阻断，流式立即截断并丢弃未展示内容），无需对各节点类型设置过度细分的特例分支。
3. **Agent 内部工具结果容错与连续性**：Agent Loop 内部的工具结果并非直接展示给用户，而是喂回给模型。因此工具结果违规时，将其替换为统一提示文案（“该信息因内容审核不通过，无法返回”），让 Agent 感知结果被阻断并继续后续规划，不中断整个 Agent 思考链。
4. **历史上下文免审**：进入模型的审核跳过已归档的历史消息，避免重复审查历史导致延迟与 Token 成本陡增。
5. **审计闭环与结果持久化**：所有触发的审查调用均支持落库到审核记录表，为企业合规审计与管理端“审核记录”页面提供完整的数据源。
6. **彻底替换旧 Censor**：清理并移除运行时业务链路中遗留的旧版文本审查（`censorCheckBaidu`、`censorCheckCustom`、`postTextCensor` 等），全流程统一收归至 Moderation 体系。仅保留 `packages/service/common/api/type.d.ts` 中的 `global.textCensorHandler` 类型声明以及模型配置 Schema（`admin/config/type.ts`、`adapt.ts`、`model/schema.ts`）中的历史 `censor` 字段，用于兼容 `pro` 子模块类型检查与存量数据库记录反序列化，运行时不再读取或执行旧版 censor。

---

## 2. 审核锚点详细规格

### 锚点 1：信息接入平台（Entry Guard）
- **触发时机**：请求进入平台最早期（在进入工作流调度与任何节点执行前）。
- **生效条件**：`policy.enabled && policy.hooks.userInput`。
- **审查对象**：
  1. **本轮用户问题**：网页端或 API 渠道传入的 `query` / `userChatInput`。
  2. **全局变量**：本次请求注入的自定义全局变量（`variables` 中的所有字符串值）。
  3. **表单输入**：用户填写的动态表单输入内容（含表单中不合法的内容）。
- **触发效果**：
  - **禁止本次请求，应用完全不开始运行**。
  - 直接抛出明确的拦截错误并记录审计记录，不触发任何工作流节点，不消耗模型 Token。

---

### 锚点 2：信息进入模型（Model Input Guard）
- **范围限定**：AI 对话节点（`chatNode`）、工具调用（`toolCall` / `tools`）、Agent 应用（`agent`）。
- **生效条件**：`policy.enabled && policy.hooks.modelInput`。
- **具体细分与处理逻辑**：
  1. **进入 Agent Loop 前（各节点单独处理，针对各自组装的输入源）**：
     - **审查项**：
       - 用户输入（传给该节点的输入文本）。
       - 提示词（System Prompt、拼接后的系统指令）。
       - 知识库检索结果（引用切片文本 Quote / Citations）。
       - 文件读取结果（从文件中读取出来的文本内容）。
     - **免审项**：**历史上下文（Chat Histories）免审**。
     - **触发效果**：
       - 违规项被替换为结构化结果：“该信息因内容审核不通过，无法返回”。
       - **必需输入拦截检测**：若必需输入（如用户输入）被拦截后导致该节点已无任何有效输入内容，**该节点本次不运行，直接抛错终止当前节点**。
       - 节点终止运行后，应用是否继续由外层节点的连线编排和异常处理机制决定。
  2. **Agent Loop 内（共用机制）**：
     - **审查项**：工具执行响应结果（Tool response / Tool run result）。
     - **触发效果**：
       - 工具结果统一替换为文案：“该信息因内容审核不通过，无法返回”。
       - **不中断 Agent 运行**：Agent 模型接收到脱敏/替换后的工具结果，继续进行下一轮规划和运行。

---

### 锚点 3：输出检查（Output / Stream Guard）
- **范围**：平台最终交付给用户的内容。
- **生效条件**：`policy.enabled && policy.hooks.finalOutput`。
- **处理细则**：
  1. **面向用户的各类文本输出（统一拦截）**：
     - 包含 AI 对话文本输出、Agent 文本输出、指定回复（`answerNode`）、用户选择选项（`userSelect`）、表单输入默认值与选项（`formInput`）、猜你想问（`queryExtension`）。
     - **违规处理**：
       - **非流式**：整次结果不发送，统一报错终止或返回统一拦截提示。
       - **流式（SSE）**：按 `strategy.streamInterval`（默认 50 字符/次）分块送审。一旦命中拦截，**立即停止向客户端发送后续 token，向 SSE 推送拦截中断事件，并立即终止模型生成，丢弃已生成未展示的内容**。
  2. **工具参数（Tool Arguments）**：
     - 检查模型生成的工具调用参数；若参数违规：**终止模型调用并抛错，参数不返回给客户端**。
  3. **工具调用结果（Tool Result 对外响应）**：
     - 检查工具执行返回结果对外呈现的部分；若违规：**响应不返回给客户端**，但不终止模型调用，使用固定特殊内容作为工具响应回传给模型。

---

## 3. 审查结果持久化模型（Audit Records）

为支撑合规审计及后续「审核记录（/admin/moderation/records）」页面的数据调取，每次真实业务审查均落库到 `system_moderation_records` 集合。

### 数据模型（Schema）
```ts
export const ModerationRecordSchema = z.object({
  _id: z.string(),
  teamId: z.string().meta({ description: '团队 ID' }),
  tmbId: z.string().meta({ description: '操作人 ID' }),
  appId: z.string().optional().meta({ description: '应用 ID' }),
  chatId: z.string().optional().meta({ description: '会话 ID' }),
  responseChatItemId: z.string().optional().meta({ description: '回复消息 ID' }),
  requestId: z.string().optional().meta({ description: '全局请求追踪 ID' }),

  // 1. 审核环节与上下文
  stage: z.enum(['entry', 'model_input', 'output']).meta({
    description: '审核环节：信息接入平台 | 信息进入模型 | 输出检查'
  }),
  nodeId: z.string().optional().meta({ description: '触发节点 ID' }),
  nodeName: z.string().optional().meta({ description: '触发节点名称' }),
  targetField: z.string().optional().meta({
    description: '具体被审字段，如 userInput / systemPrompt / toolResult / answerText 等'
  }),

  // 2. 被审内容与结果
  content: z.string().meta({ description: '送审的文本内容（供管理端审计调取）' }),
  pluginId: z.string().meta({ description: '调用的审查插件 ID' }),
  provider: z.string().meta({ description: '审查服务提供商' }),
  verdict: z.enum(['pass', 'suspected', 'block', 'error']).meta({ description: '裁决结果' }),
  keywords: z.array(z.string()).default([]).meta({ description: '命中的敏感词' }),
  hits: z.array(z.object({
    label: z.string(),
    providerLabel: z.string().optional(),
    score: z.number().optional(),
    keywords: z.array(z.string()).optional()
  })).default([]),
  errorMessage: z.string().optional(),

  // 3. 平台最终采取的执行策略与动作
  actionTaken: z.enum(['pass', 'block', 'replace']).meta({
    description: '实际执行动作：直接放行 | 拦截阻断 | 替换脱敏文本'
  }),

  duration: z.number().optional().meta({ description: '审查耗时 (ms)' }),
  createTime: z.date().default(() => new Date())
});
```

### 索引设计
- `{ teamId: 1, createTime: -1 }`
- `{ verdict: 1, createTime: -1 }`
- `{ stage: 1, createTime: -1 }`
- `{ appId: 1, createTime: -1 }`

---

## 4. 任务分解与实施计划 (P2 Todo)

### 阶段 2.1：基础与审查记录持久化（Service 层）
- [ ] **T10: 运行时审查核心函数与策略判定器**
  - 在 `packages/service/core/plugin/moderation/` 封装统一的业务审查入口：
    - `checkContentByPolicy({ text, scene, stage, targetField, context })`：
      - 自动获取已启用的插件及其解密后的 runtime secrets；
      - 结合 `suspectedRiskAction` 与 `serviceExceptionAction` 计算最终动作（`pass` / `block` / `replace`）；
      - 异步静默写入 `system_moderation_records`。
- [ ] **T11: 审核记录集合、Schema 与 Entity 实现**
  - 创建 `packages/service/core/plugin/moderation/record/schema.ts`、`entity.ts`；
  - 导出 `createModerationRecord` 异步方法，带索引声明与单测。

### 阶段 2.2：旧 Censor 彻底清理与替换
- [x] **T12: 移除旧版 Censor 链路**
  - 搜索并移除运行时 `censorCheckBaidu`、`censorCheckCustom`、`postTextCensor` 调用链路。
  - 清理 `dispatchChatCompletion` 及工具调用中原有的 `modelConstantsData.config.censor` 相关逻辑（仅保留 `type.d.ts` 与模型配置 Schema 的历史兼容字段定义以维持 `pro` 子模块编译及历史数据读取兼容）。

### 阶段 2.3：三大审核锚点落地
- [ ] **T13: 锚点 1（信息接入平台）拦截实现**
  - 在 `dispatchWorkFlow` 启动前校验用户输入 `query`、全局变量 `variables`、表单输入值；
  - 违规直接抛错阻断，应用不开始执行。
- [ ] **T14: 锚点 2（信息进入模型）拦截实现**
  - 在 `dispatchChatCompletion`、`dispatchRunAgent`、`toolCall` 构造提示词时：
    - 审查用户输入、提示词、知识库切片、文件读取内容，跳过历史消息；
    - 违规替换为统一脱敏文案；无有效输入时抛错中止当前节点。
  - 在 Agent Loop 工具返回结果处（`createWorkflowAgentLoopRuntime`）：
    - 审查工具执行返回结果，违规内容替换为统一提示文案后送回模型，保持 Agent 继续运转。
- [ ] **T15: 锚点 3（输出检查与流式阻断）拦截实现**
  - 面向用户的输出（AI 回答、指定回复、用户选择等）统一拦截：非流式直接抛错终止；
  - 模型工具调用参数违规时：终止模型调用抛错，参数不返回客户端；
  - 在 `createLLMResponse` 的 `onStreaming` 回调链中接入流式审查缓冲器，按 `streamInterval` 字符数滑动分块送审；
  - 流式中途违规时，立即调用 `abortController.abort()` 掐断生成，向 SSE 推送拦截中断事件，丢弃未展示内容。

### 阶段 2.4：验证与测试
- [ ] **T16: 单元测试与端到端联调**
  - 单元测试覆盖三类锚点判定、流式分块截断、审核记录异步落库；
  - 本地双服务联调验证完整生命周期。
