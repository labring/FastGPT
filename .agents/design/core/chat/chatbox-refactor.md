# ChatBox 拆分重构设计文档

## 1. 背景

`projects/app/src/components/core/chat/ChatContainer/ChatBox/index.tsx` 是当前主聊天界面的核心组件，文件约 2000 行。它不是单纯的 UI 文件，而是同时承担了输入表单、滚动控制、流式生成、恢复生成、消息操作、反馈标注、记录渲染、home/chat/log 多模式分支等职责。

这种结构带来的主要问题：

1. **修改风险高**：一个需求经常需要同时理解 `chatRecords`、`chatBoxData`、`ChatBoxContext`、`WorkflowRuntimeContext` 等多层状态。
2. **副作用集中**：发送消息、恢复生成、停止请求、侧边栏状态同步、已读状态、TTS、问题引导都在同一个组件内交织。
3. **难以局部测试**：大量逻辑以内联函数和 `useMemo` 形式存在，纯逻辑与 React 副作用混在一起，不利于补充单元测试。
4. **后续需求成本高**：暂停、恢复、流式响应、输入状态、反馈、log 展示等需求都容易改动同一个大文件，冲突概率高。

本次重构的目标不是重写聊天协议，也不是一次性替换状态管理，而是按职责逐步拆分 `ChatBox`，让后续维护能在更小的模块里完成。

## 2. 目标

1. 保持 `ChatBox` 对外调用方式不变，包括默认导出、props、`ChatBoxRef.restartChat`、`ChatBoxRef.scrollToBottom`。
2. 将 `index.tsx` 中的核心职责拆成可理解、可测试、可迭代的模块。
3. 优先抽离纯逻辑，再抽离 hook，最后拆分 UI 组件，避免一次性大重构。
4. 保持现有聊天行为不变，包括普通聊天、home chat、share chat、log 展示、skill preview、app chat test 等入口。
5. 为流式生成、恢复生成、输入状态、消息反馈等高频需求建立清晰边界。
6. 每个阶段都提供明确验证方式，保证重构可以分批合入。

## 3. 非目标

1. 不重写聊天接口、SSE 协议、workflow runtime 协议。
2. 不改变 `ChatBox` 外部 props 结构。
3. 不合并或替换 `ChatItemContext`、`ChatRecordContext`、`ChatBoxContext`、`WorkflowRuntimeContext`。
4. 不引入新的全局 store 来承接所有状态。
5. 不同步重构 `HelperBot`，除非抽出的类型或纯工具函数天然复用。
6. 不迁移历史数据结构。
7. 不在第一阶段调整视觉样式或交互文案。

## 4. 当前职责拆解

### 4.1 容器状态

当前 `ChatBox` 内部维护以下 UI 或运行状态：

1. `isLoading`：重试删除等操作的加载态。
2. `feedbackId`：用户点踩后打开反馈弹窗的目标消息。
3. `adminMarkData`：管理员标注弹窗的数据。
4. `questionGuides`：一次回答结束后生成的问题引导。
5. `expandedDeletedGroups`：log 模式中被删除消息组的展开状态。

这些状态分属不同领域，后续可以分别进入 feedback、question guide、record list 等模块。

### 4.2 上下文依赖

`ChatBox` 同时读取多个 context：

1. `ChatItemContext`
   - `chatBoxData`
   - `setChatBoxData`
   - `ChatBoxRef`
   - `variablesForm`
   - `resetVariables`
   - `setIsVariableVisible`
   - app/user avatar
2. `ChatRecordContext`
   - `chatRecords`
   - `setChatRecords`
   - `isLoadingRecords`
   - `isChatRecordsLoaded`
   - `ScrollData`
   - `itemRefs`
3. `WorkflowRuntimeContext`
   - `appId`
   - `chatId`
   - `outLinkAuthData`
4. `ChatBoxContext`
   - app chat config 派生数据，例如 `welcomeText`、`variableList`、`questionGuide`
   - 音频能力，例如 `startSegmentedAudio`、`splitText2Audio`、`finishSegmentedAudio`
   - `isChatting`
5. `ChatContext`
   - 侧边栏历史列表 `setHistories`
   - `loadHistories`

其中 `sendPrompt` 和 `resume` 同时改写多个 context，是当前耦合最重的两块。

### 4.3 输入表单

当前输入表单职责包括：

1. `useForm<ChatBoxInputFormType>` 初始化。
2. 从 `sessionStorage` 读取 `chatInput_${chatId}` 草稿。
3. 监听 `input` 变化并 debounce 写入草稿。
4. 计算 `chatStarted`。
5. `resetInputVal` 同时重置 `files`、`input`、textarea 高度和草稿。
6. home 模式下变量表单与输入框互斥渲染。

这部分适合拆成 `useChatInputForm`，由它返回：

```ts
type UseChatInputFormResult = {
  chatForm: UseFormReturn<ChatBoxInputFormType>;
  chatStarted: boolean;
  chatStartedWatch: boolean;
  commonVariableList: VariableItemType[];
  showExternalVariable: boolean;
  resetInputVal: (value: ChatBoxInputType) => void;
};
```

### 4.4 滚动控制

当前滚动职责包括：

1. `ScrollContainerRef`。
2. `scrollToBottom`，支持延迟和递归等待 DOM。
3. `generatingScroll`，根据当前位置决定流式生成时是否跟随底部。
4. records loaded 后强制滚到底部。
5. `ChatBoxRef.scrollToBottom` 对外暴露。
6. 变量输入区可见性检测。

这部分适合拆成 `useChatScroll`，但变量可见性检测可以单独拆成较小的 `useVariableInputVisibility`，避免滚动 hook 承担太多 UI 观察职责。

### 4.5 流式生成

流式生成是当前最核心、风险最高的逻辑，包含：

1. `generatingMessage`
   - 根据 SSE event 更新最后一条 AI 消息。
   - 处理 answer、reasoning、tool call、tool params、tool response。
   - 处理 skill、agent plan、plan status。
   - 处理 sandbox status。
   - 处理 workflow duration、interactive、updateVariables。
   - 触发 TTS 分段音频和滚动。
2. `sendPrompt`
   - 校验输入内容。
   - 从变量表单生成 request variables。
   - 生成 human/AI placeholder。
   - 写入 `chatRecords`。
   - 调用 `onStartChat`。
   - 收尾更新最后一条 AI 消息状态、responseData、time。
   - 处理 workflow error toast。
   - 处理 question guide、TTS、输入框聚焦。
   - 同步 `chatBoxData.chatGenerateStatus`。
   - 同步侧边栏 histories。
   - 处理已读状态。
   - 异常时恢复输入和记录。
3. `abortRequest`
   - 中断 chat、question guide、plugin、resume controller。

这部分不应直接一次性抽到一个大 hook。建议先拆纯函数，再拆 `useChatGenerate`。

### 4.6 恢复生成

当前恢复生成逻辑由 `enableAutoResume` 相关 effect 承担，包含：

1. 判断是否允许恢复。
2. 防止同一 `appId/chatId` 重复恢复。
3. 找到或创建 AI placeholder 的 `dataId`。
4. 调用 `streamResumeFetch`。
5. 按 SSE event 创建 placeholder 并复用 `generatingMessage`。
6. 处理 `completedChat` 覆盖本地记录。
7. 处理 `resumeUnavailable`。
8. 恢复失败时区分 stream error 和普通异常。
9. 收尾更新 `chatBoxData`、侧边栏 histories、已读状态。

这部分适合拆成 `useChatResume`，但前提是 `generatingMessage`、placeholder 纯逻辑、状态同步函数已经有清晰输入输出。

### 4.7 问题引导

当前 `createQuestionGuide` 在回答完成后触发，职责包括：

1. 判断 `questionGuide.open`。
2. 使用独立 `AbortController`。
3. 调用 `postQuestionGuide`。
4. 写入 `questionGuides`。
5. 触发滚动。

这部分边界相对清晰，适合拆成 `useQuestionGuide`。

### 4.8 消息操作

当前消息操作包括：

1. `onDelMessage`：支持外部自定义删除，否则调用默认 API。
2. `retryInput`：删除当前消息及后续消息，然后按旧输入重发。
3. `delOneMessage`：删除一条 human 消息及紧随其后的 AI 回复。

