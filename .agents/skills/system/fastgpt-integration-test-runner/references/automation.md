# 脚本执行约定

Node 脚本和 Playwright 共用已有临时 HTML 报告。脚本只负责 Markdown 声明的业务断言；AI 负责选择、未覆盖项和失败复核。接口脚本不需要启动浏览器。

## 关联脚本

用例 frontmatter 可选填写，省略或为空表示 AI 执行。一个子场景只能映射一次；一个脚本可覆盖同一用例多个完整子场景。

```yaml
automation:
  - runner: playwright
    script: .agents/test/app/workflow/editor/FG-APP-WORKFLOW-007.browser.spec.ts
    items: [C1, C2, C3, C4]
```

Node 使用 `runner: node` 和仓库内 `.mjs` 入口。脚本与用例放在同一业务目录；共享的数据准备和操作可放该业务目录的 helper，避免复制用例或为每个参数变体拆文件。不要声明尚未实现或仅覆盖部分参数变体的子场景。

## 入口和环境

这批集成用例不接入 CI，也不加入默认测试、构建或安装流程。仅在明确选定本轮用例后手动运行以下命令；Chromium 和认证状态在本轮执行环境准备。

在仓库根目录安装依赖后，浏览器只需安装 Chromium 无头版本：

```bash
pnpm exec playwright install chromium --only-shell
pnpm test:cases --report /实际临时目录/report.html --plan
pnpm test:cases --report /实际临时目录/report.html
# 在本机显示浏览器窗口，并放慢操作以便观察（首次需 pnpm exec playwright install chromium）
FASTGPT_TEST_HEADED=1 FASTGPT_TEST_SLOW_MO=150 pnpm test:cases --report /实际临时目录/report.html
# AI 复核并修正脚本后，显式重跑失败项；历史结果和证据保留
pnpm test:cases --report /实际临时目录/report.html --case FG-APP-WORKFLOW-007 --items C1
```

报告先由 report.mjs init 创建，必须填写实际 BASE_URL 和目标部署版本。本入口默认仅执行 pending 的脚本项，串行运行，不默认重试。缩小了参数变体范围的 itemScope 不自动执行完整脚本，交由 AI 按范围处理。通过的场景不重复跑；失败和阻塞项进入 AI 复核清单。

认证优先通过 `FASTGPT_TEST_STORAGE_STATE` 指向仓库外的浏览器认证状态文件，或按脚本声明传入测试账号环境变量。认证状态不作为证据，不提交。不会自动启动应用、读取生产凭证或扩大测试环境。脚本配置、登录失败等应如实记录并复核。

## Playwright 浏览器脚本

配置在 `.agents/test/playwright.config.ts`，默认无头 Chromium、一个 worker、零重试。脚本必须通过真实页面操作验证 UI，不调用内部规则函数或直接修改图状态代替 UI 行为。

测试标题以 `[用例ID/子场景ID]` 开头；同一子场景的参数变体可写多条相同前缀的 test。调度器只运行选中 ID 的测试，并将所有实际变体结果归到对应行；每个变体都成功才通过。禁止用 test.fail、skip 或重试成功掩盖业务失败。

```ts
test('[FG-APP-WORKFLOW-007/C1] 自连', async ({ page }, testInfo) => {
  // 按 Markdown 完成数据准备、真实交互和全部断言。
  // 必要的脱敏配置或响应通过 testInfo.attach 附加。
});
```

结果、失败截图、trace 和进程输出按每次尝试隔离在报告的 evidence 子目录，并记录执行入口的 SHA-256、入口地址和目标版本。登录材料不能写入日志；可共享的证据须检查并脱敏。清理须在 finally 或测试 teardown 中完成，并记录本轮资源 ID。

## Node 接口脚本

调度器直接用 Node 运行入口，不经过 shell。以下环境变量由调度器传入：

| 环境变量 | 含义 |
| --- | --- |
| FASTGPT_TEST_BASE_URL | 报告中核实的测试入口 |
| FASTGPT_TEST_CASE_ID | 当前用例 ID |
| FASTGPT_TEST_ITEMS | 本轮子场景编号的 JSON 数组 |
| FASTGPT_TEST_RUN_DIR | 本次尝试的独立证据目录 |
| FASTGPT_TEST_RESULTS_FILE | 结果 JSON 文件的绝对路径 |

脚本按 FASTGPT_TEST_ITEMS 执行完整子场景，将以下结构的数组写入 FASTGPT_TEST_RESULTS_FILE；失败也写观察结果再非零退出。每个变体可各写一条记录，同一子场景的记录统一汇总。

```json
[
  {
    "caseId": "FG-APP-WORKFLOW-007",
    "itemId": "C1",
    "variant": "明确的参数变体名称",
    "result": "passed",
    "note": "实际与预期对照，只有完成全部断言才能通过",
    "evidence": [{ "path": "C1-response.json", "label": "脱敏响应及数据核对" }]
  }
]
```

result 仅支持 passed、failed、blocked。证据路径相对 FASTGPT_TEST_RUN_DIR，必须是本次目录里的真实文件，不能通过 .. 或符号链接引用外部文件。通过或失败判定必须提供实际响应或数据快照；只返回退出码 0 不算通过。没有产出选中场景结果、协议异常或清理失败时不能标记通过。

维护调度器、状态或模板后，局部自检使用 `node --test .agents/skills/system/fastgpt-integration-test-runner/scripts/execute.test.mjs`。其中 HTTP 和浏览器使用可控的临时场景，验证框架及报告行为，不作为 FastGPT 业务用例的通过证据。

## AI 接手与失败复核

执行命令返回 aiTasks，action=execute 表示无脚本覆盖或本轮范围无法由脚本精确表达；action=review 表示需复核失败、阻塞或未完成定义。AI 沿用原 Markdown、环境和报告，不创建另一套验收目标。

复核结论写入现有结果说明并附证据，保留原脚本记录：

- 脚本兼容：独立检查产品仍满足原预期，定位到选择器、等待、数据准备或已确认的接口变更；修复脚本后显式复测，不删断言或改预期来通过。
- 产品错误：独立复现预期与实际的差异，保留 failed，记录复现与影响。执行任务本身不授权顺便修改产品代码。
- 环境问题或证据不足：记录依赖、权限或执行条件，补齐前不宣称产品通过；不能把所有超时都推断成脚本兼容问题。

复核原失败或阻塞时，保持原 result 和 executor，增加 `reviewer: ai` 并附复核证据；报告会标明“脚本执行，AI 复核”，不改成 AI 已执行。实际重新执行时，先进入 running 并设置 `executor: script` 或 `executor: ai`，再根据本次证据记录终态。历史保留各次执行方；AI 执行通过也不能声称原脚本已经修复。先检查已有写入与清理状态，再重试；不盲目重放非幂等操作。
