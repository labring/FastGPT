# Sandbox 不可用时的对话降级设计

## 1. 背景

App Chat 的 Sandbox 可能因应用配置、团队套餐或系统配置变为不可用。当前不同入口的处理不一致：部分路径会跳过 Sandbox，部分路径会抛出 Agent 错误并中断对话，Sandbox 文件入口也无法向用户稳定说明不可用原因。

本需求统一 Sandbox 不可用时的运行行为和用户提示，使 Sandbox 从对话的强依赖降级为可选能力。

## 2. 需求范围

### 2.1 Sandbox 不可用原因

需要区分以下三种原因：

1. `appDisabled`：应用开发者关闭 Sandbox。
2. `teamPlanUnavailable`：应用所属团队套餐不再提供 Sandbox 权限，包括套餐过期后降级到无 Sandbox 权限的套餐。
3. `systemDisabled`：系统未配置或已下架 Sandbox 功能。

### 2.2 对话运行行为

普通 App Chat 运行时，只要命中任意一种不可用原因：

- 不向模型注入 Sandbox system tools。
- 不注入 Sandbox system prompt。
- 不创建、恢复、连接或调用 Sandbox runtime。
- 不执行 Sandbox entrypoint。
- 不再把 Sandbox 权限错误作为 Agent/ToolCall 节点错误写入对话。
- 其他模型调用、普通工具、知识库和工作流节点继续正常运行。
- 后端记录结构化日志，并能区分三种不可用原因。

### 2.3 前端行为

- 页面加载和正常对话过程中不主动弹出 Sandbox 不可用提示。
- 用户点击右上角虚拟机入口时才进行提示。
- 三种不可用原因使用统一 Toast 文案。
- Sandbox 可用时维持现有行为，正常打开 Sandbox 文件编辑器。

## 3. 当前实现差异

### 3.1 应用开发者关闭

Agent/ToolCall 节点的 `useAgentSandbox` 为 `false` 时，普通 Sandbox tool 和 runtime 已基本不会启用。但 Agent 节点配置了 Skill 时，会因为 Skill 的 runtime 依赖强制启用 Sandbox，不能完全满足“应用关闭后不调用 Sandbox”。

### 3.2 团队套餐无权限

- Agent 路径在 `prepareAgentSandboxRuntime` 中校验套餐，失败后由 Agent dispatch catch 转成节点错误。
- ToolCall 路径在 dispatch 开始阶段校验套餐并直接抛错。
- 两条路径都会阻断本轮正常对话。

### 3.3 系统关闭

- 普通 Sandbox 开关会因 `show_agent_sandbox=false` 被忽略。
- Agent 配置了 Skill 时会显式抛出 Sandbox 权限错误，阻断本轮对话。
- `checkExist` 直接返回 `exists=false`，前端无法区分系统关闭和实例不存在。

## 4. 已确认验收标准

1. 三种 Sandbox 不可用状态均不导致对话报错或中断。
2. 三种状态均不向模型暴露 Sandbox 工具，也不发生 Sandbox runtime 调用。
3. 后端日志能通过稳定的原因字段区分三种状态。
4. 前端只在用户点击虚拟机入口时显示 Toast。
5. Toast 文案对三种状态保持一致。
6. Sandbox 可用时不改变现有对话和文件编辑器行为。

## 5. 已确认产品决策

1. 简体中文 Toast 文案：`虚拟机功能已被关闭，暂时无法使用`。
2. Sandbox 不可用时，同时跳过依赖 Sandbox 的所有 Skill 和 Sandbox system tools。
3. 虚拟机入口保持原有显示逻辑，不因为本需求新增常驻入口：
   - 后端确认 Sandbox 实例存在；或
   - 当前已加载对话历史中出现过 Sandbox 调用。
4. 静默降级覆盖普通 App Chat，包括 Workflow ToolCall 和 Agent v2/agent loop。
5. Skill 编辑和 Skill 调试继续保留现有强依赖与阻断行为。
6. 英文文案按简体中文语义翻译为：`The virtual machine feature has been disabled and is temporarily unavailable.`
7. 繁体中文文案按简体中文语义翻译为：`虛擬機功能已被關閉，暫時無法使用`。

## 6. 开发设计

### 6.1 统一状态模型

在 Global Sandbox 类型中增加稳定的不可用原因枚举：

