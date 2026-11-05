---
case_version: 1
id: "FG-CHAT-CONVERSATION-006"
title: "发送后的草稿清理与刷新恢复"
business: "chat/conversation"
types: [ui, e2e]
category: boundary
scenario: special
priority: P1
status: ready
tags: [input-draft, page-refresh, stream-resume, 覆盖基础场景, 覆盖异常场景, 覆盖边界场景]
evidence: [ui, response, cache]
sources:
  - projects/app/src/components/core/chat/ChatContainer/ChatBox/index.tsx
  - projects/app/src/components/core/chat/ChatContainer/ChatBox/Input/ChatInput.tsx
  - projects/app/src/components/core/chat/ChatContainer/ChatBox/hooks/useChatInputForm.ts
  - projects/app/src/components/core/chat/ChatContainer/ChatBox/hooks/useChatGenerate.ts
  - projects/app/src/web/core/chat/inputDraft/useChatInputDraft.ts
  - projects/app/src/web/core/chat/inputDraft/storage.ts
  - projects/app/src/web/common/api/fetch.ts
  - projects/app/src/pageComponents/chat/ChatWindow/HomeChatWindow.tsx
  - projects/app/src/pageComponents/chat/ChatWindow/AppChatWindow.tsx
routes: []
related: [FG-CHAT-CONVERSATION-002, FG-CHAT-CONVERSATION-003]
baseline: "8fd60842561e96c1e782cea15bd94d5d3b6b938e"
---

# 发送后的草稿清理与刷新恢复

## 用例简介

用户发送消息后刷新页面，已发送的文字和附件应继续属于消息记录，不能因旧连接结束而重新成为草稿。刷新同时应保留尚未发送的新输入；真正的发送失败及生成冲突仍按原规则回填，恢复流不能自动重发草稿。

## 前置准备

- 版本：记录 `BASE_URL`、主仓与 Pro commit，部署本次修复。上方 baseline 为问题分析基线，用例 ready 表示定义可执行，不表示该基线已修复或本次浏览器验收已通过。
- 身份与入口：使用有对话权限的测试成员，保持同一浏览器 tab、同一团队。普通应用会话执行完整矩阵；首页聊天启用的 Pro 环境补执行 C1、C2 和 C4，分别记录结果，缺失 Pro 环境不算该入口通过。
- D0：独立测试应用及新会话，支持上传一个小附件。工作流先进入可手动放行的测试 gate，再输出带 `RUN=draft-refresh-日期-随机串` 的固定答案；最长等待 120 秒。gate 用于稳定制造无回答文本的生成阶段；另准备一个可以先产生 reasoning/工具事件再等待的变体，模拟截图中的生成阶段。
- 浏览器 DevTools 保留 Network 日志，按当前会话过滤；记录发送请求、恢复请求和发送前后输入区截图。不能只检查 HTTP 200，流需检查错误事件、回答和完成事件。刷新前确认消息已出现在页面，服务端已到达 gate，不能将尚未发出请求算成成功发送。
- 草稿取证：在同一 tab 的 Application / Session Storage 检查 `fastgpt_chat_input_drafts_v1`，仅比对当前 `tmbId + appId + chatId` 对应条目的 `text/files/revision`；条目不存在与整个 key 不存在都允许，不要求删除其他会话草稿。附件按 key/name 比较，不比较恢复后重新生成的 UI ID。
- C1～C6 相互独立，每次使用 D0 的新会话；C4 的第二段输入是连续操作。仅在独立测试页面通过浏览器网络拦截/代理制造请求失败，不关闭共享 Redis 或服务进程。需要验证取消离页时，用测试页面临时注册可移除的 `beforeunload` 提示，完成后移除。
- 清理：放行所有 gate，等待任务完成，通过产品会话管理入口删除本轮测试会话和测试应用；不要清空同一浏览器的所有 sessionStorage。涉及生成冲突的服务端写入断言复用关联用例，不在此重复完整故障矩阵。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 基础场景；D0 | 输入带 RUN 的文字并上传成功附件，确认草稿已保存。发送后确认输入区清空、任务到达 gate；在还没有回答文本时刷新。普通无输出及 reasoning/工具变体各执行一次，放行至完成，再刷新一次。 |
| C2 | 边界场景；D0 | 粘贴带 RUN 的文字后立即发送，尽量在 300ms 防抖保存前完成发送。任务进入 gate 后立刻刷新；检查重载后的输入区与草稿，放行后完成。 |
| C3 | 边界场景；D0，测试专用网络夹具 | 请求已到 gate 后发起真实刷新，分别记录浏览器断流以正常关闭及网络异常结束的路径；重点保存 fetch reject 先于 pagehide 的实际事件顺序。需要夹具时只控制原订阅连接，保留后台任务。旧页面销毁前观察草稿变化，重载后恢复原任务，不能把单纯刷新且未经历断流异常当作异常路径通过。 |
| C4 | 边界场景；D0 | 发送 A 到 gate，输入区清空后再写未发送文字 B 并选择成功附件。在 B 尚未完成防抖时刷新；恢复 A，放行后再次刷新。 |
| C5 | 基础对照；D0 | 输入文字和成功附件但不发送，立即刷新。另一个新会话发送至完成后再刷新，区分未发送草稿与已发送内容。 |
| C6 | 异常对照；D0 | 发送前阻断测试会话的请求，使其在页面仍打开且没有回答文本时明确失败，观察文字和附件从本次发送快照回填后刷新。另一个新会话在生成中尝试离页并取消，确认页面未触发真正离开；随后真正刷新并仅让本页恢复请求发生一次网络错误，检查输入区，再放行任务并重新进入。生成占用拦截后的回填与刷新复用 FG-CHAT-CONVERSATION-002 的 C1/C3，不重复制造其全套时序。 |