这部分适合拆成 `useChatRecordActions`。它依赖 `chatRecords`、`setChatRecords`、`sendPrompt`、删除 API 和 toast。

### 4.9 反馈与标注

当前反馈与标注职责包括：

1. admin mark：
   - `onMark`
   - `SelectMarkCollection`
   - `updateChatAdminFeedback`
2. 用户反馈：
   - `onAddUserLike`
   - `onAddUserDislike`
   - `FeedbackModal`
   - `updateChatUserFeedback`
3. 自定义反馈关闭：
   - `onCloseCustomFeedback`
   - `closeCustomFeedback`
4. log read status：
   - `onToggleFeedbackReadStatus`
   - `updateFeedbackReadStatus`
   - `onTriggerRefresh`

这部分适合拆成 `useChatFeedbackActions` 和 `ChatBoxModals`。其中 hook 负责动作，modal 组件负责弹窗渲染。

### 4.10 记录渲染

当前记录渲染职责包括：

1. log 模式下将连续 deleted item 分组。
2. 根据 `expandedDeletedGroups` 决定是否渲染删除消息。
3. 渲染顶部和底部折叠按钮。
4. 处理 10 分钟时间间隔显示。
5. 渲染 human `ChatItem`。
6. 渲染 AI `ChatItem`。
7. 注入反馈、标注、语音、问题引导、状态框等 props。
8. 渲染 custom feedback 和 admin mark 详情。

这部分 JSX 大、参数多，但领域相对明确，适合拆成 `ChatRecordsList`。分组逻辑应先抽成纯函数，避免新组件内部继续塞复杂计算。

### 4.11 页面分支

当前 `ChatBox` 根据 `isHomeRender` 分成两套渲染：

1. home 模式
   - `WelcomeHomeBox`
   - `QuickApps`
   - `ChatHomeVariablesForm`
   - 或 `ChatInput`
2. 普通聊天模式
   - scroll 区域
   - welcome text
   - `VariableInputForm`
   - records list
   - workorder
   - `ChatInput`

这部分适合在 UI 拆分阶段拆成 `HomeChatMain`、`AppChatMain`、`ChatInputArea`。

## 5. 当前数据流

### 5.1 核心事实源

1. `chatRecords`
   - 聊天记录的核心事实源。
   - 由 `ChatRecordContext` 提供。
   - 流式生成、恢复生成、删除、重试、反馈都会修改它。
2. `chatBoxData`
   - 当前会话和 app 元信息。
   - 包含 `appId`、`chatId`、`app`、`userAvatar`、`chatGenerateStatus`、`hasBeenRead` 等。
   - 由 `ChatItemContext` 提供。
3. `appId/chatId/outLinkAuthData`
   - 当前 runtime 目标。
   - 由 `WorkflowRuntimeContext` 提供。
4. app chat config
   - 由 `ChatProvider` 从 `chatBoxData.app.chatConfig` 派生到 `ChatBoxContext`。
   - 包括变量、欢迎语、question guide、TTS、whisper、file select config 等。

### 5.2 发送消息数据流

```txt
ChatInput / eventBus / autoExecute
  -> sendPrompt
  -> variablesForm.handleSubmit
  -> format requestVariables
  -> create human item + AI placeholder
  -> setChatRecords
  -> setChatBoxData(generating)
  -> syncSidebarChatGenerateStatus(generating)
  -> onStartChat(generatingMessage)
  -> generatingMessage updates last AI item
  -> finish/error
  -> setChatRecords(finish/error)
  -> setChatBoxData(done/error)
  -> syncSidebarChatGenerateStatus(done/error)
  -> postMarkChatRead when active chat
  -> createQuestionGuide when no interactive
```

### 5.3 恢复生成数据流

```txt
chatBoxData.chatGenerateStatus === generating
  + enableAutoResume
  + records loaded
  + appId/chatId matched
  -> streamResumeFetch
  -> upsert AI placeholder when needed
  -> generatingMessage updates last AI item
  -> completedChat replaces records or local item finish
  -> setChatBoxData(done/error/generating)
  -> syncSidebarChatGenerateStatus
  -> postMarkChatRead when active chat
```

### 5.4 记录渲染数据流

```txt
chatRecords
  -> log mode deleted group preprocessing
  -> RecordsBox
  -> ChatItem
  -> feedback/mark/delete/retry callbacks
```

## 6. 拆分原则

1. **先纯逻辑，后副作用，再 UI**：纯函数最容易测试，先降低核心逻辑风险。
2. **保持外部 API 稳定**：重构期间不改变调用方。
3. **每次只拆一个职责域**：避免一个 PR 同时移动生成、恢复、渲染、反馈。
4. **不追求立刻减少到最少行数**：优先减少认知耦合，而不是机械拆文件。
5. **避免跨文件状态穿透**：如果新组件需要几十个 props，先考虑是否应该抽 hook 或上下文选择器。
6. **Provider 后置处理**：`Provider.tsx` 目前负责配置派生和音频能力，暂不优先改动。
7. **测试跟着风险走**：纯函数补单测，副作用 hook 先局部验证，最终再做集成验证。
8. **注释解释业务边界**：对导出函数、核心 hook、复杂纯函数补充函数级注释，说明职责和关键边界。

## 7. 目标模块结构

最终目标结构可以演进为：

```txt
ChatBox/
  index.tsx
  Provider.tsx
  type.ts
  constants.ts
  utils.ts
  scrollUtils.ts

  hooks/
    useChatBox.tsx
    useChatInputForm.ts
    useChatScroll.ts
    useVariableInputVisibility.ts
    useChatGenerate.ts
    useChatResume.ts
    useQuestionGuide.ts
    useChatRecordActions.ts
    useChatFeedbackActions.ts

  components/
    ChatRecordsList.tsx
    AppChatMain.tsx
    HomeChatMain.tsx
    ChatInputArea.tsx
    ChatBoxModals.tsx

  utils/
    generateMessage.ts
    recordGroups.ts
    requestVariables.ts
    resume.ts
```

说明：

1. 这个结构是最终形态，不要求第一阶段一次性创建所有文件。
2. 已存在的 `utils.ts`、`scrollUtils.ts` 可以继续保留；如果文件职责变多，再考虑迁移到 `utils/` 子目录。
3. `hooks/useChatBox.tsx` 当前已经存在，后续需要判断它是否仍然只是导出 context hook，避免命名冲突。
4. 如果某个 hook 参数过多，先回到数据流设计，避免把大组件原样搬进 hook。

## 8. PR 1 纯逻辑提取说明

PR 1 的目标是只移动纯计算逻辑，不改变 React 生命周期、context 数据流、UI 结构和请求副作用。这样第一步可以先降低 `ChatBox/index.tsx` 的认知负担，同时为后续 hook/UI 拆分建立可测试的基础工具函数。

本 PR 抽出了 3 个纯逻辑文件。

### 8.1 `recordGroups.ts`

从 `ChatBox/index.tsx` 中抽离的是 log 模式下的删除消息分组逻辑，原来对应 `processedRecords` 里的大段 `useMemoEnhance` 计算。

它负责：

1. 判断当前是否为 `ChatTypeEnum.log`。
2. 扫描 `chatRecords` 中连续带 `deleteTime` 的消息。
3. 将连续删除消息合并成一个“删除组”。
4. 给删除组首条消息补充 `collapseTop`。
5. 给删除组尾条消息补充 `collapseBottom`。
6. 根据 `expandedDeletedGroups` 判断整组是否展开。

输入：

```ts
{
  chatType: ChatTypeEnum;
  chatRecords: ChatSiteItemType[];
  expandedDeletedGroups: Set<string>;
}
```

输出：

```ts
ChatSiteItemType[]
```

关键边界：

1. 非 log 模式直接返回原 `chatRecords` 引用，不制造额外对象变化。
2. log 模式下只有删除组内消息会被浅拷贝，避免把 `collapseTop/collapseBottom` 写回原始 records。
3. 单条删除消息会同时拥有 `collapseTop` 和 `collapseBottom`。
4. 只有组内所有 `dataId` 都在 `expandedDeletedGroups` 中时，整组才算展开。

作用：

1. 让 `ChatBox/index.tsx` 不再承担 deleted records 分组细节。
2. 后续拆 `ChatRecordsList` 时，可以直接复用这个纯函数。
3. 分组逻辑可以通过 Vitest 独立验证，不需要挂载 React 组件。

