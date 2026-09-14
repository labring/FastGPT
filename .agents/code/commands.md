# FastGPT 开发命令

本文档记录本仓库常用开发命令。执行前请确认位于仓库根目录 `/Volumes/code/FastGPT`，并使用 `pnpm` workspace 环境。

## 项目专用命令

### 主应用（`projects/app/`）

- `cd projects/app && pnpm dev` - 启动 NextJS 开发服务器
- `cd projects/app && pnpm build` - 构建 NextJS 应用
- `cd projects/app && pnpm start` - 启动生产服务器

### 代码沙箱（`projects/code-sandbox/`）

- `cd projects/code-sandbox && pnpm dev` - 以监视模式启动（Bun）
- `cd projects/code-sandbox && pnpm build` - 构建沙箱服务
- `cd projects/code-sandbox && pnpm test` - 运行 Vitest 测试

### MCP 服务器（`projects/mcp_server/`）

- `cd projects/mcp_server && bun dev` - 使用 Bun 以监视模式启动
- `cd projects/mcp_server && bun build` - 构建 MCP 服务器
- `cd projects/mcp_server && bun start` - 启动 MCP 服务器

## 工具命令

- `pnpm lint` - 对所有 TypeScript 文件运行 ESLint 并自动修复
- `pnpm test` - 顺序运行所有 workspace 单元测试，然后运行仓库根目录测试
- `pnpm test <file-path...>` - 顺序运行指定测试，关闭覆盖率并限制为单 worker
- `FASTGPT_TEST_SCOPE=app pnpm test` - 只运行指定 workspace；支持逗号分隔多个 scope，以及 `workspace`、`repo`
- `FASTGPT_TEST_MODE=integration pnpm test` - 运行 service 集成测试；`sandbox` 运行沙箱集成测试，`all` 运行 workspace 单测和 service 集成测试
- `pnpm initIcon` - 初始化图标资源
- `pnpm gen:theme-typings` - 生成 Chakra UI 主题类型定义

## Git 远程与推送执行规范

本节是本项目 Git 分支、远程同步、Pull Request、发布和远程写入的强制操作规范。完整设计和决策见 [`分支开发与发布管理规范`](../design/git/branch-development-management.md)。

### 1. 分支模型

```text
feat/fix/refactor/docs/chore -> dev -> main
              PR + Squash       PR + Merge Commit
```

- `dev`：集成、测试和验收分支。
- `main`：生产稳定和正式发布分支。
- `feat/*`、`fix/*`、`refactor/*`、`docs/*`、`chore/*`：普通开发分支，默认从最新 `origin/dev` 创建。
- `hotfix/*`：生产紧急修复分支，从最新 `origin/main` 创建。
- `sync/upstream-*`：集中同步官方 FastGPT 更新的临时分支。
- `backup/*`：rebase、复杂同步或其他高风险操作前的安全快照。

普通分支命名使用小写 kebab-case，例如：

```text
feat/app-h5-white-label-mvp
fix/chat-input-mobile-focus
sync/upstream-v4.17.1
hotfix/auth-token-expiration
```

### 2. 固定远程职责和跟踪关系

```text
origin    git@github.com:zeroven0205-spec/ZeroFastGPT.git
upstream  git@github.com:labring/FastGPT.git
```

- `origin`：项目自有仓库，用于项目分支的拉取和推送。
- `upstream`：官方 FastGPT 仓库，只用于获取官方更新，禁止推送。
- `main` 应跟踪 `origin/main`。
- `dev` 应跟踪 `origin/dev`。
- 普通功能分支应跟踪 `origin/<同名分支>`。
- 功能分支不得跟踪 `upstream/main`。

每次同步或推送前必须检查：

```bash
git remote -v
git branch --show-current
git status --short --branch
git branch -vv
```

如果 remote 地址、当前分支或跟踪关系异常，必须停止操作，不得继续 push、merge 或 rebase。

### 3. 创建普通功能分支

创建前确认工作区没有其他任务的修改：

```bash
git status --short --branch
git diff --name-only --diff-filter=U
```

工作区不干净时，必须先确认修改归属并提交、具名 stash 或创建备份。禁止为了切换分支而丢弃修改。

从最新 `origin/dev` 创建功能分支：

```bash
git fetch origin --prune
git switch dev
git merge --ff-only origin/dev
git switch -c feat/<功能名称>
git push -u origin HEAD
```

### 4. 同步 `dev` 的选择规则

#### 个人独占分支：允许 rebase

只有当前开发者独占、没有其他人基于其开发且接受重写历史时，才允许：

```bash
git fetch origin --prune
git rebase origin/dev
```

#### 已共享分支：默认 merge

已经推送、已经创建 PR、多人协作或被其他分支引用的分支，默认：

```bash
git fetch origin --prune
git merge origin/dev
```

未经所有协作者确认，不得在共享分支上 rebase 并 force push。

#### 冲突处理

```bash
git status
git diff --name-only --diff-filter=U
```

merge 冲突解决后：

```bash
git add <已解决文件>
git commit
```

rebase 冲突解决后：

```bash
git add <已解决文件>
git rebase --continue
```

