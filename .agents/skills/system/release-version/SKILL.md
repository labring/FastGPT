---
name: release-version
description: 仅在用户明确调用或要求发布 FastGPT 新版本（release）时触发，必须由用户输入目标版本号（如 v4.17.6 或 4.17.6）。负责发布前全项核查（Pro 联动 PR 与子模块对齐、package.json 版本号、伴生镜像兼容性、升级脚本与配置变更、中英文发布文档完整性、CI 状态）、提交并合入版本号 PR、创建 GitHub Release 触发主/商业版镜像构建，以及向 main 提交文档（含 releaseTime）与部署模板 YAML 更新 PR。
---

# FastGPT 版本发布（Release Version）

标准化执行 FastGPT 版本发布全链路：**发布前核查 → 目标分支更新版本号 → 创建 GitHub Release 触发镜像构建 → 向 `main` 提交发布文档与部署模板 PR**。

**必须由用户明确提供目标版本号。未提供时先询问并等待答复，不得自行推测下一版本号，也不得在存在未解决阻断项时打 tag 或创建 Release。**

调用示例：

```text
$release-version v4.17.6
使用 release-version 发布 4.17.6，检查文档并提交 yml 和文档变更 PR
```

## 1. 解析版本与固定发布上下文

1. **标准化版本号**：支持 `v4.17.6`、`4.17.6` 或 `4176` 输入，统一解析为：
   - 标签名：`tag_name = vX.Y.Z`（例如 `v4.17.6`）
   - 包版本号：`pkg_version = X.Y.Z`（例如 `4.17.6`）
   - 维护分支名：`maint_branch = vX.Y.x`（例如 `v4.17.x`）
   - 文档路径：`document/content/self-host/upgrading/<X-Y>/<XYZ>.mdx` 与 `<XYZ>.en.mdx`（通过已有目录和 frontmatter 交叉确认，不硬拆多位数补丁号）
2. **确认目标仓库与发布分支**：
   - 优先确认官方上游 remote `upstream`（`labring/FastGPT`）与个人可写 fork `origin`，刷新 `main`、维护分支和 tags：
     ```bash
     git fetch upstream main --tags
     git ls-remote --heads upstream "refs/heads/${maint_branch}"
     ```
   - **维护补丁版**（如 `v4.17.6`）：若远端已存在 `upstream/vX.Y.x`，目标发布分支为 `vX.Y.x`。
   - **新次版本**（如 `v4.18.0`）：若尚无 `upstream/vX.Y.x`，需先向用户确认是从 `upstream/main` 切出新维护分支 `vX.Y.x` 还是直接以 `main` 发布。
3. **定位上一正式版本**：按语义版本顺序查找低于 `vX.Y.Z` 的最近正式发布 tag `prev_tag`（排除 `alpha` / `beta` / `rc` 等预发布 tag），确认远端尚不存在 `refs/tags/${tag_name}`：
   ```bash
   git ls-remote --tags upstream "refs/tags/${tag_name}"
   ```
   若目标 tag 已存在，立即停止并报告，不得覆盖历史 tag。
4. **确认部署 YAML 修改授权**：遵守 `AGENTS.md`，修改任何部署相关 `.yml` / `.yaml` 文件前必须获得用户明确确认。若用户发起本次发布时尚未授权修改部署 YAML，在阶段四编辑 `deploy/` 前先向用户确认。

## 2. 发布前全项核查（Pre-flight Audit）

执行以下 7 项只读核查并汇总结果。**若发现任一阻断项（带「阻断」标记），必须先向用户汇报具体证据并暂停，待解决或用户明确决策后再进入发版操作。**

### 检查 1：Pro 联动 PR 与子模块对齐（阻断）

1. 列出主仓本次发布范围内的全部已合入提交与关联 PR：
   ```bash
   git log --oneline "${prev_tag}..upstream/${target_branch}"
   ```
2. 核对 `pro` 子模块基线与目标指针：
   ```bash
   pro_old=$(git ls-tree "${prev_tag}" pro | awk '{print $3}')
   pro_new=$(git ls-tree "upstream/${target_branch}" pro | awk '{print $3}')
   ```
3. 检查 `labring/fastgpt-pro` 的未合入 PR 与目标 Pro 分支 tip（维护线对应 `vX.Y.x`，主线对应 `main`）：
   ```bash
   gh pr list --repo labring/fastgpt-pro --state open --limit 50 \
     --json number,title,baseRefName,headRefName,body,url
   gh api "repos/labring/fastgpt-pro/git/ref/heads/${pro_target_branch}" --jq '.object.sha'
   ```
