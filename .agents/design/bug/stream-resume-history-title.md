# 流恢复历史记录名称修复设计

## 背景

新对话发起后，侧栏会先展示一个临时历史项。旧逻辑在服务端历史记录尚未落库或尚未拉取回来时，容易显示固定的“新对话”。流恢复场景下，这个临时标题更容易停留在默认文案，导致用户在历史列表中无法通过刚输入的问题识别会话。

本 PR 目标是让临时历史项先使用用户输入生成的标题，服务端标题回来后再覆盖。

## 问题分析

1. 侧栏临时项默认标题固定为“新对话”，没有优先使用当前轮用户输入。
2. `onUpdateHistoryTitle` 发现本地 histories 没有目标 chatId 时，会直接触发拉取服务端历史；如果服务端还没落库，本地仍然没有可展示标题。
3. 当前会话 `chatBoxData.title` 与侧栏临时项标题没有在新对话开始时同步。
4. 生成完成后仍需要尊重服务端最终标题，不能让临时标题永久覆盖服务端标题。

## 最终方案

### 1. 新对话开始时生成临时标题

在 `ChatBox` 发起新一轮对话时，通过 `getChatTitleFromChatMessage(currentHumanChat)` 从用户输入生成临时标题。

该标题同步写入：

- 当前会话 `chatBoxData.title`
- 侧栏临时历史项

这样服务端历史未返回前，侧栏也能展示用户可识别的标题。

### 2. 侧栏展示标题统一走 display helper

新增 `getDisplayHistoryTitle`：

- 有非空标题时展示标题。
- 标题为空时回退到“新对话”。

侧栏临时项不再无条件展示固定“新对话”，而是优先使用 `chatBoxData.title`。

### 3. `onUpdateHistoryTitle` 支持本地 upsert

新增 `upsertHistoryTitle`：

- 如果 histories 中已有目标会话，直接本地替换标题。
- 如果还没有目标会话，先插入一个临时历史项。
- 插入临时项时标记为 `generating` 且 `hasBeenRead=false`。

随后仍然调用 `loadHistories({ init: true })` 拉取服务端数据。这样既保证即时展示，又能在服务端落库后回到真实历史记录。

### 4. 服务端标题回来后覆盖临时标题

本 PR 不改变服务端标题生成逻辑。拉取历史成功后，服务端返回的历史项会覆盖本地临时项，从而把临时标题替换成最终落库标题。

## 涉及文件

- `projects/app/src/components/core/chat/ChatContainer/ChatBox/index.tsx`
  - 新对话开始时根据用户输入生成临时标题。
  - 同步更新当前会话标题和侧栏临时历史项标题。
- `projects/app/src/pageComponents/chat/slider/ChatSliderList.tsx`
  - 临时历史项展示时优先使用 `chatBoxData.title`。
  - 接入 `getDisplayHistoryTitle` 处理空标题回退。
- `projects/app/src/web/core/chat/context/chatContext.tsx`
  - `onUpdateHistoryTitle` 改为先本地 upsert，再拉取服务端历史。
  - 使用 ref effect 同步 histories，避免直接渲染期赋值。
- `projects/app/src/web/core/chat/context/historyTitleUtils.ts`
  - 新增 `getDisplayHistoryTitle` 和 `upsertHistoryTitle`。
- `projects/app/test/web/core/chat/context/historyTitleUtils.test.ts`
  - 覆盖标题回退、已存在历史替换、不存在历史插入等场景。

## 验证点

1. 新会话刚开始时，侧栏展示用户输入生成的标题，而不是固定“新对话”。
2. `onUpdateHistoryTitle` 在 histories 尚未包含目标 chatId 时，也能先插入临时项。
3. 标题为空时仍回退到“新对话”。
4. 服务端历史拉取回来后，可以用服务端标题覆盖临时标题。

## TODO

- [x] 新对话开始时生成并同步临时标题
- [x] 侧栏临时项优先展示当前会话标题
- [x] `onUpdateHistoryTitle` 支持本地 upsert
- [x] 保留服务端历史刷新覆盖最终标题
- [x] 增加 history title 工具函数测试
