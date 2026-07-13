# ChatBox 长内容流式输出掉帧分析

## 背景与范围

用户反馈：ChatBox 在 AI 长内容流式输出时明显卡顿、掉帧。

本文只分析前端从 SSE 增量到浏览器渲染的性能链路，不直接修改实现。当前工作区存在 Agent Loop、Plan 渲染等未提交改动，本文不修改这些文件，也不把这些改动单独归因为 ChatBox 基线问题。

本次重点回答：

1. 一次 SSE 增量会触发哪些 React、Markdown 和滚动工作。
2. 为什么回答越长，单次更新越慢。
3. 哪些问题是主要瓶颈，哪些只是放大因素。
4. 后续优化应按什么顺序实施和验证。

## 相关模块地图

### ChatBox 调用方

标准 ChatBox 被以下主要场景复用：

- App Chat：`projects/app/src/pageComponents/chat/ChatWindow/AppChatWindow.tsx`
- Home Chat：`projects/app/src/pageComponents/chat/ChatWindow/HomeChatWindow.tsx`
- Skill Preview：`projects/app/src/pageComponents/dashboard/skill/detail/preview/SkillPreview.tsx`
- Chat Test：`projects/app/src/pageComponents/app/detail/useChatTest.tsx`
- Chat Agent Helper：`projects/app/src/components/core/chat/ChatAgentHelper/index.tsx`

因此优化不能只验证普通 App Chat，还要覆盖恢复生成、Skill Preview、Chat Test 和 Helper 场景。

### 核心渲染链路

```txt
SSE event
  -> onStartChat.generatingMessage
  -> useChatGenerate.generatingMessage
  -> requestAnimationFrame queue
  -> setChatRecords
  -> ChatRecordContext
  -> ChatBox
  -> ChatRecordsList
  -> ChatItem
  -> AIChatBubbleContent
  -> AIResponseBox
  -> RenderText / RenderReasoningContent / RenderProcessingPreview
  -> Markdown
  -> react-markdown + remark/rehype + syntax highlighter
  -> DOM commit
  -> MutationObserver / scroll follow
  -> style / layout / paint
```

### 状态和滚动链路

- `ChatRecordContext.chatRecords` 是消息记录事实源。
- `useChatGenerate` 把 SSE 增量合并到最后一条 AI 消息。
- `ChatBox` 订阅完整 `chatRecords`，每次记录引用变化都会重新执行容器渲染。
- `useChatScroll` 同时通过显式 `generatingScroll` 和整个滚动容器上的 `MutationObserver` 跟随内容高度。

## 结论

长输出掉帧不是单一的“React setState 太频繁”，而是以下成本叠加后的结构性结果：

1. 当前虽已用 `requestAnimationFrame` 合并 SSE state commit，但仍允许每帧提交一次完整消息树更新。
2. 流式 Markdown 每次都从头解析累计全文。
3. 流式动画插件把累计正文的每个字符都转换为独立 `span`，导致 AST、React 节点和 DOM 规模与字符数同阶增长。
4. 代码块在流式阶段反复对累计源码做完整语法高亮。
5. 每次 DOM 变更后，滚动观察器会读取 `scrollHeight`、写入滚动位置，再次读取布局状态。
6. 消息列表每次都遍历全部已加载记录，并为消息生成新回调；rAF 队列内部也会逐条 reduce SSE event，而不是先合并同类文本增量。

其中第 2、3 项是长纯文本输出的首要瓶颈，第 4 项是长代码输出的首要附加瓶颈，第 5 项会把 React commit 放大成额外布局工作。

## 主要瓶颈

### P0：流式逐字符动画造成节点爆炸

`projects/app/src/components/Markdown/rehypeStreamAnimated.ts` 的 `wrapText` 和 `wrapListItemText` 会遍历当前完整 HAST 文本，并为每个字符创建：

```ts
{
  type: 'element',
  tagName: 'span',
  properties: { className: 'stream-char' },
  children: [{ type: 'text', value: char }]
}
```

代码注释描述的是“新增文本”，但插件拿到的是每次重新解析后的完整 Markdown tree，因此它实际处理的是“截至当前的全部文本”。React 可以复用部分已有 DOM，但以下工作仍会重复：

- 从头解析完整 Markdown。
- 从头遍历完整 HAST。
- 为完整正文重新创建字符级 HAST/React element。
- 对越来越长的字符节点列表做 reconcile。
- 为新增字符创建带 `filter`、`transform` 和 420ms animation 的 DOM。

