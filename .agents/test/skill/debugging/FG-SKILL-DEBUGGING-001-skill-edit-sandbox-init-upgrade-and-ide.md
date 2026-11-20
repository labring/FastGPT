---
case_version: 1
id: "FG-SKILL-DEBUGGING-001"
title: "Skill Edit 在线 IDE 初始化、终端/预览协同、版本升级与旧迁移错误兜底"
business: "skill/debugging"
types: [ui, e2e, api]
category: basic
scenario: success
priority: P0
status: ready
tags: [skill, opensandbox, ide, terminal, preview, migration, boundary, abnormal]
evidence: [ui, response, database]
sources:
  - projects/app/src/pages/skill/detail.tsx
  - projects/app/src/pageComponents/dashboard/skill/detail/context.tsx
  - projects/app/src/pageComponents/dashboard/skill/detail/Content.tsx
  - projects/app/src/pageComponents/dashboard/skill/detail/config/SandboxError.tsx
  - projects/app/src/pageComponents/chat/SandboxEditor/components/EditorContent.tsx
  - packages/service/core/ai/sandbox/application/runtime/service.ts
  - packages/service/core/ai/sandbox/application/skillEdit/runtime.ts
  - projects/app/src/pages/api/core/ai/skill/runtime/init.ts
  - projects/app/src/pages/api/core/ai/sandbox/getTicket.ts
  - projects/app/src/pages/api/core/ai/sandbox/getHtmlPreviewLink.ts
routes:
  - "/api/core/ai/skill/create"
  - "/api/core/ai/skill/runtime/init"
  - "/api/core/ai/sandbox/getTicket"
  - "/api/core/ai/sandbox/getHtmlPreviewLink"
related:
  - "FG-INFRA-RUNTIME-003"
  - "FG-INFRA-RUNTIME-004"
automation: []
baseline: "da60070ba4f8321e54dd349243f6c9cae0bd2e99"
---

# Skill Edit 在线 IDE 初始化、终端/预览协同、版本升级与旧迁移错误兜底

## 用例简介

验证 Agent Skill 在迁移至 OpenSandbox 后的端到端在线编辑与调试体验：覆盖首次进入 Skill 详情页流式初始化（`skill/runtime/init`）、通过 `agent-sandbox-proxy` 连通实时文件树与 `uid=10001` 交互式终端、非法发布前置校验与合规发布成功、会话内非 HTML 与 HTML 预览差异展示，以及遗留 `sealosdevbox` 记录在 Skill 详情页触发 `409` 时前端 `<SandboxError>` 优雅兜底。

## 前置准备

- 环境与版本：本地 FastGPT Web 与 API 服务、`agent-sandbox-proxy`、OpenSandbox Server、`volume-manager` 与最新 `fastgpt-agent-sandbox` 镜像全部就绪并互通。代码基线 `da60070ba4f8321e54dd349243f6c9cae0bd2e99`（含本地 `runtime/service.ts`、`legacy/index.ts` 最新增量）。
- 身份与权限：使用已完成登录的测试团队管理员/拥有者账号。
- 测试数据：准备 2 个全新测试 Skill（等待 `creationStatus === 'ready'`）：`skillOkId`（正常 OpenSandbox 调试用例）与 `skillLegacyId`（在 `agent_sandbox_instances_v2` 中为其写入 `provider: 'sealosdevbox'` 记录）；另准备 1 个已发布启用沙箱的简单应用（`appId` + `chatId`），其工作区预先上传 `hello.html` 与 `notes.txt`。
- 复位约定：C1～C3 彼此隔离使用独立资源ID；测试完成后立即删除测试 Skill、应用、沙箱实例与热卷。
- 验证能力：浏览器真实交互、控制台/网络请求状态检查、`agent_sandbox_instances_v2` 只读查询。
- 关联标识：记录本轮测试的 `skillOkId`、`skillLegacyId`、`appId` 与 `chatId`。
- 清理方式：调用 Skill 删除与应用删除接口，同时回收关联容器、卷和数据库测试文档。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 基础/边界场景；打开 `skillOkId` 对应 `/skill/detail?skillId=<skillOkId>` | 等待初始化完成后展开右侧 IDE 与文件树；打开底部交互终端并执行 `id && pwd`，随后执行一条不存在的命令（如 `nonexistent_cmd_xyz`）；直接尝试点击发布以观察结构/Frontmatter 校验，随后在终端创建合规 `skills/sample/SKILL.md`（含 YAML `---` Frontmatter），确认文件树实时同步后再次点击发布并确认。 |
| C2 | 异常 UI 兜底场景；打开 `skillLegacyId`（`provider: 'sealosdevbox'` 或未转为 `tar.zst` 的遗留状态）对应 `/skill/detail?skillId=<skillLegacyId>` | 观察页面发起 `POST /api/core/ai/skill/runtime/init` 的网络状态与页面渲染结果（等待 ≤15s）。 |
| C3 | UI 预览边界场景；打开 `/chat?appId=<appId>&chatId=<chatId>` | 点击会话顶部沙箱入口按钮打开沙箱弹窗，分别选中 `notes.txt` 与 `hello.html`，检查编辑区顶部工具栏按钮差异，并点击 `hello.html` 的新窗口预览按钮确认预览页渲染。 |

## 预期结果

公共断言：所有页面交互期间不得出现未捕获 JS 运行时异常或白屏崩溃；`skillLegacyId` 场景仅产生预期的 `409` 初始化拒绝。

| 子场景 | 验证方式 | 特有预期 | 证据获取方式 |
| --- | --- | --- | --- |
| C1 | UI、响应 | `skill/runtime/init` 完成后文件树显示 `skills/` 等初始内容；终端提示 `uid=10001(sandbox)` 且工作目录为 `/workspace`，不存在的命令在终端内输出 `command not found` 且终端连接不中断；未按规范创建目录或缺少 YAML Frontmatter 时发布被明确提示拒绝；终端写入合规 `skills/sample/SKILL.md` 后文件树通过 WebSocket 实时刷新，再次发布成功并弹出成功提示。 | 浏览器页面状态、终端输出文本、发布 Toast 提示与 `/skill/runtime/init` 响应。 |
| C2 | UI、响应、数据库 | `POST /api/core/ai/skill/runtime/init` 触发迁移中错误（`409` / `agentSandboxMigrationInProgress`）；页面停止加载动画并渲染 `<SandboxError>` 组件，展示失败标题、迁移中中文/英文提示文案与重试按钮，不陷入死循环转圈或白屏。 | 浏览器 Network `409` 响应记录与 `<SandboxError>` 可见文本截图。 |
| C3 | UI、响应 | 选中 `notes.txt` 时编辑器加载正文内容且工具栏仅提供常规保存/下载等操作，不渲染 HTML 外部预览图标；选中 `hello.html` 时工具栏显示预览图标，点击后通过 `agent-sandbox-proxy` `/preview/...` URL 在新标签页正常渲染 HTML 标题与正文。 | 浏览器弹窗截图、工具栏按钮状态检查及新开预览标签页页面内容与 URL。 |
