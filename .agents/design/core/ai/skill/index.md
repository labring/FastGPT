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

- 包内任意位置存在至少一个 `SKILL.md`（大小写不敏感、任意深度，仅文件、`node_modules`、`.venv`、`venv` 下的条目跳过）。
- 若存在标准工作区入口 `skills/<name>/SKILL.md`，版本元数据只解析这些入口；更深层的 `SKILL.md`（如示例模板）视为资源，不参与发布。
- 打包时默认与自定义忽略规则可能排除 `dist/` 等目录；打包后必须核对**入口选择规则选中的入口**全部保留在实际 ZIP 中，否则拒绝发布。标准包里被排除的深层示例属于资源，不作为丢失入口。
- 打包前的入口扫描必须成功：发布模式下 `find` 非零退出会直接报错拒绝保存，不会把「空入口清单」当成没有入口继续发布。
- 打包后的条目清单来自 `unzip -Z1` 展示文本，文件名中的换行/回车会显示成 `^J`；比较前把扫描到的真实路径归一化成同一表示，避免含换行的合法文件被误判为丢失。
- `SKILL.md` frontmatter 满足平台解析要求。
- 版本包不能通过绝对路径或 `..` 逃逸工作区，且解压总大小受限。

「标准入口判断」与「入口选择（标准优先）」只有一份实现：`packages/service/core/ai/skill/package/skillEntryScan.ts`
（`isStandardWorkspaceSkillEntryPath` / `selectSkillEntryPaths`）。版本元数据解析、打包保留检查和运行态扫描都直接引用该模块，
不再各自维护同名谓词。

发布校验与运行态扫描使用同一套规则：运行时把版本包整包解压到 `projects/<versionId>/` 后，用
`find ... -type f -iname "SKILL.md"` 递归扫描（同样跳过 `node_modules/.venv/venv`），每个命中的
`SKILL.md` 目录即一个可执行 Skill。路径只按 `/` 解释（Unix `unzip` 保留字面反斜杠），目录条目不算入口。
运行态按**已发布版本的入口契约**工作：`injectAgentSkillFilesToSandbox` 把版本的 `runtimeSkills[].path` 作为
`skillMdPaths` 带入 `DeployedSkillVersion`，扫描已部署版本目录时：

- `skillMdPaths` 非空 → 只提供这些声明入口，与发布元数据保持一致；
- `skillMdPaths` 为空（旧导入版本或未重发版本）→ 不做入口过滤，保留基点行为（递归扫描，有效根级入口照常提供）。

非版本目录（编辑调试工作区、内置技能目录）继续使用「标准入口优先」：扫描根存在 `skills/<name>/SKILL.md`
时只认这些标准入口，否则递归接受任意深度的 `SKILL.md`；每个扫描根独立判断，互不影响。

导入 Skill 包时**原样入库**：平台不做布局校验、不重排目录、不改写文件，只保留流式大小限制和 ZIP 路径安全校验。

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