合成 HAST 中，`N` 个普通正文字符会形成约 `2N + 2` 个 HAST 节点。例如 20,000 字符会形成约 40,002 个 HAST 节点；浏览器侧对应约 20,000 个 `span` 元素和 20,000 个文本节点。

这会同时增加 JavaScript、DOM 内存、样式计算、合成和 GC 压力。它是目前最明确、收益最高的优化点。

### P0：累计全文 Markdown 反复解析

`projects/app/src/components/Markdown/index.tsx` 在 `source` 每次增长时重新执行：

- `hideStreamingIncompleteMarkdownTail`
- `remark-math`
- `remark-gfm`
- `remark-breaks`
- `rehype-katex`
- `rehype-external-links`
- 流式字符动画 rehype 插件
- ReactMarkdown element 生成和 React reconcile

单次解析成本大致随当前内容长度增长。流式输出从 0 增长到 `N` 时，如果以固定小增量刷新，累计处理量接近：

```txt
1 + 2 + 3 + ... + N = O(N^2)
```

这不是说 Markdown parser 单次是平方复杂度，而是“每次都重做累计全文”使整个生成过程出现平方级累计工作量。

### P0/P1：代码块流式阶段反复全量高亮

`projects/app/src/components/Markdown/codeBlock/CodeLight.tsx` 使用 `react-syntax-highlighter`。代码块内容每次增加时，`SyntaxHighlighter` 都会重新处理当前完整代码。

HTML/HTM/SVG 代码块也有同样问题；`iframe-html.tsx` 在流式源码模式下仍执行完整语法高亮，并在 effect 中读取 `scrollHeight`、写 `scrollTop`。

因此长代码输出即使跳过字符 span，仍可能比普通文本更卡。流式阶段应考虑展示低成本 plain code，代码 fence 闭合或生成结束后再做语法高亮。

### P1：滚动观察导致重复布局读写

`projects/app/src/components/core/chat/ChatContainer/ChatBox/hooks/useChatScroll.ts` 有两套内容增长跟随机制：

1. 每次生成队列 flush 后调用 `generatingScroll`，100ms throttle。
2. 在整个滚动容器上注册 `MutationObserver`，监听 `childList + subtree + characterData`。

每次 MutationObserver 回调会执行：

```txt
读取 scrollTop/clientHeight/scrollHeight
  -> scrollTo(container.scrollHeight)
  -> 再次读取 scrollTop/clientHeight/scrollHeight
```

读取 `scrollHeight` 可能要求浏览器先完成样式和布局；在读写交错时容易触发额外同步布局。字符级 DOM 更新又会制造大量 subtree mutation，使这条链路与 Markdown commit 高频耦合。

MutationObserver 本身通常会批量回调，因此不能仅凭静态代码断言“一字符一次回调”，但它确定会让每次 React DOM commit 追加布局和滚动成本。

## 次要放大因素

### P1：rAF 只合并了 setState，没有合并同类 SSE 数据

`useChatGenerate` 把同一帧的 SSE event 放入 queue，并只调用一次 `setChatRecords`，这比每个 event 单独 setState 更好。

但 state updater 内部仍执行：

```ts
queue.reduce((histories, message) => applyGeneratingMessage(histories, message), state)
```

也就是说，同一帧如果收到多个 answer/reasoning/toolParams 增量，仍会逐条：

- map 完整 records。
- 定位最后一条 AI value。
- clone/拼接当前 value。
- 创建新的 records/item/value 引用。

可以先按 `event + responseValueId + tool.id` 合并连续兼容增量，再对 state 应用一次。尤其 answer/reasoning 字符串可以先 concat，减少中间 records 和 value 对象。

### P1：消息列表每帧遍历，memo 被新回调削弱

`ChatRecordsList` 在 `records` 改变时重新计算 `renderRecords` 并遍历所有已加载消息。渲染期间还会调用：

- `onRetry(item.dataId)`
- `onEdit(item.dataId)`
- `onMark(item, q)`
- `onAddUserLike(item)`
- `onAddUserDislike(item)`
- `onToggleFeedbackReadStatus(item)`

这些 factory 每次返回新的闭包，`ChatItem` 的 `React.memo` 因 props 引用变化不能完整隔离历史消息。AI 消息还接收每次新建的 children。

