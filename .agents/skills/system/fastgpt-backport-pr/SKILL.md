---
name: fastgpt-backport-pr
description: 将 FastGPT 已合入的 GitHub PR cherry-pick（pick、回补、backport）到用户必须明确提供的历史版本目标分支，如 v4.17.x。支持一次 pick 单个或多个 PR；自动解决机械冲突，逻辑冲突询问用户，局部验证后直接 push 到 upstream 对应分支。不用于合并尚未合入的 PR 或发布版本。
---

# FastGPT PR 回补

将用户指定的已合入 PR 回补到历史维护分支，保留来源记录，验证后直接推送 `upstream` 的同名分支。不要把整个 main 合并进维护分支。

**用户必须明确提供目标分支。未提供时先询问并等待答复，不创建回补 worktree、不执行 cherry-pick 或 push；可以继续只读准备。支持一次性提供多个 PR，作为同一批次回补到该目标分支。**

调用示例：

```text
$fastgpt-backport-pr 将 #12345、#12346 pick 到 v4.17.x
$fastgpt-backport-pr 将 https://github.com/labring/FastGPT/pull/12345 回补到 upstream/v4.17.x
```

## 1. 固定范围和目标

- 优先使用当前 FastGPT 仓库，通过 `git rev-parse --show-toplevel` 定位根目录；不在仓库中时使用用户提供的仓库路径，缺失则先询问。读取适用的 `AGENTS.md`、代码规范和必要的领域技能；在历史 worktree 中修改文件前，再读取该版本对应的规范。
- 必需信息是一个或多个 PR，以及用户在当前任务中明确提供的目标分支；用户此前已明确提供且未变更的目标有效，无需重复询问。不得根据当前分支、tracking branch、PR 的 base 分支、示例或相近版本推断目标。可以去掉用户输入的 `upstream/` 前缀，但不能把版本 tag 当分支。目标缺失时必须先询问并等待答复，不能以默认值继续执行回补。
- PR 输入支持编号、链接及两者混合；多个 PR 可以用逗号、顿号、空格或换行分隔。一次解析完整列表并去重，统一检查状态和依赖，再在同一个回补 worktree 中处理；不要求用户逐个发起调用。
- 默认 remote 为 `upstream`。检查 fetch URL、所有 push URL 与目标仓库身份；FastGPT 通常是 `labring/FastGPT`，以实际配置为准。PR 链接所属仓库应与目标仓库一致；不一致时先确认，不能因 `origin` 是 fork 就默认从 fork 读取同号 PR。
- 确认远端已存在 `refs/heads/<target>`。缺少 `upstream`、目标分支不存在、存在多个不同仓库的 push URL 或仓库身份无法确认时，询问用户，不自动新建远端分支或改 remote。
- 调用本技能执行回补，默认包含提交和直接 push；信息齐全且验证通过后，不额外要求推送确认。用户明确要求只分析、只准备或暂不推送时，以其限制为准。创建本技能本身不代表执行任何回补。

只检查工作区，不 stash、reset、clean 或切换用户当前分支。记录现有 worktree 和未完成的 Git 操作；不接管其他任务的 cherry-pick/rebase。

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

## 3. 创建隔离的历史版本 worktree

从最新的远端目标分支创建独立 worktree，不复用可能混入本地提交的同名维护分支。以下变量均须先按已核实的输入赋值，路径和 ref 使用 shell 引号：

```bash
git check-ref-format --branch "$target_branch"
git fetch upstream "refs/heads/${target_branch}:refs/remotes/upstream/${target_branch}"
git rev-parse "refs/remotes/upstream/${target_branch}"
git worktree add -b "$backport_branch" "$worktree_path" "refs/remotes/upstream/${target_branch}"
```

保存起点为 `base_sha`；局部分支用唯一名称，例如 `codex/backport-v4.17.x-pr-12345`，worktree 可放在仓库外的相邻目录，例如 `<repo-parent>/FastGPT-worktrees/`。目录或分支已存在则加唯一后缀，不覆盖或删除已有工作。检查新 worktree 干净后执行回补。

## 4. 应用改动与处理冲突

逐个应用已核实的提交；每个 PR 完成后核对净 diff 和来源记录。

### 可以自动解决的机械冲突

只有能从两边完整上下文证明不改变业务语义时才直接解决，例如相邻独立增改、格式差异、已确认的文件搬迁或 import 路径变化。阅读冲突区域两边和公共基线，不批量使用 `ours`、`theirs` 或 `-X` 策略掩盖冲突。

