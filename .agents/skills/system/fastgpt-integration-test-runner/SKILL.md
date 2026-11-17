---
name: fastgpt-integration-test-runner
description: 筛选并执行 FastGPT 集成用例，优先运行 Node 或无头 Playwright 脚本，由 AI 执行未覆盖项并复核脚本失败，逐项更新临时 HTML 报告及执行方、说明和证据。适用于已有用例执行、变更回归和复测；仅编写用例或单元测试时不使用。
---

# FastGPT 用例执行

使用 `.agents/test/` 中已有用例；按本轮相关范围筛选、先生成报告、脚本优先执行，AI 执行未覆盖项并复核脚本失败。不复制维护第二份用例库，不把历史报告当作当前测试证据。

这些用例仅在用户要求执行时手动运行，不接入 CI、`pnpm test`、构建或安装脚本；调度器自检也按需手动运行。浏览器和登录环境由本轮执行准备，不能让日常 CI 依赖这些条件。

统一使用本地 dev 环境和现有配置，不自动启动独立 Mongo、Redis 或另一套测试环境，也不以缺少私有库/marker 为由阻塞。每轮新建并记录测试团队、应用及数据的 ID，只操作并清理本轮清单；沿用已有本地账号时保留其原有资源和配置。

系统升级迁移与历史回填不通过本用例库执行；相关验证归迁移代码及专项 Vitest 测试。业务接口的历史数据兼容不因此移除。

## Worktree 页面测试环境

- 在 worktree 执行页面测试时，优先在该 worktree 根目录用仓库指定的 Node/pnpm 版本执行 `pnpm install --frozen-lockfile`，保持自己的 `node_modules/.pnpm` 和 workspace 链接。可以复用 pnpm store，但不要把主仓库的 `node_modules` 或其依赖目录整体软链接过来；安装前检查已有链接，备份本轮创建的复用目录，不能沿链接改动其他工作树的依赖。
- 安装前检查依赖的安装钩子及 `AGENTS.md` 环境限制；禁止本地测试数据库时设置 `MONGOMS_DISABLE_POSTINSTALL=1 MONGOMS_RUNTIME_DOWNLOAD=0`，防止 mongodb-memory-server 在安装或运行时下载二进制。已有可用浏览器时可设置 `PUPPETEER_SKIP_DOWNLOAD=1`，再使用明确选择的浏览器；不要用 `--ignore-scripts` 跳过全部必要构建。
- 按项目 `package.json` 的 dev 脚本启动，沿用默认 Turbopack；例如 `PORT=<空闲端口> pnpm --dir projects/app dev`，保留脚本中的 worker 等前置构建。检查 `next/package.json` 实际解析路径及 workspace 包链接均落在当前 worktree 内；无需单独安装 Turbopack。
- `turbopack.root` 与 `outputFileTracingRoot` 应覆盖当前仓库并保持一致。出现依赖软链接越界时先修正依赖布局；不要为复用其他工作树的依赖而长期扩大到整个代码目录，也不要未经验证改用 Webpack。确需切换构建器时检查对应的 SVG loader 等配置，并记录实际启动方式。
- 先串行预热本轮页面并确认可交互、必要 API 成功，再执行场景。记录冷启动编译耗时、页面响应及浏览器错误；页面超时需区分编译、接口和渲染阻塞，不能只增加超时或据此判业务失败。端口及构建目录仅由本轮进程使用，不停止其他任务的服务；环境修复后新建复测报告，保留旧失败与阻塞证据。

## 筛选本轮用例

先读取仓库 `AGENTS.md`、`.agents/code/syntax.md`，沿用会话中已确认的环境和授权。以下命令在仓库根目录运行，需要已安装仓库依赖；复用相邻 [用例生成 skill](../fastgpt-integration-test-case/SKILL.md) 的扫描器和 `.agents/test/index.html` 的离线渲染库。

1. 结合用户指定功能、变更文件和依赖，查询 `sources`、`routes`、`tags`、正文及必要的 `related` 回归。只读完整相关实现后判断，不以一个文件名或关键词命中直接断言范围。工作区有其他改动时，先区分本次范围。
2. 用例是合并后的业务验收目标，一个文件可含多个场景。完整阅读所选用例的四节正文，确定公共准备、子场景、参数变体、复位或承接关系、清理方式。选中承接场景时，包含必要前序步骤，或提供经过验证的等效初态；避免重复执行通用边界。
3. 写明选择和排除原因。`category` 是主类型，跨类型覆盖还需查 `覆盖基础场景`、`覆盖异常场景`、`覆盖边界场景` 标签和矩阵。不要默认执行全库，也不主动运行全量产品测试。

