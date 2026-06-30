# Skill 接入辅助生成与子 Skill 元数据存储方案

## 背景

当前 ChatAgent 的辅助生成（HelperBot TopAgent）只把应用已有的系统提示词、工具、知识库、文件上传状态和虚拟机状态传入辅助生成链路，没有传入或展示 `selectedAgentSkills`。

实际代码现状：

- 前端 `projects/app/src/pageComponents/app/detail/Edit/ChatAgent/ChatTest.tsx` 构建 `topAgentMetadata` 时没有带 `appForm.selectedAgentSkills`。
- `packages/global/core/chat/helperBot/topAgent/type.ts` 的 `topAgentParamsSchema` 和 `TopAgentFormDataSchema` 没有 Skill 字段。
- `pro/admin/src/service/core/chat/HelperBot/processors/topAgent/utils.ts` 的 `generateResourceList()` 只生成工具和知识库资源列表。
- `pro/admin/src/service/core/chat/HelperBot/processors/topAgent/prompt.ts` 只描述预设工具和预设知识库，没有 Skill 资源。
- Skill 创建/发布时，Mongo 当前只保存平台 Skill 主表信息和版本包指针，没有结构化保存包内多个 `SKILL.md` 的 `name` / `description`。

因此，辅助生成无法基于当前用户可访问的 Skill 做规划，也无法把生成结果回填到应用的 Skill 关联中。

## 目标

分两个阶段完成：

1. 第一阶段：让辅助生成可以使用当前用户可访问的 Skill 应用。
2. 第二阶段：在 Skill 创建/发布时结构化保存包内子 Skill 信息，让辅助生成看到更准确的子 Skill 能力。

## 非目标

- 不把每个子 Skill 拆成独立权限资源。
- 不改变应用最终选择 Skill 的模型，应用仍然关联平台 Skill 应用。
- 不在辅助生成请求时临时下载对象存储 zip 或解包读取 `SKILL.md`。
- 不为了平台 Skill `description` 接一层 LLM 摘要。
- 不在第一阶段修改 Skill 发布/打包链路。

## 当前数据模型

### 平台 Skill 主表

`MongoAgentSkills` 当前主要保存：

```ts
{
  parentId,
  type,
  inheritPermission,
  source,
  name,
  description,
  avatar,
  teamId,
  tmbId,
  category,
  createTime,
  updateTime,
  deleteTime,
  currentVersionId,
  creationStatus,
  creationError,
  creationPayload
}
```

`name` 和 `description` 是平台 Skill 应用层面的名称和描述。

### Skill 版本表

`MongoAgentSkillsVersion` 当前主要保存：

```ts
{
  skillId,
  tmbId,
  versionName,
  storageKey,
  importSource,
  createdAt
}
```

版本包真实内容存在对象存储，Mongo 只保存 `storageKey`。

### 应用关联

应用表单中关联 Skill 的结构是：

```ts
{
  skillId: string;
  name: string;
  description: string;
  avatar?: string;
  isDeleted: boolean;
}
```

这里保存的是平台 Skill 应用信息，不保存子 Skill 信息。

## 第一阶段：Skill 接入辅助生成

### 目标

辅助生成可以：

- 读取当前用户可访问的 Skill 应用列表。
- 在资源列表中展示 Skill 应用。
- 在规划中选择 Skill。
- 将选中的 Skill 回填到 `appForm.selectedAgentSkills`。
- 如果选择了 Skill，自动保持 `aiSettings.useAgentSandbox = true`。

### 数据来源

第一阶段只使用 `MongoAgentSkills` 的平台字段：

```ts
{
  skillId,
  name,
  description,
  avatar
}
```

不读取版本包，不解析 `SKILL.md`。

### 权限查询

不要在服务端辅助生成中调用 `/core/ai/skill/list` API。

应把 `projects/app/src/pages/api/core/ai/skill/list.ts` 中“当前成员可访问 Skill”的权限查询抽成 service/helper，供以下两处复用：

- Skill 列表 API。
- `generateResourceList()`。

查询需要保留现有权限语义：

- team owner 可以访问团队内个人 Skill。
- 普通成员只看到自己有读权限的 Skill。
- 支持用户、组织、用户组权限。
- 支持文件夹继承权限。
- 过滤 `deleteTime: null`。
- 默认只返回 `AgentSkillTypeEnum.skill`，不把文件夹作为可选资源暴露给辅助生成。
- 系统 Skill 是否纳入第一阶段需要单独确认；建议第一版只接入 `source: personal`，和现有应用选择器保持一致。

