# ChatBox 实例隔离功能开发文档

## 文档标识

- 任务前缀：`chatbox-instance-isolation`
- 文档文件名：`chatbox-instance-isolation-功能开发文档.md`
- 关联需求：`chatbox-instance-isolation-需求设计文档.md`

## 0. 开发目标与约束

- 功能目标：让同一 React 页面中的多个 ChatBox 拥有完全独立的消息动作、记录、输入、生成和外部触发边界。
- 直接验收场景：左侧 Workflow Builder 与右侧运行预览同时打开。
- 代码范围：`projects/app/src/components/core/chat/**`、必要的聊天上下文与对应测试。
- 非目标：不改 API、数据库、工作流执行引擎、Figma 样式和后端会话模型。
- 适用维度：Frontend[x] Logging[x] Testing[x]；API[ ] Data[ ] Packaging[ ] DocI18n[ ]。
- 约束：不复制 ChatBox；不使用无 target 的全局广播修补；不新增第三方依赖。

## 1. 实施任务拆解

| 任务ID | 任务名称 | 责任层 | 输入 | 输出 | 完成定义（DoD） |
|---|---|---|---|---|---|
| T1 | 定义 ChatBox 实例身份和动作上下文 | 前端基础组件 | `sourceKey/chatId/sendPrompt/lastInteractive` | `ChatInstanceActionsContext` | 子树组件可直接调用所属 ChatBox 动作 |
| T2 | 迁移交互卡提交入口 | AIResponseBox | user form/select/preview/payment | 无全局 emit 的实例提交 | 当前串线场景消失，交互参数保持一致 |
| T3 | 迁移快捷问题与编辑入口 | Chat UI/Markdown | question guide、welcome、AI suggestions | 本地 `sendMessage/fillInput` | `rg` 不再发现聊天内部 send/edit 全局 emit |
| T4 | 重构外部消息桥接 | ChatBox 基础设施 | `window.postMessage` | 目标化实例 registry | 指定目标单发；多实例无目标拒绝；精确注销 |
| T5 | 升级草稿与 DOM 作用域 | 输入/导出 | `sourceKey/chatId/rootRef` | 实例化 storage key 和 DOM ref | 草稿、变量查询和导出不跨实例 |
| T6 | 编写回归测试 | 测试 | 两实例场景矩阵 | 单元和组件测试 | 主路径、边界、卸载和歧义分支覆盖 |
| T7 | 质量验证 | 工程 | 修改文件 | lint/typecheck/test 结果 | 全部通过，无新增 warning/error |

## 2. 文件级改动清单

> 最终文件名可以在实现时按现有目录命名收敛，但职责不得合并回全局 `eventBus`。

