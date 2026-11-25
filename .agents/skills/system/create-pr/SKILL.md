---
name: create-pr
description: 在 FastGPT 仓库提交、创建或更新 GitHub PR 时触发（支持隐式触发与显式调用 $create-pr）。负责检查工作区与提交范围并提醒额外改动、rebase upstream/main、联动处理并提交 pro 子模块 PR，以及基于真实 diff 撰写包含需求背景、问题、解决方案、边界情况（明确考虑与不考虑）和验证结果的高质量 PR 描述。
---

# FastGPT 提交 PR 规范

PR 是面向 Reviewer 和未来维护者的**变更契约**，而不只是代码推送动作。提交或更新 PR 时，必须确保代码范围干净、基线已对齐 `upstream/main`、Pro 子模块状态一致，并产出基于真实 diff 的高信息密度 PR 描述。

## 触发与确认策略

- **触发方式**：用户要求提 PR、创建 PR、更新 PR、推送分支并提 PR，或显式调用 `$create-pr` 时均适用。
- **按需确认（自行判断）**：
  - 变更范围完全归属本次需求、目标仓库/分支明确、rebase 无逻辑冲突、且无高风险异常时，直接完成整理、推送并创建/更新 PR。
  - 出现以下任一情况时，**必须先暂停并向用户说明具体情况，待确认后再执行写操作（commit / push / 创建 PR）**：
    1. 工作区或提交历史中存在**额外代码改动**（与当前需求无关的修改、调试代码、无关重构/格式化、未跟踪文件、混入其他需求的 commit）。
    2. 涉及部署配置 `.yml` / `.yaml` 且尚未获得用户明确确认（遵守 `AGENTS.md` 部署配置保护）。
    3. Rebase 出现**逻辑冲突**（语义分歧、接口/数据/权限/兼容取舍）。
    4. 需求未涉及 `pro`，但 `pro` gitlink 发生变化或 `pro` 工作区存在未提交改动；或 `pro` 存在改动但目标仓库/分支不明确。
    5. 目标仓库、目标 base 分支或推送 remote 存在歧义（例如存在多个可写 remote 且无明确 tracking 分支）。

## 1. 核对目标与工作区代码范围

在修改 Git 历史或推送前，先建立完整的变更视图：

```bash
git status --short
git remote -v
git branch --show-current
git submodule status
```

1. **确认仓库与分支**：
   - 上游目标仓库默认是 `upstream`（`labring/FastGPT`），目标 base 分支默认是 `main`；用户明确指定其他仓库或维护分支时以其为准。
   - 不得直接在 `main`（或目标 base 分支）上开发推送；若改动落在 `main` 上，先切出语义化工作分支。
   - 推送分支到已确认的可写个人 fork（通常为 `origin`）或指定 remote，严禁直接推送 `upstream/main`。
2. **核查全部变更范围**：
   - 拉取目标基线后，同时检查未提交改动（`git status` / `git diff`）和已提交范围（`git log --oneline <merge-base>..HEAD`、`git diff --name-status <merge-base>..HEAD`）。
   - **发现额外代码改动或超大混杂范围必须提醒用户**：逐文件核对是否属于本次需求。若存在无关改动、历史清理、临时脚本或未确认的部署 `.yml/.yaml`，列出具体文件路径与改动摘要，请用户确认是剔除、拆分还是纳入本次 PR，不得静默带入，也不得私自 `reset` / `checkout` 丢弃用户现场；若净改动混入多个独立议题，或同时横跨「底层契约/DAL + 核心业务迁移 + 大量 UI/SDK」具备明显可独立合入的拆分边界，主动建议拆分为多个单一职责小 PR。
   - 若修改了 `.github/workflows/`，同步检查 `.forgejo/workflows/` 是否已按 `ci-workflow-sync` 规范对齐。

## 2. Rebase `upstream/main` 与提交前验证

