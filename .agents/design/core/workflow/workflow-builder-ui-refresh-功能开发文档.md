# Workflow Builder UI 与版本归档功能开发文档

## 文档标识

- 任务前缀：`workflow-builder-ui-refresh`
- 对应需求文档：`workflow-builder-ui-refresh-需求设计文档.md`
- 当前状态：待用户审批，未开始修改源代码。

## 0. 开发目标与约束

- 功能目标：按 Figma 实现 Workflow Builder 左侧入口、面板、引导、生成状态、顶部横幅和版本卡片；将版本 S3 归档前移到生成校验完成阶段。
- 代码范围：`projects/app` Workflow 前端、共享 chat UI、`packages/global` 版本契约、`pro/admin` Builder version service/handler、i18n 和局部测试。
- 非目标：不改 Workflow CLI 命令协议、WorkflowDocument schema、AgentLoop 主链、方案预览 UI；不新增动效依赖。
- 适用维度：API[x] Data[x] Frontend[x] Logging[x] Packaging[ ] Testing[x] DocI18n[ ]
- 项目约束：TypeScript + React + Chakra UI；i18n 中/英/繁同步；API 边界使用 `parseApiInput`；测试先局部、最后全量。

## 1. 实施任务拆解

| 任务 ID | 任务名称 | 责任层 | 输入 | 输出 | 完成定义（DoD） |
|---|---|---|---|---|---|
| T1 | 统一 Builder UI 编排状态 | app workflow UI | 现有 Flow/Builder disclosures | 左侧主面板互斥状态和 Builder 派生状态 | 无重叠面板，右侧面板可共存 |
| T2 | 重构 Toolbar 和 Builder 布局 | app workflow UI | Figma `490px` 布局 | AI/添加/配置/搜索 + 左侧面板 | 桌面/移动尺寸符合设计 |
| T3 | 实现两步首次引导 | app UI state | 新建路由标记 + localStorage | Tooltip 顺序和自动开启策略 | 新建/已有 Workflow 分支通过测试 |
| T4 | 新增 Builder 空态和聚焦 | app chat UI | 新建 Workflow 开启事件 | 开场说明、示例、渐变 focus | 自动聚焦只在自动打开时触发 |
| T5 | 实现 AI 入口光环/红点 | app workflow UI | Mermaid/version 时间线 + 交互/版本/错误 key | 可叠加光环/待处理红点 | 面板打开整条 Toolbar 隐藏，已查看语义和 reduced motion 可用 |
| T6 | 适配 Builder 处理过程 UI | shared chat UI | Builder tool 响应 | 业务名称、折叠、Input/Response | 普通 ChatBox 渲染不受影响 |
| T7 | 实现顶部待应用横幅 | app workflow UI | 最新 S3 待应用版本 | 横幅 + dismiss | 点击应用后立即消失，失败不恢复 |
| T8 | 将候选版本生成即归档 | pro service | validated candidate document | 带 S3 key/TTL 的 version | S3 成功后才保存 ChatItem/发 SSE |
| T9 | 调整 load/commit 语义 | pro API/service | S3 version identity | S3 load + appliedAt mark | 不重复上传，重试幂等 |
| T10 | 重做版本卡片与过期交互 | shared chat UI | version metadata/actions | Figma 卡片状态 | 所有未过期历史版本可应用，过期 toast |
| T11 | i18n 与局部测试 | global/service/app | 新状态和错误分支 | 三语 key + 测试 | 关键纯函数分支 100%，整体不低于 90% |
| T12 | 集成验证和文档回填 | all | T1-T11 | 验证结果 | 局部 -> 类型/lint -> 最终全量通过 |

## 2. 文件级改动清单