```typescript
type SandboxUnavailableReason =
  | 'appDisabled'
  | 'teamPlanUnavailable'
  | 'systemDisabled';
```

`undefined` 表示 Sandbox 可用。不可用原因只描述产品配置和权限状态，不混入 provider 故障、初始化失败、文件错误等运行时异常。

后端普通 App Chat 的判定顺序为：

1. 系统未启用 Sandbox：`systemDisabled`。
2. 当前 Agent/ToolCall 节点未开启 Sandbox：`appDisabled`。
3. 应用所属团队无 Sandbox 套餐权限：`teamPlanUnavailable`。
4. 以上均未命中：Sandbox 可用。

这样可以在系统下架时避免无意义的套餐查询，在应用关闭时也不会为每次对话额外查询套餐。

### 6.2 后端统一降级入口

在 Sandbox application 层提供普通 App Chat 专用的可用性判定，调用方传入：

- 节点是否开启 Sandbox；
- 应用所属 `teamId`。

返回不可用原因后，Agent 和 ToolCall 只决定是否组装 Sandbox 能力，不通过异常表达三种关闭状态。可用性判定函数在返回关闭状态时直接记录固定事件名和唯一的 `reason` 字段：

```text
reason
```

三种关闭状态属于可控降级，使用 `info` 级别；套餐查询本身出现异常时统一降级为 `teamPlanUnavailable`，保证对话可继续。调用方不再负责日志，也不暴露额外日志 helper。

Sandbox 文件 API 不能只依赖前端状态查询。服务端增加统一的 Session 访问编排层：

- `authSandboxSession` 只负责 Chat/App/Skill 的资源访问鉴权，不再混入套餐校验开关。
- 普通 App Session 在资源鉴权后统一解析 `appDisabled/teamPlanUnavailable/systemDisabled`；不可用时拒绝 Ticket、上传、下载和预览请求，且不能创建、恢复或连接 Sandbox。
- Skill Edit Session 使用明确的强可用性断言，系统关闭或团队无权限时继续抛出结构化 Sandbox 权限错误。
- Agent runtime 的底层准备函数只负责实例和路径准备，不再暴露 `checkTeamPermission` 布尔绕过参数；App 静默降级和 Skill Edit 强校验都在进入 runtime 前完成。

文件/runtime API 与对话运行共用同一个拒绝日志，只输出稳定的 `reason` 字段，不透传 API 操作或资源身份等额外上下文。

### 6.3 Agent v2 / agent loop

`dispatchRunAgent` 对普通 App Chat 使用统一判定结果：

- 可用：维持现有 Sandbox runtime、entrypoint、Skill 注入和初始化流程。
- 不可用：
  - `effectiveUseAgentSandbox=false`；
  - 不调用 `ensureAppSandboxRuntimeReady`；
  - 不发送 Sandbox 初始化 SSE；
  - `ensureAgentSandboxRuntime` 直接返回空 `skillInfos`，不创建或连接 Sandbox；
  - 不传 `sandboxClient`，因此 agent loop 不注入 Sandbox system tools；
  - 不拼接 `SANDBOX_SYSTEM_PROMPT`；
  - 忽略本轮 `selectedSkills`、`skillIds` 和 Sandbox entrypoint；
  - 普通工具、数据集工具、plan/ask 和模型调用保持不变。

Skill Edit 通过 `sourceType=skillEdit` 保持原路径，不走静默降级。

### 6.4 Workflow ToolCall

`dispatchRunTools` 对普通 App Chat使用同一判定：

- 移除当前套餐失败时直接抛出 `agentSandboxPermissionDenied` 的行为。
- 不可用时把运行参数中的 `useAgentSandbox` 归一化为 `false`。
- 不准备 Sandbox runtime，不注入输入文件，不执行 entrypoint。
- ToolCall 的 agent loop 不接收 `sandboxClient`，因此不注入 Sandbox system tools。
- `useToolCatalog` 不拼接 Sandbox system prompt。
- 工作流配置的其他工具节点照常进入工具目录和执行。

### 6.5 `checkExist` 状态扩展

扩展 `/core/ai/sandbox/checkExist` 响应：

```typescript
{
  exists: boolean;
  unavailableReason?: SandboxUnavailableReason;
}
```

接口继续使用 `parseApiInput` 校验请求，并使用响应 Schema 校验返回值。为返回套餐不可用原因，`checkExist` 只做 Chat/App 读取鉴权，不在鉴权 helper 内提前抛 Sandbox 套餐错误，再显式执行状态判定。

