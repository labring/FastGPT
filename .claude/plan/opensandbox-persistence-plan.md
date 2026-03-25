# Context

当前 `opensandbox` 分支已经暴露了 OpenSandbox provider 环境变量，并在运行时通过 `SandboxClient` 走 provider 分支，但 OpenSandbox 的“持久化配置”仍然散落在 `SandboxClient` 内部，没有形成独立的配置抽象，也没有 volume-manager / `createConfig.volumes` / 实例详情落库这条完整链路。

相比之下，`agent-skill-dev` 已经把这部分能力拆成了独立配置模块，并通过 volume-manager 为 session/runtime 准备持久化卷，再将存储与运行时详情写入 sandbox 实例记录。

本次推荐方案的目标不是整包迁入 `agentSkills` 上层编排，而是：**保留当前分支以 `SandboxClient` 为唯一消费入口的形态，将 OpenSandbox 持久化配置能力下沉到 `packages/service/core/ai/sandbox` 域内完成抽离**。这样可以在最小扰动现有 workflow/tool 调用链的前提下，把持久化卷、配置解析和实例详情持久化补齐。

# Recommended Approach

## 1. 先把配置抽象从 `SandboxClient` 构造函数中抽离

新增统一配置模块，建议放在：
- `packages/service/core/ai/sandbox/config.ts`

从 `agent-skill-dev` 复用并改造以下能力，统一收敛到 sandbox 域：
- `getSandboxProviderConfig`
- `getVolumeManagerConfig`
- `buildVolumeConfig`
- `buildBaseContainerEnv`

这样 `packages/service/core/ai/sandbox/controller.ts` 不再直接读取 env 并内联拼 provider 参数，而是只消费配置模块输出。

## 2. 补齐 provider 类型与实例详情结构

当前事实：
- `packages/service/env.ts` 已支持 `opensandbox`
- `packages/service/core/ai/sandbox/type.ts` 的 `SandboxProviderSchema` 仍只有 `sealosdevbox`

需要在：
- `packages/service/core/ai/sandbox/type.ts`
- `packages/service/core/ai/sandbox/schema.ts`

补齐以下结构：
- `SandboxProviderSchema` 至少包含 `opensandbox`
- 实例 `detail`：provider 运行时返回信息、endpoint、连接信息
- 实例 `storage`：volume 标识、claimName、mountPath、provider storage payload
- 实例 `metadata`：session 维度标识、createConfig 摘要、迁移/兼容标记

要求：新字段全部可选，保证旧记录仍可读。

## 3. 在 `SandboxClient` 内接入持久化卷准备与详情落库

核心改造文件：
- `packages/service/core/ai/sandbox/controller.ts`

推荐保留 `SandboxClient` 作为唯一消费入口，内部改造为：
1. 根据业务标识（`appId/userId/chatId` 或 `sandboxId`）构建稳定 session key
2. 调用 `config.ts` 读取 provider 配置
3. 如果 provider 为 `opensandbox`，则调用 volume-manager 配置与卷构建逻辑
4. 将 volume 信息塞入 `createConfig.volumes`
5. 创建/恢复实例后，把 `detail/storage/metadata` 写入 `MongoSandboxInstance`

复用目标分支的关键能力时，优先迁“配置与卷构建逻辑”，不要直接把 `agentSkills` 生命周期编排整包搬入。

## 4. 保持业务入口不变，只做最小上下文透传

现有消费入口继续复用 `SandboxClient`：
- `packages/service/core/workflow/dispatch/ai/agent/sub/sandbox/index.ts`
- `packages/service/core/workflow/dispatch/ai/tool/toolCall.ts`

这两个入口只做最小修改：
- 确保传入稳定的 `appId/userId/chatId`
- 不感知 provider 配置、volume-manager、存储细节

原则：**底层配置与持久化逻辑留在 sandbox 域，业务入口不扩散基础设施细节。**

## 5. 分两阶段实施

### 第一阶段（必须先迁）
1. 新增 `packages/service/core/ai/sandbox/config.ts`
2. 扩展 `packages/service/env.ts` 中 OpenSandbox 持久化相关 env
3. 扩展 `packages/service/core/ai/sandbox/type.ts`
4. 扩展 `packages/service/core/ai/sandbox/schema.ts`
5. 改造 `packages/service/core/ai/sandbox/controller.ts`
6. 最小化调整 workflow / tool 入口透传上下文