每次提交或更新 PR 前，都必须对齐最新目标基线（默认 `upstream/main`）：

```bash
git fetch upstream main
git rebase upstream/main
```

1. **未提交改动处理**：在 rebase 前，确认本次需求相关的未提交改动已按逻辑整理提交（或只在确认无额外改动时处理）；遵守仓库 `.husky/pre-commit`（`lint-staged`），禁止使用 `--no-verify` 跳过钩子。
2. **冲突处理**：
   - **机械冲突**（相邻独立改动、import 排序、明确的文件重命名）：结合双边完整上下文确认不改变语义后解决。
   - **逻辑冲突**（同一行为设计不同、依赖被移除/变更、数据结构/权限/计费/默认值分歧）：**暂停并向用户说明两边差异与选项**，不盲目使用 `ours` / `theirs` 掩盖冲突。
3. **验证范围**：
   - Rebase 完成后，基于最新 `upstream/main..HEAD` 复核净 diff，确认无冲突标记、无多余改动；多轮修复或裁剪需求后，同步清理死代码、未引用 i18n key 与多余契约外壳。
   - 按 `AGENTS.md` 测试范围要求，运行覆盖改动及受影响模块的最小局部测试与 lint；用户验收前不主动运行全量测试。
   - 修改 `packages/*` 导出签名、跨包导入或 `@fastgpt/dal` 引用时，核对目标 `package.json` `exports` 公开子路径并运行受影响应用的 `typecheck`（如 `pnpm --filter @fastgpt/app typecheck`）；修改共享契约、运行时字段或 OpenAPI Schema 时，检索 `pro/` 与 `sdk/` 消费方确认已同步。

## 3. Pro 子模块联动检查与提交

检查 `pro`（`.gitmodules` 中对应 `labring/fastgpt-pro`）：

- **未初始化且主仓库无 `pro` gitlink 变更**：本次不涉及 `pro`，无需初始化。
- **本次需求修改了 `pro`**（`pro` 内有未提交改动、未推送提交，或主仓库 `pro` gitlink 相对 base 有意变更）：
  1. 进入 `pro` 同样核对工作区代码范围；若存在与本次需求无关的额外改动，先提醒用户确认。
  2. 核对 `pro` 的上游 remote（`labring/fastgpt-pro`）及对应基线分支（默认 `main`），执行 `git fetch` 与 `git rebase` 对齐最新基线；逻辑冲突同样暂停询问用户。
  3. 将 `pro` 工作分支推送到目标 remote，并在 `fastgpt-pro` 仓库创建或更新对应的 Pro PR（PR 描述同样遵守第 4 节规范）。
  4. 返回主仓库，确认主仓库记录的 `pro` gitlink 精确指向**已推送到远端**的 `pro` commit（严禁指向仅存在于本地的 commit，否则 CI 和 Reviewer 无法检出），并提交 gitlink 更新。
  5. 主仓库 PR 与 Pro PR 描述中相互标注对方的 PR 链接。
- **本次需求不涉及 `pro`，但 `pro` 有脏改动或 gitlink 变化**：必须提醒用户确认，避免误将无关 `pro` 指针带入主仓库 PR。

## 4. 撰写高质量 PR 描述（核心要求）

撰写 PR 描述前，必须通读 `git diff upstream/main..HEAD`（以及涉及的 `pro` diff）和相关调用链，**以最终提交快照为唯一事实来源**，禁止仅复述最后一条 commit message 或对话记忆。

### 标题与语言

- **标题**：遵循 Conventional Commits（`type(scope): 简明概括本次核心改动`，如 `feat(workflow): ...`、`fix(auth): ...`、`refactor(dataset): ...`、`docs(skill): ...`），直接表达行为或问题，不使用模糊标题（如 `fix bug`、`update code`）。
- **正文**：默认使用中文，结构清晰、直奔主题。

### 禁止事项（反偷懒约束）