锁文件应按目标分支的包管理器和版本、结合已确定的依赖清单处理，优先定向重生成并检查无关依赖变化；依赖版本或能力的选择有歧义时属于逻辑冲突。

### 必须询问的逻辑冲突

两边对同一行为有不同设计、历史版本缺少前置能力、接口/数据库/权限/计费/默认值不兼容，或无法证明改法保留预期语义时，都属于逻辑冲突。**即使 Git 自动应用成功，也要识别这类冲突。**

发现后暂停该 PR 的语义取舍，向用户集中说明：PR、目标分支、相关文件、两边行为、选择及影响，并在有依据时给出推荐。用户未答复前，不替用户选方案，不继续依赖该决策的操作，也不推送这批回补的部分结果。可以继续独立的只读分析。保留 worktree、分支和当前操作状态，便于用户答复后继续。

如果仓库规则保护部署 `.yml/.yaml`，回补包含这些文件时也适用：先说明确切文件与变化，并取得规则要求的明确确认，再应用；不能静默漏掉文件或以 cherry-pick 绕过保护。

### 完成或跳过当前提交

- 冲突解决后仅 stage 已检查的相关文件，使用 `git cherry-pick --continue`。检查提交信息保留 `(cherry picked from commit <完整源 SHA>)`，冲突后缺失时补齐；必要时补充 PR URL 和兼容适配原因，保留原作者。
- 遇到空 cherry-pick 时，检查 index、diff 和目标代码。确认当前版本已经完整具备该改动才 `git cherry-pick --skip` 并记录原因；不能把错误解决导致的空 diff 当成“已存在”。
- 测试失败、依赖缺失或范围不明时继续定位本次回补的问题，不删除测试、弱化断言、跳过 hooks 或扩大修改来凑通过。无法完成时保留进度并明确阻塞项，不宣称成功。

## 5. 验证与直接推送

在 worktree 中检查整个 `base_sha..HEAD`，而非只看最后一个提交：

- 每个指定 PR 都有明确结论：已回补、当前版本已包含，或阻塞。无漏文件、无无关 main 改动、无冲突标记，来源可追踪。
- 检查 diff、`git diff --check "$base_sha" HEAD` 和 `git status --short`，确认无未完成的 cherry-pick/rebase、未提交改动或未解决冲突。
- 按目标版本提供的命令，运行覆盖改动和依赖影响的最小局部测试、必要的类型或静态检查。FastGPT 用户最终验收前不主动运行全量测试，不套用 main 独有命令；缺少旧版工具或环境时先设法完成必要验证，无法验证则说明限制并询问是否仍推送。

所有 PR 都完成且必要验证通过后，刷新目标分支并确认新远端 tip 是 `HEAD` 的祖先。若远端已前进且不在本地历史中，重新基于新 tip 仅重放本次回补，保存原起点和结果以便恢复，并把比较用的 `base_sha` 更新为新 tip；按同样规则解决冲突并重跑受影响的检查。自动重新同步最多一次，再次出现并发推进则保留结果并说明情况，不无界重试。

从该 worktree 使用完整目标 refspec 直接推送：

```bash
git push upstream "HEAD:refs/heads/${target_branch}"
git ls-remote --exit-code --heads upstream "refs/heads/${target_branch}"
```

- 推送前核对 `base_sha..HEAD` 仅包含本批回补和已确认的兼容改动；没有新增提交时不创建空提交或无意义推送。
- 不使用 force/force-with-lease，不推送其他分支或 tags，不默认推到 origin，不自动改为提 PR。遇到 non-fast-forward 按上述一次同步额度处理；权限、保护分支或 hook 拒绝时保留本地结果并报告具体原因，不绕过限制。
- 核对远端 SHA 与已推送 tip；若随即有后续提交，fetch 后验证已推送 tip 仍为远端祖先。网络报错时先核实远端是否已接收，不能仅凭命令输出假定成功或失败。

简要交付 PR 列表、目标 `upstream/<branch>`、回补提交 SHA、自动处理/用户确认的冲突、验证和实际推送结果。有阻塞时给出 worktree 路径与待决策项。保留 worktree 供复查，不额外生成总结报告或执行发布动作。

## 关键语义参考

- [GitHub PR API：不同合入方式的 merge_commit_sha](https://docs.github.com/en/rest/pulls/pulls#get-a-pull-request)
- [Git cherry-pick：mainline、来源记录与空提交](https://git-scm.com/docs/git-cherry-pick)
