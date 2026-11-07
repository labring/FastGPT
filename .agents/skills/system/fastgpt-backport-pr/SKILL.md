---
name: fastgpt-backport-pr
description: 将 FastGPT 已合入的 GitHub PR cherry-pick（pick、回补、backport）到用户明确提供的维护分支，验证后直接推送并对齐维护版 Pro 子模块；随后更新对应进行中版本的中英文文档，单独向 upstream/main 提交文档 PR。不用于合并源 PR 或执行发布。
---

# FastGPT PR 回补

将用户指定的已合入 PR 回补到历史维护分支，保留来源记录，验证后直接推送 `upstream` 的同名分支；再从 `upstream/main` 单独更新对应版本文档并提交 PR。代码回补与版本文档分开交付，版本文档及其导航、生成元数据不提交到维护分支。不要把整个 main 合并进维护分支。

**直接 pick GitHub PR 实际合入后的 commit，不重建 PR 的改动，也不重复 pick 已被 squash/merge 包含的子提交。普通 cherry-pick 会因父提交或提交信息变化生成新 SHA；切换分支、去掉 `-x` 或强推都不能保证 SHA 与源提交相同。使用 `-x` 保留完整源 SHA 以便对照；只有确实可快进且已确认整个历史范围时才可能沿用原 SHA。用户要求 SHA 完全相同时，先解释这一限制；未经明确确认，不为满足 SHA 相同而引入源分支的其他历史或重写维护分支。**

**用户必须明确提供目标分支。未提供时先询问并等待答复，不切换分支、不执行 cherry-pick 或 push；可以继续只读准备。支持一次性提供多个 PR，作为同一批次回补到该目标分支。**

调用示例：

```text
$fastgpt-backport-pr 将 #12345、#12346 pick 到 v4.17.x
$fastgpt-backport-pr 将 https://github.com/labring/FastGPT/pull/12345 回补到 upstream/v4.17.x
```

## 1. 固定范围和目标

- 优先使用当前 FastGPT 仓库，通过 `git rev-parse --show-toplevel` 定位根目录；不在仓库中时使用用户提供的仓库路径，缺失则先询问。读取适用的 `AGENTS.md`、代码规范和必要的领域技能；在历史 worktree 中修改文件前，再读取该版本对应的规范。
- 必需信息是一个或多个 PR，以及用户在当前任务中明确提供的目标分支；用户此前已明确提供且未变更的目标有效，无需重复询问。不得根据当前分支、tracking branch、PR 的 base 分支、示例或相近版本推断目标。可以去掉用户输入的 `upstream/` 前缀，但不能把版本 tag 当分支。目标缺失时必须先询问并等待答复，不能以默认值继续执行回补。
- PR 输入支持编号、链接及两者混合；多个 PR 可以用逗号、顿号、空格或换行分隔。一次解析完整列表并去重，统一检查状态和依赖，再在同一个目标维护分支中处理；不要求用户逐个发起调用。
- 默认 remote 为 `upstream`。检查 fetch URL、所有 push URL 与目标仓库身份；FastGPT 通常是 `labring/FastGPT`，以实际配置为准。PR 链接所属仓库应与目标仓库一致；不一致时先确认，不能因 `origin` 是 fork 就默认从 fork 读取同号 PR。
- 确认远端已存在 `refs/heads/<target>`。缺少 `upstream`、目标分支不存在、存在多个不同仓库的 push URL 或仓库身份无法确认时，询问用户，不自动新建远端分支或改 remote。
- 调用本技能执行回补，默认包含代码提交、直接 push 维护分支，以及基于 `upstream/main` 更新版本文档并创建独立 PR；信息齐全且验证通过后，不额外要求推送或创建文档 PR 的确认。用户明确要求只分析、只准备或暂不推送时，以其限制为准。创建或更新本技能本身不代表执行回补或创建文档 PR。

切换前检查当前工作区、现有 worktree 和未完成的 Git 操作。工作区干净时直接切换到用户指定的同名维护分支；不 stash、reset、clean，不接管其他任务的 cherry-pick/rebase。未提交改动或已有 Git 操作妨碍切换时，保留现场并说明阻塞原因。

## 2. 确认 PR 实际合入内容

使用 GitHub 连接器或 `gh` 读取 PR 正文、合入状态、base 分支、实际合入 SHA、提交列表和完整 diff；显式指定仓库。例如：

```bash
gh api "repos/${repo}/pulls/${pr_number}"
gh api --paginate "repos/${repo}/pulls/${pr_number}/commits?per_page=100"
gh pr diff "$pr_number" --repo "$repo"
```