4. **必须核查两类问题**：
   - **主仓已合入但 Pro 未合入**：排查主仓本批 PR（尤其是改动 `packages/global`、`packages/service`、`/proApi/*`、共享契约、权限/计费/SSO/同步等模块，或在 PR 描述/评论中引用 `fastgpt-pro` 的 PR），确认是否存在对应 Pro PR 仍为 `OPEN`、或已合入 `pro/main` 但未回补到 `pro/${pro_target_branch}` 的情况。发现即阻断。
   - **Pro 子模块指针未同步**：若 `pro_new` 落后于 `fastgpt-pro/${pro_target_branch}` 的远端 tip，或维护分支 `.gitmodules` 中 `submodule.pro.branch` 未指向对应维护分支，须先同步 `pro` gitlink（维护分支可参考 `$fastgpt-backport-pr` 规则）并验证后再继续。
5. 读取 `pro` 在 `${pro_old}..${pro_new}` 间的实际提交记录（`git -C pro log --oneline ${pro_old}..${pro_new}`），用于后续文档完整性核查。

### 检查 2：`package.json` 版本号检查

- 检查目标发布分支上的 `projects/app/package.json` 中 `"version"` 字段：
  ```bash
  git show "upstream/${target_branch}:projects/app/package.json" | head -n 10
  ```
- 若尚未更新为 `${pkg_version}`，标记在阶段 3 中通过独立版本 bump PR 完成更新；禁止在 `"version"` 仍为旧版本号时创建 Release tag。
- 若本轮同步发布了同仓库其他独立包或服务，一并核对对应 `package.json` 版本号。

### 检查 3：伴生镜像与跨服务运行态兼容性（阻断）

- 审查 `${prev_tag}..upstream/${target_branch}` 与 `${pro_old}..${pro_new}` 中涉及外部/伴生服务的接口调用、配置项或协议变更（例如 `fastgpt-sso-service`、`fastgpt-plugin`、`fastgpt-code-sandbox`、`fastgpt-agent-sandbox*`、`aiproxy`、`opensandbox`）。
- 若代码新增了对伴生服务新接口或新版本镜像的硬依赖，核查对应镜像（如 GHCR 最新发布时间与 tag）是否已构建发布且包含该能力：
  - 若伴生镜像尚未发布且缺乏降级兼容，**立即阻断发布**并向用户说明缺失项与兼容风险；
  - 若需要用户同步升级某伴生镜像，记录准确的新 tag，供文档「镜像更新」与 `deploy/version/<dir>/args.json` 同步更新。

### 检查 4：系统升级脚本、数据库与配置变更核查

- 检查 `projects/app/src/migration/tasks/` 在本发布范围内是否有新增或修改的迁移脚本，核对自动执行与手动触发（`manual: true`）属性、前置依赖及失败重试边界。
- 检查是否涉及新增/废弃环境变量、默认值变化、数据库索引变更或破坏性 API/行为兼容影响，确保与发布文档「重要说明」「升级指南」一致。

### 检查 5：中英文发布文档完整性核查

- 在 `upstream/main` 上读取目标版本的中文与英文文档（`document/content/self-host/upgrading/<X-Y>/<XYZ>.mdx`、`<XYZ>.en.mdx`）及同目录 `meta.json` / `meta.en.json`。
- 逐条对照主仓 `${prev_tag}..upstream/${target_branch}` 与 `pro` `${pro_old}..${pro_new}` 的全部真实代码变更，核验：
  1. 所有用户可感知的新增、优化、修复、安全修复及升级动作是否已完整记录且无虚构；
  2. 无用户感知的内部杂项（测试、`.agents/skills/`、内部脚本等）未混入；
  3. 中英文内容、条目数量与顺序一致，且保留人工编辑决策；
  4. `meta.json` / `meta.en.json` 已包含该版本页面。
- 若文档缺失或遗漏重要内容，调用 `$fastgpt-release-docs`（先补全中文再调用 `$doc-i18n` 同步英文）。

### 检查 6：目标分支 CI 与待合入阻塞 PR 核查（阻断）

- 检查 `labring/FastGPT` 指向 `${target_branch}` 的 `OPEN` PR，确认无遗漏待合入的本版本 PR（若有用户已指定待合入的 PR，先确认状态并合入）。
- 检查 `${target_branch}` 最新 commit 与最近合入 PR 的 CI 状态：
  - 维护分支（如 `v4.17.x`）若触发了 `main` 分支的 `pull_request_target` 工作流（例如 `Test FastGPT-pro/test` 跑高版本 DAL 守卫测试导致误报失败），须在本地初始化对应版本 `pro` 子模块并运行受影响单测与 `typecheck` 交叉核验通过后，方可判定非真实故障。