### 8.2 `requestVariables.ts`

从 `ChatBox/index.tsx` 中抽离的是 `sendPrompt` 里将变量表单值转换为请求 variables 的逻辑。

它负责：

1. 只保留 `variableList` 中声明过的变量 key。
2. 对空字符串、`null`、`undefined` 使用变量配置里的 `defaultValue`。
3. 对 `timePointSelect` 做时间点格式化。
4. 对 `timeRangeSelect` 做时间范围格式化。
5. 最后通过 `valueTypeFormat` 将值转换成 workflow runtime 期望的类型。

输入：

```ts
{
  variableList?: VariableItemType[];
  variables?: Record<string, any>;
}
```

输出：

```ts
Record<string, any>
```

关键边界：

1. 表单里多出来的 key 不会进入请求，避免把未声明字段传给 workflow。
2. 时间变量先转为 `YYYY-MM-DD HH:mm:ss`，再走 `valueTypeFormat`。
3. `timeRangeSelect` 里的空字符串会保留为空字符串，用来表达未选择的边界。
4. `variableList` 为空时返回空对象。

作用：

1. 将 `sendPrompt` 中的变量清洗逻辑独立出来，减少发送流程内的分支。
2. 为后续拆 `useChatGenerate` 降低复杂度。
3. 可以单测覆盖默认值、类型转换、时间格式和未声明字段过滤。

### 8.3 `resume.ts`

从 `ChatBox/index.tsx` 中抽离的是恢复生成相关的两个纯判断：

1. `shouldCreateResumeAiPlaceholder`
2. `hasMeaningfulAiOutput`

`shouldCreateResumeAiPlaceholder` 负责判断恢复流中遇到某个 SSE event 时，是否需要提前创建 AI placeholder。

需要创建 placeholder 的事件包括：

1. `flowNodeResponse`
2. `flowNodeStatus`
3. `answer`
4. `fastAnswer`
5. `toolCall`
6. `toolParams`
7. `toolResponse`
8. `interactive`
9. `plan`
10. `planStatus`
11. `workflowDuration`

不创建 placeholder 的典型事件：

1. `error`：只影响最终状态和 toast，不应该制造空 AI 气泡。
2. `updateVariables`：只回写变量，不代表有可展示的 AI 输出。

`hasMeaningfulAiOutput` 负责判断恢复生成结束或失败后，一个 AI placeholder 是否已经有值得保留的输出。

会被认为“有意义”的内容包括：

1. `responseData`
2. `text.content`
3. `reasoning.content`
4. 单 tool 的 `params/response`
5. tools 数组里的 `params/response`
6. `skills`
7. `plan`
8. `interactive`

关键边界：

1. 非 AI 消息永远返回 false。
2. 空文本、空推理、空工具参数不会让 placeholder 被保留。
3. `responseData` 即使没有文本，也要保留，因为它承载节点响应详情。
4. `skills/plan/interactive` 本身就是可见 UI 块，不要求额外文本。

作用：

1. 将恢复生成里的 placeholder 创建/清理规则从 effect 中拆出来。
2. 后续拆 `useChatResume` 时可以复用这些判断，不再把规则藏在 effect 里。
3. 可以通过单测覆盖哪些 SSE event 会创建 placeholder，以及哪些 AI 内容应该保留。

### 8.4 为什么本 PR 不拆 `generatingMessage`

设计文档原计划评估是否将 `generatingMessage` 拆成 reducer。评估后决定不放进 PR 1。

原因：

1. `generatingMessage` 虽然包含大量可计算分支，但它并不是完全纯逻辑。
2. 它会调用 `setChatRecords`，且依赖“只更新最后一条 AI 消息”的状态约束。
3. 它还会触发滚动跟随、TTS 分段、`resetVariables` 等副作用。
4. 它同时被普通发送和恢复生成复用，拆错会影响两个高风险路径。

因此，PR 1 只处理已经明确纯净且可独立验证的逻辑；`generatingMessage` 放到阶段三，和 `useChatGenerate` 一起拆。

## 9. PR 2 基础 hook 提取说明

PR 2 的目标是抽离低风险 React 副作用和基础状态管理，不触碰发送协议、SSE 处理、恢复生成、消息操作和 UI 拆分。这样可以让 `ChatBox/index.tsx` 先少承担输入、滚动、变量可见性、问题引导这几类基础职责，同时为后续 `useChatGenerate`、`useChatResume` 提供更清晰的依赖边界。

本 PR 抽出了 4 个 hook。

### 9.1 `hooks/useChatInputForm.ts`

从 `ChatBox/index.tsx` 中抽离的是输入表单生命周期，原来对应 `useForm` 初始化、草稿缓存、`chatStarted` 计算和 `resetInputVal`。

它负责：

1. 初始化 `ChatBoxInputFormType` 表单。
2. 从 `sessionStorage` 读取 `chatInput_${chatId}` 草稿作为默认输入。
3. debounce 监听 `input`，同步写入或删除草稿。
4. 过滤普通变量，识别外部自定义变量。
5. 根据 app 匹配、已有记录、手动开始和变量状态计算 `chatStarted`。
6. 暴露 `resetInputVal`，用于发送完成、编辑问题、异常恢复时重置输入文本、文件列表、草稿和 textarea 高度。

关键边界：

1. `chatStarted` 仍要求 `chatBoxAppId === appId`，避免 app 切换过程复用旧状态。
2. 有历史记录时直接认为对话已开始，保持原有 chat/log/test 入口行为。
3. 没有普通变量且没有外部变量时，可以自动开始对话。
4. `resetInputVal` 会清理当前 `chatId` 的草稿，并在 textarea DOM 存在时恢复高度。

作用：

1. 把输入表单和草稿细节从主组件中移出。
2. 后续 `sendPrompt` 只需要消费 `chatForm`、`chatStarted` 和 `resetInputVal`。
3. 让输入状态和发送流程保持分层，避免后续生成逻辑拆分时继续扩大主组件。

### 9.2 `hooks/useChatScroll.ts`

从 `ChatBox/index.tsx` 中抽离的是滚动容器和生成中跟随底部逻辑。

它负责：

1. 持有 `ScrollContainerRef`。
2. 暴露 `scrollToBottom`，支持滚动行为和延迟参数。
3. 在 DOM 尚未挂载时延迟重试滚动到底部。
4. 暴露 `generatingScroll`，在流式生成过程中根据当前位置决定是否跟随底部。

关键边界：

1. `scrollToBottom` 保留原有“先延迟、再检查 DOM、未就绪再重试”的行为。
2. `generatingScroll` 仍复用 `shouldFollowGeneratingScroll`，只有用户本来接近底部或调用方强制滚动时才滚动。
3. records loaded 后是否需要强制滚动，仍由 `index.tsx` 中的 effect 和 `shouldForceScrollAfterRecordsLoaded` 判断；PR 2 只把实际滚动能力交给 hook，避免一次移动太多生命周期逻辑。

作用：

1. 把滚动 ref、滚动方法、节流跟随逻辑聚合在同一个 hook。
2. 保持 `ChatBoxRef.scrollToBottom` 和生成中滚动调用方的使用方式稳定。
3. 为后续拆 `useChatResume`、`useChatGenerate` 时复用滚动能力做准备。

### 9.3 `hooks/useVariableInputVisibility.ts`

从 `ChatBox/index.tsx` 中抽离的是变量输入区可见性监听。

它负责：

1. 在滚动容器挂载后查找 `#variable-input`。
2. 通过容器和变量输入区的 `getBoundingClientRect` 判断是否可见。
3. 初次挂载和滚动时同步 `setIsVariableVisible`。
4. 卸载时移除 scroll listener。

关键边界：

1. 继续使用原有 DOM 查询方式，不改变变量表单组件结构。
2. 变量输入区高度为 0 时不更新可见性，避免隐藏状态误判。
3. 该 hook 不放进 `useChatScroll`，避免滚动能力 hook 额外承担 ChatItemContext 状态同步。

作用：

1. 让主组件不再直接管理变量表单可见性监听。
2. 保留 home/chat 不同入口下的变量可见性同步行为。
3. 后续 UI 拆分时可以随变量表单所在区域一起迁移。