- 必须确认已合入且实际合入 SHA 可取得。关闭但未合入的 PR 不符合范围，不自动替用户合入源 PR。API 分页结果须核对总数；接口截断时改用完整 Git 历史和 diff，不能把部分结果当全部内容。
- 获取实际合入提交对象并核对父提交、PR diff 与 base 分支历史；对象缺失时按需 fetch 该 base 分支或 SHA。不要使用可能失效的 `refs/pull/<n>/merge` 测试提交作为已合入结果。
- **Merge commit**：确认哪一个 parent 属于原 base 主线，通常是第 1 个；以相对该 parent 的完整净改动为回补内容。使用 `git cherry-pick -x -m <parent-number> <merge-sha>`，不要再重复 pick PR 的子提交。
- **Squash merge**：确认单个合入提交的 diff 覆盖整个 PR，再使用 `git cherry-pick -x <squash-sha>`。
- **Rebase merge**：API 返回的合入 SHA 可能只是最后一个提交。结合完整 PR 提交列表、patch-id 和 base 历史确认重写后的整个提交序列，按依赖顺序逐个 `git cherry-pick -x <sha>`。不能只 pick 最后一个，也不能盲取最后 N 个或从 merge-base 到最新 main 的整个范围。
- 只有一个 parent 不能证明是 squash；提交标题或 `(#PR)` 只能提供线索。无法唯一确认实际合入范围时，给出已有证据并询问用户确认源提交，不猜测。

完整阅读改动文件及目标版本中相关的调用方、数据结构、依赖、配置和局部测试，确认回补能形成完整能力。若依赖未指定的其他 PR、升级脚本、数据库字段或新依赖，说明缺失项和影响，询问是否扩展范围，不自行多 pick。

多 PR 默认按已确认的依赖关系排序，无依赖时按合入先后处理；用户指定顺序与依赖矛盾时先说明。检查目标版本是否已通过原提交、历史 cherry-pick 或等价实现包含改动。祖先关系、`-x` 记录和 patch-id 都只是证据，还要确认当前代码中的效果未被 revert 或后续修改覆盖，不能只凭标题或历史出现过就跳过。

## 3. 直接切换到目标维护分支

先刷新已核实的远端目标分支并记录起点 `base_sha`，再切换到本地同名维护分支。`upstream/<target>` 是远端跟踪引用，实际提交应在本地 `<target>` 分支完成。以下变量均须先按已核实的输入赋值，路径和 ref 使用 shell 引号：

```bash
git check-ref-format --branch "$target_branch"
git fetch upstream "refs/heads/${target_branch}:refs/remotes/upstream/${target_branch}"
base_sha=$(git rev-parse "refs/remotes/upstream/${target_branch}")
```

- 本地分支不存在时执行 `git switch --track -c "$target_branch" "upstream/$target_branch"`。
- 本地分支存在时，先检查其与远端的差异；相同或仅落后时，执行 `git switch "$target_branch"` 和 `git merge --ff-only "upstream/$target_branch"`。本地存在未推送或分叉提交时先说明差异并等待处理，不用 reset 或强推丢弃这些提交。
- 同名分支已在其他 worktree 检出时，检查并进入该干净 worktree 执行，不强制重复检出、不覆盖其他任务的现场。
- 确认当前分支名为目标分支，`HEAD` 等于 `base_sha`，且工作区干净后执行回补。不默认再创建回补分支或新 worktree。

## 4. 应用改动与处理冲突

逐个应用已核实的提交；每个 PR 完成后核对净 diff 和来源记录。

源提交若同时包含版本更新说明、对应导航或生成元数据，改用 `git cherry-pick --no-commit`（merge commit 仍带已核实的 `-m`），在提交前将这些路径恢复为本次 pick 前的维护分支状态；代码提交保留原作者、完整源 SHA 的 `-x` 来源记录及文档拆分原因。版本文档按第 6 节在 main 侧更新。纯版本文档 PR 不创建空的维护分支提交。

### 可以自动解决的机械冲突

只有能从两边完整上下文证明不改变业务语义时才直接解决，例如相邻独立增改、格式差异、已确认的文件搬迁或 import 路径变化。阅读冲突区域两边和公共基线，不批量使用 `ours`、`theirs` 或 `-X` 策略掩盖冲突。

锁文件应按目标分支的包管理器和版本、结合已确定的依赖清单处理，优先定向重生成并检查无关依赖变化；依赖版本或能力的选择有歧义时属于逻辑冲突。

### 必须询问的逻辑冲突

两边对同一行为有不同设计、历史版本缺少前置能力、接口/数据库/权限/计费/默认值不兼容，或无法证明改法保留预期语义时，都属于逻辑冲突。**即使 Git 自动应用成功，也要识别这类冲突。**

发现后暂停该 PR 的语义取舍，向用户集中说明：PR、目标分支、相关文件、两边行为、选择及影响，并在有依据时给出推荐。用户未答复前，不替用户选方案，不继续依赖该决策的操作，也不推送这批回补的部分结果。可以继续独立的只读分析。保留工作目录、分支和当前操作状态，便于用户答复后继续。

