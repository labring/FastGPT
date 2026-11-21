# Agent Skill 当前设计

状态：当前实现

最后核对：2026-07-16

## 目标

平台 Skill 使用“空白工作区 + Agent 辅助编辑”的创建体验。平台负责资源、版本、发布校验和运行态部署；Skill 的具体内容由用户在编辑工作区中创建，不在创建弹窗中生成默认需求或 `SKILL.md`。

## 创建与编辑

创建 Skill 时只收集平台资源信息，例如名称、简介、头像和目录。创建成功后：

1. 创建一个空白 workspace 初始版本。
2. 进入 Skill 详情和编辑聊天。
3. 用户自行创建 `skills/<skill-name>/SKILL.md` 及相关文件，或使用内置辅助生成 Skill。

创建接口不接收 `requirements`，也不根据名称或描述生成默认 Skill 内容。

## 工作区约束

用户 Skill 产物推荐位于：

```text
<workspace>/skills/<skill-name>/SKILL.md
```

这是编辑器和 Agent 的默认约定；发布校验与运行态扫描并不强制该布局，只要求包内至少有一个 `SKILL.md`。
禁止把用户 Skill 写到系统内置 Skill 目录。Agent reminder 会明确提供当前工作目录和写入边界。

发布/保存版本前执行最小结构校验，至少要求：

- 包内任意位置存在至少一个 `SKILL.md` 文件（大小写不敏感、任意深度，仅文件，`node_modules`、`.venv`、`venv` 下的条目跳过）。
- 至少存在一个 frontmatter 有效且包含非空 `name` 的 `SKILL.md`；解析失败或缺少 `name` 的文件（如文档示例、草稿）会被跳过并记录警告，不阻断发布；若包内所有 `SKILL.md` 均无效，则拒绝发布并返回可国际化的业务错误码（`SkillErrEnum`），具体解析原因记入日志与 `cause`。
- 不限制同一包内子 Skill 之间的 `name` 重复（模型提示同时注入 `name`、`description` 和唯一文件路径 `location`）。
- 版本包不能通过绝对路径或 `..` 逃逸工作区，不能包含 ASCII 控制字符（普通空格保留），且解压总大小受限。

扫描与元数据解析规则各只有一份实现：

- 入口扫描与元数据解析：`packages/service/core/ai/skill/utils.ts`（`RUNTIME_SKILL_SCAN_PRUNE_DIRS` / `findSkillMdEntries` / `extractSkillMetadataFromMarkdown`），包级聚合入口为 `packages/service/core/ai/skill/package/runtimeMetadata.ts`（`extractRuntimeSkillsFromPackage`）。

发布结构校验、版本元数据解析和运行态扫描共用同一套口径：运行时把版本包整包解压到 `projects/<versionId>/` 后，
用 `find ... -type f -iname "SKILL.md"` 递归扫描（同样跳过 `node_modules/.venv/venv`），跳过解析失败或缺少 `name` 的文件，
每个有效 `SKILL.md` 目录即一个可执行 Skill。路径只按 `/` 解释（Unix `unzip` 保留字面反斜杠），目录条目不算入口。
编辑调试工作区与内置技能目录采用完全相同的递归扫描规则；工作区根目录 `.gitignore` 与默认忽略规则仅在 Skill 发布打包时生效，Skill 导出完整打包当前编辑工作区（仅排除临时 `package.zip` 并保留体积与 ZIP 结构安全校验），App 发布及其他扫描阶段均不处理 `.gitignore`。
导出完整工作区包含默认忽略的文件，但会跳过符号链接（依赖目录常见），仍受整包大小与 ZIP 安全校验。

导入 Skill 包时**原样入库**：平台不做布局校验、不重排目录、不改写文件，导入阶段仅执行请求/权限校验与流式上传大小限制并保存原始字节；归档路径与大小安全校验在后续解压、发布、导出或读取版本元数据等包使用阶段执行。

## 内置辅助生成 Skill

Pro 可以提供平台内置的辅助生成 Skill 源码。运行时遵循以下边界：

- 源码归 Pro 所有，社区版通过可选注入接口保持无依赖。
- 内置 Skill 写入 Sandbox HOME 下的 `.fastgpt/skills/<name>`。
- 内置目录不在用户 workspace 内，因此不会出现在用户产物、导出包或发布版本中。
- 同步逻辑根据文件内容计算 etag，内容没有变化时不覆盖。
- Agent 扫描用户 workspace 和内置 Skill 目录，把可用 Skill 的名称、描述和 `SKILL.md` 路径放入 reminder。
- 模型必须先读取匹配 Skill 的完整 `SKILL.md`，不能仅凭描述推断工作流。

实现入口：

- 通用注入协议：`packages/global/core/ai/skill/runtime/builtin.ts`
- Sandbox 同步：`packages/service/core/ai/sandbox/application/runtime/skill/builtin.ts`
- Skill 扫描与已发布版本部署：`packages/service/core/ai/sandbox/application/runtime/skill`

## 发布与运行

### 发布

Skill 版本保存为不可变 ZIP 包并记录 storage key。发布校验在持久化版本前执行，失败时不生成可运行版本。

### 普通 Agent 运行

1. 根据 Agent 配置读取选中的 Skill。
2. 校验团队和成员读取权限。
3. 将当前发布版本注入会话 Sandbox。
4. 可选执行版本根目录的 `entrypoint.sh`。
5. 扫描 `SKILL.md` 并把可用 Skill 信息注入当前轮 reminder。

### Skill Edit Debug

编辑调试直接使用 Skill Edit Sandbox 的当前工作区，避免下载旧发布版本覆盖正在编辑的内容。内置辅助生成 Skill 仍位于 Sandbox HOME，与用户工作区隔离。

## 安全边界

- Skill ZIP 解压前校验总大小和路径穿越。
- 部署前检查团队归属和成员读取权限。
- 内置 Skill 不进入用户版本包。
- entrypoint 在隔离 Sandbox 中执行，限制时间和输出；失败不标记为成功。
- 已发布 Skill 以 versionId 作为部署目录，避免同名 Skill 相互覆盖。

## 验证范围

相关改动至少覆盖：

- 空白 workspace 创建和创建接口 schema。
- 最小发布结构和非法路径校验。
- Skill 包权限、大小限制和部署目录。
- edit-debug 不覆盖当前工作区。
- 内置 Skill 路径隔离、etag 幂等同步和扫描。
- entrypoint 的成功、失败和重复执行行为。