| 文件路径 | 类型 | 变更摘要 | 关键代码/伪代码 | 任务 |
|---|---|---|---|---|
| `projects/app/src/pageComponents/app/detail/Workflow/index.tsx` | 修改 | 提升 Builder/Toolbar 共享 UI 编排 | `const builderUI = useWorkflowBuilderUI()` | T1 |
| `WorkflowComponents/Flow/index.tsx` | 修改 | 统一左侧 Toolbar 顺序和面板切换 | `activeLeftPanel` | T1,T2 |
| `WorkflowComponents/WorkflowBuilder/index.tsx` | 修改 | 490px 左侧面板、横幅、应用编排 | `applyVersion`、`dismissBanner` | T2,T7,T10 |
| `WorkflowComponents/WorkflowBuilder/ChatPanel.tsx` | 修改 | 空态、focus 请求、生成/交互/版本状态上报 | `onUIStateChange` | T4,T5,T7 |
| `WorkflowComponents/WorkflowBuilder/WorkflowBuilderEntry.tsx` | 新增 | 封装 AI 入口、待处理红点和光环 | `data-generating` + `data-attention` | T2,T5 |
| `WorkflowComponents/WorkflowBuilder/workflowBuilderEntry.module.scss` | 新增 | HTML `cool` CSS keyframes 和 reduced motion | `workflow-glow-breathe` 等 | T5 |
| `Flow/SystemConfigDrawer.tsx` | 修改 | Drawer 开关改由共享左面板状态控制 | 受控 `isOpen/onOpen/onClose` | T1,T3 |
| `Flow/NodeTemplatesModal.tsx` | 修改 | 接入受控左面板状态 | 保持现有列表内容 | T1 |
| `Flow/hooks/useSystemConfigAutoOpen.ts` | 替换/删除 | 不再自动打开系统配置 | 迁移为 guide hook | T3 |
| `components/core/app/useAppEditorUIState.ts` | 修改 | 增加 Builder 引导完成状态 | `workflowBuilder.hasCompletedFirstEntryGuide` | T3 |
| `web/core/app/utils.ts` 及 3 个创建跳转调用点 | 修改 | 路由标记语义改为新建 Workflow Builder 自动开启 | `openWorkflowBuilder=1` | T3 |
| `AIResponseBox/RenderProcessingCollapse.tsx` | 修改 | 支持 Builder 完成后默认折叠 | 保持通用默认行为 | T6 |
| `AIResponseBox/RenderTool.tsx` | 修改 | Builder tool 名称/图标和细节样式 | context-specific map | T6 |
| `AIResponseBox/RenderWorkflowBuilderVersion.tsx` | 修改 | Figma 卡片、过期 toast、可重复应用 | `onApplyClick` | T10 |
| `packages/global/core/workflow/builder/type.ts` | 修改 | 收紧新版本归档语义，保持旧数据兼容 | schema 不破坏旧 value | T8,T9 |
| `packages/global/core/workflow/builder/utils.ts` | 修改 | 版本展示状态不再依赖 `isLatestReady` | `getWorkflowBuilderVersionDisplayState` | T10 |
| `packages/global/openapi/core/workflow/builder/api.ts` | 修改 | commit 请求/响应语义调整 | 优先保持已有 shape | T9 |
| `pro/admin/src/service/core/ai/workflowBuilder/version/service.ts` | 修改 | 生成归档、S3 load、appliedAt mark | `createArchivedWorkflowBuilderVersion` | T8,T9 |
| `pro/admin/src/service/core/ai/workflowBuilder/handler.ts` | 修改 | 归档成功后再存 ChatItem/发 SSE | `readyVersion` 创建时机 | T8 |
| `packages/web/i18n/{zh-CN,zh-Hant,en}/workflow.json` | 修改 | 引导、横幅、版本、过期 toast | 三语同步 | T11 |
| 对应 `test/` 文件 | 新增/修改 | 覆盖状态机、归档、过期、多版本 | 见第 7 节 | T11,T12 |

### 2.1 关键控制流伪代码

#### T1/T3：左侧面板和引导

```ts
type LeftPanel = 'workflowBuilder' | 'nodeTemplates' | 'systemConfig' | undefined;

const onGuideComplete = () => {
  completeWorkflowBuilderGuide();
  if (isNewWorkflowEntry) {
    setLeftPanel('workflowBuilder');
    requestInputFocus();
  }
};
```

