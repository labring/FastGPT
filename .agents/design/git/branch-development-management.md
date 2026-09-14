# Git 分支开发与发布管理规范

> 状态：已评审，按项目规约执行
>
> 适用范围：本仓库所有本地 Git 操作、远程分支、Pull Request、官方代码同步和版本发布
>
> 最后校准：2026-09-14

## 1. 目标与结论

本项目采用“功能分支开发、`dev` 集成验收、`main` 稳定发布”的分支模型：

```text
feat/fix/refactor/docs/chore
              |
              | PR + Squash Merge
              v
             dev
              |
              | 验收通过后 PR + Merge Commit
              v
             main
```

核心决策：

- 个人独占功能分支允许 rebase 到最新 `origin/dev`。
- 已共享或已被其他人使用的功能分支，默认 merge 最新 `origin/dev`，不得擅自 rebase。
- 普通功能 PR 合入 `dev` 使用 Squash Merge；合入后删除功能分支。
- `dev -> main` 发布 PR 使用 Merge Commit，保留长期分支的祖先关系。
- `dev` 和 `main` 禁止直接 push，正常更新必须经过 PR。
- `origin` 是项目自有仓库；`upstream` 只用于获取官方 FastGPT 更新，不得向其推送。
- 功能分支只能跟踪 `origin` 下的同名远程分支，不得跟踪 `upstream/main`。

Merge commit 不会造成分支引用混乱。分支只是 commit 引用；merge 只会移动目标分支引用并创建带两个父提交的 commit。真正容易造成 PR 重复的是在长期分支之间使用 Squash/Rebase Merge，或在功能分支 Squash 合入后继续复用旧分支。

## 2. 远程仓库职责

固定远程配置：

```text
origin    git@github.com:zeroven0205-spec/ZeroFastGPT.git
upstream  git@github.com:labring/FastGPT.git
```

职责约束：

| 远程 | 用途 | 推送规则 |
|---|---|---|
| `origin` | 项目自有代码、功能分支、`dev`、`main` | 只在明确目标后推送；正常开发只推送功能分支 |
| `upstream` | 获取 FastGPT 官方更新 | 禁止推送 |

本地分支跟踪关系应为：

```text
main                              -> origin/main
dev                               -> origin/dev
feat/*、fix/* 等普通开发分支       -> origin/<同名分支>
```

官方代码通过远程跟踪引用使用：

```text
upstream/main
```

不应让本地 `main` 跟踪 `upstream/main`，否则执行 `git pull` 时可能误把官方仓库当作项目生产分支。

## 3. 分支类型和命名

### 3.1 长期分支

#### `main`

生产稳定分支，正式发布和版本标签必须基于此分支。

- 禁止直接开发。
- 禁止直接 push。
- 禁止 force push。
- 只能通过已审查、已验证的 PR 更新。

#### `dev`

集成、测试和验收分支。

- 普通功能和修复必须通过 PR 合入。
- 禁止直接开发。
- 禁止直接 push。
- 禁止 force push。
- 只接收已完成基本验证的变更。

### 3.2 临时分支

| 类型 | 用途 | 默认基线 |
|---|---|---|
| `feat/*` | 新功能 | `origin/dev` |
| `fix/*` | 普通缺陷修复 | `origin/dev` |
| `refactor/*` | 不改变业务目标的重构 | `origin/dev` |
| `docs/*` | 文档变更 | `origin/dev` |
| `chore/*` | 依赖、脚本和工程维护 | `origin/dev` |
| `hotfix/*` | 生产紧急修复 | `origin/main` |
| `sync/upstream-*` | 集中同步官方更新 | `origin/dev` |
| `backup/*` | 高风险操作前的安全快照 | 当前分支 HEAD |

分支名要求：

- 使用小写和 kebab-case。
- 使用明确的业务或问题描述。
- 不使用 `temp`、`test`、`new`、`final` 等无法说明目的的名称。
- 可在描述中包含关联任务号。

示例：

```text
feat/app-h5-white-label-mvp
fix/chat-input-mobile-focus
refactor/workflow-runtime-context
docs/git-branch-management
sync/upstream-v4.17.1
hotfix/auth-token-expiration
```

## 4. 创建和检查功能分支

创建前必须确认当前工作区不会把其他任务的修改带入新分支：

```bash
git remote -v
git branch --show-current
git status --short --branch
git diff --name-only --diff-filter=U
```

