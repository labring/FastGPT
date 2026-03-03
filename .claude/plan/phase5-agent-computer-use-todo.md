# Phase 5: Agent 模式支持 Computer Use - TODO 清单

## 概述

为 Agent 简易模式（`/projects/app/src/pageComponents/app/detail/Edit/ChatAgent/EditForm.tsx`）添加虚拟机（Sandbox）支持，使其能够调用 `sandbox_shell` 工具。

**产品名称**：
- 中文：虚拟机
- 繁体：虛擬機
- 英文：Sandbox

**核心调度逻辑**：`/packages/service/core/workflow/dispatch/ai/agent/index.ts`

---

## 任务清单

### 1. 前端：Agent 编辑表单添加虚拟机（Sandbox）开关

**文件**：`projects/app/src/pageComponents/app/detail/Edit/ChatAgent/EditForm.tsx`

**改动**：
- [ ] 在 AI Settings 区块（约第 128-200 行）添加虚拟机开关
- [ ] 位置：在 Prompt Editor 之后，Tool Choice 之前
- [ ] 使用 Switch 组件，与 `appForm.aiSettings` 中的新字段 `useComputer` 绑定
- [ ] 国际化 key 已存在：`app:use_computer` / `app:use_computer_desc`
  - 中文：启用虚拟机
  - 繁体：啟用虛擬機
  - 英文：Enable Sandbox

**实现示例**：
```tsx
{/* Sandbox (虚拟机) */}
<Flex alignItems={'center'} mt={4}>
  <FormLabel flex={1}>{t('app:use_computer')}</FormLabel>
  <Switch
    isChecked={appForm.aiSettings.useComputer}
    onChange={(e) => {
      setAppForm((state) => ({
        ...state,
        aiSettings: {
          ...state.aiSettings,
          useComputer: e.target.checked
        }
      }));
    }}
  />
</Flex>
{appForm.aiSettings.useComputer && (
  <Box mt={2} fontSize={'sm'} color={'myGray.600'}>
    {t('app:use_computer_desc')}
  </Box>
)}
```

**预计工作量**：~20 行代码

---

### 2. 类型定义：useComputer 字段已存在 ✅

**文件**：`packages/global/core/app/formEdit/type.ts`

**状态**：
- ✅ 已在第 29 行添加：`[NodeInputKeyEnum.useComputer]: z.boolean().default(false).optional()`
- ✅ 类型定义完整，无需改动

**无需改动**：类型定义已在 Phase 2 中添加

---

### 3. 后端：Agent 调度逻辑读取 useComputer

**文件**：`packages/service/core/workflow/dispatch/ai/agent/index.ts`

**改动位置**：约第 40-52 行（`DispatchAgentModuleProps` 类型定义）

**改动内容**：
- [ ] 在 `DispatchAgentModuleProps` 类型中添加 `[NodeInputKeyEnum.useComputer]?: boolean`
- [ ] 在 `dispatchRunAgent` 函数的 `params` 解构中读取 `useComputer`（约第 80-90 行）
- [ ] 将 `useComputer` 传递给 `getSubapps()` 调用（约第 158-167 行）

**实现示例**：
```typescript
// 类型定义
export type DispatchAgentModuleProps = ModuleDispatchProps<{
  // ...现有字段...
  [NodeInputKeyEnum.useComputer]?: boolean;  // 新增
}>;

// 函数内读取
const {
  // ...现有解构...
  agent_useComputer: useComputer = false  // 新增
} = props.params;

// 传递给 getSubapps
const { completionTools: agentCompletionTools, subAppsMap: agentSubAppsMap } = await getSubapps({
  // ...现有参数...
  useComputer  // 新增
});
```

**预计工作量**：+5 行

---

### 4. 后端：getSubapps 注入 sandbox_shell 工具

**文件**：`packages/service/core/workflow/dispatch/ai/agent/utils.ts`

**改动位置**：约第 215-230 行（`getSubapps` 函数）

**改动内容**：
- [ ] 在函数参数中添加 `useComputer?: boolean`
- [ ] 在 `/* Sandbox Shell */` 注释处（与 Dataset Search 同级）添加条件注入逻辑
- [ ] 导入 `sandboxShellTool` from `./sub/sandbox/utils`