### 9.4 `hooks/useQuestionGuide.ts`

从 `ChatBox/index.tsx` 中抽离的是回答完成后的问题引导请求。

它负责：

1. 判断 `questionGuide.open`。
2. 保留聊天请求已中断时不再生成问题引导的保护。
3. 为问题引导请求创建独立 `AbortController`。
4. 调用 `postQuestionGuide`。
5. 成功返回数组时写入 `questionGuides` 并延迟滚动到底部。

关键边界：

1. hook 只封装请求和结果写入，不决定何时触发；调用方仍在回答完成且没有 interactive 时调用。
2. `chatController` 和 `questionGuideController` 都可能阻止请求，分别对应聊天主请求已停止、问题引导请求本身已停止。
3. 请求失败仍保持原逻辑静默处理，不在 PR 2 改变 toast 或错误上报策略。

作用：

1. 把回答后的推荐问题请求从生成流程旁边移走。
2. 保持发送流程只负责在合适时机触发 `createQuestionGuide`。
3. 后续拆 `useChatGenerate` 时可以把它作为外部依赖传入，而不是把请求细节混进生成 hook。

## 10. PR 3 生成与恢复 hook 提取说明

PR 3 原计划覆盖 `syncSidebarChatGenerateStatus`、`useChatGenerate` 和 `useChatResume`。实际拆分时评估后决定先完成“侧边栏状态同步 + 恢复生成”这两个边界，不在同一个 PR 中继续搬迁普通发送链路。

原因：

1. `sendPrompt` 和 `generatingMessage` 同时承担普通发送、恢复生成、TTS、滚动、变量回写、interactive、tool/plan 合并等职责。
2. `useChatResume` 已经依赖 `generatingMessage`，如果同一 PR 同时迁移两者，review 时很难判断行为是否只是移动。
3. 恢复生成本身有异步回写、abort、placeholder 清理、已读状态同步等高风险边界，适合单独审阅。

本 PR 抽出了 2 个 hook。

### 10.1 `hooks/useSidebarChatGenerateStatus.ts`

从 `ChatBox/index.tsx` 中抽离的是侧边栏历史列表生成状态同步逻辑，原来对应 `syncSidebarChatGenerateStatus`。

它负责：

1. 根据当前 runtime `appId/chatId` 或显式传入的 `targetAppId/targetChatId` 定位历史会话。
2. 同步历史项的 `chatGenerateStatus`。
3. 同步历史项的 `hasBeenRead`。
4. 更新历史项的 `updateTime`。
5. 当历史列表中不存在目标会话时，先插入一条本地历史，并通过 `loadHistories` 触发后续服务端校准。

关键边界：

1. 目标 app 和当前 app 不一致时直接跳过，避免跨 app 写错历史列表。
2. `hasBeenRead` 未显式传入时，`generating` 默认未读，其它状态默认已读。
3. 新插入历史项会使用当前 ChatBox title；如果没有 title，则使用默认“New Chat”文案。
4. hook 只改侧边栏 histories，不改当前 `chatBoxData`。

作用：

1. 让发送完成、发送失败、恢复完成都复用同一个侧边栏同步能力。
2. 降低后续拆 `useChatGenerate` 时的依赖数量。
3. 把“当前会话状态”和“侧边栏历史状态”两个事实源的同步关系显式化。

### 10.2 `hooks/useChatResume.ts`

从 `ChatBox/index.tsx` 中抽离的是 auto resume effect 和恢复生成的本地状态维护。

它负责：

1. 判断当前会话是否需要恢复生成。
2. 创建并写回 `resumeControllerRef`，让页面切换或停止时可以中断恢复流。
3. 调用 `streamResumeFetch` 接收恢复流。
4. 在恢复流出现可见 SSE event 时补齐或复用 AI placeholder。
5. 通过调用方传入的 `generatingMessage` 复用普通发送的 SSE 增量合并逻辑。
6. 处理 `completedChat` 覆盖本地 records。
7. 处理 `resumeUnavailable` 占位状态。
8. 恢复完成或失败后清理空 AI placeholder。
9. 同步当前 `chatBoxData`、侧边栏生成状态和已读状态。

关键边界：

1. 只有 `enableAutoResume` 开启、records 已加载、当前 ChatBox app/chat 和 runtime app/chat 对齐，并且状态仍为 `generating` 时才恢复。
2. `resumedChatTargetRef` 继续防止同一个 app/chat 重复恢复。
3. `activeAppIdRef/activeChatIdRef` 继续防止恢复流异步结果写入已切走的会话。
4. 用户离开页面触发的 abort 不会把会话标记为 done/error，也不会 toast。
5. `generatingMessage` 暂时留在 `index.tsx`，恢复生成 hook 只消费它，确保 PR 3 不同时改动普通发送的 SSE 合并逻辑。

作用：

1. 让 `index.tsx` 不再直接承载长恢复生成 effect。
2. 为下一步拆 `useChatGenerate` 留出更清晰的接口：普通发送可以继续复用 `syncSidebarChatGenerateStatus` 和恢复生成留下的 controller 边界。
3. 让恢复生成的高风险条件集中在一个 hook 内，便于单独 review 和后续补测试。

### 10.3 为什么本 PR 暂不拆 `useChatGenerate`

`useChatGenerate` 仍然是阶段三目标，但不放进本 PR。

原因：

1. `sendPrompt` 内部同时处理输入校验、变量格式化、human/AI placeholder、`onStartChat`、错误恢复、TTS、已读状态和侧边栏同步。
2. `generatingMessage` 内部同时处理 answer、reasoning、tool、plan、interactive、sandbox、workflowDuration 和 updateVariables。
3. 当前 PR 已经移动了恢复生成 effect；继续移动普通发送会让 diff 同时覆盖两个运行时主路径。

因此，PR 3 先完成恢复生成和侧边栏同步；`useChatGenerate` 建议作为阶段三的下一次独立 PR。

## 11. PR 4 生成 hook 提取说明

PR 4 继续完成阶段三中剩余的普通生成链路，把 `generatingMessage`、`sendPrompt` 和 `abortRequest` 从 `ChatBox/index.tsx` 移入 `hooks/useChatGenerate.ts`。本 PR 仍然不处理消息删除、重试、反馈、标注和 UI 组件拆分，这些保留给后续阶段。

本 PR 抽出了 1 个 hook。

### 11.1 `hooks/useChatGenerate.ts`

从 `ChatBox/index.tsx` 中抽离的是普通发送和 SSE 增量生成逻辑。

它负责：

1. `generatingMessage`
   - 根据 SSE event 更新最后一条 AI 消息。
   - 处理 answer、reasoning、tool call、tool params、tool response。
   - 处理 skill、sandbox status、agent plan、plan status。
   - 处理 interactive、updateVariables、workflowDuration。
   - 触发生成中滚动跟随。
2. `sendPrompt`
   - 通过变量表单提交拿到 variables。
   - 校验输入文本和文件。
   - 格式化 request variables。
   - 创建 human 消息和 AI placeholder。
   - 写入 chatRecords。
   - 调用 `onStartChat`。
   - 处理完成状态、workflow error toast、TTS、问题引导、输入框 focus。
   - 处理异常 toast、输入恢复、records 回滚、当前会话和侧边栏状态同步。
3. `abortRequest`
   - 统一中断 chat、question guide、plugin 和 resume 请求。

关键边界：

1. `generatingMessage` 仍只更新最后一条 AI 消息；恢复生成 hook 继续复用它。
2. interactive 输入仍通过 `rewriteHistoriesByInteractiveResponse` 回写上一轮交互，不创建新的普通轮次。
3. 发送失败且没有 `responseText` 时，继续恢复用户输入并移除本轮 human/AI placeholder。
4. `eventBus`、window message、auto execute effect 仍留在 `index.tsx`，只调用 hook 返回的 `sendPrompt`，避免本 PR 同时迁移入口监听生命周期。
5. controller refs 仍由 `index.tsx` 创建并传入，保证 stop/page leave/resume 继续共用同一组 abort controller。

作用：

1. 让 `ChatBox/index.tsx` 不再承载普通生成的长流程和 SSE event 分支。
2. 让阶段三的生成、恢复、侧边栏同步形成清晰边界。
3. 为下一阶段拆消息操作和反馈操作减少主组件噪音。

