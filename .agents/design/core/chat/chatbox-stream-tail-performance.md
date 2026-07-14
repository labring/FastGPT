# ChatBox 流式尾部淡入性能优化

## 1. 需求

ChatBox 在长内容流式输出时会持续掉帧。已确认本次需要：

1. 保留流式文本淡入效果。
2. 淡入只作用于最新一次 UI 刷新的文本块尾部，不再把累计全文拆成字符级 DOM。
3. 流式 UI 刷新频率限制为最多 20 次/秒，即两次普通增量渲染至少间隔 50ms。
4. 完成、异常、停止和恢复生成收尾不能因为 50ms buffer 延迟。
5. 最终 Markdown 内容和当前行为一致，不增加流式光标。
6. 分析文档和代码改动只放在基于 `upstream/main` 的独立 worktree。

问题分析见：

- `.agents/issue/chatbox-long-stream-render-performance-analysis.md`

## 2. 非目标

1. 本次不实现 Markdown 增量 parser。
2. 本次不调整代码块语法高亮策略。
3. 本次不引入聊天记录虚拟列表。
4. 本次不重构 ChatRecordContext 或 ChatBox 状态所有权。
5. 本次不修改 SSE 协议和服务端输出频率。

## 3. 当前问题

### 3.1 字符级 DOM

当前 `rehypeStreamAnimated` 会把流式 Markdown 中所有可见正文字符转换为：

```html
<span class="stream-char">字</span>
```

每次增量都会重新解析累计全文并重建字符级 HAST。回答越长，HAST、React element、DOM、样式计算和 reconcile 成本越高。

### 3.2 rAF 仍允许 60 次/秒更新

当前 `useChatGenerate` 用 `requestAnimationFrame` 把同一帧 SSE event 合并为一次 `setChatRecords`。它避免了单帧内多次 React commit，但在持续输出时仍可能每秒 commit 60 次。

### 3.3 恢复生成缺少结束前 flush

普通 `sendPrompt` 会在请求结束和 catch 中调用 `flushGeneratingMessageQueue`。`useChatResume` 只接收 `generatingMessage`，恢复流结束后直接合并 `completedChat` 或设置最终状态。

刷新窗口扩大到 50ms 后，恢复流最后一批增量更可能仍停留在 queue 中。必须在恢复收尾状态更新前 flush，保证 React functional state updater 的入队顺序为：

```txt
最后一批 SSE 增量 -> completedChat / finish / error
```

## 4. 方案

### 4.1 流式尾部长度

`MarkdownRender` 保存上一次已经 commit 的 `formatSource`。

当前内容是上一次内容的 append 时，计算新增可见尾部的 Unicode code point 数；首尾空白和纯 Markdown 控制标记不产生动画，内容发生替换、缩短或不是 append 时，本次不添加尾部动画。单次最多标记 64 个 code point，避免异常大 chunk 生成过大的动画节点。

```ts
tailLength = min(codePoints(visibleAppend(currentSource - previousSource)), 64)
```

`previousSourceRef` 只在 layout effect 中更新，表示上一次已经提交到 DOM 的 source，不在 render 中改写 ref。

### 4.2 HAST 尾部包装

保留 `rehypeStreamAnimated.ts` 作为流式动画实现文件，但修改职责：

1. 找到最后一个可渲染文本 block：`p/h1-h6/li`。
2. 从 block 末尾反向遍历可渲染 inline/text node。
3. 只包装最后 `tailLength` 个 code point。
4. 使用自定义 HAST tag `stream-tail`，避免接管 Markdown、KaTeX 等现有 `span`。
5. 遇到 `pre/code/table/svg/katex` 时停止向前包装，避免新增内容只有代码或公式时错误动画旧正文。
6. 一个普通文本节点最多生成一个 tail element，不再一字符一个 element。

普通文本示例：

```html
<p>
  已稳定内容
  <stream-tail>本次新增内容</stream-tail>
</p>
```

跨粗体、链接等 inline node 时，可能生成少量 tail element，但数量只与本次新增尾部的 inline 结构有关，不与累计字符数成正比。

### 4.3 淡入 renderer

ReactMarkdown 为 `stream-tail` 注册自定义 renderer，最终输出普通 `span`。

renderer 在 layout effect 中通过 Web Animations API 执行：

```txt
opacity: 0.25 -> 1
filter: blur(1px) -> blur(0)
transform: translateY(1px) -> translateY(0)
```

动画使用现有 `cubic-bezier(0.16, 1, 0.3, 1)` 快速 ease-out，时长调整为 120ms。原因是 UI 每 50ms 可能产生一个新尾部批次；保留 420ms 会使同一个尾部 renderer 在远未完成时反复重启动画，产生持续模糊和亮度跳变。

生成结束时 `showAnimation=false`，不再安装 tail rehype 插件，最终 DOM 回到普通 Markdown 结构。

### 4.4 20Hz 调度器

新增 ChatBox 专用 `streamRenderScheduler`：

1. `schedule()`：按上次 flush 时间计算剩余等待时间。
2. 等待达到 50ms 后，再用一个 rAF 对齐浏览器 paint。
3. 多次 `schedule()` 共享同一个 timer/frame。
4. `flush()`：取消 timer/frame 并立即提交，用于完成和异常收尾。
5. `cancel()`：取消 timer/frame、重置节流时间，不提交，用于组件卸载或离开会话。