分页默认只加载 10 条，普通短历史下这不是首要瓶颈；用户向上加载大量历史、或 processing records 合并生成新对象时，影响会明显增加。

### P1/P2：不完整 Markdown 尾部检查存在病理输入

`hideStreamingIncompleteMarkdownTail` 对普通纯文本接近线性，但 marker-rich 文本中，扫描每个 `*`、`_`、反引号时会重复从前缀检查 inline code 状态，可能退化。

本地合成基准的中位耗时：

| 输入 | 2k 字符 | 4k 字符 | 8k 字符 | 16k 字符 |
| --- | ---: | ---: | ---: | ---: |
| 普通纯文本 | 0.10ms | 0.15ms | 0.33ms | 0.42ms |
| `*a* ` 重复 | 1.82ms | 8.36ms | 34.11ms | 117.82ms |

这不会解释所有长输出卡顿，但会让 Markdown 标记密集的回答出现更严重的长任务。

### P2：没有消息窗口化

ChatRecordsList 会保留所有已加载历史 DOM，没有 virtualization/windowing。它主要影响“历史很多”的会话，不是“单条回答很长”的第一根因。

虚拟列表还会与动态消息高度、向上分页保位、引用跳转和吸底行为冲突，不应作为第一阶段方案。

## 合成基准

### 方法

在 `projects/app` 依赖环境中，使用当前的 `react-markdown`、remark/rehype 插件和 `rehypeStreamAnimated`，通过 `renderToStaticMarkup` 渲染包含粗体和链接的重复 Markdown。每组运行 7 次，取中位数。

该基准只覆盖 Markdown parse、HAST transform 和 React SSR element/string 生成，不覆盖浏览器 DOM commit、样式、布局、paint、动画和滚动，因此浏览器实际成本只会更多。它用于验证相对成本和复杂度，不作为最终 FPS 验收结果。

### 结果

| 累计内容长度 | 无逐字动画 | 有逐字动画 | 动画额外倍率 |
| --- | ---: | ---: | ---: |
| 5,000 字符 | 5.79ms | 16.84ms | 2.9x |
| 10,000 字符 | 9.50ms | 31.43ms | 3.3x |
| 20,000 字符 | 14.67ms | 56.83ms | 3.9x |

60Hz 一帧预算约 16.7ms。仅 SSR pipeline 在 10k 字符时已经约 31ms，20k 字符约 57ms；加上浏览器 commit 和滚动后，掉帧属于必然结果。

## 建议优化顺序

### 阶段 1：先移除最重的字符级 DOM

建议优先级：最高。

推荐直接停止把完整流式正文拆成逐字符 `span`，保留低成本的尾部 cursor 或块级淡入。若产品必须保留逐字动画，可先讨论以下折中：

- 只动画最新尾部小窗口，历史前缀保持普通文本节点。
- 内容超过较小阈值后关闭逐字动画。
- 对 `prefers-reduced-motion`、低性能设备和后台 tab 关闭动画。

简单按长度切换插件会在阈值处发生一次 DOM 结构替换，属于可接受但需要验证的过渡方案；更完整的方案是让稳定前缀和流式尾部分开渲染。

### 阶段 2：降低流式提交频率并合并 event

建议把“网络 event 频率”和“UI commit 频率”解耦：

- 原始 SSE 继续实时接收。
- 同类 answer/reasoning/tool 增量先在 ref buffer 合并。
- UI 以 50~100ms 或自适应节奏提交，而不是追求每个 animation frame 都 commit。
- stop、interactive、error、finish 等语义事件立即 flush。

10~20 次/秒的文本刷新通常已经有连续流式感，同时能显著减少全文 Markdown 重算次数。仅做 throttle 不能解决超长内容单次解析过慢，因此必须排在字符 DOM 优化之后或一起实施。

### 阶段 3：流式 Markdown 分段和代码延迟高亮

将已经稳定的 Markdown block 与仍在增长的尾部分离：

- 在代码 fence、列表、表格等语法边界安全的前提下冻结完整 block。
- 已冻结 block 用稳定 key 和 memo，不再随尾部 token 重解析。
- 只对未闭合尾部做频繁解析。
- 流式代码块先用 plain `pre/code`；代码 fence 闭合或生成结束后再启用 SyntaxHighlighter。

这一阶段收益大，但 Markdown 边界和最终渲染一致性风险高，需要单独设计和测试，不建议和滚动重构混成一个大改动。

### 阶段 4：收敛滚动与列表更新