放弃操作：

```bash
git merge --abort
git rebase --abort
```

### 5. PR 合并规则

普通功能、修复、重构和文档变更：

```text
feat/*、fix/*、refactor/*、docs/*、chore/* -> dev
```

默认使用 **Squash Merge**。PR 合入后必须删除功能分支；如果继续开发，必须从最新 `dev` 创建新分支。不要在 Squash 合入后继续复用旧功能分支，否则后续 PR 可能重复显示已合入内容。

发布 PR：

```text
dev -> main
```

默认使用 **Merge Commit**，不得使用 Squash Merge 或 Rebase and Merge 代替常规发布合并。这样可以保留 `dev` 提交作为 `main` 的祖先，避免长期分支在下一次发布中重复显示历史变更。

推荐合并方式：

| PR 方向 | 合并方式 |
|---|---|
| `feat/* -> dev` | Squash Merge |
| `fix/* -> dev` | Squash Merge |
| `sync/upstream-* -> dev` | Merge Commit |
| `dev -> main` | Merge Commit |
| `hotfix/* -> main` | Merge 或 Squash，完成后必须回流 `dev` |

`dev` 和 `main` 正常情况下只能通过 PR 更新，禁止本地直接 merge 后 push。

### 6. Hotfix 和官方同步

生产紧急修复：

```bash
git fetch origin --prune
git switch main
git merge --ff-only origin/main
git switch -c hotfix/<问题描述>
```

使用 `hotfix/* -> main` PR 发布后，必须通过 PR 将实际修复回流 `dev`。如果 `main` 只有发布 merge commit、没有额外代码改动，不需要为了同步该 merge commit 本身而制造重复合并。

官方更新必须集中处理：

```bash
git fetch origin --prune
git fetch upstream --prune
git switch dev
git merge --ff-only origin/dev
git switch -c sync/upstream-$(date +%Y%m%d)
git merge upstream/main
```

完成冲突处理、测试和构建后，创建：

```text
sync/upstream-* -> dev PR
```

禁止直接在 `dev` 上合并 `upstream/main`，普通功能分支也不应重复合并官方更新。

### 7. 高风险操作和备份

rebase 已推送分支、大范围官方同步、复杂冲突处理或其他可能重写历史的操作前，应创建 `backup/*`：

```bash
branch=$(git branch --show-current)
backup="backup/$(printf '%s' "$branch" | tr '/' '-')-$(date +%Y%m%d-%H%M%S)"
git branch "$backup"
echo "$backup"
```

工作区有未提交内容时，还必须单独保存：

```bash
git stash push -u -m "backup before rewriting $branch $(date '+%Y-%m-%d %H:%M:%S')"
git stash list -1
```

`backup/*` 只保存已提交内容，stash 保存工作区内容，两者不能互相替代。只有确认备份没有唯一提交且不再需要回退时，才允许删除。

禁止使用以下破坏性命令处理同步冲突，除非已有可验证备份且用户明确授权：

```bash
git reset --hard
git clean -fd
```

### 8. 推送前强制检查

任何远程写入前必须执行：

```bash
git remote -v
git branch --show-current
git status --short --branch
git diff --check
git diff --name-only --diff-filter=U
git branch -vv
```

普通功能分支还应检查相对 `dev` 的提交范围：

```bash
git log --oneline --decorate origin/dev..HEAD
```

必须确认：

1. 目标 remote 是预期的 `origin`，不得向 `upstream` 推送。
2. 当前分支是明确的普通功能分支；不得直接推送 `dev`、`main` 或 `release/*`。
3. 没有未解决冲突。
4. 待推送提交全部属于当前任务，不包含无关修改、临时提交或敏感信息。
5. 未提交文件不会被 push，必须确认目标内容已经提交。
6. 已完成改动范围所需的局部 lint、类型检查和测试。
7. Agent 执行 push、删除远程分支或修改远程标签前，必须获得用户针对具体 remote 和 branch 的明确授权。

### 9. 推送功能分支

首次推送：

```bash
git push -u origin HEAD
```

普通后续推送，确认跟踪关系正确后：

```bash
git push origin HEAD
```

rebase 后更新已推送的个人独占分支，必须确认远程没有他人新增提交、已有必要备份并获得明确授权后，才允许：

```bash
git fetch origin <功能分支>
git push --force-with-lease origin HEAD:<功能分支>
```

禁止：

```bash
git push --force
```

`--force-with-lease` 也禁止用于 `dev`、`main` 和 `release/*`。

### 10. 发布和标签

正式发布必须经过：

```text
dev -> main PR
       ↓
main 验证
       ↓
创建版本标签
```

正式标签必须基于 `main`，使用项目现有格式，例如 `v4.17.1`。创建和推送标签前必须获得明确授权，不得在未验收的功能分支或 `dev` 上创建正式标签。

### 11. GitHub 分支保护

`dev` 和 `main` 应配置：

- 禁止直接 push；
- 必须通过 PR；
- 必须通过必要状态检查；
- 合并前解决 review 对话；
- 禁止 force push 和删除分支；
- 合并前要求分支与目标分支同步。