如果工作区有未提交修改，必须先确认修改归属，再选择提交、具名 stash 或创建备份。禁止为了切换分支而丢弃修改。

同步 `dev` 并创建普通功能分支：

```bash
git fetch origin --prune
git switch dev
git merge --ff-only origin/dev
git switch -c feat/<功能名称>
```

首次推送功能分支：

```bash
git push -u origin HEAD
```

创建分支后检查：

```bash
git branch -vv
git status --short --branch
```

## 5. 功能分支日常提交

提交必须发生在 `feat/*`、`fix/*`、`refactor/*`、`docs/*` 或 `chore/*` 等临时分支，不得在 `dev` 或 `main` 上直接编写普通功能。

提交前检查：

```bash
git status --short
git diff --check
git diff --stat
git diff --name-only --diff-filter=U
```

提交要求：

- 一个提交应表达一个清晰的逻辑变更。
- 排除无关格式化、临时调试和本地环境文件。
- 不提交密钥、token、个人配置和生成产物。
- 根据改动范围执行局部 lint、类型检查和测试。
- 不在用户最终验收前主动运行全量测试。
- 提交信息优先采用 Conventional Commits 格式。

示例：

```text
feat(app-entry): add white-label mobile workbench
fix(chat): restore mobile input focus
refactor(workflow): isolate runtime context
docs(git): add branch development policy
```

## 6. 同步最新 `dev`

### 6.1 个人独占分支：允许 rebase

只有在分支由当前开发者独占、没有其他人基于其开发且接受重写历史时，才允许：

```bash
git fetch origin --prune
git rebase origin/dev
```

rebase 冲突：

```bash
git status
git diff --name-only --diff-filter=U
# 解决冲突并暂存
git add <已解决文件>
git rebase --continue
```

放弃：

```bash
git rebase --abort
```

rebase 已推送分支后，只有在确认远程没有他人新增提交并获得明确授权时，才能使用 `--force-with-lease` 更新远程功能分支。

### 6.2 已共享分支：默认 merge

已经推送、已经创建 PR、多人协作或被其他分支引用的功能分支，默认使用：

```bash
git fetch origin --prune
git merge origin/dev
```

merge 冲突：

```bash
git status
git diff --name-only --diff-filter=U
# 解决冲突并暂存
git add <已解决文件>
git commit
```

放弃：

```bash
git merge --abort
```

共享分支未经所有协作者确认，不得 rebase 后 force push。

## 7. PR 合并策略

### 7.1 普通功能合入 `dev`

```text
feat/*、fix/*、refactor/*、docs/*、chore/* -> dev
```

默认使用 **Squash Merge**。

原因：开发分支中的调试、修复和整理提交不一定需要全部保留在集成分支，Squash 可以让 `dev` 中每个功能对应一个清晰的集成提交。

Squash 合入完成后必须：

1. 确认 CI、代码审查和必要测试均通过；
2. 确认 PR 目标是 `dev`；
3. 删除远程功能分支；
4. 删除本地功能分支；
5. 后续工作从最新 `dev` 创建新功能分支。

不要在 Squash 合入后继续复用旧功能分支，否则后续 PR 可能重复显示已合入的变更。

### 7.2 `dev` 发布到 `main`

```text
dev -> main
```

默认使用 **Merge Commit**，不得使用 Squash Merge 或 Rebase and Merge 代替常规发布合并。

Merge Commit 能保留 `dev` 提交作为 `main` 的祖先，避免长期分支因提交 SHA 被重新生成而在下一次发布 PR 中重复显示已发布内容。

发布前必须确认：

- `dev` 已完成测试和业务验收；
- PR 的目标分支为 `main`；
- 没有未解决的 review 对话和 CI 失败；
- 发布变更范围只包含已验收内容。

### 7.3 PR 合并方式总表

| PR 方向 | 默认方式 | 说明 |
|---|---|---|
| `feat/* -> dev` | Squash Merge | 每个功能形成一个集成提交 |
| `fix/* -> dev` | Squash Merge | 压缩修复过程中的临时提交 |
| `sync/upstream-* -> dev` | Merge Commit | 保留官方同步边界和来源 |
| `dev -> main` | Merge Commit | 保留长期分支祖先关系 |
| `hotfix/* -> main` | Merge 或 Squash | 按修复规模决定，完成后必须回流 `dev` |

## 8. Hotfix 流程