### 11.2 为什么事件监听仍留在 `index.tsx`

`eventBus`、window message 和 auto execute 都是 ChatBox 的入口编排逻辑。它们依赖 `lastInteractive`、`canSendPrompt`、`active`、`isReady`、`chatStarted`、records loaded 状态等 UI 层条件。

本 PR 只抽生成执行能力，不同时迁移入口监听，原因：

1. 生成 hook 应该表达“如何发送和如何合并流式结果”，不应该再吞掉所有入口条件。
2. 保留监听在 `index.tsx` 可以让 review 更容易确认外部触发行为没有变化。
3. 后续如果需要继续收敛，可以单独抽 `useChatInputEvents` 或类似 hook。

## 12. PR 5 消息记录动作 hook 提取说明

PR 5 开始阶段四，但只处理消息记录动作，不把反馈、标注、log read status 一起移入同一个 PR。这样本 PR 的 review 可以集中确认删除与重试行为是否保持一致，下一 PR 再单独检查反馈动作。

本 PR 抽出了 1 个 hook。

### 12.1 `hooks/useChatRecordActions.ts`

从 `ChatBox/index.tsx` 中抽离的是会直接修改聊天记录的删除与重试逻辑。

它负责：

1. `onDelMessage`
   - 作为 hook 内部统一删除通道。
   - 如果外部传入 `onDeleteChatItem`，优先使用外部删除能力。
   - 如果没有外部删除能力，则调用默认 `delChatRecordById`。
   - 默认删除关联文件，重试流程会显式传 `delFile=false`，避免旧输入文件在重试前被删掉。
   - 默认删除 API 会自动带上当前 `appId`、`chatId` 和 `outLinkAuthData`。
2. `retryInput`
   - 根据目标 `dataId` 找到需要重试的记录位置。
   - 删除目标记录以及它后面的所有服务端记录，避免旧后续历史和新回答并存。
   - 将本地 `chatRecords` 裁剪到目标记录之前。
   - 从被删除的第一条记录里恢复 text/files，转换为 `ChatBoxInputType`。
   - 调用 `sendPrompt` 重新发送，并把裁剪后的 records 作为 history 传入。
   - 失败时使用 warning toast 提示 `Retry failed`，保持原有反馈方式。
3. `delOneMessage`
   - 删除一条 human 消息。
   - 如果它的下一条记录是带 `dataId` 的 AI 回复，则同步删除该 AI 回复。
   - 不删除更远处的 AI 或其他历史，避免误删跨轮记录。

关键边界：

1. 本 hook 只处理 record action，不处理用户点赞、点踩、自定义反馈关闭、admin mark 和 log read status。
2. 单条删除仍保持原来的 fire-and-forget 语义：本地先过滤记录，不额外等待远端删除完成，也不新增失败 toast。
3. 重试继续复用 `useChatGenerate` 返回的 `sendPrompt`，不在本 hook 内处理 SSE、placeholder、TTS、问题引导和侧边栏状态。
4. `isRecordActionLoading` 只表示 record action 的加载态，目前主要覆盖重试过程，不等同于聊天生成状态。

作用：

1. 让 `ChatBox/index.tsx` 不再直接承载删除和重试的副作用细节。
2. 将“记录变更动作”和“反馈标注动作”拆开，降低阶段四 review 难度。
3. 为后续 `ChatRecordsList` 组件提取准备更稳定的 actions 入参。

### 12.2 为什么反馈动作留到下一 PR

反馈动作虽然也挂在 `ChatItem` 上，但它和删除/重试的业务边界不同：

1. 点赞、点踩、自定义反馈关闭、admin mark、log read status 依赖 feedback API 和弹窗状态。
2. feedback/admin mark 会修改不同字段，例如 `userGoodFeedback`、`userBadFeedback`、`customFeedbacks`、`adminFeedback`、`readFeedbackTmbIdList`。
3. feedback 还牵涉 `FeedbackModal`、`SelectMarkCollection` 和 `onTriggerRefresh`，如果和删除/重试一起移动，单个 diff 会同时覆盖 records、API、modal 三类行为。

因此 PR 5 只完成 `useChatRecordActions`；`useChatFeedbackActions` 会作为阶段四的下一次独立 PR。

## 13. PR 6 反馈与标注动作 hook 提取说明

PR 6 继续阶段四，只处理反馈、标注和 log 模式反馈已读状态。它不拆 `FeedbackModal`、`SelectMarkCollection` 或 records list JSX，避免同时进入 UI 组件提取阶段。

本 PR 抽出了 1 个 hook。

### 13.1 `hooks/useChatFeedbackActions.ts`

从 `ChatBox/index.tsx` 中抽离的是挂在 AI 消息上的反馈与标注动作。

它负责：

1. feedback modal 状态
   - 维护 `feedbackId`。
   - 点踩无内容时打开 `FeedbackModal`。
   - `FeedbackModal` 提交成功后，把返回内容写入目标消息的 `userBadFeedback`，并关闭 modal。
2. admin mark modal 状态
   - 维护 `adminMarkData`。
   - 点击标注时，如果已有 `adminFeedback`，进入编辑态并带回 dataset、collection、feedback data。
   - 如果没有 `adminFeedback`，用上一条 human 文本作为 q，用当前 AI 文本作为 a。
   - `SelectMarkCollection` 提交成功后调用 `updateChatAdminFeedback`，并把 `adminFeedback` 写回本地记录。
3. 用户点赞
   - 只在 `feedbackType=user`、AI 消息、且当前没有点踩时可用。
   - 点击未点赞消息会写入 `userGoodFeedback='yes'`。
   - 再次点击已点赞消息会清空 `userGoodFeedback`。
   - 本地乐观更新，服务端调用保持原来的静默失败策略。
4. 用户点踩
   - 只在 `feedbackType=user`、AI 消息、且当前没有点赞时可用。
   - 没有点踩内容时打开 `FeedbackModal`。
   - 已有点踩内容时点击会清空本地 `userBadFeedback`，并同步服务端。
5. 自定义反馈关闭
   - 保持 checkbox 勾选后关闭指定 custom feedback 的行为。
   - 调用 `closeCustomFeedback` 后，本地按 index 过滤 `customFeedbacks`。
6. log 模式反馈已读状态
   - 只在 `chatType=log` 且目标消息是 AI 时可用。
   - 服务端 `updateFeedbackReadStatus` 成功后更新本地 `isFeedbackRead`。
   - 成功后继续触发 `onTriggerRefresh`，让外层日志统计刷新。

关键边界：

1. 本 hook 只抽动作与状态，不移动弹窗 JSX；`ChatBox/index.tsx` 仍负责渲染 modal。
2. 本 hook 不处理删除、重试和 record action loading，这些已经归入 `useChatRecordActions`。
3. 用户反馈相关 API 异常仍保持原来的静默处理，不新增 toast、不新增回滚。
4. admin mark 成功后不会主动关闭弹窗，关闭动作仍由 `SelectMarkCollection` 内部在 `onSuccess` 后调用 `onClose`。

作用：

1. 让 `ChatBox/index.tsx` 不再直接承载 feedback API 调用和乐观更新细节。
2. 完成阶段四 hook 层拆分，为后续 `ChatRecordsList` 和 `ChatBoxModals` UI 提取降低参数复杂度。
3. 将 feedback/admin mark/log read status 的业务边界集中到一个可 review 的文件。

### 13.2 为什么 modal JSX 仍留在 `index.tsx`

`FeedbackModal` 和 `SelectMarkCollection` 是 UI 组件拆分阶段的工作，不在 PR 6 里移动。

原因：

1. 本 PR 已经移动了 feedback API、modal 状态和 records 乐观更新，继续移动 JSX 会让 diff 同时覆盖动作层和渲染层。
2. `SelectMarkCollection` 内部还有 dataset、collection、input data 三段式流程，适合在 `ChatBoxModals` 提取时单独 review。
3. records list JSX 仍依赖 `onMark`、`onAddUserLike`、`onAddUserDislike`、`onCloseCustomFeedback`、`onToggleFeedbackReadStatus`，先稳定 actions 返回值，再拆渲染组件更稳。

## 14. PR 7 弹窗组件提取说明