首次增量不等待完整 50ms，直接进入下一个 animation frame。之后普通文本增量最多 20 次/秒。

调度器接受 runtime adapter，生产环境使用 `performance/window`，测试使用同步可控 fake runtime，不依赖 jsdom 和真实时间。

### 4.5 普通生成和恢复生成

`useChatGenerate`：

- queue 非空后调用 scheduler `schedule()`。
- 普通请求完成或 catch 时调用 scheduler `flush()`。
- `abortRequest('leave')` 和 hook cleanup 时调用 scheduler `cancel()` 并清空 queue，避免旧会话
  buffer 写入新会话。
- 对外返回 `flushGeneratingMessages`。

`useChatResume`：

- 接收 `flushGeneratingMessages`。
- `streamResumeFetch` resolve 后、处理 `completedChat/resumeUnavailable/finish` 前立即 flush。
- catch 中设置最终 error/done 状态前立即 flush。
- 用户主动停止恢复流时立即 flush；因离开会话触发的 abort 不提交旧会话 buffer。

这保持普通生成与恢复生成的最后一批内容顺序一致。

## 5. 风险与边界

1. Markdown 语法闭合可能重写最后一个 block 的 HAST；此时仍只包装最终可见 block 的尾部，不在 Markdown 源字符串层拆分。
2. 新增 chunk 只有 Markdown 标记、代码或公式时，可能没有淡入节点；不能为了动画回退包装旧正文。
3. emoji 和代理对按 Unicode code point 计数和切分，不能拆坏 surrogate pair。
4. 一次新增超过 64 个 code point 时只动画最后 64 个，其余直接稳定显示。
5. Web Animations API 不存在时直接显示文本，不影响内容。
6. 20Hz 是最大 commit 频率，不保证服务端低频 event 被人为补齐到 20Hz。

## 6. 测试设计

### 6.1 rehype tail

新增 `projects/app/test/components/Markdown/rehypeStreamAnimated.test.ts`：

1. 只包装最后 block 的新增尾部。
2. 普通长文本只生成一个 tail element，不按字符增长。
3. 支持粗体、链接等嵌套 inline node。
4. 不跨过 code/table/svg/katex 回退动画旧文本。
5. 跳过的 block 位于 blockquote/list 等容器内时同样不回退动画旧文本。
6. 首尾空白和纯 Markdown 控制标记 append 不重复动画旧文本。
7. `tailLength=0` 不修改 tree。
8. 正确处理 emoji。
9. append length 支持首次内容、普通 append、非 append、上限和 Unicode。

### 6.2 scheduler

新增 `projects/app/test/components/core/chat/ChatContainer/ChatBox/streamRenderScheduler.test.ts`：

1. 首次 schedule 进入最近一帧。
2. 50ms 内多次 schedule 只 flush 一次。
3. 下一次 flush 不早于 50ms。
4. `flush()` 取消待执行任务并立即提交。
5. `cancel()` 只取消、不提交。
6. cancel 后下一轮重新从最近一帧开始调度。
7. 空 flush 不消耗下一轮 50ms 窗口。
8. timer 已触发但 frame 未执行时仍不会重复 schedule。

### 6.3 回归验证

1. Markdown utils 现有测试。
2. ChatBox 现有局部测试。
3. App TypeScript typecheck。
4. 最后运行 app 测试集合；若仓库全量测试受外部服务或既有失败阻塞，记录具体结果。

## 7. TODO

- [x] 从最新 `upstream/main` 创建独立 worktree。
- [x] 迁移性能问题分析文档，并清理当前工作区副本。
- [x] 核对 upstream Markdown、生成 queue 和恢复生成实现。
- [x] 新增 rehype tail 和 append length 单元测试。
- [x] 新增 20Hz scheduler 单元测试。
- [x] 实现流式尾部 HAST 包装和淡入 renderer。
- [x] 实现 50ms scheduler 并接入普通生成。
- [x] 给恢复生成增加收尾前 flush。
- [x] 运行局部测试和 typecheck。
- [x] 运行最终相关测试并检查 diff。

## 8. 验证记录

1. 新增 rehype/scheduler 测试：31 项通过（rehype 23 项、scheduler 8 项），包含真实
   `react-markdown` 自定义组件映射。
2. Markdown utils 与 ChatBox 回归测试：12 个文件、114 项通过。
3. 改动 TypeScript/测试文件 ESLint：0 error；ChatBox/index.tsx 保留 11 条 upstream 原有
   warning，未由本次改动引入。
4. `@fastgpt/app` typecheck：通过。
5. 22,400 字符 ReactMarkdown SSR 合成基准：无动画中位数 4.40ms，尾部动画中位数
   3.57ms；两者已处于相同成本级别。该基准只证明尾部插件不再产生字符级放大，不代表浏览器 FPS。
6. App 全量测试：154/156 个文件、1100/1102 项在并发运行中直接通过；另外 2 项在 20 秒
   超时，随后用单 worker 串行重跑均通过。全量 Vitest 汇总后存在仓库既有未关闭句柄并被 pnpm
   强制结束，因此原全量命令退出码为 1，但所有测试项最终均已通过。
7. Global 全量测试：78 个文件、1670 项通过。
8. Service 全量测试：229 个文件、3121 项通过，另有 35 项按仓库配置跳过。
9. Worktree 开发服务在 `http://localhost:3001` 启动成功，Turbopack 编译 `/` 后返回 HTTP 200。