#### T5：入口状态派生

```ts
const entryState = !isBuilderOpen && hasPendingAttention
  ? 'attention'
  : !isBuilderOpen && isGenerating
    ? 'generatingHalo'
    : 'default';
```

实现时遵循项目三元表达式限制，改用小型纯函数或顺序 `if`，不直接保留上述伪代码形式。

#### T7：横幅点击

```ts
const onBannerApply = (version: WorkflowBuilderVersion) => {
  dismissBanner(version.checksum);
  void applyVersion(version, responseChatItemId);
};
```

#### T8：生成完成即归档

```ts
const archivedVersion = await createArchivedWorkflowBuilderVersion({
  appId,
  chatId,
  responseChatItemId,
  document: candidateWorkflow.document,
  checksum: candidateWorkflow.checksum,
  tmbId
});

// 只有归档完成才把版本写入 ChatItem 并发 SSE。
aiResponse.value.push({ workflowBuilderVersion: archivedVersion });
```

#### T9：load/commit

```ts
const load = async (version: WorkflowBuilderVersion) => {
  assertNotExpired(version.expiresAt);
  const document = await readArchivedDocument(version.s3Key);
  await assertChecksum(document, version.checksum);
  return document;
};

const markApplied = async (identity: VersionIdentity) => {
  return updateVersionAppliedAtOnce(identity, new Date().toISOString());
};
```

#### T10：过期点击

```ts
if (isExpired(displayVersion.expiresAt)) {
  setRuntimeState('expired');
  toast({ status: 'warning', title: t('workflow_builder_version_expired') });
  return;
}

try {
  await actions.applyVersion(displayVersion, responseChatItemId);
} catch (error) {
  if (isWorkflowBuilderExpiredError(error)) setRuntimeState('expired');
  throw error;
}
```

### 2.2 Reviewer 阅读流程

#### 2.2.1 一句话改动主线

从 Workflow 编辑页统一管理左侧 Builder 入口和面板状态；候选工作流在生成校验完成后立即归档到 S3，前端所有版本卡片都从该独立归档加载并直接覆盖画布。

#### 2.2.2 阅读顺序

| 步骤 | 文件/符号 | 关注点 | 应得结论 |
|---|---|---|---|
| 1 | `Workflow/index.tsx#WorkflowEdit` | 共享 UI 状态在哪里创建 | Flow 和 Builder 不再各自管理相互冲突的开关 |
| 2 | `Flow/index.tsx` + `WorkflowBuilderEntry.tsx` | Toolbar 顺序、光环、红点 | Figma 入口如何由聊天状态派生 |
| 3 | `useAppEditorUIState.ts` + guide hook | 本地引导状态和新建路由标记 | 两步 Tooltip 与自动开启如何区分 |
| 4 | `workflowBuilder/handler.ts` | candidate 校验后的版本创建时机 | 应用按钮前已经有 S3 文件 |
| 5 | `version/service.ts` | upload/load/markApplied 职责 | 不会在应用时重复上传 |
| 6 | `RenderWorkflowBuilderVersion.tsx` | 过期预判和服务端错误 | 历史版本都能应用，过期双重保护 |
| 7 | `WorkflowBuilder/index.tsx#applyVersion` | 覆盖画布、布局、快照、commit | 用户当前画布不做冲突比较 |
| 8 | 对应测试 | 多版本、过期、S3 失败、UI 状态 | 主链和异常分支有证据 |

#### 2.2.3 完整调用链