### 检查 7：发布时间与最新稳定版归属确认

- 确认发布日期 `YYYY-MM-DD`（默认取当前本地日期）。
- 确认本版本是否属于当前最高稳定主次版本线：
  - **是**（如 4.17 为当前稳定线时发布 `v4.17.6`）：GitHub Release 标记 `--latest`，部署模板更新 `deploy/version/main/args.json`。
  - **否**（历史维护线，如 `v4.16.x`）：GitHub Release 显式设置 `--latest=false`，部署模板仅更新对应 `deploy/version/vX.Y/args.json`。

## 3. 更新版本号并合入目标发布分支

当检查 2 确认 `projects/app/package.json` 的 `"version"` 尚未等于 `${pkg_version}` 时执行（已等于则跳过）：

1. 在独立临时 worktree 中基于最新 `upstream/${target_branch}` 创建分支 `chore/bump-app-version-${tag_name}`，避免污染当前工作区。
2. 仅将 `projects/app/package.json` 的 `"version"` 更新为 `"${pkg_version}"`，核对 `git diff` 仅此 1 行改动。
3. 正常通过仓库 `.husky/pre-commit` 提交（严禁 `--no-verify`），推送到 `origin`：
   ```bash
   git commit -m "chore: bump app version to ${pkg_version}"
   git push -u origin "chore/bump-app-version-${tag_name}" --force-with-lease
   ```
4. 向 `labring/FastGPT` 创建 base 为 `${target_branch}` 的 PR（标题 `chore: bump app version to ${pkg_version}`）并 squash 合入，随后清理临时 worktree 与临时分支。
5. 重新 `git fetch upstream "${target_branch}"`，确认 `upstream/${target_branch}` HEAD 已是该版本号提交。

## 4. 创建 GitHub Release 并确认镜像构建

1. 按第 6 节的 **GitHub Release 模板** 生成发布说明（内容与最终中文版本文档对齐，严禁在「镜像更新」中写成带固定仓库域名的格式）。
2. 基于 `upstream/${target_branch}` 创建正式 GitHub Release（自动创建并推送 tag `${tag_name}`）：
   ```bash
   gh release create "${tag_name}" \
     --repo labring/FastGPT \
     --target "${target_branch}" \
     --title "${tag_name}" \
     --notes-file <notes_file> \
     --latest # 历史维护线改为 --latest=false
   ```
3. 等待数秒后核查 GitHub Actions 触发情况：
   ```bash
   gh run list --repo labring/FastGPT --branch "${tag_name}" --limit 5 \
     --json workflowName,status,conclusion,url
   ```
   确认 **`Release FastGPT`**（`build-fastgpt.yml`）与 **`Release FastGPT-pro`**（`build-admin.yml`）两个工作流均已触发运行，并记录各自链接。若任一工作流未触发，立即排查并向用户报告。

## 5. 向 `main` 提交发布文档与部署模板 PR

从最新 `upstream/main` 创建独立工作分支（如 `docs/release-${tag_name}`，不要在已存在的业务分支或维护分支上叠加提交）：

### 5.1 更新部署模板 YAML（需已获用户确认）

1. 更新对应版本目录的 `deploy/version/<dir>/args.json` 中 `"fastgpt": "${tag_name}"`（若有伴生镜像同步升级，一并更新对应 tag）以及 `deploy/README.md` 版本表。
2. 在仓库根目录执行生成脚本：
   ```bash
   node deploy/init.mjs
   ```
3. **强制防退化检查（必做）**：
   - 检查 `git diff deploy/dev/`：当 `main` 处于下一版本开发阶段（例如 `deploy/dev/` 中的沙箱、OpenSandbox 等镜像版本高于 `deploy/version/main/args.json`）时，`node deploy/init.mjs` 可能将 `deploy/dev/docker-compose*.yml` 意外降级回 `args.json` 版本。**如出现非预期降级，必须执行 `git checkout -- deploy/dev/` 还原 `deploy/dev/`！**
   - 检查目标部署目录无残留旧主版本号，且每个 `document/public/deploy/docker/<dir>/{cn,global}/docker-compose.*.yml` 仅包含预期镜像版本变更：
     ```bash
     git diff --stat
     git grep -n "${prev_tag}" -- "deploy/version/${dir}" "document/public/deploy/docker/${dir}" || true
     ```

### 5.2 定稿中英文发布文档

