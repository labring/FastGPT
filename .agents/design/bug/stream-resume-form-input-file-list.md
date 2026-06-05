# 流恢复表单输入值修复

## 背景

流恢复过程中，工作流的「表单输入」节点可以恢复出交互节点本身，但已提交的表单值没有完整恢复，其中 `fileSelect` 文件列表最容易暴露。

典型表现：

1. 刷新页面后，历史记录接口 `getRecords_v2` 返回的交互节点中有 `interactive.params.inputForm[].value`，已提交表单值可以从历史数据恢复。
2. 一旦自动流恢复开始，页面上仍然能看到表单输入交互节点，但文件上传区域只剩禁用上传框，已提交字段值消失，文件字段表现为文件列表消失。
3. 恢复流中有 `flowNodeResponse` 事件，数据里包含：

```json
{
  "moduleType": "formInput",
  "formInputResult": {
    "File": [
      "http://localhost:3000/api/system/file/download/xxx?filename=H6%E4%BA%A7%E5%93%81%E6%A6%82%E8%BF%B0V1.5_tBF8kj.docx"
    ]
  },
  "nodeId": "j1Ifb41hX176ezmo"
}
```

用户期望：表单输入节点的已提交字段值恢复到「用户交互表单节点」内部；其中 fileSelect 应恢复为文件列表，而不是展示在 AI 普通回复气泡或文本区域里。

## 相关数据结构

### 历史记录里的表单交互节点

`getRecords_v2` 返回的交互节点中，字段值已经存在；其中文件字段是 `FileSelector` 可渲染的结构：

```json
{
  "interactive": {
    "type": "userInput",
    "params": {
      "submitted": true,
      "inputForm": [
        {
          "type": "fileSelect",
          "key": "File",
          "value": [
            {
              "key": "chat/xxx.docx",
              "name": "H6产品概述V1.5.docx",
              "type": "file",
              "url": "http://localhost:3000/api/system/file/download/xxx"
            }
          ]
        }
      ]
    },
    "entryNodeIds": ["j1Ifb41hX176ezmo"]
  }
}
```

### 恢复流里的节点响应

`flowNodeResponse.formInputResult` 只包含字段结果，不是完整的表单渲染结构：

```json
{
  "formInputResult": {
    "File": ["http://localhost:3000/api/system/file/download/xxx?filename=file.docx"]
  }
}
```

因此前端不能直接把 `formInputResult` 当成 AI 文本渲染，也不能只展示在响应详情里；需要把它转换并回填到交互表单的 `inputForm[].value`。

## 根因分析

### 1. 表单控件本身不是根因

以 fileSelect 为例，`FileSelector` 接收以下两类值都能渲染文件列表：

```ts
[{ name: 'file.docx', url: 'https://example.com/file.docx' }]
```

或：

```ts
[{ name: 'file.docx', key: 'chat/xxx/file.docx' }]
```

页面能看到禁用上传区域，说明：

1. 交互节点已经渲染出来。
2. `submitted=true` 已经生效。
3. 真正缺失的是交互节点 `inputForm[].value`；fileSelect 只是表现为传给 `FileSelector` 的 value 为空。

### 2. 恢复事件没有天然回填表单值

恢复流的 `flowNodeResponse` 会进入 `generatingMessage`，并追加到当前 AI 记录的 `responseData`。但原始实现只保存节点响应详情，没有把 `formInputResult.File` 回填到已提交的 `interactive.params.inputForm[].value`。

结果：交互节点还在，但字段值仍是空数组。

### 3. completed records 会覆盖当前恢复态

流恢复结束时，后端会返回 `completedChat.records`，前端用它覆盖当前 `chatRecords`。

这个覆盖有两个风险：

1. 恢复过程中刚回填到交互节点的字段值，被 completed records 里空的 `inputForm.value` 覆盖。
2. 当前已回填的交互节点和 completed records 里的交互节点 `dataId` 不一定完全一致。只按 `dataId` 合并可能漏掉。