```bash
node .agents/skills/system/fastgpt-integration-test-case/scripts/catalog.mjs list --business app/workflow --tag 覆盖异常场景
```

精确到子场景时，在临时目录创建 selection JSON。省略 `items` 表示该用例全部场景；省略 `itemScope` 表示选中行的全部参数变体。若缩小变体范围，必须明确列出，结果只代表该范围。

```json
{
  "cases": [
    {
      "id": "FG-APP-WORKFLOW-007",
      "reason": "本轮验证普通连线重复判定及删除后的拓扑变化",
      "items": ["C1", "C4"],
      "itemScope": { "C1": "仅重复同端口变体；自连、串行回环不纳入本轮" }
    }
  ]
}
```

## 先生成临时报告

在执行任何场景前生成，即使当前缺少环境也先记录选择范围。环境、测试账号角色、可用工具、目标部署版本及验证渠道必须如实确认；本地 HEAD 只是参考，不能替代实际部署版本。缺少必要入口或凭证时记录阻塞，向用户询问缺失信息，同时继续可以独立执行的场景。已有明确授权时不重复请求。

```bash
node .agents/skills/system/fastgpt-integration-test-runner/scripts/report.mjs init --selection /tmp/selection.json --reason "本轮连线变更回归" --environment "本地 dev 环境" --base-url http://127.0.0.1:3000 --target-version "实际核实的部署版本"

# 或按明确 ID / 与查询工具相同的条件选择整个用例
node .agents/skills/system/fastgpt-integration-test-runner/scripts/report.mjs init --ids FG-APP-WORKFLOW-007 --reason "普通连线规则回归"
```

命令返回系统临时目录中的 `report.html` 和 `evidenceDirectory`。报告默认用多列表格展示，一行一个业务用例，列出业务、用例类型、测试方式、执行方、优先级、场景进度、**执行结果、结果说明**；点击行才展开完整用例、各子场景结果、证据及复测历史。每个子场景和历史事件记录 `executor: script/ai`，汇总行可显示混合；未执行明确标注计划执行方，AI 只做复核不更改原执行方。运行信息默认折叠，不使用统计卡片或平铺长正文。

报告复制完整 Markdown 快照（含原元数据、路径、哈希和基线），展开后在「预期结果」矩阵追加执行结果、结果说明两列；没有编号矩阵时增加 `CASE` 整体验证项。未选子场景保留原文并标注未纳入范围。草稿和废弃定义初始化为阻塞，不自动执行；完善定义后新建报告。

HTML 是报告状态的唯一存储，可直接打开；更新后刷新。需要自动展示进展时启动本机只读预览，页面每 2 秒同步：

```bash
node .agents/skills/system/fastgpt-integration-test-runner/scripts/report.mjs serve --report /实际临时目录/report.html --port 4318
```

创建时未知的环境信息核实后，用 `report.mjs context --report <HTML> --environment <环境> --base-url <入口> --target-version <部署版本>` 补齐；不会改变已有执行结果。

测试报告及证据保留在仓库外，不纳入 PR。报告旁的 `evidence/` 一并交付；不在报告里嵌入凭证或未脱敏的用户数据。

## 逐项执行并更新

先检查用例的 automation 映射。有脚本则使用 `pnpm test:cases --report <HTML>`，无脚本覆盖的子场景由 AI 执行；浏览器脚本默认使用 Playwright 无头 Chromium，接口可直接使用 Node.js。读取 [脚本协议与失败复核](references/automation.md)，了解安装、结果和证据约定。该入口会回填已有报告并返回 aiTasks，不会调用另一个 AI 或自动结束报告；当前执行方继续处理这些待办。

脚本失败必须由 AI 审查证据，区分脚本兼容、环境问题与真实产品错误；保留失败，修正脚本后显式复测，不能以修改预期、删断言、跳过或自动重试消除失败。缺少脚本不是阻塞，AI 仍按原用例运行；声明的脚本不可用时先复核原因，再决定修复或实际由 AI 接手。

确认脚本不适用于实际入口或无法稳定验证真实桌面行为时，移除该子场景的脚本映射并在用例中注明 AI 执行，再按原断言实际接手；保留旧脚本的结果与复核历史。环境有本地 dev/Pro 时先检查真实入口，不能只因缺少脚本配置就判业务不可执行。

执行 customUid、日志身份或租约脚本时，读取 [接口与租约测试配置](references/api-cases.md)，按实际账号权限、独立资源和证据通道提供仓库外夹具；只为已实现的完整执行项声明脚本覆盖。

