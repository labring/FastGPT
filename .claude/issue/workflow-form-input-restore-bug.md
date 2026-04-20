# 工作流表单输入节点重新打开预览页面后表单内容恢复默认值问题

## 问题描述

在工作流中添加表单输入节点后,在运行预览页面进行对话测试时:

1. 触发表单输入交互
2. 正常填写表单并提交
3. 任务继续运行成功
4. **关闭预览页面**
5. **重新打开预览页面**
6. **问题**: 表单内容被恢复为默认值,而不是用户之前填写的值

## 根本原因分析

### 1. 数据结构设计

根据类型定义 `packages/global/core/workflow/template/system/interactive/type.ts`:

```typescript
export type UserInputFormItemType = {
  key: string;
  label: string;
  value: any;              // 用户填写的值
  defaultValue?: any;      // 默认值
  required: boolean;
  // ...
}

export type UserInputInteractive = {
  type: 'userInput';
  params: {
    description: string;
    inputForm: UserInputFormItemType[];
    submitted?: boolean;   // 是否已提交
  }
}
```

**设计意图**:
- `value` 字段用于存储用户填写的值
- `submitted` 标记表单是否已提交
- 这些数据应该保存在聊天记录的 `interactive` 对象中

### 2. 实际实现的问题

#### 问题 1: sessionStorage 的冗余使用

在 `AIResponseBox.tsx` 的 `RenderUserFormInteractive` 组件中(第 248-271 行):

```typescript
if (typeof window !== 'undefined') {
  const dataToSave = { ...data };
  // ... 处理文件数据
  sessionStorage.setItem(`interactiveForm_${chatItemDataId}`, JSON.stringify(dataToSave));
}
```

**问题**:
- 表单提交时保存到 `sessionStorage`,但**从未读取**
- 通过全局搜索确认: 只有写入,没有任何读取操作
- 这是一个**无效的代码**,增加了复杂度但没有实际作用

#### 问题 2: defaultValues 计算逻辑不完整

在 `RenderUserFormInteractive` 组件中(第 231-237 行):

```typescript
const defaultValues = useMemo(() => {
  return interactive.params.inputForm?.reduce((acc: Record<string, any>, item) => {
    acc[item.key] = item.value ?? item.defaultValue;
    return acc;
  }, {});
}, [interactive]);
```

**逻辑**: `item.value` 优先于 `item.defaultValue`

**问题**: 当页面重新打开时,`interactive.params` 从聊天记录中恢复,但:
- 如果后端没有正确保存用户填写的 `value` 到 `interactive.params.inputForm`
- 或者前端没有正确更新 `interactive` 对象
- 就会导致 `item.value` 为空,回退到 `defaultValue`

### 3. 数据流分析

**正常流程(应该是这样)**:
```
用户填写表单
  → 提交时发送到后端
  → 后端更新 interactive.params.inputForm[].value
  → 后端保存到聊天记录
  → 关闭预览页面
  → 重新打开预览页面
  → 从聊天记录恢复 interactive
  → defaultValues 从 item.value 读取
  → 表单显示用户填写的值 ✅
```

**实际流程(出问题了)**:
```
用户填写表单
  → 提交时发送到后端
  → 后端处理但可能没有更新 interactive.params.inputForm[].value
  → 或者前端没有正确更新本地的 interactive 对象
  → 关闭预览页面
  → 重新打开预览页面
  → 从聊天记录恢复 interactive
  → interactive.params.inputForm[].value 为空
  → defaultValues 回退到 item.defaultValue
  → 表单显示默认值 ❌
```

### 4. 核心问题定位 ✅

**问题确认**: 前端在表单提交后,只更新了 `submitted: true`,但**没有更新 `inputForm[].value`**

在 `projects/app/src/components/core/chat/ChatContainer/ChatBox/utils.ts` 的 `rewriteHistoriesByInteractiveResponse` 函数中(第 154-168 行):