| 文件路径 | 类型 | 变更摘要 | 关键代码/伪代码 | 任务 |
|---|---|---|---|---|
| `projects/app/src/components/core/chat/ChatContainer/context/chatInstanceActionsContext.tsx` | 新增 | 定义实例动作类型、Provider 与消费 hook | `sendMessage/continueInteractive/fillInput` | T1 |
| `projects/app/src/components/core/chat/ChatContainer/ChatBox/index.tsx` | 修改 | 构造实例动作，包裹 ChatBox 子树；移除内部 send/edit 全局监听 | `continueInteractive({ ...input, interactive: lastInteractive })` | T1/T3 |
| `projects/app/src/components/core/chat/ChatContainer/ChatBox/utils/externalPromptRegistry.ts` | 新增 | 注册实例并路由外部 prompt | `Map<instanceKey, handler>` + 精确 cleanup | T4 |
| `projects/app/src/components/core/chat/components/AIResponseBox/utils.ts` | 修改 | 删除全局 `onSendPrompt`，保留纯转换函数 | 不再 import `eventBus` | T2 |
| `.../AIResponseBox/RenderUserFormInteractive.tsx` | 修改 | 表单提交调用 `continueInteractive` | JSON payload 保持不变 | T2 |
| `.../AIResponseBox/RenderUserSelectInteractive.tsx` | 修改 | 选择提交调用所属实例 action | option value 保持不变 | T2 |
| `.../AIResponseBox/RenderWorkflowBuilderPreviewInteractive.tsx` | 修改 | Builder preview 回答调用实例 action | 保留 `agentPlanAskResponse` | T2 |
| `.../AIResponseBox/RenderPaymentPauseInteractive.tsx` | 修改 | Continue 进入所属实例 | `continueInteractive({ text: 'Continue' })` | T2 |
| `.../ChatBox/components/AIChatBubble/Actions.tsx` | 修改 | 问题建议使用 `sendMessage` | 不 import `eventBus` | T3 |
| `.../ChatBox/components/AppChatMain.tsx` | 修改 | 欢迎问题 fallback 使用实例 action | QuickReply context 保持兼容 | T3 |
| `projects/app/src/components/Markdown/A.tsx` | 修改 | 空链接快捷问题使用实例 action | hook 仅在 ChatBox 子树启用 | T3 |
| `projects/app/src/components/Markdown/chat/Guide.tsx` | 修改 | Guide 快捷问题实例发送 | 移除 sendQuestion emit | T3 |
| `projects/app/src/components/Markdown/chat/QuestionGuide.tsx` | 修改 | 发送与填充输入实例化 | `sendMessage/fillInput` | T3 |
| `.../ChatBox/hooks/useChatInputForm.ts` | 修改 | 草稿键加入 `sourceKey`，封装迁移逻辑 | `getChatDraftKey(identity)` | T5 |
| `.../ChatBox/components/ChatRecordsList.tsx` | 修改 | `#history` 改为 ref/data attribute | 不依赖全局 DOM ID | T5 |
| `.../ChatBox/hooks/useChatBox.tsx` | 修改 | 导出接收当前 history root | 不使用 `document.getElementById` | T5 |
| `projects/app/test/components/core/chat/ChatContainer/context/chatInstanceActionsContext.test.tsx` | 新增 | 两实例 action 路由测试 | 右侧点击只调用右侧 spy | T6 |
| `projects/app/test/components/core/chat/ChatContainer/ChatBox/utils/externalPromptRegistry.test.ts` | 新增 | registry 路由、歧义、注销测试 | 覆盖全部返回状态 | T6 |
| `projects/app/test/components/core/chat/ChatContainer/ChatBox/hooks/useChatInputForm.test.ts` | 新增/修改 | 草稿 key 和迁移测试 | 两 identity 不共享草稿 | T6 |
| `projects/app/test/components/core/chat/components/AIResponseBox/utils.test.ts` | 修改 | 删除全局 emit 断言，保留纯转换测试 | 不再操作全局 eventBus | T6 |
| `projects/app/test/web/common/utils/eventbus.test.ts` | 修改 | 若 send/edit enum 移除则同步测试；其他事件保持原义 | 只测试剩余全局事件 | T6 |

### 2.1 关键代码片段

#### T1：实例动作上下文

```ts
type ChatInstanceActions = {
  identity: ChatInstanceIdentity;
  sendMessage: (input: ChatBoxInputType) => void;
  continueInteractive: (input: ChatBoxInputType) => void;
  fillInput: (input: ChatBoxInputType) => void;
};

const actions = useMemoEnhance(
  () => ({
    identity: { sourceKey, chatId },
    sendMessage: sendPromptWithDisabledGuard,
    continueInteractive: (input) =>
      sendPrompt({ ...input, interactive: input.interactive ?? lastInteractive }),
    fillInput: resetInputVal
  }),
  [sourceKey, chatId, sendPromptWithDisabledGuard, sendPrompt, lastInteractive, resetInputVal]
);
```

关键点：`continueInteractive` 必须由所属 ChatBox 注入自己的 `lastInteractive`，不能让卡片从全局 listener 间接获得。

#### T2：交互卡提交

```ts
const continueInteractive = useChatInstanceAction((value) => value.continueInteractive);

const handleFormSubmit = (data: Record<string, unknown>) => {
  const finalData = pickInteractiveFields(data, interactive.params.inputForm);
  continueInteractive({ text: JSON.stringify(finalData) });
};
```

#### T4：外部消息 registry

```ts
const handlers = new Map<string, ExternalPromptHandler>();

export const dispatchExternalPrompt = (payload: ExternalChatPrompt) => {
  if (payload.target) {
    const handler = handlers.get(getChatInstanceKey(payload.target));
    if (!handler) return 'not-found';
    handler({ text: payload.text });
    return 'sent';
  }

  if (handlers.size !== 1) return 'ambiguous';
  handlers.values().next().value?.({ text: payload.text });
  return 'sent';
};
```

#### T5：草稿 key

```ts
export const getChatDraftKey = ({ sourceKey, chatId }: ChatInstanceIdentity) =>
  `chatInput_${sourceKey}:${chatId}`;
```

## 2.2 Reviewer 阅读流程

### 2.2.1 一句话改动主线

所有 ChatBox 子组件的发送和编辑动作从全局 `eventBus` 回收到当前 ChatBox 的 React action context；只有真正的外部消息继续经过 registry，并按 `sourceKey + chatId` 精确路由。

### 2.2.2 阅读顺序表