因此需要在 completed 覆盖阶段保留 submitted interactive 中已经恢复出来的字段值。

### 4. 仍需要渲染层兜底

即使状态层做了回填和 merge，仍可能出现中间态或边界情况：

1. `responseData` 已经有 `formInputResult`。
2. `interactive.params.inputForm[].value` 被后续 records 替换成空。
3. 渲染表单时只看 `inputForm.value`，导致已提交表单值仍然不显示。

所以渲染表单时也应当能从同一条 AI 消息的 `responseData.formInputResult` 还原字段默认值。

## 修复方案

本次修复不是四个备选方案，而是一个组合修复。最终采用：

```text
恢复事件回填 + completed 覆盖保护 + 过期交互去重 + 渲染层兜底
```

四个修复点分别覆盖不同阶段的问题：

1. 恢复流事件到达时，把节点结果写回表单交互节点。
2. 恢复完成 records 覆盖时，保留已经写回的表单值。
3. 恢复流重复推送交互节点时，避免过期未提交交互覆盖已提交交互。
4. 渲染表单时，如果状态值仍为空，从同条消息的 `responseData.formInputResult` 做最后兜底。

### 修复点一：恢复事件回填 submitted 表单交互节点

位置：

- `projects/app/src/components/core/chat/ChatContainer/ChatBox/index.tsx`
- `projects/app/src/components/core/chat/ChatContainer/ChatBox/utils.ts`

逻辑：

1. `generatingMessage` 收到 `flowNodeResponse`。
2. 如果 `nodeResponse.formInputResult` 存在，调用 `refreshSubmittedFormInteractiveValues`。
3. 在当前 `chatRecords` 里寻找已提交的 `userInput` 交互节点。
4. 匹配方式：
   - 优先用 `interactive.entryNodeIds.includes(nodeResponse.nodeId)`。
   - 如果只有一个 submitted 表单交互节点，并且字段 key 能匹配，也允许兜底匹配。
5. 对 `fileSelect` 字段，把 `formInputResult.File: string[]` 转成：

```ts
[
  {
    name: 'file.docx',
    url: 'http://localhost:3000/api/system/file/download/xxx?filename=file.docx'
  }
]
```

转换复用 `normalizeFormInputResultFile`，保证文件名从 `filename` query 或 URL path 中取。

### 修复点二：completed records 覆盖时保留已回填交互值

位置：

- `projects/app/src/components/core/chat/ChatContainer/ChatBox/utils.ts`

逻辑：

1. `mergeResumeCompletedChatRecords` 建立当前 AI record map。
2. 对 completed records 的 AI 消息做合并：
   - 保留恢复过程中 replay 出来的 `responseData`。
   - 保留当前 submitted `userInput` 交互节点里的 `inputForm.value`。
3. 如果 completed record 能按 `dataId` 找到当前 record，则使用对应 current values。
4. 如果按 `dataId` 找不到，则从当前所有 AI records 中寻找 submitted interactive，并按交互身份匹配。

交互身份匹配规则：

```ts
type 相同 &&
(usageId 相同 || entryNodeIds 数组相同)
```

这个逻辑覆盖 completed records 中交互节点 `dataId` 变化的情况。

### 修复点三：跳过过期的未提交恢复交互

位置：

- `projects/app/src/components/core/chat/ChatContainer/ChatBox/utils.ts`

逻辑：

如果当前已经有同一个 submitted `userInput` 交互节点，恢复流里又来了同一个未提交 interactive，不再 append。

作用：

1. 避免恢复过程中重新插入一个空表单。
2. 避免 submitted 表单被未提交表单视觉上覆盖。

### 修复点四：渲染层从 `responseData.formInputResult` 兜底恢复表单值

位置：

- `projects/app/src/components/core/chat/ChatContainer/ChatBox/components/ChatItem.tsx`
- `projects/app/src/components/core/chat/components/AIResponseBox/index.tsx`
- `projects/app/src/components/core/chat/components/AIResponseBox/RenderUserFormInteractive.tsx`