```typescript
if (
  finalInteractive.type === 'userInput' ||
  finalInteractive.type === 'agentPlanAskUserForm'
) {
  return {
    ...val,
    interactive: {
      ...finalInteractive,
      params: {
        ...finalInteractive.params,
        submitted: true  // ✅ 只设置了 submitted
        // ❌ 但没有更新 inputForm[].value
      }
    }
  };
}
```

**分析**:
- 用户提交的表单数据在 `interactiveVal` 参数中(JSON 字符串格式)
- 函数只是简单地标记 `submitted: true`
- 没有解析 `interactiveVal` 并更新 `params.inputForm[].value`
- 导致重新打开页面时,`item.value` 仍然是空的,回退到 `defaultValue`

## 重要发现: sessionStorage 的设计意图

经过深入分析,发现 `sessionStorage` 的使用**可能有其合理性**:

### chatItemDataId 的含义

- `chatItemDataId` 是**每条聊天消息的唯一标识** (不是 chatId)
- 一个对话(chatId)中可能有**多条消息**,每条消息有不同的 `dataId`
- 一个工作流中可能有**多个表单输入节点**,每个节点触发时会创建新的消息

### 可能的场景

**场景 1: 同一对话中多个表单输入**
```
对话开始
  → 触发表单输入节点 A (dataId: xxx-1)
  → 用户填写表单 A
  → 提交,继续执行
  → 触发表单输入节点 B (dataId: xxx-2)
  → 用户填写表单 B
  → 关闭预览页面
  → 重新打开
  → 需要恢复两个表单的数据
```

**场景 2: 表单数据的临时性**
- 用户可能在填写过程中关闭页面(未提交)
- sessionStorage 可以保存**未提交的草稿**
- 重新打开时恢复草稿,避免用户重新填写

### 为什么后端保存不够?

1. **未提交的数据**: 用户填写了一半但未提交,后端没有这些数据
2. **多个表单实例**: 同一对话中可能有多个表单输入节点,需要分别保存
3. **临时状态**: 表单的临时编辑状态(如文件上传中)不应该保存到后端

## 影响范围

- **影响文件**:
  - `projects/app/src/components/core/chat/components/AIResponseBox.tsx`
  - `projects/app/src/components/core/chat/ChatContainer/ChatBox/utils.ts`
- **影响组件**: `RenderUserFormInteractive`, `rewriteHistoriesByInteractiveResponse`
- **影响场景**:
  - 所有使用表单输入节点的工作流
  - 在预览页面关闭后重新打开时
  - 同一对话中有多个表单输入节点时

## 解决方案(修正版)

### 方案 1: 双重保存机制 - sessionStorage + interactive.params (推荐)

结合两种机制的优点:
- **sessionStorage**: 保存未提交的草稿和临时状态
- **interactive.params**: 保存已提交的最终数据

#### 步骤 1: 修复 `rewriteHistoriesByInteractiveResponse` (已提交数据)

**文件**: `projects/app/src/components/core/chat/ChatContainer/ChatBox/utils.ts`

```typescript
if (
  finalInteractive.type === 'userInput' ||
  finalInteractive.type === 'agentPlanAskUserForm'
) {
  // 解析用户提交的表单数据
  let submittedData: Record<string, any> = {};
  try {
    submittedData = JSON.parse(interactiveVal);
  } catch (error) {
    console.warn('Failed to parse form input data', error);
  }

  // 更新 inputForm 中的 value
  const updatedInputForm = finalInteractive.params.inputForm.map((item) => ({
    ...item,
    value: submittedData[item.key] ?? item.value ?? item.defaultValue
  }));

  return {
    ...val,
    interactive: {
      ...finalInteractive,
      params: {
        ...finalInteractive.params,
        inputForm: updatedInputForm,
        submitted: true
      }
    }
  };
}
```

#### 步骤 2: 修复 `defaultValues` 计算逻辑 (恢复草稿)

**文件**: `projects/app/src/components/core/chat/components/AIResponseBox.tsx`