执行流镜像/断线恢复、列表轮询或 Mongo 历史兼容时，读取 [流、列表与数据库测试配置](references/stream-history-database.md)。历史夹具只写入本轮资源清单；索引升级和全局 Redis 故障不在共享 dev 的业务用例中注入，归相应代码专项测试；多来源入口未准备时如实记录阻塞。

按用例和子场景顺序串行执行。报告工具只记录和展示；实际操作使用脚本或当前可用的 HTTP、浏览器、服务集成、数据库、日志工具，不能以生成报告替代执行。

1. 创建隔离测试数据，记录 run 标识、实际资源 ID、账号角色和时间。沿用用户授权的测试环境；用例文案本身不扩大到无关生产修改、支付、发布或对外消息。前置失败影响多个场景时逐项记录阻塞原因。
2. 每项操作前写入 `running`。按步骤实际调用接口或操作 UI，按规则复位；同一行多个选中变体逐一执行，记录各自实际值和结果。不要只测第一种变体就整行通过。
3. 验证所有本轮必需断言：响应业务字段及持久化副作用、UI 状态和保存/刷新效果、数据库精确记录、可获取的日志/trace，或队列/存储等链路结果。通过响应码、边数或截图观感不能替代用例要求的精确集合、字段值和禁止副作用。
4. 保存脱敏后的实际观察到 `evidence/`，如响应 JSON、DOM/配置快照、截图、只读数据库查询及返回值、日志片段。文件名区分场景、变体及尝试次数，复测不覆盖旧证据。写明资源 ID、时间范围、查询条件；日志不可获取就明确说明。可选渠道缺失不凭空阻塞；必需断言缺少证据必须阻塞。单测/mock、代码阅读和旧报告不能冒充本轮集成结果。
5. 立即更新该项。结果说明包含实际与预期对照、执行过的变体、异常及相关证据；部分变体失败则整行失败，其余未执行变体写清。仅缺少执行条件则阻塞。业务预期拒绝且实际符合要求应判通过，`scenario: failure` 不等于执行失败，定义 `status: ready` 也不等于通过。
6. 复测先检查写入是否已成功、是否支持幂等；不盲目重放非幂等操作。从失败/阻塞再次执行时先更新 `running`，开始新一次尝试，报告保留先前结果和证据。报告已结束则新建一轮。

将更新内容写入临时 JSON，通过文件参数传入，避免 shell 转义损坏说明或泄漏凭证。每次一项：

```json
{
  "caseId": "FG-APP-WORKFLOW-007",
  "itemId": "C1",
  "result": "running",
  "executor": "ai",
  "note": "开始重复同端口变体；已恢复 G1 并保存 E0"
}
```

```bash
node .agents/skills/system/fastgpt-integration-test-runner/scripts/report.mjs update --report /实际临时目录/report.html --record /tmp/update.json
```

终态记录格式如下。以下内容只是字段示意，必须替换为本轮真实观察；证据文件需实际存在于本轮 `evidence/` 中。工具要求通过/失败前先进入 running，并提供证据文件；它不会自动判断文件是否证明了业务断言，执行方须检查内容。

```json
{
  "caseId": "FG-APP-WORKFLOW-007",
  "itemId": "C1",
  "result": "passed",
  "executor": "ai",
  "note": "重复同端口变体：目标不可连接，实际释放后 E=E0；已对比四元组集合。其余变体不在本轮范围。",
  "evidence": [{ "path": "evidence/C1-observation.json", "label": "DOM、E0 与释放后关系集合" }]
}
```

结果取值为 `pending` 待执行、`running` 执行中、`passed` 通过、`failed` 失败、`blocked` 阻塞、`skipped` 跳过。初始化后不手动退回 pending；跳过要写原因，不能用跳过掩盖失败。只在所有选中项都通过时汇总通过；未纳入项不计入分母，报告始终说明范围。

## 清理和交付

按原用例清理实际创建的资源，保留失败证据。清理失败或需保留现场时记录资源 ID 和原因；检查先前失败不会污染后续场景。不要为清理删除本轮以外的资源。

```bash
node .agents/skills/system/fastgpt-integration-test-runner/scripts/report.mjs show --report /实际临时目录/report.html
node .agents/skills/system/fastgpt-integration-test-runner/scripts/report.mjs finish --report /实际临时目录/report.html --note "实际清理结果及遗留资源"
```

结束命令拒绝尚有待执行/执行中项的正常收尾。用户终止或不可继续时加 `--interrupted "原因"`，保留未完成状态，不自动改为通过或跳过。最终简洁给出报告绝对路径链接、执行范围、通过/失败/阻塞/跳过数量及必要遗留事项，不另写总结文档，不将执行结果回写用例库。