- 禁止空泛套话：如“优化了部分逻辑”“修复了一些已知问题”“按需调整代码”“完善相关处理”。
- 禁止只罗列修改文件名而不说明行为变化和实现思路。
- 禁止跳过“边界情况”，更禁止只写“已处理常见边界”而不具体说明**哪些已考虑、哪些明确不考虑**。
- 禁止虚报验证：不能把代码推理或未执行的测试写成“已测试通过”。

### 必填结构与模板

正文必须覆盖以下核心板块（关联信息按需保留，其余四项不可省略）：

```markdown
## 需求背景
- 说明为什么要做这次改动：业务场景、用户/系统诉求，以及关联的 Issue 或设计文档（如 `.agents/design/...`）。

## 问题说明
- 当前存在什么具体问题或能力缺口（修复/优化类写清触发路径与根因；新功能类写清现状限制）。
- 落到具体模块、状态或调用链，不泛泛描述。

## 解决方案
- **核心思路**：简述采用的方案及关键设计取舍（若有替代方案，说明为何选当前方案）。
- **行为变化**：核心行为从什么变成什么（接口、数据结构/索引、权限、计费、运行时、交互等）。
- **关键实现路径**：按“入口 → 核心处理 → 数据/状态落点”说明关键改动模块与职责（而非机械罗列文件名）。

## 边界情况
### 已考虑并处理
- 逐条列出本次已覆盖的关键边界条件及处理策略（如空值/非法输入、旧数据兼容、权限隔离、并发/重试、失败回滚、极端数据规模等）。

### 明确不考虑（Out of Scope）
- 逐条明确列出本次**刻意不处理或暂不支持**的场景、历史遗留问题或后续迭代项，并简述原因，便于 Reviewer 判断变更边界。

## 验证情况
- **已执行验证**：列出实际运行的局部单测/集成测试/类型检查/lint/手测场景及结果（如 `单测 12/12 通过`）。
- **未覆盖/受限说明**：说明未运行或受环境限制未验证的部分及评估依据（如无则写“无”）。

## 关联信息（按需）
- 关联 Issue：`Refs #xxx` / `Fixes #xxx`
- 关联 Pro PR：<链接>（涉及 `pro` 改动时必填）
- 设计/分析文档：`<相对路径>`
- 破坏性变更 / 配置或迁移注意：（有则写明，无则省略）
```

> 小型改动（例如纯文档/单点 bugfix）可保持精简篇幅，但**需求背景、问题说明、解决方案、边界情况（含已考虑与明确不考虑）、验证情况**五个维度必须全部落地，每项写清实质内容而非占位符。

## 5. 推送与创建/更新 PR

1. **安全推送**：
   - Rebase 后若远端同名分支已有历史，使用 `git push --force-with-lease <push-remote> HEAD:<branch>`，严禁使用裸 `-f` / `--force`。
   - 新分支首次推送使用 `git push -u <push-remote> <branch>`。
2. **复用已有 PR 或新建 PR**：
   - 先检查该分支是否已存在指向目标仓库的 open PR：
     ```bash
     gh pr list --repo labring/FastGPT --head "<head-owner>:<branch>" --state open --json number,url,title
     ```
   - **已存在 open PR**：使用 `gh pr edit <number> --repo labring/FastGPT --title ... --body-file ...` 按最新完整 diff 刷新标题与正文，避免重复建 PR。
   - **不存在 open PR**：使用 `gh pr create --repo labring/FastGPT --base <base-branch> --head "<head-owner>:<branch>" --title ... --body-file ...` 创建 PR。
   - 若同时创建/更新了 Pro PR，在拿到双方链接后及时补全互相引用。
3. **交付汇报**：
   - 输出主仓库 PR 链接（及 Pro PR 链接如有）、目标分支与 rebase 基线 SHA、验证结果，以及需 Reviewer 重点关注的风险或待确认事项。