PR 7 开始阶段五 UI 组件提取，但只移动 ChatBox 底部弹窗层，不拆 records list、普通聊天主区域、home 主区域或输入区。这样本 PR 可以聚焦确认弹窗渲染和反馈 hook 的连接是否保持一致。

本 PR 抽出了 1 个组件。

### 14.1 `components/ChatBoxModals.tsx`

从 `ChatBox/index.tsx` 中抽离的是用户反馈弹窗和管理员标注弹窗的条件渲染。

它负责：

1. `FeedbackModal`
   - 当 `feedbackId`、`appId`、`chatId` 都存在时渲染。
   - 继续把 `appId`、`chatId`、`feedbackId` 传给 modal。
   - 关闭和提交成功处理仍由外部传入。
2. `SelectMarkCollection`
   - 当 `adminMarkData` 存在时渲染。
   - 继续把完整 `adminMarkData` 传给原组件。
   - `setAdminMarkData` 更新时补回当前 `dataId`，保证 dataset/collection/input data 多步流程中不会丢失被标注消息 id。

关键边界：

1. 本组件只负责弹窗渲染，不直接调用 feedback API、不写 `chatRecords`。
2. 弹窗状态和成功回写仍由 `useChatFeedbackActions` 管理。
3. `FeedbackModal` 和 `SelectMarkCollection` 本身不在本 PR 内改动。
4. records list JSX 暂时仍留在 `index.tsx`，避免本 PR 同时迁移大量 `ChatItem` props。

作用：

1. 让 `ChatBox/index.tsx` 的底部 modal JSX 变成单一组件调用。
2. 为后续拆 `ChatRecordsList` 减少主组件里的渲染噪音。
3. 保持 PR 7 的 review 范围足够小，专注弹窗连接关系。

### 14.2 为什么本 PR 不先拆 `ChatRecordsList`

`ChatRecordsList` 会移动当前最大的 JSX 片段，也会一次性承接 avatar、statusBoxData、questionGuides、deleted group、反馈动作、删除重试动作、custom feedback、admin mark 展示等大量 props。

PR 7 先拆 `ChatBoxModals` 的原因：

1. 弹窗层已经在 PR 6 通过 `useChatFeedbackActions` 稳定了状态和回调边界。
2. 弹窗组件参数少，移动后更容易确认没有行为变化。
3. records list 拆分适合作为下一次独立 PR，单独检查 log 折叠、时间间隔、human/AI 渲染和 `ChatItem` action 注入。

## 15. PR 8 聊天记录列表组件提取说明

PR 8 继续阶段五 UI 组件提取，只移动聊天记录列表渲染，不拆普通聊天主区域、home 主区域和输入区。

本 PR 抽出了 1 个组件。

### 15.1 `components/ChatRecordsList.tsx`

从 `ChatBox/index.tsx` 中抽离的是 `RecordsBox` 里的 records map 渲染逻辑。

它负责：

1. log 模式 deleted records 展示
   - 根据 `expandedDeletedGroups` 判断 deleted record 是否渲染。
   - 渲染顶部 `collapseTop` 和底部 `collapseBottom` 折叠按钮。
   - 折叠按钮点击时调用父组件传入的 `onToggleDeletedGroup`。
2. 记录 DOM ref 登记
   - 每条可见记录渲染时继续写入 `itemRefs.current.set(item.dataId, element)`。
   - `itemRefs` 的事实源仍在 `ChatRecordContext`，本组件不创建新的 ref 容器。
3. 时间分隔
   - 保持相邻消息超过 10 分钟时显示 `TimeBox` 的规则。
   - 规则被保留在组件内部的 `shouldShowTimeDivider` 小函数里，便于后续测试或继续拆纯函数。
4. human 消息渲染
   - 继续渲染 `ChatItem`。
   - 注入 `onRetry` 和 `onDelete`。
   - 继续跳过 `hideInUI` 的 human 消息。
5. AI 消息渲染
   - 继续渲染 `ChatItem`。
   - 注入 `showVoiceIcon`、`statusBoxData`、`questionGuides`、admin mark、点赞、点踩、反馈已读动作。
   - admin mark 默认 q 仍取上一条 processed record 的文本。
6. AI 子内容
   - 继续渲染 custom feedback 关闭 checkbox。
   - 继续渲染 admin mark 内容展示。

关键边界：

1. 本组件接收已经由 `getProcessedChatRecords` 处理过的 records，不负责分组计算。
2. 本组件不直接调用删除、重试、feedback、admin mark API，只消费上层 hook 生成的回调。
3. `ChatBox/index.tsx` 仍负责 scroll 容器、welcome、变量表单、输入框和 home/app 分支。
4. 本 PR 不拆 `AppChatMain`、`HomeChatMain` 或 `ChatInputArea`。

作用：

1. 把最大的一段 records JSX 从 `index.tsx` 移出，让主组件更接近编排层。
2. 为下一步拆 `AppChatMain` 降低复杂度：普通聊天区域可以直接组合 welcome、变量表单和 `ChatRecordsList`。
3. 将 log 折叠、时间分隔、human/AI item 渲染集中到 records list 组件里，后续 review 更聚焦。

### 15.2 为什么本 PR 不同时拆 `AppChatMain`

`AppChatMain` 会继续移动 scroll 容器、welcome、变量表单和 records list，涉及 `ScrollData`、`ScrollContainerRef`、`chatStarted`、`chatForm`、`chatType` 等父级编排依赖。

PR 8 先只拆 `ChatRecordsList` 的原因：

1. records list 是当前最大 JSX 块，单独移动后已经能明显降低 `index.tsx` 复杂度。
2. scroll 容器和 records 渲染属于不同边界，分开 review 更容易确认滚动行为未被误改。
3. 后续 `AppChatMain` 可以在 records list 稳定后作为独立 PR 处理。

## 16. PR 9 普通聊天主区域组件提取说明

PR 9 继续阶段五 UI 组件提取，只移动非 home 模式下的主聊天滚动内容区，不拆 home 主区域和底部输入区。

本 PR 抽出了 1 个组件。

### 16.1 `components/AppChatMain.tsx`

从 `ChatBox/index.tsx` 中抽离的是原 `AppChatRenderBox` 对应的 JSX。

它负责：

1. 滚动容器
   - 继续使用 `ChatRecordContext` 提供的 `ScrollData`。
   - 继续接收并传入 `ScrollContainerRef`。
   - 保持原来的 `flex`、`h`、`w`、`overflow`、`px`、`pb` 样式。
2. 普通聊天内容布局
   - 保持内层 `Box maxW={['100%', '92%']} h="100%" mx="auto"`。
   - 有 `welcomeText` 时继续渲染 `WelcomeBox`。
   - 继续渲染 `VariableInputForm`，并传入 `chatStarted`、`chatForm`、`chatType`。
   - 继续渲染 `ChatRecordsList`。
3. records list 参数承接
   - `AppChatMain` 通过 `recordsListProps` 接收上层组装好的 records list 参数。
   - 这样 records action 和 feedback action 仍由 `ChatBox/index.tsx` 的 hooks 管理，组件只做布局组合。

关键边界：

1. 本组件只用于非 home 模式。
2. 本组件不渲染底部输入区，不处理 `ChatInput`、停止按钮和 workorder。
3. 本组件不处理 home 欢迎页、quick apps、home variable form。
4. 本组件不直接读 context，不调用 API，不写 `chatRecords`。

作用：

1. 让 `ChatBox/index.tsx` 的非 home 主内容区从内联 `useMemo` 变成组件调用。
2. 保持 scroll 容器和 records list 的组合关系清晰，为后续拆 `ChatInputArea` 和 `HomeChatMain` 留出边界。
3. 让 `index.tsx` 更接近编排层：准备数据和 actions，然后组合主区域、输入区、modals。

### 16.2 为什么底部输入区仍留在 `index.tsx`

底部输入区虽然也属于非 home 分支，但它和发送/停止运行时关系更紧：

1. 它直接依赖 `sendPrompt`、`abortRequest`、`lastInteractive`、`resetInputVal`、`TextareaDom` 和 `chatForm`。
2. 它还包着 `showWorkorder` 和 `canSendPrompt` 条件。
3. 如果和 `AppChatMain` 同时拆，会让本 PR 同时移动内容区和输入区，review 范围变大。