## 预期结果

公共断言：按同一个成员、应用、会话取证；刷新和恢复不新增一条用户消息，不自动发送输入框草稿。已发送内容从消息记录/恢复流展示，未发送内容只在输入区出现。不能以“输入框恰好为空”代替草稿缓存、请求次数和最终消息的联合验证。

| 子场景 | 验证方式 | 特有预期与证据 |
| --- | --- | --- |
| C1 | UI、Network、Session Storage | 刷新前已消费的文字/附件条目被删除，重载后输入区文字为空、无附件预览；reasoning 或工具阶段断开也不能回填 A。只恢复原消息，最终答案完整；完成后再次刷新仍为空。保存三阶段截图、对应缓存和原始流证据。 |
| C2 | UI、Session Storage | 旧防抖任务及离页保存不会复活已发送文字；重载后为空。保留输入/发送时间、旧缓存及重载后的缓存快照。 |
| C3 | UI、Network、Session Storage | 页面销毁时只中断本地订阅；旧连接正常关闭或抛网络错误都不将 A 写回草稿、不把后台任务标记为已完成。重载恢复原轮并等待真实终态；证据明确标记实际观察到的关闭路径，未观察到的变体记待执行。 |
| C4 | UI、Network、Session Storage | 重载只恢复 B 的文字与附件，A 的断流/迟到回调不能覆盖或删除 B；B 不出现在发送请求或消息记录中。A 完成再刷新仍保留 B。保存当前条目的内容、消息列表与请求差集。 |
| C5 | UI、Session Storage | 未发送内容可刷新恢复，发送完成后的内容不能恢复为草稿；读取草稿不延长 `updatedAt`。保存两种状态的缓存时间及输入区截图。 |
| C6 | UI、Network、Session Storage | 发起请求前已删除本轮草稿；直接发送真正失败才从发送快照回填本轮文字与附件，刷新后保留，不依赖重新查询消息或旧草稿。取消离页不提前中断流；恢复请求失败不能回填已发送消息，也不能覆盖后续新草稿，后台任务仍可完成。生成冲突仍撤销被拒消息、保留待发送内容并恢复原轮，不能因修复刷新而丢失失败草稿。 |