调用链：

```text
ChatItem
  -> AIContentCard
    -> AIResponseBox
      -> RenderUserFormInteractive
        -> FormInputComponent
          -> InputRender
            -> FileSelector
```

新增传参：

1. `ChatItem` 把当前 AI 消息的 `chat.responseData` 传给 `AIContentCard`。
2. `AIContentCard` 传给 `AIResponseBox`。
3. `AIResponseBox` 在渲染 `userInput` 时传给 `RenderUserFormInteractive`。

`RenderUserFormInteractive` 生成 `defaultValues` 时：

1. 从 `responseData` 里倒序查找带 `formInputResult` 的节点响应。
2. 优先匹配 `nodeId` 与 `interactive.entryNodeIds`。
3. 取同名字段，例如 `File`。
4. 如果 `formInputResult` 中存在该字段，则优先使用该字段值作为 submitted 表单的渲染默认值。
5. 对普通输入、选择、数字等字段，直接使用 `formInputResult[key]`。
6. 对 `fileSelect` 字段，额外把 URL 数组归一化为 `FileSelector` 可渲染的 `{ name, url }[]`。

作用：

即使状态层 `inputForm.value` 被 completed records 覆盖为空，只要同一条 AI 消息还带有 `responseData.formInputResult`，表单节点仍然能渲染出已提交表单值。

## 非目标

本 PR 不做以下事情：

1. 不把 `formInputResult` 渲染到 AI 普通文字回复气泡里。
2. 不改变 `FileSelector` 的基础交互行为。
3. 不改变后端 `formInputResult` 的输出结构。
4. 不迁移历史数据。
5. 不处理非 `userInput` 类型的假想表单交互类型；当前类型定义中不存在 `agentPlanAskUserForm`。

## 影响文件

### 全部改动文件清单

代码改动：

- `projects/app/src/components/core/chat/ChatContainer/ChatBox/components/ChatItem.tsx`
  - 把当前 AI 消息的 `chat.responseData` 传入 AI 响应渲染链路。
- `projects/app/src/components/core/chat/components/AIResponseBox/index.tsx`
  - 接收并继续下传 `responseData` 给表单交互组件。
- `projects/app/src/components/core/chat/components/AIResponseBox/RenderUserFormInteractive.tsx`
  - 表单渲染时，从 `responseData.formInputResult` 兜底恢复 submitted 表单字段值；`fileSelect` 字段额外归一化为文件列表渲染结构。
- `projects/app/src/components/core/chat/ChatContainer/ChatBox/utils.ts`
  - 处理恢复流回填、completed records 覆盖合并、submitted interactive 保留、过期 interactive 去重。
- `projects/app/src/components/core/chat/components/FormInputResult.tsx`
  - 提供 `normalizeFormInputResultFile`，并支持在响应详情里展示表单输入文件结果。
- `projects/app/src/components/core/chat/components/WholeResponseModal.tsx`
  - 在响应详情弹窗里挂载 `FormInputResult` 展示 `formInputResult`。

测试改动：

- `projects/app/test/components/core/chat/ChatContainer/ChatBox/utils.test.ts`
  - 增加恢复回填、completed 覆盖保留、`dataId` 变化保留等测试。
- `projects/app/test/components/core/chat/components/FormInputResult.test.ts`
  - 测试签名 URL 文件名解析和显式文件名保留。
- `projects/app/test/components/core/app/FileSelector/utils.test.ts`
  - 覆盖文件选择器值清洗、URL 文件保留等能力。

设计文档：

- `.agents/design/bug/stream-resume-form-input-file-list.md`
  - 新增本次问题的设计说明、根因、方案、测试和 TODO。

### 数据合并与恢复工具

- `projects/app/src/components/core/chat/ChatContainer/ChatBox/utils.ts`

职责：

