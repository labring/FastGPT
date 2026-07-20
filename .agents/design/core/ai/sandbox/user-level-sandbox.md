# 用户级 Sandbox 需求与技术设计

状态：当前实现

最后核对：2026-07-20

## 1. 目标

普通 App Sandbox 的隔离边界是 `sourceId + effectiveUserId`，不再按 Chat 创建物理实例。
同一 App 用户的不同 Chat 共享 Workspace，并通过 `sessions/<chatId>` 隔离默认工作目录。
Skill Edit 继续使用 Skill 级稳定 Sandbox。

生命周期统一使用 [Durable Saga 设计](./durable-saga.md)，本文只描述用户级聚合、目录和 Legacy
Workspace 迁移规则。

## 2. 身份与数据模型

新集合固定为 `agent_sandbox_instances_v2`：

```typescript
type SandboxInstance = {
  provider: SandboxProviderType;
  sandboxId: string;
  sourceType: 'app' | 'skillEdit';
  sourceId: string;
  userId: string;
  status:
    | 'provisioning'
    | 'legacyMigrating'
    | 'running'
    | 'stopping'
    | 'stopped'
    | 'archiving'
    | 'archived'
    | 'restoring'
    | 'providerMigrating'
    | 'deleting';
  metadata?: {
    upstreamId?: string;
    activeSaga?: {
      sagaId: string;
      type: SandboxLifecycleType;
    };
  };
};
```

约束：

- `sandboxId` 是 FastGPT 逻辑 ID，由 sourceType、sourceId 和 userId 确定性生成。
- `upstreamId` 是 Adapter 返回、可持久化并用于稳定重绑定的 opaque handle。
- App 的 userId 使用 effective user；Skill Edit 固定为 `skillEdit`。
- `chatId` 只属于运行时上下文，不写入 v2 aggregate。
- 新集合不包含旧 `appId`、`type` 或 `metadata.skillId`。
- `(provider, sandboxId)` 和 `(sourceType, sourceId, userId)` 分别保持资源与逻辑身份唯一。
- 顶层 status 是业务投影；执行权威是 Durable Saga snapshot。
- 稳定态不得保留 activeSaga，过渡态必须绑定类型匹配的 activeSaga。

## 3. Workspace

App Workspace：

```text
workspaceRoot        = <provider workDirectory>
runtimeSkillsRoot    = <workspaceRoot>/projects
sessionWorkDirectory = <workspaceRoot>/sessions/<encoded chatId>
```

- Sandbox 工具和本轮用户文件默认使用 sessionWorkDirectory。
- Skill 包同步到共享 runtimeSkillsRoot。
- App entrypoint 在 workspaceRoot 执行，成功状态按 Sandbox 维度记录。
- Sandbox Editor 以 sessionWorkDirectory 为文件树根目录。
- Session 目录是默认工作目录，不是安全边界。

Skill Edit 直接使用 workspaceRoot，不创建 Chat session 子目录。

## 4. 生命周期

所有 mutator 只走 Durable Saga：

- provision：创建或恢复 Provider 资源，checkpoint 后发布 running。
- stop：Provider 停止成功后发布 stopped。
- archive：S3 上传完成后删除 Provider 资源并发布 archived。
- restore：安装归档并持久化 cleanup checkpoint 后发布 running。
- providerMigration：归档、删除源 Provider、切换 Provider 全程持有同一 reservation。
- delete：Provider、Volume 和 S3 清理完成后删除 aggregate。
- legacyMigration：冻结 manifest，安装全部 Legacy Workspace 后发布 running。

Mongo 保存 Saga snapshot、step checkpoint、execution token/epoch 和 reservation。Redis lease 只降低并发
执行概率，BullMQ 只负责低延迟唤醒，Mongo polling 始终负责恢复补漏。

## 5. Source 并发

- provision、restore、provider migration 和 Legacy migration 初始化时获取 source advisory lease。
- aggregate 初始化和 source 存活校验在同一 Mongo transaction 中完成。
- App 或 Skill 删除遇到 activeSaga 时必须 join/resume，直到原 Saga terminal 后再启动 delete Saga。
- 单个 Chat 删除不删除共享 App Sandbox，也不单独删除 session 目录。

## 6. Legacy Workspace 迁移

正式 Legacy 数据源是 `upstream/main` 的 `agent_sandbox_instances` 集合。4160 管理员接口默认 dry-run，
真实执行使用冻结 manifest 的 Durable Saga：

1. 全表校验 Legacy 记录，并按 Skill 或 App 用户分组。
2. 为目标用户级 Sandbox 生成确定性 sandboxId 和 targetSagaId。
3. 归档并安装每条旧 Workspace；目标 session 已存在时只合并缺失文件，不覆盖现有内容。
4. 忽略旧 Workspace 中 `projects/<skillVersionId>` 运行时缓存目录。
5. 单条安装成功后删除其旧 S3 归档、Provider 资源和 Legacy Mongo 记录。
6. 全组完成后一次性发布 v2 running aggregate。

迁移只读取 `upstream/main` 旧集合的正式字段。`userLevelMigration` 是当前 Durable Saga 写入旧记录的
单条 checkpoint，不是旧状态机兼容字段；Legacy 记录清理完毕就是迁移完成，不保留第二套生命周期协议。

## 7. 验证

- sandboxId 对 App 用户和 Skill Edit 的确定性与唯一性。
- App session 路径编码、文件合并不覆盖和 Skill 缓存过滤。
- 所有过渡态 activeSaga 不变量。
- Saga checkpoint 与 aggregate 投影的事务一致性。
- Provider effect 成功但 checkpoint 丢失后的 reconcile。
- Source 删除与生命周期初始化竞争。
- Legacy manifest 固定、分组串行、失败暂停和重复执行幂等。