建议新增 service：

```ts
type AccessibleSkillResource = {
  skillId: string;
  name: string;
  description: string;
  avatar?: string;
};

async function getAccessibleSkillResources({
  teamId,
  tmbId,
  isRoot
}: {
  teamId: string;
  tmbId: string;
  isRoot: boolean;
}): Promise<AccessibleSkillResource[]>;
```

### TopAgent metadata

前端 `topAgentMetadata` 增加当前应用已选 Skill：

```ts
selectedAgentSkills: appForm.selectedAgentSkills || []
```

`topAgentParamsSchema` 增加：

```ts
selectedAgentSkills: z.array(SelectedAgentSkillItemTypeSchema).nullish()
```

这些预设 Skill 在 prompt 中作为高优先级已有配置提示，不代表固定约束。

### 资源列表

`generateResourceList()` 从：

```md
## 可用工具与知识库
### 工具
...

### 知识库
...
```

扩展为：

```md
## 可用工具、知识库与 Skill
### 工具
...

### 知识库
...

### Skill
- **skillId** [Skill]: name - description
```

没有可访问 Skill 时展示：

```md
暂未配置 Skill
```

### Prompt 约束

需要让 TopAgent 明确知道：

- Skill 是可选资源，适合表达可复用操作经验、项目规范、流程约束和领域方法。
- 选择 Skill 时返回平台 Skill `skillId`。
- 不要求用户提供 Skill ID，TopAgent 应从资源列表中自行选择。
- 如果资源列表里没有合适 Skill，不要强行选择。
- 选择 Skill 后需要启用虚拟机，因为 Agent Skill 运行依赖 sandbox。

预设信息区增加：

```md
**预设 Skill**: 搭建者已预先选择了以下 Skill ID: ...
```

### 生成结果 schema

`TopAgentFormDataSchema` 增加：

```ts
selectedAgentSkills: z.array(SelectedAgentSkillItemTypeSchema).optional().default([])
```

辅助生成的计划资源提取从：

```ts
{ tools, knowledges }
```

扩展为：

```ts
{ tools, knowledges, skills }
```

并根据 `skills` 过滤出真实可访问 Skill，形成 `selectedAgentSkills`。

过滤逻辑必须按 `skillId` 校验当前用户仍有读权限，不能完全信任 LLM 输出。

### 前端回填

`onApply(formData)` 增加：

```ts
selectedAgentSkills: formData.selectedAgentSkills
```

并且：

```ts
aiSettings.useAgentSandbox = enableSandboxEnabled || formData.selectedAgentSkills.length > 0
```

如果当前套餐或系统配置不支持 sandbox，沿用现有 `checkAgentSkillSandboxUnavailable` 的提示和阻断逻辑。

### 前端 Skill 选择与辅助生成应用流程

第一阶段不新增一个“辅助生成专用 Skill 选择器”。手动选择 Skill 仍然沿用现有 ChatAgent 编辑区里的 `SkillSelectModal` 和 `useAgentSkillSelect()`。

需要明确两条路径：

#### 手动选择路径

用户在 ChatAgent 编辑表单中点击 Skill 选择入口：

```text
SkillSelectModal
  -> onAddAgentSkill(skill)
  -> appForm.selectedAgentSkills
  -> useAgentSkillSelect 自动保持 sandbox 开启
```

这条路径已经存在，第一阶段只要求后续辅助生成能读取这个结果作为预设信息。

#### 辅助生成路径

用户在辅助生成面板里提出需求后：

```text
HelperBot TopAgent
  -> generateResourceList() 提供可访问 Skill 资源
  -> LLM 规划并返回 selectedAgentSkills
  -> topAgentConfig SSE
  -> HelperBot onApply(formData)
  -> ChatAgent ChatTest.onApply
  -> setAppForm 写入 appForm.selectedAgentSkills
```

这条路径和工具的辅助生成回填类似，但 Skill 回填不能只写 ID。前端应用表单需要完整保存：

```ts
{
  skillId,
  name,
  description,
  avatar,
  isDeleted: false
}
```

因此服务端在生成 `TopAgentFormData` 时，必须把 LLM 输出的 Skill ID 重新映射成可访问 Skill 列表中的完整对象，前端不再额外请求 Skill 详情。