为保持原有入口显示逻辑：

- 三种关闭状态与可用状态都从本地实例表返回真实 `exists`，关闭原因只通过 `unavailableReason` 表达。
- 本地实例查询不会创建、恢复或连接远端 Sandbox。
- Skill Edit：沿用现有强权限校验，不返回普通 App Chat 的静默降级原因。

应用是否开启 Sandbox 根据实际会话类型计算：

- 线上、分享等普通 App Chat 使用当前已发布版本工作流。
- App Chat Test 运行的是请求携带的当前编辑态节点，不能读取已发布版本代替。测试会话在每轮运行后保存本轮 Sandbox 开关状态，状态查询和文件 API 使用该服务端会话状态；旧测试会话再回退到 App 草稿节点。
- 任意 Agent/ToolCall 节点的 `useAgentSandbox` 为 `true`，即视为该会话开启 Sandbox。

### 6.6 前端点击拦截

`useSandboxStatus` 在原有 `sandboxExists` 状态外保存当前 target/chat 对应的 `unavailableReason`：

- 按钮是否渲染仍只取决于原有 `sandboxExists` 公式。
- 页面加载、状态请求完成、对话生成时均不弹 Toast。
- 桌面端 `SandboxEntryIcon` 点击时：
  - 每次点击都重新查询服务端状态，不使用页面加载时的缓存状态作为最终结论；请求失败时维持原有打开行为，由文件 API 做服务端兜底。
  - 有 `unavailableReason`：显示统一 warning Toast，不打开编辑器；
  - 无不可用原因：正常打开编辑器。
- 移动端 ToolMenu 使用同一个点击 guard，避免绕过桌面按钮组件直接打开编辑器。
- AI 回复气泡底部的虚拟机入口也使用同一个点击 guard，不允许直接打开编辑器。
- 如果入口已由历史记录显示、但状态请求尚未完成，点击时主动等待或补发一次状态请求，再决定提示或打开，避免竞态下误调用 `getTicket`。

### 6.7 国际化

在 `chat.json` 增加统一 key，例如 `sandbox_unavailable_toast`：

- `zh-CN`: `虚拟机功能已被关闭，暂时无法使用`
- `zh-Hant`: `虛擬機功能已被關閉，暫時無法使用`
- `en`: `The virtual machine feature has been disabled and is temporarily unavailable.`

### 6.8 测试策略

后端局部测试：

- 可用性判定覆盖系统关闭、应用关闭、套餐无权限和正常可用。
- Agent v2 在三种关闭状态下继续完成模型调用，不创建 Sandbox、不注入 Sandbox tools/prompt、不注入 Skill。
- Workflow ToolCall 在三种关闭状态下继续运行普通工具，不创建 Sandbox、不注入 Sandbox tools/prompt。
- Skill Edit 在系统/套餐不可用时仍保持原有阻断行为。
- `checkExist` 覆盖三种原因、实例存在性和读取鉴权。

最后按仓库要求执行全量测试。

## 7. TODO

- [x] 增加 Sandbox 不可用原因枚举、统一可用性判定和结构化日志。
- [x] 改造 Agent v2：普通 App Chat 不可用时跳过 runtime、prompt、tools、Skills 和 entrypoint。
- [x] 改造 Workflow ToolCall：普通 App Chat 不可用时继续运行其他工具。
- [x] 扩展 `checkExist` 返回不可用原因，并保持虚拟机入口原有显示逻辑。
- [x] 前端桌面端和移动端统一增加点击 guard 与 Toast，不在其他时机提示。
- [x] 增加简体中文、繁体中文和英文文案。
- [x] 更新三类关闭状态、Skill Edit 强依赖和状态接口的局部测试。
- [ ] 清理被替代的异常分支、导入和旧测试，运行全量测试。
- [x] 增加 Sandbox Session 服务端访问兜底，覆盖 Ticket、上传、下载和预览。
- [x] 移除 `authSandboxSession` 和 Agent runtime 的 `checkTeamPermission` 布尔绕过参数。
- [x] 区分线上发布版本与 App Chat Test 编辑态的 Sandbox 开关来源。
- [x] 所有虚拟机入口统一点击守卫，并在每次点击时刷新状态。
- [x] 补充服务端访问和编辑调试版本回归测试。
