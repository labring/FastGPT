# Skill 空白工作区与 pro 内置辅助生成 Skill 需求开发文档

## 背景

平台上的 Skill 资源负责权限、展示名、头像、版本和编辑入口；运行时真正可执行的是工作区里的 `skills/<skillName>/SKILL.md`。新建 Skill 资源时，用户还没有定义任何可执行 Skill，因此系统不应自动生成同名 `SKILL.md`，也不应把平台展示名强行绑定到运行时目录名。

新建 Skill 后，用户需要一个自然的创建体验：在同一个 Skill 聊天流程里描述想做的能力，由 AI 帮助生成或修改 `skills/` 下的文件。这个辅助生成能力属于 pro 功能，应作为 pro 内置能力提供，不能暴露成用户可见的普通 Skill，也不能进入用户发布版本。

## 目标

- 新建 Skill 只创建平台资源和空白初始版本。
- 空白初始版本只包含 `.gitignore` 和空的 `skills/` 目录。
- 同一个 Skill 工作区允许包含多个可执行 Skill 目录。
- 用户通过原 Skill 聊天流程创建或修改 Skill，不需要切换到独立创建助手。
- 辅助生成能力由 pro 内置 Skill 提供，对用户不可见。
- 发布/保存版本时只做最小结构校验：
  - 必须存在 `skills/` 目录，且下面至少有一个一级子目录。
  - `skills/` 下每个一级子目录都必须包含根部 `SKILL.md`。
- 平台 Skill 展示名不参与运行时目录校验，可使用中文或任意业务展示名。

## 源码内置方案

### 创建流程

用户在 Skill 列表中创建一个新的平台 Skill 时，只填写平台资源信息，例如名称、简介、头像和所属目录。创建流程不收集“技能需求”，创建接口也不再接收 `requirements` 字段，不根据平台名称或需求文本生成默认 `SKILL.md`。

后台创建流程：

1. 创建 `MongoAgentSkills` 资源，写入 owner 权限。
2. 生成空白 workspace 包。
3. 将空白 workspace 包上传到对象存储，作为初始版本。
4. 将初始版本绑定为当前版本。
5. 创建完成后进入 Skill 详情页，展示空白 `skills/` 工作区和原聊天框。

新建后的初始版本：

```txt
.gitignore
skills/
```

用户或 AI 辅助生成后的可发布版本：

```txt
.gitignore
skills/
  product-image-enhancer/
    SKILL.md
    examples/
    templates/
    scripts/
    assets/
  seo-title-generator/
    SKILL.md
```

### 辅助生成体验

辅助生成不设计独立 HelperBot，不新增「创建助手」按钮，不新增右侧独立面板，也不通过 URL query 或前端模式判断来决定是否可用。用户始终使用 Skill 详情页左侧原聊天框。

用户可以直接输入：

- “帮我创建一个用于生成 SEO 标题的 Skill。”
- “修改 `seo-title-generator`，让它输出 5 个标题并给出理由。”
- “再新增一个处理商品图优化的 Skill。”

运行时 Agent 根据用户意图决定是否调用内置辅助生成 Skill。用户感知到的是同一个 Skill 聊天流程；系统内部把“运行调试”和“创建/修改 Skill 文件”都作为当前 Skill 应用的能力处理。

聊天记录继续归属于当前 Skill 的调试会话，不维护独立的辅助生成历史。辅助生成写入文件后，前端刷新右侧文件树和已打开文件状态，但不触发发布或保存版本。

### pro 内置 Skill 源码位置

内置辅助生成 Skill 的源码随 pro 代码发布，放在 pro 目录中，避免把 pro-only 能力放入公共 `packages/service`：

```txt
pro/admin/src/service/core/ai/skill/builtin/skill-creator/
  SKILL.md
  scripts/
  templates/
```

公共 service 层只提供通用加载、校验、注入机制；具体的 `skill-creator` 内容属于 pro，不进入社区版公共能力。

### 运行时注入位置

内置辅助生成 Skill 注入到 sandbox 的非用户工作区目录：

```txt
~/.fastgpt/skills/skill-creator/
  SKILL.md
  scripts/
  templates/
```

这个目录是运行时能力目录，不属于用户可编辑 workspace。右侧文件树从用户 workspace 根目录开始展示，因此正常情况下不会看到内置辅助生成 Skill；导出、发布、保存版本也只处理用户 workspace，不需要额外把内置 Skill 作为用户文件过滤。

