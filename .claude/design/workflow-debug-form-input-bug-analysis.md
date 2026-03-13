# 工作流调试弹窗表单输入内容清空问题分析

## 问题描述

**位置**: 工作流画布右侧的 ChatTest 调试弹窗（运行测试对话窗口）
**前提**: 包含表单输入节点（用户可输入内容）
**现象**: 用户填写内容后提交，工作流继续运行。关闭调试弹窗后再打开，历史记录中的表单内容被清空
**预期**: 内容不应被清空

## 数据流分析

### 正常流程

1. **用户提交表单** → `AIResponseBox.tsx` 中的 `RenderUserFormInteractive` 组件
2. **调用 handleFormSubmit** → 将表单数据 JSON 化并通过 `onSendPrompt` 发送
3. **发送到后端** → `/api/core/chat/chatTest` 接收请求
4. **工作流执行** → `dispatchWorkFlow` 处理表单输入节点
5. **保存聊天记录** → 调用 `updateInteractiveChat` 更新数据库
6. **更新 interactive** → `saveChat.ts` 中更新 `inputForm[].value`
7. **关闭弹窗** → 调试状态保存
8. **重新打开弹窗** → 从数据库读取聊天记录
9. **渲染表单** → `RenderUserFormInteractive` 使用 `item.value ?? item.defaultValue`

### 关键代码位置

#### 1. 前端表单提交 (`AIResponseBox.tsx`)

```typescript
// 第 231-237 行：计算 defaultValues
const defaultValues = useMemo(() => {
  return interactive.params.inputForm?.reduce((acc: Record<string, any>, item, index) => {
    // 使用 ?? 运算符，只有 undefined 或 null 时才使用 defaultValue
    acc[item.key] = item.value ?? item.defaultValue;
    return acc;
  }, {});
}, [interactive]);
```

#### 2. 后端保存逻辑 (`saveChat.ts`)

```typescript
// 第 495-525 行：更新 inputForm 值
if (
  (finalInteractive.type === 'userInput' || finalInteractive.type === 'agentPlanAskUserForm') &&
  typeof parsedUserInteractiveVal === 'object'
) {
  finalInteractive.params.inputForm = finalInteractive.params.inputForm.map((item) => {
    const itemValue = parsedUserInteractiveVal[item.key];
    if (itemValue === undefined) return item;

    return {
      ...item,
      value: itemValue  // ✅ 保存用户输入的值
    };
  });
  finalInteractive.params.submitted = true;  // ✅ 标记为已提交
}

// 第 533 行：将更新后的 interactive 赋值给最后一条消息
chatItem.value[chatItem.value.length - 1].interactive = interactive;
```

#### 3. API 调用 (`chatTest.ts`)

```typescript
// 第 263-267 行：根据是否有 interactive 选择保存方式
if (interactive) {
  await updateInteractiveChat({
    interactive,
    ...params
  });
} else {
  await pushChatRecords(params);
}
```

## 问题排查

需要验证以下几点：

1. **后端是否正确保存了 `inputForm[].value`？**
   - 检查数据库中的 `chat_items` 集合
   - 查看 `value` 字段中的 `interactive.params.inputForm` 是否包含用户提交的值

2. **前端是否正确读取了保存的值？**
   - 检查 `getChatRecords` API 返回的数据
   - 查看 `interactive.params.inputForm[].value` 是否存在

3. **是否有其他地方覆盖了 `interactive` 数据？**
   - 检查是否有缓存或状态管理覆盖了数据库的值

## 调试步骤

### 1. 检查数据库保存

在 `saveChat.ts` 的 `updateInteractiveChat` 函数中添加日志：

```typescript
// 第 498 行之后
finalInteractive.params.inputForm = finalInteractive.params.inputForm.map((item) => {
  const itemValue = parsedUserInteractiveVal[item.key];
  if (itemValue === undefined) return item;

  console.log('Saving form value:', { key: item.key, value: itemValue });  // 添加日志

  return {
    ...item,
    value: itemValue
  };
});
```

### 2. 检查 API 返回数据

在 `AIResponseBox.tsx` 中添加日志：

```typescript
// 第 231 行之后
const defaultValues = useMemo(() => {
  console.log('Interactive data:', interactive);  // 添加日志
  console.log('InputForm:', interactive.params.inputForm);  // 添加日志

  return interactive.params.inputForm?.reduce((acc: Record<string, any>, item, index) => {
    console.log('Form item:', { key: item.key, value: item.value, defaultValue: item.defaultValue });  // 添加日志
    acc[item.key] = item.value ?? item.defaultValue;
    return acc;
  }, {});
}, [interactive]);
```

### 3. 检查数据库记录

直接查询 MongoDB：

```javascript
db.chat_items.find({
  chatId: "your_chat_id",
  obj: "AI"
}).sort({ _id: -1 }).limit(1)
```

查看返回的 `value` 字段中的 `interactive.params.inputForm` 是否包含 `value` 属性。

## 可能的原因

### 原因 1: 数据库未正确保存

如果 `updateInteractiveChat` 没有被正确调用，或者保存失败，数据库中就不会有用户提交的值。

**验证方法**: 检查数据库记录

### 原因 2: API 返回数据不完整

如果 `getChatRecords` API 没有返回完整的 `interactive` 数据，前端就无法显示用户提交的值。

**验证方法**: 检查 API 响应

### 原因 3: 前端状态管理问题

如果前端有缓存或状态管理覆盖了数据库的值，也会导致表单内容被清空。

**验证方法**: 检查 React 组件的 props 和 state

## 临时解决方案

如果问题是由于数据库未正确保存导致的，可以使用 `sessionStorage` 作为临时方案：

```typescript
// 在 AIResponseBox.tsx 的 defaultValues 计算中
const defaultValues = useMemo(() => {
  // 尝试从 sessionStorage 恢复数据
  let savedData: Record<string, any> = {};
  if (typeof window !== 'undefined') {
    try {
      const saved = sessionStorage.getItem(`interactiveForm_${chatItemDataId}`);
      if (saved) {
        savedData = JSON.parse(saved);
      }
    } catch (error) {
      console.warn('Failed to parse saved form data:', error);
    }
  }

  return interactive.params.inputForm?.reduce((acc: Record<string, any>, item, index) => {
    // 优先使用 item.value，其次使用 sessionStorage，最后使用 defaultValue
    acc[item.key] = item.value ?? savedData[item.key] ?? item.defaultValue;
    return acc;
  }, {});
}, [interactive, chatItemDataId]);
```

但这只是临时方案，根本问题还是需要确保数据库正确保存了用户提交的值。

## 下一步

1. 添加日志验证数据流
2. 检查数据库记录
3. 根据调试结果确定具体原因
4. 实施修复方案