如果仓库规则保护部署 `.yml/.yaml`，回补包含这些文件时也适用：先说明确切文件与变化，并取得规则要求的明确确认，再应用；不能静默漏掉文件或以 cherry-pick 绕过保护。

### 完成或跳过当前提交

- 冲突解决后仅 stage 已检查的相关文件，使用 `git cherry-pick --continue`。检查提交信息保留 `(cherry picked from commit <完整源 SHA>)`，冲突后缺失时补齐；必要时补充 PR URL 和兼容适配原因，保留原作者。
- 遇到空 cherry-pick 时，检查 index、diff 和目标代码。确认当前版本已经完整具备该改动才 `git cherry-pick --skip` 并记录原因；不能把错误解决导致的空 diff 当成“已存在”。
- 测试失败、依赖缺失或范围不明时继续定位本次回补的问题，不删除测试、弱化断言、跳过 hooks 或扩大修改来凑通过。无法完成时保留进度并明确阻塞项，不宣称成功。

### 对齐 v4.17.x 的 Pro 子模块

- `v4.17.x` 中的 `pro` 必须指向 `labring/fastgpt-pro` 的 `refs/heads/v4.17.x`，不能跟随 main，也不能原样保留源 PR 从 main 带入的 Pro 指针。此规则仅适用于本次约定的 `v4.17.x`；其他目标版本先核实对应的 Pro 分支。
- 核对 `.gitmodules` 中 `pro` 的仓库身份；在目标工作目录中初始化子模块，确认无未提交改动或其他 Git 操作，并选择指向该官方仓库的已验证 remote。取不到维护分支时停止，不回退到 main、不新建 Pro 远端分支。
- 设置 `.gitmodules` 的 `submodule.pro.branch` 为 `v4.17.x`，fetch Pro 的同名分支，并将 `pro` 检出到核实后的远端 tip。需要提交时，将 `.gitmodules` 和 `pro` 的 gitlink 差异作为独立的子模块同步提交，保留 PR 回补提交的来源记录。
- Git 子模块实际记录固定 commit；`branch = v4.17.x` 只指定远端更新时使用的分支，不会自动跟随远端。每次回补与推送前都必须重新核对 Pro 分支 tip，必要时更新指针并重新验证受影响范围；无差异时不创建空提交。
- 若源 PR 依赖维护版 Pro 尚未具备的能力，按逻辑冲突说明缺失依赖并等待答复，不能通过替换指针掩盖不兼容。

## 5. 验证与直接推送

检查整个 `base_sha..HEAD`，而非只看最后一个提交：

- 每个指定 PR 都有明确结论：已回补、当前版本已包含，或阻塞。无漏文件、无无关 main 改动、无冲突标记，来源可追踪。
- 检查 diff、`git diff --check "$base_sha" HEAD` 和 `git status --short`，确认无未完成的 cherry-pick/rebase、未提交改动或未解决冲突。
- 按目标版本提供的命令，运行覆盖改动和依赖影响的最小局部测试、必要的类型或静态检查。FastGPT 用户最终验收前不主动运行全量测试，不套用 main 独有命令；缺少旧版工具或环境时先设法完成必要验证，无法验证则说明限制并询问是否仍推送。
- 目标为 `v4.17.x` 时，核对 `.gitmodules` 的维护分支配置和 `git ls-tree HEAD pro`，确认 gitlink 等于已核实的 `fastgpt-pro/v4.17.x` tip；该检查也适用于 PR 已包含、无需重复回补的情况。
- 检查 `base_sha..HEAD` 未混入本次版本更新说明、导航或文档生成元数据；这些改动只能在第 6 节的 main 文档分支中提交。

所有 PR 都完成且必要验证通过后，刷新目标分支并确认新远端 tip 是 `HEAD` 的祖先。若远端已前进且不在本地历史中，重新基于新 tip 仅重放本次回补，保存原起点和结果以便恢复，并把比较用的 `base_sha` 更新为新 tip；按同样规则解决冲突并重跑受影响的检查。自动重新同步最多一次，再次出现并发推进则保留结果并说明情况，不无界重试。

从当前同名维护分支使用完整目标 refspec 直接推送，代码不再创建回补 PR；版本文档另按第 6 节向 main 提交 PR。使用带明确预期远端 SHA 的 `--force-with-lease` 执行强推，避免裸 `-f` 覆盖检查后到达的并发提交；它仍不会让 cherry-pick 结果与源提交具有相同 SHA：

```bash
remote_tip=$(git rev-parse "refs/remotes/upstream/${target_branch}")
git push --force-with-lease="refs/heads/${target_branch}:${remote_tip}" upstream "HEAD:refs/heads/${target_branch}"
git ls-remote --exit-code --heads upstream "refs/heads/${target_branch}"
```