#### 和工具回填的区别

工具目前会通过 `loadGeneratedTools()` 根据工具 ID 补齐工具模板配置。Skill 不应复用工具加载逻辑，而应由服务端直接返回 `SelectedAgentSkillItemType[]`。

原因：

- Skill 选择不需要像工具那样加载节点模板。
- Skill 权限必须在服务端生成阶段校验，不能把无权限 ID 交给前端再处理。
- Skill 运行依赖 sandbox，回填时需要同步开启 `useAgentSandbox`。

### 运行态 Skill 应用名与子 Skill 对齐

第一阶段还需要解决一个提示词对齐问题：

- 辅助生成和调试预览阶段展示、回填的是平台 Skill 应用。
- 真正运行 Agent 时，sandbox 中可读取和执行的是该 Skill 应用包内展开后的一个或多个 `skills/**/SKILL.md` 子 Skill。

如果运行态只把子 Skill 的 `name` / `description` 提供给模型，而不提供平台 Skill 应用的 `name` / `description`，就会出现错位：

```text
系统提示词或辅助生成结果提到：数据分析助手
运行态可用技能列表只有：data-cleaning、chart-reporting
模型无法稳定判断 data-cleaning/chart-reporting 属于“数据分析助手”，可能导致提示词提到了 Skill 但运行时不调用。
```

因此第一阶段需要在运行态 skill prompt 中保留两层信息：

```xml
<skill>
  <app_id>平台 Skill 应用 ID</app_id>
  <app_name>平台 Skill 应用名</app_name>
  <app_description>平台 Skill 应用描述</app_description>
  <name>子 Skill 名</name>
  <description>子 Skill 描述</description>
  <directory>子 Skill 目录</directory>
  <path>子 Skill 的 SKILL.md 路径</path>
</skill>
```

运行态 prompt 需要明确告诉模型：

- 匹配用户任务、系统提示词和应用配置时，应同时参考 `app_name` / `app_description` 与子 Skill 的 `name` / `description`。
- 如果用户任务或系统提示词提到了某个平台 Skill 应用名，应在该应用下选择最匹配的子 Skill。
- 执行时不能只凭平台 Skill 应用描述推断完整流程，仍必须读取最终选中的子 Skill `SKILL.md`。
- `app_name` / `app_description` 只用于对齐应用层语义和辅助生成回填结果；实际执行入口仍然是子 Skill 的 `path`。

实现上，普通运行态应在注入 Skill 包后，把 `selectedAgentSkills` 中的平台应用信息合并到已部署版本信息，再传给 `getAgentSkillInfos()`。`getAgentSkillInfos()` 扫描子 Skill 时，把匹配到的应用信息附加到每个 `DeployedSkillInfo`，最后由 `buildAgentSkillsPrompt()` 输出上述字段和匹配规则。

这个方案属于第一阶段的运行态 prompt 对齐，不要求提前解析并落库子 Skill 元数据，也不要求辅助生成资源列表展示子 Skill 详情。辅助生成资源列表展示子 Skill 详情仍放在第二阶段，依赖 `runtimeSkills` / `currentRuntimeSkills`。

### 第一阶段验收

- 辅助生成资源列表包含当前用户可访问 Skill。
- 用户要求适合某个 Skill 的场景时，生成结果能自动关联该 Skill。
- 已选 Skill 会作为预设信息进入下一轮辅助生成。
- 无权限 Skill 即使被 LLM 输出，也不会进入 `selectedAgentSkills`。
- 选择 Skill 后应用配置中自动开启 sandbox。
- 手动选择的 Skill 会进入辅助生成预设信息。
- 辅助生成选择的 Skill 会直接显示在 ChatAgent 编辑表单的 Skill 列表中，和手动选择效果一致。
- 运行态 skill prompt 包含平台 Skill 应用 `app_name` / `app_description` 和子 Skill `name` / `description`。
- 当系统提示词或用户输入提到平台 Skill 应用名时，模型能在该应用下选择匹配的子 Skill，并读取对应 `SKILL.md`。

## 第二阶段：发布时保存子 Skill 元数据

### 目标

在创建、导入、保存发布 Skill 包时，解析包内所有 `skills/**/SKILL.md` 的 frontmatter，把子 Skill 信息结构化写入 Mongo。辅助生成后续直接从 Mongo 读取子 Skill `name` / `description`，不需要临时解包。

