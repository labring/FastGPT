---
case_version: 1
id: FG-APP-WORKFLOW-051
title: Builder 待确认方案阅读定位与聊天滚动回归
business: app/workflow/editor
types: [ui, e2e]
category: boundary
scenario: special
priority: P1
status: ready
tags: [workflow-builder, preview, scroll, pagination, 覆盖基础场景, 覆盖边界场景]
evidence: [ui, response]
sources:
  - projects/app/src/components/core/chat/ChatContainer/ChatBox/hooks/useChatScroll.ts
  - projects/app/src/components/core/chat/ChatContainer/ChatBox/index.tsx
  - projects/app/src/components/core/chat/ChatContainer/ChatBox/hooks/useChatGenerate.ts
  - projects/app/src/components/core/chat/ChatContainer/ChatBox/hooks/useChatResume.ts
  - projects/app/src/components/core/chat/components/AIResponseBox/index.tsx
  - projects/app/src/components/core/chat/components/AIResponseBox/WorkflowBuilder/RenderWorkflowBuilderPreview.tsx
  - projects/app/src/components/Markdown/components/MermaidCodeBlock.tsx
  - projects/app/src/web/core/chat/context/chatRecordContext.tsx
  - packages/web/hooks/useLinkedScroll.tsx
  - packages/global/core/workflow/runtime/utils.ts
routes: []
related: [FG-APP-WORKFLOW-050]
baseline: "8d720653d46a46dffb076490ca9fd545307a3413"
---

# Builder 待确认方案阅读定位与聊天滚动回归

## 用例简介

较长方案生成后，用户应从标题开始阅读，而不是停在说明末尾。手动阅读、流程图异步加载和恢复历史会话不能反复抢走当前位置；普通聊天仍应跟随生成，且用户可以主动回到底部。

## 前置准备

- 复用 FG-APP-WORKFLOW-050 的本轮独立应用、账号与真实主站/Pro 版本，不使用旧测试结果。浏览器为独立 Chromium 会话，记录实际 viewport。模型及 Agent Sandbox 不可用时记录依赖阻塞，仍可检查本轮已真实生成的方案。
- R0：真实 Builder 会话中准备长度超过一屏的待确认方案，包含流程图和足够的配置说明。记录 appId、chatId、AI dataId 和 toolCallId；用 `[data-chat-scroll-anchor]` 定位卡片，向上找到实际 overflow 滚动容器，不修改 React 状态或插入锚点。
- 真实几何：记录容器 scrollTop、scrollHeight、clientHeight、clientTop，及卡片/容器 getBoundingClientRect。足够空间时卡片 top 应贴近容器内容区 top，允许 8px 测量余量；短内容受滚动范围限制时，要求标题实际可见，不要求无法达到的坐标。
- C2 通过本轮浏览器请求延迟真实 Mermaid chunk/图像加载，或在页面实际加载图时取证；不伪造 SVG 或改变 DOM 高度。若未观察到实际异步高度变化，不把此变体判通过。
- R1：经真实聊天生成多轮记录，使 Builder 会话超过初始 20 条窗口；仅在本轮私有实例可用时也可按已核实 schema 写有 marker 的合成历史。必须记录真实 record/list 请求及前后游标，不能仅调用内部滚动函数冒充分页。
- C6 使用独立普通应用聊天窗口，以可控的多段固定文本工作流输出，准备可放行 HTTP gate 制造真实追加；不使用 Builder UI 代替普通聊天，不扩大到租约/Redis 故障注入。
- C1～C3 连续使用 R0；C4 独立使用 R1；C5 使用修订产生的新方案；C6 使用普通聊天独立资源。每次滚动经真实滚轮、键盘或可见按钮触发。清理只回收本轮资源，保留脱敏截图、几何序列和请求事件证据。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 基础；R0 生成结束 | 等待待确认标记出现，记录初次位置；继续观察延迟滚动回调和请求结束后的布局。 |
| C2 | 边界；承接 C1 | 手动滚到卡片中段，等待真实流程图异步渲染并改变内容高度，再改变窗口大小；观察标题与阅读位置，保留变化前后几何。 |
| C3 | 基础；承接 C2 | 点击界面“回到底部”按钮，再手动回到卡片中段；分别观察自动回调是否又把同一方案强制定位到顶部。 |
| C4 | 恢复与分页；R1 | 刷新并重新进入待确认会话；向上触发真实前一页记录加载，再恢复最新方案。记录列表恢复和分页补偿的实际坐标。 |
| C5 | 新方案；R0 或 FG-APP-WORKFLOW-050/C2 | 通过正常“修改方案”提交修订，等待新方案。对比旧/新锚点归属，并再滚动阅读新方案。 |
| C6 | 普通聊天对照 | 从底部发送并接收多段真实输出；上滚后放行追加；再主动回到底部并放行下一段。另开一个聊天窗口，确认没有跨容器定位。 |

## 预期结果

公共断言：通过真实可见内容和测量几何判断，而不是仅凭 DOM 存在。只当前待确认预览具有阅读锚点；每个方案自动定位一次，后续保留用户阅读位置。以事件/布局稳定为等待条件，不用固定 sleep 后直接判通过。

| 子场景 | 验证方式 | 特有预期 | 证据获取方式 |
| --- | --- | --- | --- |
| C1 | UI、几何序列 | 足够内容空间时卡片标题从容器顶部开始，延迟自动贴底不将其滚走；初次定位和稳定后位置一致，标题实际可见。 | 生成结束时间、AI/toolCallId、前后截图与容器/卡片几何。 |
| C2 | UI、真实请求时序 | 图渲染、异步高度变化和 resize 后保留用户阅读位置，不再次跳到卡片顶部或底部；记录浏览器正常滚动锚定的影响，不能用恒定 mock 矩形代替。 | Mermaid 请求/图加载事件、几何序列、前后截图。 |
| C3 | UI、几何序列 | 主动点击能到达真实底部；后续自动回调不把同一方案拉回顶部。手动上滚阅读继续有效，按钮显隐与实际位置一致。 | 按钮点击、底部距离及后续滚动截图/几何。 |
| C4 | UI、真实分页响应 | 重新打开时对齐方案标题；新增前页后保留原阅读内容及补偿位置，不重复初始定位或丢掉最新待确认状态。确有分页请求和返回记录，不能只测单页恢复。 | record/list 请求游标与 ID 序列、分页前后可见内容及几何。 |
| C5 | UI、SSE | 新方案只定位一次；旧方案无待确认锚点。新方案的消息 ID 与 toolCallId 共同归属当前交互，后续手动滚动不被同方案覆盖。 | 两轮 SSE/消息 ID、锚点集合、定位与手动滚动截图。 |
| C6 | UI、真实流 | 普通输出在底部继续跟随；主动上滚后追加不打断阅读；回到底部后恢复跟随。另一个窗口不受 Builder 锚点影响。 | 两个窗口截图、多段 SSE、各容器 bottom distance 和滚动轨迹。 |