- 移除整个 subtree 的广泛 MutationObserver，改为明确的流式 commit 通知，或观察专用 content wrapper 的尺寸变化。
- 把布局读取和滚动写入合并到单个 rAF，避免一次回调中 read -> write -> read。
- 图片、iframe 等异步高度变化继续用 ResizeObserver 兜底。
- 为消息操作使用稳定的 `dataId` 事件入口，避免列表 render 时为所有消息创建新闭包。
- 必要时把正在生成的最后一条消息与稳定历史列表拆成不同订阅边界。

### 阶段 5：再评估虚拟列表

只有 profiling 证明大量历史 DOM 仍是主要瓶颈时，再设计动态高度 windowing。该方案需要同时解决向上分页保位、跳转 dataId、图片高度变化和生成中吸底，实施风险高于前四阶段。

## 验证矩阵

后续实现不能只用一个纯文本 case 验证。建议固定以下场景录制 Chrome Performance 和 React Profiler：

1. 5k、10k、20k 普通 Markdown。
2. 10k Markdown 标记密集内容。
3. 10k TypeScript/Python 代码块。
4. 长 reasoning 后接长 answer。
5. tool params/response 持续增长。
6. 用户停留底部自动跟随。
7. 用户主动上滚后不得被拉回底部。
8. 图片加载、HTML preview、引用、公式和 quick replies。
9. 普通发送、自动恢复、Skill Preview、Chat Test。
10. 桌面端和移动端至少各一个中等性能设备档位。

建议记录：

- 主线程 long task 数量和最长耗时。
- React commit 次数、commit duration、实际更新的组件数。
- FPS / dropped frames。
- DOM element 数量和 JS heap。
- 输入框打字、停止按钮点击的响应延迟。
- 每秒 SSE event 数和每秒 UI commit 数。

## 初步验收目标

具体阈值需要产品和前端确认，建议先以以下目标讨论：

- 20k 普通 Markdown 流式输出期间不出现持续超过 50ms 的主线程 long task。
- 生成越长时，单次 commit 耗时不再近似随完整字符数线性增长。
- 流式阶段 DOM element 数不再与正文字符数 1:1 增长。
- 停止按钮和输入交互在长输出期间仍可在 100ms 内得到视觉响应。
- 用户主动上滚后保持当前位置；回到底部后恢复吸底。
- 流式结束后的最终 Markdown、代码高亮、公式、引用和交互块与当前语义一致。

## 待确认问题

进入开发设计前，需要确认以下体验取舍：

1. 是否允许取消逐字符淡入，只保留尾部 cursor 或块级动画？这是收益最大、风险最低的方向。
2. 可接受的 UI 刷新节奏是多少：约 20 FPS（50ms）还是约 10 FPS（100ms）？
3. 长代码块是否允许流式阶段不高亮，结束后一次性高亮？
4. 本次首期目标只解决“单条长回答”，还是同时覆盖“加载大量历史记录”的窗口化？建议首期不做虚拟列表。

## 相关代码证据

- `projects/app/src/components/core/chat/ChatContainer/ChatBox/hooks/useChatGenerate.ts`：rAF queue、逐 event reducer、`setChatRecords`。
- `projects/app/src/components/core/chat/ChatContainer/ChatBox/index.tsx`：订阅完整 records、派生 RecordsList props。
- `projects/app/src/components/core/chat/ChatContainer/ChatBox/components/ChatRecordsList.tsx`：完整记录遍历、合并和回调 factory。
- `projects/app/src/components/core/chat/ChatContainer/ChatBox/hooks/useChatScroll.ts`：显式滚动、MutationObserver、布局读写。
- `projects/app/src/components/core/chat/components/AIResponseBox/RenderText.tsx`：长 answer 进入 Markdown。
- `projects/app/src/components/core/chat/components/AIResponseBox/RenderReasoningContent.tsx`：长 reasoning 进入 Markdown。
- `projects/app/src/components/Markdown/index.tsx`：完整 Markdown pipeline。
- `projects/app/src/components/Markdown/rehypeStreamAnimated.ts`：逐字符 HAST/DOM 转换。
- `projects/app/src/components/Markdown/utils.ts`：流式不完整尾部扫描。
- `projects/app/src/components/Markdown/codeBlock/CodeLight.tsx`：代码块全量语法高亮。
- `projects/app/src/components/Markdown/codeBlock/iframe-html.tsx`：HTML 流式源码高亮和内部滚动。