### 第二阶段（可后补）
1. 引入独立 lifecycle 管理（参考 `agent-skill-dev` 的 `.../sandbox/lifecycle.ts`）
2. 区分 edit-debug 与 session-runtime 的 volume 策略
3. 补充 volume 清理、回滚、观测与旧数据回填能力

# Critical Files to Modify

必须修改：
- `packages/service/env.ts`
- `packages/service/core/ai/sandbox/type.ts`
- `packages/service/core/ai/sandbox/schema.ts`
- `packages/service/core/ai/sandbox/controller.ts`
- `packages/service/core/workflow/dispatch/ai/agent/sub/sandbox/index.ts`
- `packages/service/core/workflow/dispatch/ai/tool/toolCall.ts`

建议新增：
- `packages/service/core/ai/sandbox/config.ts`

目标分支中应重点参考、复用逻辑的来源文件：
- `packages/service/core/agentSkills/sandboxConfig.ts`
- `packages/service/core/agentSkills/sandboxController.ts`
- `packages/service/core/workflow/dispatch/ai/agent/sub/sandbox/lifecycle.ts`

# Reuse Existing Functions and Patterns

优先复用当前仓库已验证的模式：
- 现有单一消费入口模式：`packages/service/core/ai/sandbox/controller.ts` 中的 `SandboxClient`
- 现有运行时消费入口：
  - `packages/service/core/workflow/dispatch/ai/agent/sub/sandbox/index.ts`
  - `packages/service/core/workflow/dispatch/ai/tool/toolCall.ts`
- 目标分支中可迁入的配置抽离函数：
  - `getSandboxProviderConfig`
  - `getVolumeManagerConfig`
  - `buildVolumeConfig`
  - `buildBaseContainerEnv`

复用原则：
- 复用“能力”与“结构”，不直接复制 `agentSkills` 上层调用链
- 将通用配置逻辑沉入 `core/ai/sandbox`，避免基础设施层依赖业务层

# Key Risks and Compatibility Notes

1. **类型不一致风险**
   - 现在 env 支持 `opensandbox`，但 `SandboxProviderSchema` 不支持
   - 必须先统一类型层，再改控制器逻辑

2. **旧数据兼容风险**
   - 历史 `agent_sandbox_instances` 没有 `detail/storage/metadata`
   - 新字段必须 optional，读取逻辑必须支持旧数据回退到 `provider + sandboxId`

3. **provider 分支串扰风险**
   - OpenSandbox 的 volume 逻辑不能污染 `sealosdevbox` / `e2b`
   - `createConfig.volumes` 只能在对应 provider 下启用

4. **依赖反转风险**
   - 不要让 `core/ai/sandbox` 反向依赖 `agentSkills`
   - 通用配置能力必须落在 sandbox 域内

5. **卷幂等与清理风险**
   - 第一阶段至少保证 ensure volume 幂等
   - 清理/回滚放第二阶段补齐

# Verification

## 单测

1. `config.ts`
   - `getSandboxProviderConfig`：不同 provider 输出正确；缺失关键 env 时给出明确错误
   - `getVolumeManagerConfig`：能正确解析 volume-manager 配置
   - `buildVolumeConfig`：相同 session 上下文生成稳定 volume 配置
   - `buildBaseContainerEnv`：容器基础 env 正确且不泄漏无关敏感信息

2. `type.ts` / `schema.ts`
   - 旧记录仅有基础字段时可通过读取
   - 新记录包含 `detail/storage/metadata` 时可通过校验

3. `controller.ts`
   - OpenSandbox 创建时会注入 `createConfig.volumes`
   - 创建后会写入 `detail/storage/metadata`
   - 旧实例记录仍可兼容
   - 非 OpenSandbox provider 行为不变

## 集成测试

1. 通过 `dispatchSandboxShell` 触发首次 session sandbox 创建
2. 检查 `agent_sandbox_instances` 中是否写入 `detail/storage/metadata`
3. 同一 `appId + userId + chatId` 再次进入时，验证 volume 信息可复用
4. 从 `toolCall.ts` 链路触发一次 sandbox 执行，确认入口无需感知底层 volume 配置

## 人工验证

1. 配齐 OpenSandbox + volume-manager 环境变量后启动服务
2. 首次会话进入 sandbox，写入一个测试文件
3. 结束请求后使用相同 `appId/userId/chatId` 再次进入
4. 验证测试文件仍然存在，且实例记录中保留 storage/detail 信息
5. 切换到 `sealosdevbox` / `e2b` 时，验证旧链路行为不变