生产紧急问题从最新 `origin/main` 创建：

```bash
git fetch origin --prune
git switch main
git merge --ff-only origin/main
git switch -c hotfix/<问题描述>
```

修复完成后：

```text
hotfix/* -> main PR
```

生产修复合入 `main` 并发布后，必须将实际修复内容同步回 `dev`：

```text
hotfix/* 或 main -> dev PR
```

不能只修复 `main` 而遗漏 `dev`。如果 `main` 仅多出发布 merge commit、没有额外代码改动，则不需要为了同步 merge commit 本身而制造重复合并。

## 9. 官方代码同步流程

官方更新统一通过专用同步分支进入 `dev`，不在普通功能分支中重复合并 `upstream/main`：

```bash
git fetch origin --prune
git fetch upstream --prune
git switch dev
git merge --ff-only origin/dev
git switch -c sync/upstream-$(date +%Y%m%d)
git merge upstream/main
```

完成冲突处理、局部测试和必要构建后，创建：

```text
sync/upstream-* -> dev PR
```

约束：

- 禁止向 `upstream` 推送。
- 禁止直接在 `dev` 上合并官方更新。
- 普通功能分支默认不直接合并 `upstream/main`。
- 不同功能分支不得重复引入同一批官方更新。
- 官方同步 PR 合入后删除 `sync/upstream-*` 分支。

## 10. 高风险操作与备份

以下操作前必须评估是否需要创建 `backup/*`：

- rebase 已推送的分支；
- 大范围官方代码同步；
- 复杂冲突处理；
- cherry-pick 或提交历史重写；
- 其他可能覆盖当前提交历史的操作。

创建备份：

```bash
branch=$(git branch --show-current)
backup="backup/$(printf '%s' "$branch" | tr '/' '-')-$(date +%Y%m%d-%H%M%S)"
git branch "$backup"
echo "$backup"
```

如果工作区有未提交内容，还必须单独保存：

```bash
git stash push -u -m "backup before rewriting $branch $(date '+%Y-%m-%d %H:%M:%S')"
git stash list -1
```

`backup/*` 只保存已提交内容，stash 保存工作区内容，两者不能互相替代。

禁止使用以下破坏性命令清理同步问题：

```bash
git reset --hard
git clean -fd
```

除非已经有可验证备份且用户明确授权。

删除备份前必须确认其中没有唯一提交：

```bash
git log --oneline origin/dev..backup/<备份分支>
git log --oneline origin/main..backup/<备份分支>
```

远程备份分支的创建和删除均属于远程写操作，需要明确授权。

## 11. 推送前强制检查

任何远程写入前必须执行并检查：

```bash
git remote -v
git branch --show-current
git status --short --branch
git diff --check
git diff --name-only --diff-filter=U
git branch -vv
```

还必须根据本次 PR 的基线检查提交范围，例如普通功能分支：

```bash
git log --oneline --decorate origin/dev..HEAD
```

检查要求：

1. remote 必须是预期的 `origin` 或明确批准的目标 remote；
2. 普通开发只能推送当前功能分支；
3. `dev`、`main`、`release/*` 不得直接推送；
4. 不存在未解决冲突；
5. 工作区中的未提交文件不会被 push，必须确认待交付内容已经提交；
6. 提交范围不包含无关任务、临时提交、敏感信息或部署配置误改；
7. 根据改动范围完成必要的局部 lint、类型检查和测试；
8. Agent 执行 push、删除远程分支、修改远程标签等远程写操作前，必须获得用户针对具体 remote 和 branch 的明确授权。

## 12. 分支保护要求

建议为 `dev` 和 `main` 配置：

- 禁止直接 push；
- 必须通过 PR；
- 必须通过必要状态检查；
- 合并前解决所有 review 对话；
- 禁止 force push；
- 禁止删除分支；
- 合并前要求分支与目标分支同步；
- 限制可以绕过保护规则的账号。

多人维护时建议至少一名非提交者审批；单人维护时可不强制审批人数，但仍应保留 PR、CI 和合并检查。

## 13. 发布和标签

正式版本必须从 `main` 发布：

```text
dev -> main PR
       ↓
main 验证
       ↓
创建版本标签
```

标签必须：

- 基于 `main`；
- 使用项目现有版本格式，例如 `v4.17.1`；
- 创建和推送前获得明确授权；
- 不在未验收的功能分支或 `dev` 上创建正式标签。