```typescript
const defaultValues = useMemo(() => {
  // 1. 优先从 sessionStorage 恢复数据(包括未提交的草稿)
  let savedData: Record<string, any> | null = null;
  if (typeof window !== 'undefined') {
    try {
      const saved = sessionStorage.getItem(`interactiveForm_${chatItemDataId}`);
      if (saved) {
        savedData = JSON.parse(saved);
      }
    } catch (error) {
      console.warn('Failed to restore form data from sessionStorage', error);
    }
  }

  // 2. 构建 defaultValues
  // 优先级: sessionStorage(草稿) > item.value(已提交) > item.defaultValue(默认)
  return interactive.params.inputForm?.reduce((acc: Record<string, any>, item) => {
    if (savedData && item.key in savedData) {
      // 优先使用 sessionStorage 中的数据(可能是未提交的草稿)
      acc[item.key] = savedData[item.key];
    } else {
      // 否则使用 item.value(已提交的数据) 或 defaultValue
      acc[item.key] = item.value ?? item.defaultValue;
    }
    return acc;
  }, {});
}, [interactive, chatItemDataId]);
```

#### 步骤 3: 清理 sessionStorage (可选优化)

在表单提交成功后,清理对应的 sessionStorage:

```typescript
const handleFormSubmit = useCallback(
  (data: Record<string, any>) => {
    const finalData: Record<string, any> = {};
    interactive.params.inputForm?.forEach((item) => {
      if (item.key in data) {
        finalData[item.key] = data[item.key];
      }
    });

    // 保存到 sessionStorage (用于页面关闭后恢复)
    if (typeof window !== 'undefined') {
      const dataToSave = { ...data };
      // ... 处理文件数据
      sessionStorage.setItem(`interactiveForm_${chatItemDataId}`, JSON.stringify(dataToSave));
    }

    onSendPrompt(JSON.stringify(finalData));

    // 可选: 提交成功后清理 sessionStorage
    // setTimeout(() => {
    //   sessionStorage.removeItem(`interactiveForm_${chatItemDataId}`);
    // }, 1000);
  },
  [chatItemDataId, interactive.params.inputForm]
);
```

**优点**:
- 保留 sessionStorage 的草稿保存功能
- 同时修复已提交数据的持久化问题
- 支持多个表单输入节点的场景
- 向后兼容

**缺点**:
- 需要修改两个地方
- 逻辑稍微复杂一些

### 方案 2: 仅修复 interactive.params (简化方案)

如果不需要草稿保存功能,可以只修复 `rewriteHistoriesByInteractiveResponse`,删除 sessionStorage 相关代码。

**优点**: 简单,代码更清晰
**缺点**: 失去草稿保存功能

## 推荐实施方案

**推荐方案 1**,原因:
1. 保留了 sessionStorage 的设计意图(草稿保存)
2. 修复了已提交数据的持久化问题
3. 支持复杂场景(多个表单、未提交草稿)
4. 向后兼容,不破坏现有功能

## 相关文件

- `projects/app/src/components/core/chat/components/AIResponseBox.tsx` - 表单渲染和提交逻辑
- `projects/app/src/components/core/chat/components/Interactive/InteractiveComponents.tsx` - 表单输入组件
- `projects/app/src/web/core/chat/context/chatItemContext.tsx` - Chat 上下文管理
- `packages/service/core/workflow/dispatch/interactive/formInput.ts` - 后端表单输入处理

## 测试建议

修复后需要测试以下场景:

1. **基本场景**: 填写表单 → 提交 → 关闭预览 → 重新打开 → 验证表单内容保持
2. **多次提交**: 填写 → 提交 → 修改 → 再次提交 → 关闭 → 重新打开 → 验证最后一次提交的内容
3. **文件上传**: 包含文件选择的表单,验证文件信息正确恢复
4. **必填项验证**: 验证必填项的验证逻辑不受影响
5. **多个表单**: 同一对话中多个表单输入节点,验证各自独立保存和恢复
6. **清空对话**: 点击"重新开始"后,验证表单数据被正确清空
