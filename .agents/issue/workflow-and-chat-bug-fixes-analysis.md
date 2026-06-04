# 工作流与聊天预览相关 Bug 修复分析文档

## Bug 1: 自定义文件扩展类型下，流程开始节点缺少“文件链接”变量

### 漏洞概述

系统配置开启文件上传后，如果只勾选“自定义文件扩展类型”，流程开始节点不会暴露“文件链接”变量，后续节点无法引用上传文件链接。

### 主要问题

开始节点和 workflow 输入 schema 的“可上传文件”判断逻辑仍停留在旧实现，只识别：

- `canSelectFile`
- `canSelectImg`

没有将以下配置纳入统一判断：

- `canSelectVideo`
- `canSelectAudio`
- `canSelectCustomFileExtension`

### 受影响文件

- `projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodeSystemConfig.tsx`
- `packages/global/core/workflow/utils.ts`
- `test/cases/global/core/workflow/utils.test.ts`

### 问题代码

```typescript
const canUploadFiles = e.canSelectFile || e.canSelectImg;
```

```typescript
...(chatConfig?.fileSelectConfig?.canSelectFile || chatConfig?.fileSelectConfig?.canSelectImg
  ? [Input_Template_File_Link]
  : []),
```

### 修改代码

```typescript
const canUploadFiles =
  e.canSelectFile ||
  e.canSelectImg ||
  e.canSelectVideo ||
  e.canSelectAudio ||
  e.canSelectCustomFileExtension;
```

```typescript
...(chatConfig?.fileSelectConfig?.canSelectFile ||
chatConfig?.fileSelectConfig?.canSelectImg ||
chatConfig?.fileSelectConfig?.canSelectVideo ||
chatConfig?.fileSelectConfig?.canSelectAudio ||
chatConfig?.fileSelectConfig?.canSelectCustomFileExtension
  ? [Input_Template_File_Link]
  : []),
```

---

## Bug 2: 判断器选择 array 类型变量后，没有条件可选

### 漏洞概述

在判断器中选择 array 类型变量时，条件下拉为空，无法配置数组相关判断逻辑。

### 主要问题

前端条件映射遗漏了 `WorkflowIOValueTypeEnum.arrayAny`，导致泛数组类型没有进入 `arrayConditionList` 分支。

### 受影响文件

- `projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/NodeIfElse/ListItem.tsx`

### 问题代码

```typescript
if (
  valueType === WorkflowIOValueTypeEnum.chatHistory ||
  valueType === WorkflowIOValueTypeEnum.datasetQuote ||
  valueType === WorkflowIOValueTypeEnum.dynamic ||
  valueType === WorkflowIOValueTypeEnum.selectApp ||
  valueType === WorkflowIOValueTypeEnum.arrayBoolean ||
  valueType === WorkflowIOValueTypeEnum.arrayNumber ||
  valueType === WorkflowIOValueTypeEnum.arrayObject ||
  valueType === WorkflowIOValueTypeEnum.arrayString
)
  return arrayConditionList;
```

### 修改代码

```typescript
if (
  valueType === WorkflowIOValueTypeEnum.chatHistory ||
  valueType === WorkflowIOValueTypeEnum.datasetQuote ||
  valueType === WorkflowIOValueTypeEnum.dynamic ||
  valueType === WorkflowIOValueTypeEnum.selectApp ||
  valueType === WorkflowIOValueTypeEnum.arrayAny ||
  valueType === WorkflowIOValueTypeEnum.arrayBoolean ||
  valueType === WorkflowIOValueTypeEnum.arrayNumber ||
  valueType === WorkflowIOValueTypeEnum.arrayObject ||
  valueType === WorkflowIOValueTypeEnum.arrayString
)
  return arrayConditionList;
```

---

## Bug 3: 系统工具集不应显示版本信息

### 漏洞概述

系统工具集卡片错误显示“保持最新版本”等版本 UI，但系统工具集本身不应展示版本选择能力。

### 主要问题

节点卡片的版本显示条件排除了 `mcpToolSet`、`mcpTool`、`httpToolSet`，但漏掉了 `systemToolSet`，导致系统工具集也进入了版本渲染逻辑。

### 受影响文件

- `projects/app/src/pageComponents/app/detail/WorkflowComponents/Flow/nodes/render/NodeCard.tsx`

### 问题代码

```typescript
if (
  isAppNode &&
  (node.toolConfig?.mcpToolSet || node.toolConfig?.mcpTool || node?.toolConfig?.httpToolSet)
)
  return false;
```

### 修改代码

```typescript
if (
  isAppNode &&
  (
    node.toolConfig?.mcpToolSet ||
    node.toolConfig?.mcpTool ||
    node?.toolConfig?.httpToolSet ||
    node?.toolConfig?.systemToolSet
  )
)
  return false;
```

---

## Bug 4: 用户输入中的 `*` 被按 Markdown 强调语法渲染

### 漏洞概述

在运行预览和相关聊天场景中，用户输入 `1*1=1, 2*2=4` 后，消息会被按 Markdown 语法渲染，导致 `*` 不按原样显示。

### 主要问题

用户消息展示层直接复用了 Markdown 渲染组件：

- 主聊天容器中的人类消息
- HelperBot 中的人类消息

因此用户输入里的 `*`、`#`、`` ` `` 等字符会被 Markdown 解释。

### 受影响文件

- `projects/app/src/components/core/chat/ChatContainer/ChatBox/components/ChatItem.tsx`
- `projects/app/src/components/core/chat/HelperBot/components/HumanItem.tsx`

### 问题代码

```typescript
{text && <Markdown source={text} />}
```

### 修改代码

```typescript
{text && (
  <Box fontSize={'inherit'} color={'inherit'} whiteSpace={'pre-wrap'} wordBreak={'break-word'}>
    {text}
  </Box>
)}
```

```typescript
{text && <Box whiteSpace={'pre-wrap'} wordBreak={'break-word'}>{text}</Box>}
```