1. `refreshSubmittedFormInteractiveValues`：把 `formInputResult` 回填到 submitted 表单节点。
2. `mergeResumeCompletedChatRecords`：completed records 覆盖时保留已恢复的 submitted interactive values。
3. `shouldAppendResumeInteractive`：避免追加过期未提交交互。

### 聊天项渲染链路

- `projects/app/src/components/core/chat/ChatContainer/ChatBox/components/ChatItem.tsx`
- `projects/app/src/components/core/chat/components/AIResponseBox/index.tsx`
- `projects/app/src/components/core/chat/components/AIResponseBox/RenderUserFormInteractive.tsx`

职责：

1. 把 `responseData` 从 chat item 下传到表单交互渲染组件。
2. 在渲染表单默认值时，从 `responseData.formInputResult` 兜底恢复表单字段值。

### 文件结果展示辅助

- `projects/app/src/components/core/chat/components/FormInputResult.tsx`

职责：

1. 提供 `normalizeFormInputResultFile`。
2. 详情弹窗中展示 `formInputResult` 文件。

注意：详情弹窗展示不是本 bug 的核心修复，核心修复是交互节点内已提交表单值恢复，文件列表只是 fileSelect 字段的展示结果。

### 测试

- `projects/app/test/components/core/chat/ChatContainer/ChatBox/utils.test.ts`
- `projects/app/test/components/core/chat/components/FormInputResult.test.ts`
- `projects/app/test/components/core/app/FileSelector/utils.test.ts`

## 测试覆盖

已覆盖场景：

1. `flowNodeResponse.formInputResult.File` 能回填到 submitted `userInput` 的 `inputForm[].value`。
2. `nodeId` 不匹配但只有一个 submitted 表单交互节点时，可以按字段 key 兜底回填。
3. completed records 覆盖时保留已恢复的 submitted interactive 字段值。
4. completed records 中交互节点 `dataId` 变化时，仍能按交互身份保留字段值。
5. `FormInputResult` 能从签名 URL 的 `filename` query 中解析文件名。
6. `FileSelector` 的值清洗函数能保留可渲染 URL 字段值。

局部测试命令：

```bash
source ~/.zshrc >/dev/null 2>&1; pnpm --filter @fastgpt/app test test/components/core/chat/ChatContainer/ChatBox/utils.test.ts test/components/core/chat/components/FormInputResult.test.ts test/components/core/app/FileSelector/utils.test.ts
```

当前结果：

```text
Test Files  3 passed
Tests       32 passed
```

## 已知验证情况

1. 用户本地验证：恢复流开始后，表单输入节点内文件列表已能正常展示。
2. touched files eslint 无 error，仅剩当前文件已有 warning：

```text
projects/app/src/components/core/chat/ChatContainer/ChatBox/utils.ts
  'error' is defined but never used
```

3. `@fastgpt/app typecheck` 在当前分支仍有无关类型错误，集中在：
   - `ChatItem.tsx` 的 `stepId/stepTitle` 类型声明缺失。
   - `ResponseTags.tsx` / `RenderResponseDetail.tsx` 缺 `chatTime` 参数。
   - `WholeResponseModal.tsx` 中 `queryExtensionResult` 类型名与当前 schema 不一致。

这些不是本修复新增逻辑引入的问题。

## TODO

- [x] 确认恢复流 `flowNodeResponse` 会进入前端 `generatingMessage`。
- [x] 回填 `formInputResult` 到 submitted 表单交互节点。
- [x] completed records 覆盖时保留恢复出的表单字段值。
- [x] 处理 completed 交互节点 `dataId` 变化场景。
- [x] 渲染层从 `responseData.formInputResult` 兜底恢复表单值。
- [x] 保证已提交表单值展示在用户交互表单节点内，而不是 AI 文本回复气泡内。
- [x] 增加局部测试。
- [x] 用户完成手动验证。
- [ ] 用户确认后提交本地未提交改动并推送到 draft PR。