1. 入口：`Workflow/index.tsx#WorkflowEdit` 创建 Builder UI controller，`Flow/index.tsx` 渲染 AI 入口。
2. 聊天状态：`WorkflowBuilder/ChatPanel.tsx` 从 ChatBox context/records 派生 generating、pending interactive 和 latest version，上报 controller。
3. 生成：`ChatPanel.tsx#onStartChat` -> `/core/workflow/builder/chat` -> `workflowBuilder/handler.ts`。
4. 归档：handler 获得 validated candidate -> `version/service.ts#createArchivedWorkflowBuilderVersion` -> S3 upload -> 版本元数据。
5. 返回：handler 保存 ChatItem 并发 `workflowBuilderVersion` SSE -> ChatBox -> `RenderWorkflowBuilderVersion`。
6. 应用：卡片/横幅 -> `WorkflowBuilder/index.tsx#applyVersion` -> version load API -> S3 -> 画布 init/auto-layout/snapshot -> commit mark appliedAt。
7. 异常：S3 upload 失败不产生版本卡片；load 失败不改画布；画布导入失败按现有事务规则恢复；过期转为 toast + 已过期卡片。
8. 测试：global 纯函数 -> pro service/handler -> app UI/controller -> 完整 E2E。

## 3. 后端实施说明

### 3.1 API 调整

| 接口 | 请求 | 响应 | 鉴权 | 错误处理 |
|---|---|---|---|---|
| Builder chat SSE | 保持现有 body | version 必须含 `s3Key/expiresAt` | App 写权限 + Builder/Sandbox 开关 | 归档失败写 stream error，不发 version |
| version load | identity 不变 | document/checksum/source=`s3` | App 写权限 + ChatItem 归属 | 过期/不存在/损坏/checksum 错误 |
| version commit | 优先保持 IDs + document/checksum | 带 `appliedAt` 的 version | 同上 | 不再上传；重复请求返回已有结果 |

commit 请求示例（保持现有契约）：

```json
{
  "appId": "67f4c91c79a4d61b1f116b2a",
  "chatId": "workflow-builder-chat-id",
  "responseChatItemId": "response-chat-item-id",
  "document": { "schemaVersion": "fastgpt-workflow/v1" },
  "checksum": "sha256:0000000000000000000000000000000000000000000000000000000000000000"
}
```

响应示例：

```json
{
  "versionNo": 2,
  "name": "AI 生成版本 2",
  "filename": "AI 生成版本 2.json",
  "checksum": "sha256:0000000000000000000000000000000000000000000000000000000000000000",
  "generatedAt": "2026-08-17T08:00:00.000Z",
  "s3Key": "chat/app/.../version-2.json",
  "expiresAt": "2026-08-18T08:00:00.000Z",
  "appliedAt": "2026-08-17T08:05:00.000Z"
}
```

### 3.2 Service 调整

| 函数 | 具体改动 | 依赖 |
|---|---|---|
| `createReadyWorkflowBuilderVersion` | 重命名/扩展为幂等归档 validated document | MongoChatItem、S3 chat source、checksum |
| `loadWorkflowBuilderVersion` | 新版本统一读 S3；旧无 s3Key 版本保留 Sandbox 兼容 | S3/Sandbox |
| `commitWorkflowBuilderVersion` | 验证 checksum 后幂等设置 `appliedAt`，不 upload | MongoChatItem |

### 3.3 数据层

- 不新增 Mongo Schema 顶层字段。
- 不新增或删除索引。
- `WorkflowBuilderVersionSchema` 保持可解析旧版本；新生成链在 service 边界强制返回 `s3Key/expiresAt`。

## 4. 前端实施说明

| 组件 | 交互变化 | i18n | 状态覆盖 |
|---|---|---|---|
| Workflow Toolbar | AI 入口置顶，左侧主面板互斥 | Tooltip | default/hover/open/attention/generating |
| Workflow Builder Panel | 左侧 490px，顶底贴边，移动全屏 | title/clear/collapse | open/closed/loading |
| First Entry Guide | 系统配置 -> AI 两步 | 知道了 + 引导内容 | unseen/step1/step2/completed |
| Builder Empty State | 开场说明、示例、聚焦框 | 三语 | empty/focused/typed |
| Entry Motion | HTML `cool` 光环 + 红点 | aria label | generating/attention/reduced motion |
| Processing | Builder tool 名称、现有单轮折叠和 Builder 专属最外层会话折叠 | tool labels + ChatBox feature | running/cancelled/completed/error |
| Version Banner | 最新待应用，点击立即消失 | banner/apply | visible/dismissed/replaced |
| Version Card | 按 Figma 重做，历史均可再应用 | apply/reapply/expired/toast | ready/loading/applied/available/expired/error |

