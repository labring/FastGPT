# 流恢复暂停状态与禁发保护设计

## 背景

流式对话暂停时，前端原本只把 stop 请求当作一次本地 abort 处理。若后端工作流尚未真正完成，用户立刻发送下一轮消息，会出现上一轮仍在写入、下一轮已经开始的并发状态，进而导致上下文混乱、侧栏生成态和输入框状态不一致。

本 PR 目标是让“暂停”从单纯的前端中断动作，升级为前后端共同确认的生成态切换：后端返回真实完成情况，前端在未完成时继续保持禁发。

## 问题分析

1. `/api/v2/chat/stop` 只返回 `success`，前端不知道工作流是否已经结束。
2. 前端 stop 后会立即执行本地 abort，输入区可能恢复可发送状态。
3. `sendPrompt` 只依赖局部 `isChatting` 判断，不能覆盖服务端仍为 `generating` 或最后一条 AI 记录未 finish 的情况。
4. 侧栏生成态、输入按钮状态和当前会话 `chatGenerateStatus` 没有在 stop 结果返回后统一同步。

## 最终方案

### 1. stop 接口返回生成态

`/api/v2/chat/stop` 在触发 `finishWorkflow` 并最多等待工作流完成后，重新读取 `MongoChat.chatGenerateStatus`，返回：

- `success`
- `completed`
- `chatGenerateStatus`

其中 `completed = chatGenerateStatus !== generating`。这样前端能区分“停止完成”和“停止请求已发出但后台还没完全收尾”。

### 2. 前端 stop 等待结果并同步状态

`ChatInput` 调用 `postStopV2Chat` 后，把 `chatGenerateStatus` 和 `completed` 回传给 `ChatBox`。

`ChatBox` 统一处理 stop settle：

- `completed=true` 时使用后端返回的状态。
- `completed=false` 时继续保持 `generating`。
- 同步 `chatBoxData` 和侧栏历史项生成态。
- 未完成时提示“停止中”，避免用户误以为可以马上开始下一轮。

### 3. 抽象下一轮禁发判断

新增 `isChatRoundPending`，统一判断本轮是否仍处于未完成状态：

- 本地 `isChatting=true`
- 当前会话 `chatGenerateStatus=generating`
- 最后一条 AI 记录存在但 `status !== finish`

只要任一条件成立，`sendPrompt` 和输入按钮都进入禁发状态。

### 4. 补齐提示文案和接口 schema

OpenAPI schema 增加 stop response 字段定义，前端 API 类型跟随 schema 更新。

新增 `chat:stopping_chat` 国际化文案，用于 stop 未真正完成时的提示。

## 涉及文件

- `projects/app/src/pages/api/v2/chat/stop.ts`
  - stop 后读取当前 `chatGenerateStatus`，返回 `completed` 与生成态。
- `packages/global/openapi/core/chat/controler/api.ts`
  - 更新 stop response schema。
- `projects/app/src/web/core/chat/api.ts`
  - 更新前端 stop API 返回类型。
- `projects/app/src/components/core/chat/ChatContainer/ChatBox/chatStatus.ts`
  - 新增 `isChatRoundPending`，集中维护禁发判断。
- `projects/app/src/components/core/chat/ChatContainer/ChatBox/index.tsx`
  - 使用 `isChatRoundPending` 禁止下一轮发送，并处理 stop settle 后的状态同步。
- `projects/app/src/components/core/chat/ChatContainer/ChatBox/Input/ChatInput.tsx`
  - stop 请求等待后端结果；输入发送受 `disableSend` 控制。
- `packages/web/i18n/en/chat.json`
- `packages/web/i18n/zh-CN/chat.json`
- `packages/web/i18n/zh-Hant/chat.json`
  - 新增“停止中”提示文案。
- `packages/global/test/core/chat/controler.test.ts`
  - 覆盖 stop response schema。
- `projects/app/test/components/core/chat/ChatContainer/ChatBox/chatStatus.test.ts`
  - 覆盖禁发判断。

## 验证点

1. stop response schema 支持 `completed` 与 `chatGenerateStatus`。
2. stop 未完成时，前端仍视为生成中并禁止继续发送。
3. 本地 `isChatting=false` 但服务端生成态仍为 `generating` 时，不能发起下一轮。
4. 最后一条 AI 记录未 finish 时，不能发起下一轮。

## TODO

- [x] stop 接口返回 `completed` 和 `chatGenerateStatus`
- [x] 前端 stop settle 后同步当前会话和侧栏生成态
- [x] 抽象并接入统一禁发判断
- [x] 增加 stop response schema 测试
- [x] 增加禁发判断单元测试