| 步骤 | Reviewer 看什么 | 文件/符号 | 关注点 | 应得结论 |
|---|---|---|---|---|
| 1 | 实例身份来源 | `workflowRuntimeContext.tsx`：`sourceKey/chatId` | Builder 与 app target 是否不同 | 每个 ChatBox 有稳定身份 |
| 2 | 动作边界 | `chatInstanceActionsContext.tsx` | 普通发送、交互继续、填充输入是否分开 | 动作不会离开实例子树 |
| 3 | ChatBox 注入 | `ChatBox/index.tsx` | `lastInteractive` 和 sendPrompt 绑定 | 交互提交使用正确历史状态 |
| 4 | 主问题入口 | `RenderUserFormInteractive.tsx` 等 | 是否完全移除全局 onSendPrompt | 右侧答案只能进入右侧 |
| 5 | 其余入口 | Markdown、welcome、AI suggestions | 是否还有 send/edit 全局 emit | 不存在遗漏入口 |
| 6 | 外部桥接 | `externalPromptRegistry.ts` | target、单实例兼容、歧义拒绝、cleanup | 外部入口不广播 |
| 7 | 草稿/DOM | `useChatInputForm.ts`、history ref | identity 是否贯穿持久化和 DOM | 内容层同样隔离 |
| 8 | 测试 | 新增测试文件 | 双实例、卸载、并发、歧义 | 回归能够被自动发现 |

### 2.2.3 调用链展开

1. 入口：右侧 `RenderUserFormInteractive.handleFormSubmit`。
2. 状态进入：通过 `useChatInstanceActions` 取得右侧 Provider 的 `continueInteractive`。
3. 核心调用：右侧 `ChatBox` 把右侧 `lastInteractive` 注入 input，调用右侧 `sendPrompt`。
4. 数据变化：只写右侧 `ChatRecordContext.setChatRecords`，只请求运行预览 `chatTest`。
5. 页面结果：右侧交互变成 submitted 并继续流式输出；左侧 records 和 Builder 状态不变。
6. 错误分支：如果外部消息 target 不存在或多实例无 target，registry 返回失败状态，不产生聊天记录。
7. 测试验证：两个实例分别注入 spy，提交右侧后断言 `right=1`、`left=0`；卸载右侧后左侧仍可发送。

## 3. 后端实施说明

### 3.1 API 改动

Not Applicable。现有运行预览与 Workflow Builder API 已通过不同 source target 和 chatId 工作。

### 3.2 Core/Service 改动

Not Applicable。

### 3.3 数据层改动

Not Applicable。无 Schema、索引和迁移。

## 4. 前端实施说明

| 场景 | 改造前 | 改造后 | 状态覆盖 |
|---|---|---|---|
| 普通输入发送 | ChatInput 直接调用实例函数 | 保持现状 | 空/加载/错误/成功不变 |
| 历史交互表单 | 全局 `onSendPrompt` | `continueInteractive` | 待填/提交中/已提交/失败 |
| 快捷问题 | 部分本地、部分 eventBus | 统一实例 `sendMessage` | 可发送/生成中禁用 |
| 编辑问题 | 全局 `editQuestion` | 实例 `fillInput` | 填充所属输入框 |
| 外部 postMessage | 所有 ChatBox 监听 | registry 精确目标 | sent/not-found/ambiguous |
| 草稿 | 仅 chatId | sourceKey + chatId | 读取/写入/清空/旧 key 迁移 |

i18n：无新增用户文案；开发 warning 不进入 UI。

## 5. 日志与可观测性

| 触发点 | 级别 | 分类 | 字段 | 脱敏 |
|---|---|---|---|---|
| 多实例无 target 外部消息 | `console.warn`（development only） | `ChatBox external dispatch` | `registeredInstanceCount` | 不记录正文、文件、用户 ID |
| target 不存在 | 可选 development warning | 同上 | target 类型摘要，不记录完整 ID | 截断/不输出 identity |

## 6. 文档 i18n

Not Applicable。

## 7. 测试与验证

### 7.1 测试文件映射

| 源文件 | 测试文件 | 跳过 | 理由 |
|---|---|---|---|
| `chatInstanceActionsContext.tsx` | `test/components/core/chat/ChatContainer/context/chatInstanceActionsContext.test.tsx` | 否 | 核心实例边界 |
| `externalPromptRegistry.ts` | `test/components/core/chat/ChatContainer/ChatBox/utils/externalPromptRegistry.test.ts` | 否 | 外部路由核心逻辑 |
| `useChatInputForm.ts` | 对应 hook/utils 测试 | 否 | 草稿身份隔离 |
| 四个交互渲染组件 | 优先通过实例 action 集成测试覆盖 | 否 | 当前真实串线入口 |
| Markdown/快捷入口 | 组件测试或 action spy 测试 | 否 | 防止遗漏全局 emit |