## 5. 日志与可观测性

| 触发点 | 级别 | 分类 | 字段 | 备注 |
|---|---|---|---|---|
| candidate archive success | info | `AGENT_SKILLS` | appId/chatId/responseChatItemId/versionNo/checksum/expiresAt | 不记 JSON |
| candidate archive failure | error | `AGENT_SKILLS` | 同上 + error | 不记凭据 |
| version loaded | info | `AGENT_SKILLS` | IDs/versionNo/checksum/source=s3 | 沿用 |
| version marked applied | info | `AGENT_SKILLS` | IDs/versionNo/appliedAt | 幂等 |

## 6. 文档 i18n

Not Applicable。本期不修改文档站用户文档。产品 UI 文案必须同步：

- `packages/web/i18n/zh-CN/workflow.json`
- `packages/web/i18n/zh-Hant/workflow.json`
- `packages/web/i18n/en/workflow.json`

## 7. 测试与验证

规范来源：`project-requirement-design/references/testing-standards.md`。

### 7.1 测试文件映射

| 源文件/能力 | 测试文件 | 跳过 |
|---|---|---|
| `packages/global/core/workflow/builder/utils.ts` | `packages/global/test/core/workflow/builder/utils.test.ts` | 否 |
| `pro/admin/.../workflowBuilder/version/service.ts` | `pro/admin/test/core/ai/workflowBuilder/version.service.test.ts` | 否 |
| `pro/admin/.../workflowBuilder/handler.ts` | `pro/admin/test/core/ai/workflowBuilder/handler.test.ts` | 否 |
| Builder guide/UI controller | `projects/app/test/pageComponents/app/detail/WorkflowComponents/WorkflowBuilder/uiState.test.ts` | 否 |
| `RenderWorkflowBuilderVersion.tsx` | `projects/app/test/components/core/chat/components/AIResponseBox/workflowBuilderVersion.test.tsx` | 否 |
| Builder preview 回归 | 现有 interactive/preview tests | 否 |
| 光环 CSS | 样式结构测试 + 手工视觉验收 | 否 |

### 7.2 自动化测试设计

| 类型 | 用例 | 预期 |
|---|---|---|
| 单元 | AI 入口状态优先级 | attention > generatingHalo > default |
| 单元 | 新建/已有 Workflow 引导结束 | 只有新建自动打开并 focus |
| 单元 | 版本展示状态 | 未应用/已应用/过期分支正确，不按最新卡片失效 |
| 集成 | candidate 上传成功 | S3 先于 ChatItem/version SSE |
| 集成 | S3 上传失败 | 不保存/发送不可用 version |
| 集成 | 同 responseChatItemId 重试 | 版本号和 S3 元数据幂等 |
| 集成 | 多个未应用版本 | 每个都从自己的 S3 key 加载 |
| 集成 | commit 重试 | 不重复上传，appliedAt 稳定 |
| 组件 | 横幅 apply click | 同步 dismiss，异步应用，失败不恢复 |
| 组件 | 过期 click | toast + 按钮转已过期，不调 load |
| 组件 | 服务端临界过期 | load 失败后 toast + 按钮转已过期 |
| 回归 | 方案预览 actions | 现有 Mermaid/Sections/后端文案不变 |

### 7.3 场景覆盖

| 场景 | 是否覆盖 | 用例 |
|---|---|---|
| 基础场景 | 是 | 新建自动打开、生成归档、应用 |
| 复杂场景 | 是 | 多版本、右侧面板共存、生成期间改画布 |
| 边界值 | 是 | 过期临界、最新横幅替换、重复点击 |
| 异常场景 | 是 | S3/load/checksum/画布导入失败 |
| 安全边界 | 是 | App/ChatItem 归属、无写权限、文件损坏 |

### 7.4 执行命令和覆盖率