**实现示例**：
```typescript
import { sandboxShellTool } from './sub/sandbox/utils';

export const getSubapps = async ({
  // ...现有参数...
  useComputer  // 新增
}: {
  // ...现有类型...
  useComputer?: boolean;  // 新增
}) => {
  // ...现有逻辑...

  /* Sandbox Shell */
  if (useComputer) {
    completionTools.push(sandboxShellTool);
  }

  // ...后续不变...
};
```

**预计工作量**：+5 行

---

### 5. 后端：masterCall 处理 sandbox_shell 调用

**文件**：`packages/service/core/workflow/dispatch/ai/agent/master/call.ts`

**改动位置**：约第 440 行附近（工具调用分发逻辑）

**改动内容**：
- [ ] 在工具调用分发逻辑中添加 `sandbox_shell` 分支
- [ ] 导入 `SandboxInstance` from `@fastgpt/service/core/ai/sandbox/controller`
- [ ] 导入 `SubAppIds` from `@fastgpt/global/core/workflow/node/agent/constants`
- [ ] 调用 `SandboxInstance.exec()` 并格式化结果

**实现示例**：
```typescript
import { SandboxInstance } from '@fastgpt/service/core/ai/sandbox/controller';
import { SubAppIds } from '@fastgpt/global/core/workflow/node/agent/constants';

// 在工具调用分发逻辑中
if (toolName === SubAppIds.sandboxShell) {
  const { command, timeout } = tool_call.function.arguments;

  const sandboxInstance = new SandboxInstance({
    appId: runningAppInfo.appId,
    userId: runningAppInfo.tmbId,
    chatId: runningAppInfo.chatId
  });

  const result = await sandboxInstance.exec(command, timeout);

  return {
    role: 'tool',
    tool_call_id: tool_call.id,
    content: JSON.stringify({
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode
    })
  };
}
```

**预计工作量**：~20 行

---

### 6. 后端：Master Agent System Prompt 追加沙盒说明

**文件**：`packages/service/core/workflow/dispatch/ai/agent/master/prompt.ts`

**改动位置**：`getMasterSystemPrompt()` 函数

**改动内容**：
- [ ] 在函数参数中添加 `useComputer?: boolean`
- [ ] 当 `useComputer=true` 时，在 System Prompt 末尾追加 `SANDBOX_SYSTEM_PROMPT`
- [ ] 导入 `SANDBOX_SYSTEM_PROMPT` from `@fastgpt/global/core/ai/sandbox/constants`

**实现示例**：
```typescript
import { SANDBOX_SYSTEM_PROMPT } from '@fastgpt/global/core/ai/sandbox/constants';

export const getMasterSystemPrompt = (
  systemPrompt?: string,
  hasUserTools: boolean = true,
  useComputer?: boolean  // 新增
) => {
  let prompt = `...现有逻辑...`;

  if (useComputer) {
    prompt += `\n\n${SANDBOX_SYSTEM_PROMPT}`;
  }

  return prompt;
};
```

**预计工作量**：+5 行

---

### 6.5. 后端：Plan Agent System Prompt 追加沙盒说明

**文件**：`packages/service/core/workflow/dispatch/ai/agent/sub/plan/prompt.ts`

**改动位置**：
- `getInitialPlanPrompt()` 函数
- `getContinuePlanPrompt()` 函数

**改动内容**：
- [ ] 在两个函数参数中添加 `useComputer?: boolean`
- [ ] 当 `useComputer=true` 时，在 `<toolset>` 部分之前追加虚拟机环境说明
- [ ] 导入 `SANDBOX_SYSTEM_PROMPT` from `@fastgpt/global/core/ai/sandbox/constants`

**实现示例**：
```typescript
import { SANDBOX_SYSTEM_PROMPT } from '@fastgpt/global/core/ai/sandbox/constants';

export const getInitialPlanPrompt = ({
  getSubAppInfo,
  completionTools,
  useComputer  // 新增
}: {
  getSubAppInfo: GetSubAppInfoFnType;
  completionTools: ChatCompletionTool[];
  useComputer?: boolean;  // 新增
}) => {
  const { toolset, requirements, guardrails, bestPractices } = getCommonPromptParts({
    getSubAppInfo,
    completionTools
  });

  // 虚拟机环境说明（如果启用）
  const sandboxPrompt = useComputer ? `\n\n<sandbox_environment>\n${SANDBOX_SYSTEM_PROMPT}\n</sandbox_environment>\n` : '';

  return `<!-- 任务规划专家系统 - 初始规划模式 -->