### 子 Skill 元数据结构

建议新增公共类型：

```ts
type RuntimeSkillMetadata = {
  name: string;
  description: string;
  path: string;
};
```

示例：

```ts
runtimeSkills: [
  {
    name: 'data-cleaning',
    description: '清洗表格中的缺失值、异常值和格式问题',
    path: 'skills/data-cleaning/SKILL.md'
  },
  {
    name: 'chart-reporting',
    description: '根据数据生成图表和分析报告',
    path: 'skills/chart-reporting/SKILL.md'
  }
]
```

### 存储位置

建议两层存储：

1. `MongoAgentSkillsVersion.runtimeSkills`
   - 必须存。
   - 表示该版本包里实际包含的子 Skill。
   - 不同版本可以不同。

2. `MongoAgentSkills.currentRuntimeSkills`
   - 建议存。
   - 缓存 `currentVersionId` 指向版本的子 Skill 列表。
   - 辅助生成和列表查询可以直接读主表，避免每次 join 当前版本表。

这里的“最新版本信息”应以当前生效版本为准，而不是按 `createdAt` 最大的版本为准。

现有版本模型中：

- `MongoAgentSkills.currentVersionId` 是当前生效版本指针。
- `getCurrentVersion(skillId)` 先读取主表 `currentVersionId`，再查询对应的 `MongoAgentSkillsVersion`。
- 保存发布新版本时，`saveDeploySkillFromSandbox()` 会通过 `updateCurrentVersion(skillId, versionId)` 把新版本切为当前版本。
- 版本列表可以按 `createdAt` 倒序展示历史版本，但用户也可以通过版本切换把历史版本重新设为当前版本。

因此第二阶段实现必须保证：

- 新建版本时，把解析出的子 Skill 元数据写入 `MongoAgentSkillsVersion.runtimeSkills`。
- 当前版本发生变化时，把目标版本的 `runtimeSkills` 同步写入 `MongoAgentSkills.currentRuntimeSkills`。
- 辅助生成读取 `MongoAgentSkills.currentRuntimeSkills`，拿到的是当前生效版本的子 Skill 信息。
- `version/switch.ts` 切换历史版本时，必须同步刷新 `currentRuntimeSkills`，否则会出现 `currentVersionId` 已切换但辅助生成仍展示旧子 Skill 的不一致问题。

### 平台 Skill name/description

平台 Skill `name` 不被子 Skill 覆盖，仍然是 Skill 应用名。

平台 Skill `description` 不由子 Skill 描述自动填充或覆盖。导入时用户填写什么就写入什么；用户未填写时保持空字符串。

原因是平台描述属于 Skill 应用级元信息，子 Skill 描述属于运行时能力元信息。第二阶段只把子 Skill 信息写入 `runtimeSkills` / `currentRuntimeSkills`，供辅助生成展示和匹配使用，不反向改写平台 Skill 主表字段。

### 解析时机

需要覆盖所有会产生版本包的入口：

- AI 创建初始包：`completePendingSkillCreation()`。
- 导入 Skill 包。
- 复制 Skill。
- 从编辑态 sandbox 保存发布：`saveDeploySkillFromSandbox()`。

解析应在上传对象存储前完成，确保包内容和入库 metadata 来自同一份内容。

### 校验规则

发布包解析后需要校验：

- 至少存在一个 `skills/**/SKILL.md`。
- 每个 `SKILL.md` 必须有 frontmatter `name`。
- `description` 建议必填；如果为了兼容旧包允许为空，辅助生成展示时用空字符串。
- 同一个包内子 Skill `name` 不能重复。
- `path` 必须在 `skills/` 下，不能接受 `../` 等越界路径。

重复 name 不应静默覆盖，应发布失败并给出明确错误。

### 辅助生成第二阶段展示

第一阶段资源列表：

```md
- **skillId** [Skill]: 平台 Skill 名 - 平台描述
```

第二阶段资源列表升级为：

```md
- **skillId** [Skill]: 平台 Skill 名 - 平台描述
  - **data-cleaning**: 清洗表格中的缺失值、异常值和格式问题
  - **chart-reporting**: 根据数据生成图表和分析报告
```

模型选择时仍然只返回平台 `skillId`，不返回子 Skill path。

### Prompt 长度控制