因此 PR 9 只拆主内容区；`ChatInputArea` 可作为后续独立 PR。

## 17. 分阶段方案

### 17.1 阶段一：纯逻辑提取

目标：不改变 UI 和 React 生命周期，先把可测试的计算逻辑移出 `index.tsx`。

建议提取：

1. `recordGroups.ts`
   - log 模式 deleted records 分组。
   - 输入：`chatType`、`chatRecords`、`expandedDeletedGroups`。
   - 输出：带 `collapseTop/collapseBottom` 的 records。
2. `generateMessage.ts`
   - 根据 SSE event 计算下一条 AI item。
   - 初期可以只抽最内层 reducer，不直接处理 `setChatRecords`、TTS、scroll。
3. `requestVariables.ts`
   - 根据 variable config 和 form values 生成 request variables。
   - 处理 time point、time range、defaultValue、`valueTypeFormat`。
4. `resume.ts`
   - `shouldCreateResumeAiPlaceholder`
   - `hasMeaningfulAiOutput`
   - resume unavailable placeholder 相关纯判断。

阶段一完成标准：

1. `index.tsx` 中对应内联逻辑减少。
2. 新增或补充 Vitest 覆盖纯函数。
3. 现有 `utils.test.ts`、`scrollUtils.test.ts` 保持通过。

### 17.2 阶段二：基础 hook 提取

目标：先拆低风险 hook，让主组件的基础状态更清楚。

建议顺序：

1. `useChatInputForm`
   - 管理 `useForm`、草稿、`chatStarted`、`resetInputVal`。
   - 注意 `chatId` 切换时草稿 key 和 textarea 高度。
2. `useChatScroll`
   - 管理 `ScrollContainerRef`、`scrollToBottom`、`generatingScroll`。
   - 保持原有 records loaded 后滚动行为。
3. `useVariableInputVisibility`
   - 管理变量输入区可见性监听。
   - 避免放进 `useChatScroll` 造成职责变宽。
4. `useQuestionGuide`
   - 管理问题引导请求、abort controller、写入 `questionGuides`。

阶段二完成标准：

1. `ChatBox` 保持同样 props/ref 行为。
2. 输入草稿、发送后清空、textarea 高度恢复正常。
3. 切换 chat 后不会沿用错误草稿。
4. records loaded 和生成中滚动行为保持一致。

### 17.3 阶段三：生成与恢复 hook 提取

目标：拆出最复杂的运行时逻辑，但要分小步做。

建议顺序：

1. 提取 `syncSidebarChatGenerateStatus` 到 hook 或工具函数。
   - 它依赖 `appId`、`chatId`、`chatBoxData.title`、`setHistories`、`loadHistories`、`t`。
2. 提取 `useChatGenerate`
   - 输入：`onStartChat`、`chatRecords`、`setChatRecords`、变量配置、输入 reset、滚动、TTS、toast、状态同步等。
   - 输出：`sendPrompt`、`abortRequest`、`generatingMessage` 或 `handleGeneratingMessage`。
3. 提取 `useChatResume`
   - 输入：`enableAutoResume`、`isReady`、`isChatRecordsLoaded`、`chatBoxData`、`appId/chatId`、`generatingMessage`、状态同步能力。
   - 输出：不一定需要返回值，主要注册恢复 effect。

注意事项：

1. `eventBus`、`window.message`、auto execute effect 暂时可以留在 `ChatBox`，等 `sendPrompt` 稳定后再判断是否移动。
2. `AbortController` 的归属要统一，避免停止按钮只能停一部分请求。
3. `activeAppIdRef`、`activeChatIdRef` 用于避免异步回写错误会话，拆 hook 时必须保留。
4. `generatingMessage` 被发送和恢复共用，应优先稳定其类型和副作用边界。

阶段三完成标准：

1. 普通发送消息流程正常。
2. 流式 answer/reasoning/tool/plan/interactive 更新正常。
3. 停止请求仍可中断 chat、question guide、plugin、resume。
4. 恢复生成不会重复触发，也不会写入错误 chat。
5. 侧边栏 generating/done/error 状态和已读状态保持一致。

### 17.4 阶段四：消息操作与反馈 hook 提取

目标：把记录操作和反馈操作从主组件中移出。

建议提取：

1. `useChatRecordActions`
   - `onDelMessage`
   - `retryInput`
   - `delOneMessage`
2. `useChatFeedbackActions`
   - `onMark`
   - `onAddUserLike`
   - `onAddUserDislike`
   - `onCloseCustomFeedback`
   - `onToggleFeedbackReadStatus`
   - feedback/admin mark modal 状态

阶段四完成标准：

1. 删除 human 消息时仍会同步删除紧随 AI 消息。
2. 重试会恢复原输入并删除后续记录。
3. 用户点赞/点踩 optimistic update 正常。
4. admin mark 更新后本地记录同步。
5. log read status 更新后能触发 `onTriggerRefresh`。

### 17.5 阶段五：UI 组件提取

目标：在逻辑边界稳定后，拆 JSX。

建议顺序：

1. `ChatRecordsList`
   - 接收 records、avatars、actions、statusBoxData、questionGuides、render flags。
   - 内部只负责渲染，不直接调用 API。
2. `AppChatMain`
   - 普通聊天滚动区域。
   - 渲染 welcome、变量表单、records list。
3. `HomeChatMain`
   - home 欢迎、quick apps、home variable form/input。
4. `ChatInputArea`
   - workorder + `ChatInput` 包装。
5. `ChatBoxModals`
   - 用户反馈弹窗和管理员标注弹窗。

阶段五完成标准：

1. `index.tsx` 成为编排层，主要组合 hooks 和组件。
2. 新组件职责单一，props 数量可接受。
3. home/chat/log 三类 UI 行为保持一致。

### 17.6 阶段六：收敛与清理

目标：减少临时兼容代码，完善测试和注释。

工作项：

1. 检查 hook 和 utils 的命名是否准确。
2. 删除重复类型和过度透传参数。
3. 给导出的复杂 hook 和纯函数补充 `/** ... */` 函数注释。
4. 补齐单元测试。
5. 运行局部测试，最后再运行更完整验证。

## 18. 风险点与边界行为

### 18.1 流式生成最后一条 AI 消息

`generatingMessage` 默认更新 `chatRecords` 最后一条 AI 消息。拆分时必须保持：

1. 非最后一条记录不被误改。
2. 最后一条不是 AI 时不改。
3. `responseValueId` 命中已有 value 时追加，否则新增 value。
4. tool params/response 是增量字符串拼接。
5. reasoning 和 text 分开追加。
6. `flowNodeResponse` 写入 `responseData`，不写入 `value`。
7. `workflowDuration` 累加并保留两位小数。

### 18.2 恢复生成目标会话

恢复逻辑必须防止异步结果写入错误会话：

1. `activeAppIdRef` 和 `activeChatIdRef` 的语义必须保留。
2. `resumedChatTargetRef` 必须继续防止重复恢复。
3. `chatBoxData.appId/chatId` 必须和 runtime `appId/chatId` 对齐才恢复。
4. 用户离开页面或切换 chat 时，abort 后不能继续写状态。

### 18.3 输入状态

输入状态涉及用户体验，边界包括：

1. 空输入且无文件时不能发送。
2. 发送成功后清空输入和文件。
3. 发送失败且无 `responseText` 时恢复原输入。
4. `chatInput_${chatId}` 草稿不能串到其他会话。
5. textarea 高度要在 reset 后恢复。

### 18.4 eventBus 和 window message

当前 `ChatBox` 监听：

1. `window.postMessage({ type: 'sendPrompt' })`
2. `EventNameEnum.sendQuestion`
3. `EventNameEnum.editQuestion`

拆 hook 时要避免 stale closure：

1. `sendPrompt` 必须始终拿到最新 `lastInteractive` 和 `canSendPrompt`。
2. cleanup 时要移除正确监听。
3. 如果 eventBus 支持按 handler off，后续应优先按 handler 精确解绑；若现有 API 是事件级 off，则保持现状语义。

### 18.5 ChatBoxRef

外部依赖 `ChatBoxRef`：

1. `restartChat`
   - abort 当前请求。
   - 清空 records。
   - 重置 `chatStarted`。
2. `scrollToBottom`
   - 延迟滚到底部。