<role>
你是一个任务规划专家，负责将复杂任务分解为清晰的执行步骤。这是**初始规划阶段**，历史消息中没有已执行步骤的结果。
</role>

${sandboxPrompt}

<core_principle>
...现有内容...
`;
};

// getContinuePlanPrompt 同样处理
export const getContinuePlanPrompt = ({
  getSubAppInfo,
  completionTools,
  useComputer  // 新增
}: {
  getSubAppInfo: GetSubAppInfoFnType;
  completionTools: ChatCompletionTool[];
  useComputer?: boolean;  // 新增
}) => {
  const { toolset, requirements, guardrails, bestPractices } = getCommonPromptParts({
    getSubAppInfo,
    completionTools
  });

  const sandboxPrompt = useComputer ? `\n\n<sandbox_environment>\n${SANDBOX_SYSTEM_PROMPT}\n</sandbox_environment>\n` : '';

  return `<role>
你是任务规划专家，负责**基于已执行步骤的实际结果**，决定是否需要优化补全。
...
</role>

${sandboxPrompt}

<core_principle>
...现有内容...
`;
};
```

**预计工作量**：+15 行

---

### 6.6. 后端：Plan Agent 调用时传递 useComputer

**文件**：`packages/service/core/workflow/dispatch/ai/agent/sub/plan/index.ts`

**改动位置**：`dispatchPlanAgent()` 函数

**改动内容**：
- [ ] 在函数参数中添加 `useComputer?: boolean`
- [ ] 调用 `getInitialPlanPrompt()` 和 `getContinuePlanPrompt()` 时传递 `useComputer`

**预计工作量**：+3 行

---

### 7. 后端：masterCall 调用时传递 useComputer

**文件**：`packages/service/core/workflow/dispatch/ai/agent/master/call.ts`

**改动位置**：调用 `getMasterSystemPrompt()` 的地方

**改动内容**：
- [ ] 在 `masterCall` 函数参数中添加 `useComputer?: boolean`
- [ ] 调用 `getMasterSystemPrompt()` 时传递 `useComputer` 参数

**预计工作量**：+3 行

---

### 8. 后端：index.ts 调用 masterCall 和 dispatchPlanAgent 时传递 useComputer

**文件**：`packages/service/core/workflow/dispatch/ai/agent/index.ts`

**改动位置**：
- 约第 244-257 行（planCallFn 中的 dispatchPlanAgent）
- 约第 295-312 行（continuePlanCallFn 中的 dispatchPlanAgent）
- 约第 372-383 行（Step call 中的 masterCall）
- 约第 450-459 行（Master agent 中的 masterCall）

**改动内容**：
- [ ] 在 `planCallFn` 的 `dispatchPlanAgent` 调用中添加 `useComputer` 参数
- [ ] 在 `continuePlanCallFn` 的 `dispatchPlanAgent` 调用中添加 `useComputer` 参数
- [ ] 在两处 `masterCall` 调用中添加 `useComputer` 参数

**实现示例**：
```typescript
// planCallFn 中
const result = await dispatchPlanAgent({
  // ...现有参数...
  useComputer  // 新增
});

// continuePlanCallFn 中
const result = await dispatchPlanAgent({
  // ...现有参数...
  useComputer  // 新增
});

// masterCall 中
const result = await masterCall({
  ...props,
  // ...现有参数...
  useComputer  // 新增
});
```

**预计工作量**：+4 行（四处）

---

### 9. 国际化：翻译 key 已存在 ✅

**文件**：
- `packages/web/i18n/zh-CN/app.json`
- `packages/web/i18n/zh-Hant/app.json`
- `packages/web/i18n/en/app.json`

**已有翻译**：
- ✅ `use_computer`: "启用虚拟机" / "啟用虛擬機" / "Enable Sandbox"
- ✅ `use_computer_desc`: "开启后，AI 将获得一个独立 Linux 环境，可执行命令、操作文件" / "開啟後，AI 將獲得一個獨立 Linux 環境，可執行命令、操作檔案" / "When enabled, AI will have access to an isolated Linux environment for executing commands and file operations"