第二阶段资源列表完整展示当前版本里的所有子 Skill：

- 不限制单个 Skill 展示的子 Skill 数量。
- 不截断子 Skill 描述。
- 不追加“还有 N 个子 Skill”这类摘要提示。

如果后续出现 prompt 过长问题，应先基于真实包规模和模型上下文窗口做数据评估，再单独设计压缩策略；第二阶段不提前加入展示限制。

## 数据迁移与兼容

第二阶段上线后，旧版本记录没有 `runtimeSkills`。

兼容策略：

- 旧数据的 `runtimeSkills` 缺失时，辅助生成退回使用平台 Skill `name` / `description`。
- 不强制后台批量解包历史对象存储。
- 用户下一次保存发布后，自动写入当前版本的 `runtimeSkills` 和主表缓存。

## 测试计划

### 第一阶段测试

- `topAgentParamsSchema` 支持 `selectedAgentSkills`。
- `TopAgentFormDataSchema` 支持 `selectedAgentSkills` 默认值。
- `generateResourceList()` 能输出 Skill 分区。
- 无 Skill 时输出空提示。
- 权限过滤只返回当前用户可读 Skill。
- LLM 输出不存在或无权限 Skill ID 时被过滤。
- 前端 `onApply` 能回填 `selectedAgentSkills`。
- 回填 Skill 时自动开启 sandbox。
- 运行态 `buildAgentSkillsPrompt()` 输出 `app_id`、`app_name`、`app_description`。
- 运行态 prompt 明确要求用平台 Skill 应用信息匹配任务，再读取匹配子 Skill 的 `SKILL.md`。

### 第二阶段测试

- 单个 `SKILL.md` 解析出一个 runtime skill。
- 多个 `SKILL.md` 解析出多个 runtime skills。
- 重复 `name` 发布失败。
- 缺少 `name` 发布失败。
- 无 `SKILL.md` 发布失败。
- 导入 Skill 时不使用子 Skill 描述自动填充平台 `description`。
- 保存发布新版本后：
  - `MongoAgentSkillsVersion.runtimeSkills` 写入。
  - `MongoAgentSkills.currentRuntimeSkills` 更新。
  - `currentVersionId` 正确切换。
- 旧版本无 `runtimeSkills` 时辅助生成仍可使用平台描述。

## TODO

### 阶段一 TODO

- [ ] 抽取 Skill 可访问列表查询 service，复用列表 API 的权限规则。
- [ ] `generateResourceList()` 增加 Skill 分区。
- [ ] `topAgentParamsSchema` 增加 `selectedAgentSkills`。
- [ ] `TopAgentFormDataSchema` 增加 `selectedAgentSkills`。
- [ ] TopAgent prompt 增加 Skill 资源说明、预设 Skill 说明、sandbox 依赖说明。
- [ ] 扩展 `extractResourcesFromPlan()`，支持 `skill` 资源类型。
- [ ] TopAgent 生成阶段校验并回填可访问 Skill。
- [ ] 前端 `topAgentMetadata` 传入 `appForm.selectedAgentSkills`。
- [ ] 前端 `onApply` 回填 `selectedAgentSkills` 并保持 sandbox 开启。
- [ ] 明确辅助生成回填后的 Skill 展示复用现有 ChatAgent Skill 列表，不新增独立展示组件。
- [ ] 运行态 skill prompt 补充平台 Skill 应用信息与子 Skill 的匹配规则。
- [ ] 补充单元测试与必要的 pro/admin TopAgent 测试。

### 阶段二 TODO

- [ ] 定义 `RuntimeSkillMetadata` schema/type。
- [ ] `MongoAgentSkillsVersion` 增加 `runtimeSkills`。
- [ ] `MongoAgentSkills` 增加 `currentRuntimeSkills` 缓存。
- [ ] 实现从包内容解析 `skills/**/SKILL.md` frontmatter 的 service。
- [ ] 创建初始包时写入 runtime skill metadata。
- [ ] 导入包时写入 runtime skill metadata。
- [ ] 复制 Skill 时复制 runtime skill metadata。
- [ ] 保存发布 sandbox 包时写入 runtime skill metadata。
- [ ] 版本切换时同步刷新主表 `currentRuntimeSkills`。
- [ ] 辅助生成资源列表完整展示当前版本的全部子 Skill 详情。
- [ ] 补充发布、导入、复制、辅助生成资源列表测试。