### 加载与注入流程

创建或复用 Skill edit-debug sandbox 时，系统完成两类文件准备：

1. 用户当前版本包：解压到工作区根目录，形成 `.gitignore` 和 `skills/`。
2. pro 内置辅助生成 Skill：从 pro 源码目录读取并写入 sandbox 的 `~/.fastgpt/skills/skill-creator/`。

Skill 应用运行时扫描可用 Skill 时，同时扫描：

- 用户工作区的 `skills/`。
- 非用户 workspace 的主目录 `~/.fastgpt/skills/`。

扫描结果进入 Agent 可用能力列表。因为内置辅助生成 Skill 不在用户 workspace 根目录下，UI 文件树不需要额外识别或过滤它。

内置辅助生成 Skill 只作为当前 Skill 应用运行时能力参与聊天，不改变平台 Skill 的名称、简介、头像、权限或版本元数据。

### 按需同步与版本对比

内置 Skill 注入应从“全量覆盖”升级为“按需同步”。公共 service 层提供通用同步函数，调用方传入当前 sandbox 实例、sandbox home 目录和需要注入的 FastGPT 官方 Skill 名称列表：

```ts
syncBuiltinSkillsToSandbox({
  sandbox,
  homeDirectory,
  includeNames: ['skill-creator']
});
```

函数职责：

1. 从 pro 内置 Skill 源码目录读取 `includeNames` 指定的 Skill。
2. 计算每个 Skill 的源码 etag。
3. 读取 sandbox 中该 Skill 上次同步时写入的最小 manifest。
4. 如果 etag 相同，则跳过写入。
5. 如果 manifest 不存在、无法解析或 etag 不同，则只覆盖该 Skill 目录。

etag 由源码文件内容计算，pro 侧不需要额外存版本文件。推荐算法：

```txt
fileEtag = sha256(file content)
skillEtag = sha256(sorted(fileRelativePath + ':' + fileEtag).join('\n'))
```

注意事项：

- 文件路径统一使用 `/`。
- 文件列表必须排序，避免不同系统目录读取顺序导致 etag 不稳定。
- manifest 文件不参与 etag 计算。
- etag 不同时只删除并重写 `~/.fastgpt/skills/<skill-name>`，不能删除整个 `~/.fastgpt/skills`，避免影响其他内置 Skill。

`includeNames` 的值直接使用 pro 内置 Skill 的一级目录名。例如：

```txt
pro/admin/src/service/core/ai/skill/builtin/skill-creator/
```

对应：

```ts
includeNames: ['skill-creator']
```

加载时只做最小校验：

1. `includeNames` 对应的一级目录必须存在。
2. 该目录下必须存在 `SKILL.md`。

目录名与 `SKILL.md` frontmatter `name` 是否一致、是否为英文 slug 等语义约束不在运行时校验，交给内置 Skill 开发规范和测试保证。

sandbox 中每个内置 Skill 目录写入一个最小 manifest：

```txt
~/.fastgpt/skills/skill-creator/.fastgpt-builtin-manifest.json
```

manifest 内容只保留同步判断必需信息：

```json
{
  "etag": "sha256:xxxx"
}
```

pro 源码是事实来源，每次同步时现算当前 etag；sandbox manifest 只表示“上一次注入到该 sandbox 的版本”。这样不需要数据库版本表，也不需要每次从 sandbox 逐文件读取内容计算 hash。

当前 Skill 编辑/创建场景先在调用点写死白名单：

```ts
includeNames: ['skill-creator']
```

未来如果出现更多 FastGPT 官方内置 Skill，不修改公共同步函数，只在具体业务调用点传入不同白名单。例如代码审查场景可以传入 `['code-review']`，通用编辑创建场景继续只传 `['skill-creator']`。

## 内置辅助生成 Skill 约束

内置辅助生成 Skill 的 `SKILL.md` 必须约束模型：

- 当前用户工作区根目录包含 `.gitignore` 和 `skills/`。
- 一个平台 Skill 工作区可以包含多个可执行 Skill 目录。
- 每个可执行 Skill 目录必须包含 `SKILL.md`。
- 新创建 Skill 时，一级目录名必须使用英文，且与 `SKILL.md` frontmatter 里的 `name` 保持一致。
- 可以按需求创建 `examples/`、`templates/`、`scripts/`、`assets/` 等辅助文件。
- 不修改平台 Skill 的展示名、简介、头像、权限或版本元数据。
- 不发布、不部署、不触发保存版本。
- 用户需求不足以安全生成或修改文件时，先在聊天中追问，并且本轮不写文件。
- 写入或验证失败时，在聊天中说明失败文件、失败原因和建议下一步。