1. 更新 `document/content/self-host/upgrading/<X-Y>/<XYZ>.mdx` 与 `<XYZ>.en.mdx`：
   - Frontmatter 中将 `sidebarTag: 开发中` / `sidebarTag: In dev`（或 `upgradeTags` 中的开发状态项）替换为 `releaseTime: 'YYYY-MM-DD'`；
   - 更新 `description` 以准确概括本版本主要变化；
   - 按第 6 节标准格式填写或核对 `### 镜像更新` / `### Image updates`；
   - 确认同目录 `meta.json` / `meta.en.json` 已包含该版本页且中英文一致。
2. 正常执行 `git commit` 触发 `lint-staged`（自动运行 `textlint`、`prettier`、`checkDocRefs`、`initDocTime` 等校验；若无 TTY 导致 GPG 签名失败，允许仅加 `-c commit.gpgsign=false`，仍严禁 `--no-verify`）。
3. 提交后再执行一次 `pnpm -C ./document run initDocTime`；若 `document/data/doc-last-modified.json` 仍有时间戳变化，将其加入并 `git commit --amend --no-edit`，确保文档时间与最终 commit 一致。

### 5.3 推送并创建新版本 PR（目标 `upstream/main`）

1. 核对 `git diff --stat upstream/main..HEAD` 仅包含本次发布相关的部署文件、中英文版本文档及文档生成元数据，无无关改动。
2. 推送至 `origin` 并向 `labring/FastGPT` 的 `main` 创建 PR（标题：`docs: publish ${tag_name} release notes and update deployment templates`）。
3. PR 描述必须包含：
   - GitHub Release 链接；
   - 变更摘要（部署模板目录、是否保留 `deploy/dev/`、文档更新项与 `releaseTime`）；
   - **`Release FastGPT` 与 `Release FastGPT-pro` 构建任务链接，并提醒待两个镜像推送完成后再合入本 PR**（防止用户在镜像构建完成前从 `main` 拉取部署模板时遇到 `manifest unknown`）。除非用户明确要求立即合入，否则保持 PR 处于待合入状态。

## 6. 标准模板（强约束）

### 6.1 镜像更新格式规范

由于国内与海外部署使用的镜像仓库域名不同，**禁止**在镜像更新条目中写死 `ghcr.io/...` 完整地址，统一采用与历史版本一致的 `镜像 tag` 格式：

- **中文（GitHub Release 与 `<XYZ>.mdx` 通用）**：

```markdown
### 镜像更新

- 更新 fastgpt-app（FastGPT 主服务）镜像 tag: vX.Y.Z
- 更新 fastgpt-pro（FastGPT 商业版）镜像 tag: vX.Y.Z
```

（若同步升级其他伴生镜像，按同格式追加，如 `- 更新 fastgpt-plugin 镜像 tag: vA.B.C`、`- 更新 AI Proxy 镜像 tag: vD.E.F`。）

- **英文（`<XYZ>.en.mdx`）**：

```markdown
### Image updates

- Update the fastgpt-app (FastGPT main service) image tag to vX.Y.Z.
- Update the fastgpt-pro (FastGPT Pro) image tag to vX.Y.Z.
```

### 6.2 GitHub Release 正文模板

按实际涉及项保留章节（无内容的章节直接省略，不写空章节）：

```markdown
## 升级指南

### 镜像更新

- 更新 fastgpt-app（FastGPT 主服务）镜像 tag: vX.Y.Z
- 更新 fastgpt-pro（FastGPT 商业版）镜像 tag: vX.Y.Z

### 配置说明

（涉及环境变量、代理、端口或运行时前提时填写；无变更时可简述无需新增环境变量或升级脚本）

### 升级脚本

（仅当存在新增或调整的迁移脚本时保留，明确区分自动执行与手动触发）

## 安全修复

（按需保留）

## 🚀 新增内容

（按需保留）

## ⚡ 优化

（按需保留）

## 🐛 修复

1. ...

**Full Changelog**: https://github.com/labring/FastGPT/compare/vPREV...vX.Y.Z
```

## 7. 交付输出要求

完成后简洁汇报以下信息：

1. **发布前核查结论**：Pro 联动 PR 与子模块 SHA、伴生镜像与升级脚本核查结果。
2. **发版产出链接**：版本号 Bump PR、`Release vX.Y.Z` 链接、`Release FastGPT` / `Release FastGPT-pro` 构建链接。
3. **主干更新 PR**：面向 `main` 的文档与部署模板 PR 链接及改动清单，提示待镜像构建完成后合入。