- 推送前核对 `base_sha..HEAD` 仅包含本批回补、已确认的兼容改动及上述维护版 Pro 同步；没有新增提交时不创建空提交或无意义推送。
- 不使用裸 `--force` / `-f`，不推送其他分支或 tags，不默认推到 origin。强推不代表允许丢弃远端已存在的提交或引入 main 的其他历史；lease 拒绝时按上述一次同步额度处理，不移除 lease 重试。权限、保护分支或 hook 拒绝时保留本地结果并报告具体原因，不绕过限制。
- 核对远端 SHA 与已推送 tip；若随即有后续提交，fetch 后验证已推送 tip 仍为远端祖先。网络报错时先核实远端是否已接收，不能仅凭命令输出假定成功或失败。

## 6. 更新对应版本文档，单独向 main 提交 PR

### 选择版本页面

- 刷新 `upstream/main`，从该分支的 `document/content/self-host/upgrading/` 中读取中文版本页 frontmatter 和同目录导航，以 `title` 中的实际版本号确认页面，不按文件名字符串排序，也不固定补丁号。
- 未明确指定页面时，只考虑与目标维护分支相同的主、次版本系列，按数字比较补丁号。只有该系列最高版本页标记 `sidebarTag: 进行中` 且没有已发布的 `releaseTime` 时，才将本批回补内容补充到该页面。
- 例如 `v4.17.x` 在 V4.17.4 为该系列最高版本且仍进行中时，对应 `4-17/4174.mdx` 和 `4174.en.mdx`；V4.18.0 不参与选择。若后来出现 V4.17.5，必须重新检查最高版本及其状态，不再沿用 4174。
- 用户指定页面时先核实其与维护系列和版本状态一致。页面缺失、最高版本已发布或版本映射有歧义时，说明现状并询问应新建哪个版本或更新哪一页，不猜测新版本号、不修改已发布页面。

### 在 main 侧编辑和验证

- 从最新 `upstream/main` 创建唯一的 `codex/` 文档分支和独立 worktree，保存 `docs_base_sha`；不得从维护分支创建文档分支、把维护分支合并到 main，或在维护分支中暂存、提交这些文档改动。
- 只补充本批已成功推送的回补内容，以目标维护分支最终实现为事实依据；按该版本页面既有章节、领域标签和编号归并用户可感知的变化，合并同类条目并去重，不扩大为整理整个 main 的版本变更。涉及配置、迁移或兼容性的回补同步更新升级指南；不臆造发布日期或镜像 tag。
- 读取当前仓库的 `.agents/skills/doc/i18n/SKILL.md`，按其共享翻译规范和术语库同步英文页面；检查同目录 `meta.json` / `meta.en.json`，仅在需要时更新导航，保持页面引用、条目和进行中状态一致。
- 按仓库文档流程运行本次页面的 Prettier、中文 textlint、文档引用及 `checkEnglishDocs(contentDir)` 英文页面与路由校验，允许使用局部 fixture。检查提交钩子生成的目录和修改时间元数据，清除与本批文档无关的副作用，不提交无关图片删除、产品代码、部署配置或 Pro 指针。

### 提交独立文档 PR

- 提交前检查整个 `docs_base_sha..HEAD` 仅包含该版本中英文文档、必要导航与文档流程生成的元数据；文档分支必须基于 main，不得混入维护分支回补提交。
- 将文档分支推送到已验证且可写的 remote，再向已核实的上游仓库创建 `base=main` 的独立 PR；PR 描述关联本批源 PR、维护分支和实际回补提交，并简述文档验证。已有属于本任务、同版本且以 main 为 base 的文档 PR 时复用并更新，不重复创建或改动其他任务的 PR。
- 即使代码因已包含而无需再次 pick，也检查版本文档是否缺失对应说明；内容已完整覆盖时不创建空提交或无意义 PR。
- 回补已推送但文档选择、校验、推送或 PR 创建失败时，分别报告代码已完成和文档未完成的状态，保留文档工作目录与阻塞原因，不撤销已成功的回补，也不改为将文档推到维护分支。

简要交付源 PR 列表、目标 `upstream/<branch>`、源 SHA 与回补 SHA 的对应关系、Pro 锁定 SHA、版本文档路径和 main 文档 PR 链接，以及验证和实际推送结果。有阻塞时给出工作目录与待决策项。仅在代码回补与文档交付均有明确结论后结束任务；保留工作分支供复查，不额外生成总结报告或执行发布动作。

## 关键语义参考

- [GitHub PR API：不同合入方式的 merge_commit_sha](https://docs.github.com/en/rest/pulls/pulls#get-a-pull-request)
- [Git cherry-pick：mainline、来源记录与空提交](https://git-scm.com/docs/git-cherry-pick)