## 工具与安全边界

内置辅助生成 Skill 可以使用受控沙盒工具，而不是获得无限制执行能力。允许的能力包括：

- 读取当前 workspace 文件。
- 搜索 `skills/` 下已有内容。
- 写入新文件。
- 编辑已有文件。
- 运行必要的只读或验证类 shell 命令。

安全限制：

- 只允许操作当前 Skill 的 edit-debug 沙盒工作目录。
- 写路径必须位于用户工作区的 `skills/` 下。
- 禁止写入 `~/.fastgpt/skills`，避免内置能力被用户请求覆盖。
- 禁止绝对路径、空路径、`.`、`..`、`.git` 相关路径和包含空字符的路径。
- 不写数据库 Skill 版本，不修改 current version，不触发发布流程。
- 工具调用固定上限，例如 10 轮；超出后停止，并返回已完成内容和未完成原因。

## 发布校验

发布/保存版本时校验编辑沙盒打出的 workspace zip：

1. zip 结构安全：复用现有路径安全、symlink、大小限制校验。
2. 必须存在 `skills/` 目录。
3. `skills/` 目录下必须至少有一个一级 Skill 目录。
4. 每个一级 Skill 目录根部必须存在 `SKILL.md`。

空白初始版本是创建阶段特例，允许 `skills/` 为空；用户点击发布/保存版本时不允许发布空 workspace。

首版不在发布边界强制解析 `SKILL.md` frontmatter，不强制目录名等于 `name`，也不强制英文 slug。这些由内置辅助生成 Skill 和后续体验约束引导。

## Test Plan

- 创建 Skill 后初始版本只包含 `.gitignore` 和空 `skills/`。
- 创建流程不再根据 name 或 description 生成 `SKILL.md`，创建接口不再包含 requirements 字段。
- edit-debug sandbox 能注入 pro 内置 `skill-creator`。
- 内置 Skill 同步时只注入 `includeNames` 指定的官方 Skill。
- sandbox manifest etag 与 pro 源码 etag 一致时跳过写入。
- sandbox manifest 缺失、损坏或 etag 不一致时，只覆盖对应内置 Skill 目录。
- 右侧文件树只展示用户 workspace。
- 内置 Skill 能创建 `skills/<english-name>/SKILL.md`。
- 禁止写 `~/.fastgpt/skills`、`.git`、`../`、绝对路径和空路径。
- 发布空 workspace 失败。
- 发布包含至少一个 `skills/<name>/SKILL.md` 的 workspace 成功。
- 导出包不包含 `~/.fastgpt/skills`。

建议测试命令：

```bash
cd packages/service
pnpm exec vitest run -c vitest.config.ts test/core/ai/skill/zipBuilder.test.ts test/core/ai/skill/builtinRuntime.test.ts test/core/ai/skill/editSandboxPackage.test.ts test/core/ai/skill/runtime.test.ts test/core/ai/sandbox/runtime/profile.test.ts
pnpm exec vitest run -c vitest.config.ts test/core/workflow/dispatch/ai/agent/index.test.ts test/core/workflow/dispatch/ai/agent/piAgent/index.test.ts
cd ../..
pnpm --filter @fastgpt/app typecheck
pnpm --filter @fastgpt/admin typecheck
```

## TODO

- [x] 创建流程改为空白 workspace 初始版本。
- [x] 创建弹窗移除需求字段，创建成功后进入详情页并保持原聊天流程。
- [x] 在 pro 目录新增内置辅助生成 Skill 源码。
- [x] edit-debug sandbox 初始化时注入 pro 内置辅助生成 Skill 到 `~/.fastgpt/skills`。
- [x] Skill 应用运行时扫描用户 `skills/` 和非用户 workspace 的 `~/.fastgpt/skills`。
- [x] 确保内置 Skill 注入路径不位于用户 workspace 根目录下。
- [x] 发布/保存版本增加最小 workspace 结构校验。
- [x] 补充空白 workspace、发布校验、内置 Skill 注入和非用户 workspace 路径测试。
- [ ] 将内置 Skill 注入升级为按需同步函数，支持 `includeNames` 白名单。
- [ ] 为 sandbox 内置 Skill 写入最小 manifest，并通过 etag 判断是否需要覆盖。