拆分后 `useImperativeHandle` 可以留在 `index.tsx`，避免外部 ref 逻辑分散。

### 18.6 多入口复用

`ChatBox` 被多个入口复用，验证不能只覆盖一个页面：

1. `AppChatWindow`
2. `HomeChatWindow`
3. `chat/share`
4. app detail chat test
5. skill preview
6. log detail modal

这些入口的 `chatType`、`feedbackType`、`showMarkIcon`、`showWorkorder`、`enableAutoResume` 不完全一致。

## 19. 验证策略

### 19.1 单元测试

优先补充以下测试：

1. `recordGroups.test.ts`
   - 非 log 模式直接返回原 records。
   - log 模式连续 deleted items 生成 collapseTop/collapseBottom。
   - expanded 状态影响 `isExpanded`。
2. `requestVariables.test.ts`
   - 空值使用 defaultValue。
   - time point 格式化。
   - time range 格式化。
   - 只保留声明过的 variables。
3. `generateMessage.test.ts`
   - answer/fastAnswer 追加 text。
   - reasoning 追加 reasoning。
   - tool params/response 增量拼接。
   - plan/planStatus 合并。
   - workflowDuration 累加。
4. `resume.test.ts`
   - placeholder event 判断。
   - empty AI output 判断。

保留并持续运行现有测试：

```bash
pnpm test projects/app/test/components/core/chat/ChatContainer/ChatBox/utils.test.ts
pnpm test projects/app/test/components/core/chat/ChatContainer/ChatBox/scrollUtils.test.ts
```

### 19.2 局部手动验证

每个阶段至少验证：

1. 普通发送一条消息。
2. 发送后输入框清空。
3. 生成过程中滚动跟随。
4. 停止生成。
5. 删除和重试。
6. 点赞/点踩。
7. home chat 首屏。
8. log 模式删除记录折叠。

### 19.3 恢复生成验证

涉及 `useChatResume` 时必须额外验证：

1. 刷新页面后 generating 会话能恢复。
2. 恢复完成后状态变为 done。
3. 恢复失败时状态变为 error 或保持 generating，符合原逻辑。
4. 切换到其他 chat 后恢复结果不会写入当前页面。
5. resume unavailable placeholder 能正常展示。

### 19.4 最终验证

全部阶段完成后再考虑：

```bash
pnpm lint
pnpm test
cd projects/app && pnpm build
```

如果中途只是局部拆分，不要求每一步都跑全量测试，但每一步必须至少跑相关局部测试。

## 20. TODO

### 阶段一：纯逻辑提取

- [x] 新增 `recordGroups.ts`，提取 log 模式 deleted records 分组逻辑。
- [x] 为 deleted records 分组补充 Vitest。
- [x] 新增 `requestVariables.ts`，提取 request variables 格式化逻辑。
- [x] 为 request variables 补充 Vitest。
- [x] 新增或扩展 `resume.ts`，提取恢复生成相关纯判断。
- [x] 为恢复生成纯判断补充 Vitest。
- [x] 评估 `generatingMessage` 是否先拆 reducer，再接回 `setChatRecords`。

结论：`generatingMessage` 可以进一步拆成 event reducer，但它同时牵涉 TTS 分段、滚动跟随、`resetVariables` 和 `setChatRecords` 的最后一条 AI 消息约束。为了保持 PR 1 低风险，先不在纯逻辑 PR 中拆它，改放到“阶段三：生成与恢复 hook 提取”里和 `useChatGenerate` 一起处理。

### 阶段二：基础 hook 提取

- [x] 新增 `useChatInputForm`。
- [x] 将草稿保存、`chatStarted`、`resetInputVal` 从 `index.tsx` 移入 `useChatInputForm`。
- [x] 新增 `useChatScroll`。
- [x] 将 `scrollToBottom`、`generatingScroll` 移入 `useChatScroll`。
- [x] records loaded 后滚动继续留在 `index.tsx` 的生命周期 effect 中，但改为调用 `useChatScroll` 暴露的 `scrollToBottom`。
- [x] 新增 `useVariableInputVisibility`。
- [x] 新增 `useQuestionGuide`。
- [x] 跑现有 `utils.test.ts`、`scrollUtils.test.ts` 和 PR 1 新增测试。

### 阶段三：生成与恢复 hook 提取

- [x] 提取侧边栏生成状态同步逻辑。
- [x] 提取 `useChatGenerate`，输出 `sendPrompt`、`abortRequest`、`generatingMessage`。
- [x] 保留 `eventBus`、window message、auto execute 行为在 `index.tsx`，不在 PR 3 同时迁移。
- [x] 提取 `useChatResume`。
- [x] 跑现有 `utils.test.ts`、`scrollUtils.test.ts` 和 PR 1 新增测试。
- [x] 跑 `tsc --noEmit` 验证生成/恢复 hook 类型。
- [ ] 手动验证普通生成、停止、恢复生成、切换 chat 后异步回写。

### 阶段四：消息操作与反馈 hook 提取

- [x] 新增 `useChatRecordActions`。
- [x] 移入 `onDelMessage`、`retryInput`、`delOneMessage`。
- [x] 新增 `useChatFeedbackActions`。
- [x] 移入点赞、点踩、自定义反馈关闭、admin mark、log read status。
- [x] 验证删除、重试、反馈、标注。

PR 5 结论：本次只完成删除与重试相关 record action 提取，并通过现有 ChatBox 局部测试与 `tsc --noEmit` 验证。反馈、标注和 log read status 仍留在 `index.tsx`，等待下一 PR 单独处理。

PR 6 结论：本次完成反馈与标注 action 提取，并通过现有 ChatBox 局部测试与 `tsc --noEmit` 验证。modal JSX 仍留在 `index.tsx`，等待 UI 组件提取阶段处理。

### 阶段五：UI 组件提取

- [x] 新增 `ChatRecordsList`。
- [x] 新增 `AppChatMain`。
- [~] 暂缓新增 `HomeChatMain`：当前 home 分支剩余 JSX 较小，继续拆会增加 props 透传和 review 成本。
- [~] 暂缓新增 `ChatInputArea`：底部输入区直接连接 `sendPrompt`、`abortRequest`、`lastInteractive`、`TextareaDom` 和 workorder，后续有输入区专项需求时再拆。
- [x] 新增 `ChatBoxModals`。
- [x] 完成当前分阶段的类型检查和 ChatBox 局部测试；home/chat/log/share/preview 的完整手动入口验证留到合并集成分支统一做。

PR 7 结论：本次只提取 `ChatBoxModals`，将用户反馈弹窗和管理员标注弹窗从 `index.tsx` 移出。records list、app/home main 和 input area 仍留给后续 PR。

PR 8 结论：本次只提取 `ChatRecordsList`，将 records map、deleted collapse、时间分隔、human/AI `ChatItem` 渲染、custom feedback 和 admin mark 展示从 `index.tsx` 移出。scroll 容器、app/home main 和 input area 仍留给后续 PR。

PR 9 结论：本次只提取 `AppChatMain`，将非 home 模式下的 `ScrollData`、`WelcomeBox`、`VariableInputForm` 和 `ChatRecordsList` 组合从 `index.tsx` 移出。底部输入区、workorder 和 home 主区域仍留给后续 PR。

PR 10 收敛结论：当前阶段暂不继续拆 `HomeChatMain` 和 `ChatInputArea`。`ChatBox/index.tsx` 已从原来的大组件收敛到编排层，剩余逻辑主要是 context 取数、运行时 hook 编排、home/app 分支、输入区和生命周期 effect。后续如果没有输入区或 home 页专项需求，优先做集成验证，而不是继续机械拆分。

### 阶段六：收敛

- [x] 检查并收敛 hook/组件参数边界。
- [x] 补齐导出函数和复杂 hook 的函数级注释。
- [x] 删除不再需要的临时导入和重复工具函数。
- [x] 运行局部测试。
- [x] 最后运行全量测试或 build。

PR 10 验证结论：已运行 `pnpm --dir projects/app exec tsc --noEmit --pretty false`、ChatBox 现有局部测试和 `pnpm --dir projects/app build`。build 退出码为 0，过程中仍有现有的 `styled-jsx/style.js` 解析 warning 和 i18next 初始化提示，不阻塞构建。