**无需改动**：翻译已在 Phase 2 中添加

---

## 测试验证

### 手动测试步骤

1. **前端测试**：
   - [ ] 打开 Agent 编辑页面
   - [ ] 验证 Computer Use 开关显示正常
   - [ ] 切换开关，验证状态保存

2. **功能测试**：
   - [ ] 创建一个 Agent，启用虚拟机
   - [ ] 发送消息："请在虚拟机中执行 `echo 'Hello World'`"
   - [ ] 验证 AI 调用 `sandbox_shell` 工具
   - [ ] 验证虚拟机返回正确结果

3. **集成测试**：
   - [ ] 测试 Plan 模式 + 虚拟机
   - [ ] 测试 Step 模式 + 虚拟机
   - [ ] 测试 Master 模式 + 虚拟机

### 预期行为

- Agent 能够识别需要执行命令的场景
- 正确调用 `sandbox_shell` 工具
- 虚拟机返回结果正确显示在对话中
- 虚拟机实例生命周期管理正常（创建、执行、停止、删除）

---

## 依赖检查

- [x] Phase 1 完成（基础设施：constants + schema + controller）
- [x] Phase 2 完成（ToolCall 节点支持）
- [x] Phase 3 完成（生命周期管理）
- [ ] `@fastgpt-sdk/sandbox-adapter` SDK 可用
- [ ] 环境变量配置完成（`AGENT_SANDBOX_PROVIDER` 等）

---

## 文件改动汇总

| 文件 | 操作 | 改动量 | 说明 |
|------|------|--------|------|
| `projects/app/.../ChatAgent/EditForm.tsx` | ✏️ 改造 | +20 行 | 添加虚拟机开关 |
| `packages/global/.../formEdit/type.ts` | ✅ 已完成 | 0 行 | 类型定义已存在 |
| `packages/service/.../agent/index.ts` | ✏️ 改造 | +11 行 | 读取并传递 useComputer（4处调用） |
| `packages/service/.../agent/utils.ts` | ✏️ 改造 | +5 行 | 注入 sandbox_shell 工具 |
| `packages/service/.../agent/master/call.ts` | ✏️ 改造 | +23 行 | 处理 sandbox_shell 调用 |
| `packages/service/.../agent/master/prompt.ts` | ✏️ 改造 | +5 行 | Master Agent System Prompt |
| `packages/service/.../agent/sub/plan/prompt.ts` | ✏️ 改造 | +15 行 | Plan Agent System Prompt |
| `packages/service/.../agent/sub/plan/index.ts` | ✏️ 改造 | +3 行 | Plan Agent 传递 useComputer |
| `packages/web/i18n/*/app.json` | ✅ 已完成 | 0 行 | 国际化翻译已存在 |

**总计**：~82 行代码改动（类型定义和国际化已完成）

---

## 实现顺序建议

1. **类型定义** → 2. **后端逻辑** → 3. **前端 UI** → 4. **国际化** → 5. **测试验证**

这样可以确保后端逻辑先完成，前端可以直接对接测试。

---

## 注意事项

1. **与 ToolCall 模式的区别**：
   - ToolCall 模式：在 `tool/toolCall.ts` 中处理
   - Agent 模式：在 `agent/master/call.ts` 中处理
   - 两者都需要支持 `sandbox_shell`，但调用路径不同

2. **System Prompt 注入**：
   - Agent 模式使用 `getMasterSystemPrompt()`
   - ToolCall 模式直接在 `toolCall.ts` 中追加

3. **工具调用分发**：
   - Agent 模式在 `master/call.ts` 中拦截 `sandbox_shell`
   - 与 `dataset_search`、`file_parse` 等内置工具处理方式一致

4. **生命周期管理**：
   - 沙盒实例由 `SandboxInstance` 类管理
   - 自动处理创建、执行、停止、删除
   - 无需在 Agent 调度逻辑中额外处理

---

## 完成标准

- [ ] 所有代码改动完成
- [x] 国际化翻译已存在
- [ ] 手动测试通过
- [ ] 虚拟机生命周期正常
- [ ] 无 TypeScript 类型错误
- [ ] 无 ESLint 警告