### 7.2 自动化测试设计

| 类型 | 用例 | 预期 |
|---|---|---|
| 单元 | 两个 identity 生成不同 instance key | key 不相同 |
| 单元 | registry 指定右侧 target | 只调用右侧 handler |
| 单元 | registry 多实例无 target | 返回 `ambiguous`，两个 handler 都不调用 |
| 单元 | 注销右侧 handler | 左侧 handler 仍存在且可调用 |
| 单元 | 同 chatId、不同 sourceKey 的草稿 | 分别读写 |
| 组件 | 两个 action Provider 下各渲染交互按钮 | 点击右侧只触发右侧 spy |
| 组件 | user form/select/preview/payment 分别提交 | payload 和原实现一致，目标实例正确 |
| 组件 | 快捷问题和编辑问题 | 只发送/填充来源实例 |
| 集成 | Builder + Run Preview 同时生成 | 两侧 records 独立更新 |
| 集成 | 任一侧关闭/重开 | 另一侧发送能力不丢失 |
| 集成 | 刷新后恢复 | 两侧按各自 target 恢复 |

### 7.3 场景覆盖

| 场景 | 覆盖 | 对应用例 |
|---|---|---|
| 基础场景 | 是 | 左右普通发送、右侧表单提交 |
| 复杂场景 | 是 | 两边并发生成、交互嵌套、关闭重开 |
| 边界值 | 是 | 相同 chatId 不同 sourceKey、单实例 legacy 外部消息 |
| 异常场景 | 是 | target 不存在、多实例无 target、handler 注销 |
| 安全边界 | 是 | 外部消息不广播、warning 不记录正文 |

### 7.4 执行命令与目标

| 命令 | 目标 | 覆盖率目标 |
|---|---|---|
| `pnpm --dir projects/app test test/components/core/chat/ChatContainer/context/chatInstanceActionsContext.test.tsx` | action context | 100% 行/分支 |
| `pnpm --dir projects/app test test/components/core/chat/ChatContainer/ChatBox/utils/externalPromptRegistry.test.ts` | 外部 registry | 100% 行/分支 |
| `pnpm --dir projects/app test test/components/core/chat/components/AIResponseBox/utils.test.ts` | 交互纯函数回归 | 100% 相关分支 |
| `pnpm --dir projects/app typecheck` | TypeScript | 0 error |
| `pnpm exec eslint <本次修改文件>` | Lint | 0 新 error/warning |
| `pnpm prettier --check <本次修改文件>` | 格式 | 全部通过 |

实现完成后再填写真实执行结果，不得在开发前伪填通过。

## 8. 质量自检清单

- [ ] ChatBox 内部不存在 `sendQuestion/editQuestion` 全局 emit。
- [ ] 交互提交保留正确 `lastInteractive` 与 `agentPlanAskResponse`。
- [ ] 一个实例 cleanup 不会注销另一个实例。
- [ ] 多实例外部无 target 消息不会广播。
- [ ] `sourceKey + chatId` 贯穿动作、草稿、外部桥接。
- [ ] 单实例聊天行为无回归。
- [ ] 不新增用户文案，无 i18n 遗漏。
- [ ] 测试覆盖当前截图复现路径。

## 9. 发布与回滚

### 9.1 发布步骤

1. 先提交实例 action context、纯逻辑与测试。
2. 再迁移交互入口和快捷入口。
3. 最后移除 ChatBox 内部全局 send/edit 监听，上线外部 registry。
4. 在应用详情页手工执行双 ChatBox 验收矩阵。

### 9.2 回滚触发条件

- 单实例聊天无法发送、继续交互或填充编辑内容。
- 外部嵌入调用无法提供 target 且无法走单实例兼容。
- 双实例中仍出现任何一次跨实例记录写入。

### 9.3 回滚步骤

1. 回滚实例 action 迁移提交，恢复原全局入口。
2. 保留无数据副作用的测试和问题复现用例，避免问题被遗忘。
3. 新草稿 key 无需数据回滚；必要时恢复双读旧 key。

## 10. AI 实施 TODO

- [ ] T1：新增实例 action context，并在 ChatBox 中绑定 identity 和本地动作。
- [ ] T2：迁移四类 interactive 组件，验证 payload 完全兼容。
- [ ] T3：迁移所有 send/edit 全局 emit，使用 `rg` 做零遗漏检查。
- [ ] T4：实现外部 registry、精确 cleanup 和歧义拒绝。
- [ ] T5：升级草稿 key 和 DOM 查询作用域。
- [ ] T6：先写能稳定复现“右侧提交进入左侧”的失败测试，再完成修复。
- [ ] T7：运行针对性测试、typecheck、lint、prettier 和双面板手工验证。