| 阶段 | 命令 | 覆盖率目标 |
|---|---|---|
| global 局部 | `pnpm test packages/global/test/core/workflow/builder/utils.test.ts` | 纯函数行/分支 100% |
| pro service 局部 | `pnpm test pro/admin/test/core/ai/workflowBuilder/version.service.test.ts` | 核心分支 >= 90% |
| pro handler 局部 | `pnpm test pro/admin/test/core/ai/workflowBuilder/handler.test.ts` | 新增分支 >= 90% |
| app 局部 | `pnpm test projects/app/test/pageComponents/app/detail/WorkflowComponents/WorkflowBuilder` | 新增纯函数 100% |
| 类型/lint | 按 `.agents/code/commands.md` 对应 app/pro/global 命令 | 0 error |
| 最终全量 | `pnpm test` | 全部通过 |

实际开发时在本表回填结果、行/分支覆盖率和失败修复记录。

## 8. 质量自检

- [ ] 没有复制 Workflow CLI 或建立第二套生成状态机。
- [ ] 新版本必须 S3 成功后才显示应用按钮。
- [ ] 旧无 `s3Key` ChatItem 仍能按兼容分支加载。
- [ ] commit 不会再上传同一 JSON。
- [ ] 生成期间用户修改画布不会阻止应用。
- [ ] 引导顺序、自动 focus 和本地持久化符合需求。
- [ ] 光环只在 Mermaid 确认到版本卡片出现前运行；面板打开时整条 Toolbar 隐藏，进入 Builder/点击横幅确认当前提醒。
- [ ] 中/英/繁 i18n key 集合一致。
- [ ] 局部测试和最终全量测试都已回填。

## 9. 发布与回滚

### 9.1 发布步骤

1. 先发布兼容新旧 version value 的 global/pro 改动。
2. 再发布 app UI；若同一版本同步发布，仍保留旧无 s3Key 兼容分支。
3. 观察 S3 上传错误率、Builder stream error 和 version load 错误。

### 9.2 回滚触发条件

- S3 归档显著拉高 Builder 失败率。
- 旧版本无法 load，或新版本 commit 产生重复上传。
- Toolbar/面板编排导致画布主要操作不可用。

### 9.3 回滚步骤

1. 回滚 app UI 可恢复旧入口，不影响 ChatItem 可选 version value。
2. 回滚 pro 生成归档后，已产生 `s3Key` 的新卡片仍可被旧 load 逻辑读取。
3. S3 对象交给现有 1 天 TTL 自动清理。

## 10. TODO（用户批准后执行）

- [ ] T1 读取 `.agents/code/syntax.md`，核对实际调用点后建立 Builder UI controller。
- [ ] T2 重构 Workflow Toolbar 和 490px/全屏 Builder 面板。
- [ ] T3 用两步 Tooltip 状态机替换系统配置自动打开逻辑。
- [ ] T4 实现新建 Workflow 开场说明、示例和自动 focus。
- [ ] T5 拆出 AI 入口组件，实现 HTML `cool` 光环和红点。
- [ ] T6 适配 Builder processing/tool 展示，保持方案预览现状。
- [ ] T7 实现最新待应用横幅及点击立即 dismiss。
- [ ] T8 将 candidate S3 归档前移到生成校验完成阶段。
- [ ] T9 将 version load 统一到 S3，commit 改为幂等记录 appliedAt。
- [ ] T10 按 Figma 重做版本卡片和过期 toast/按钮状态。
- [ ] T11 同步中/英/繁 i18n，补齐 global/pro/app 局部测试。
- [ ] T12 执行局部测试、类型/lint，最后执行全量测试并回填结果。

## 11. AI 实施提示

- 严格按 T1-T12 执行，每完成一项就更新 TODO 和验证结果。
- 优先复用 `AppDetailPanelModal`、ChatBox context、processing/tool 和现有版本 API，不建立重复组件体系。
- 光环的参数来自 HTML `cool`，不自行调整为 `generating` 克制版。
- 若实际代码使新版本无法在创建阶段获得 `tmbId`/S3 context，先停止并修订 service 边界文档，不把上传偷偷放回应用阶段。
