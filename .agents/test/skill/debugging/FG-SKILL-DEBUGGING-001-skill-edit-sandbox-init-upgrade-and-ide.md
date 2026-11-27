---
case_version: 1
id: "FG-SKILL-DEBUGGING-001"
title: "Skill Edit 在线 IDE 初始化、终端/发布/预览协同与旧迁移错误兜底"
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
  - packages/service/core/ai/sandbox/infrastructure/instance/repository.ts
  - packages/service/core/ai/skill/package/runtimeMetadata.ts
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
baseline: "0552d2a20d40265ae851dba2d2d4bee882c516a3"
---

# Skill Edit 在线 IDE 初始化、终端/发布/预览协同与旧迁移错误兜底

## 用例简介

验证 Agent Skill 在迁移至 OpenSandbox 后的端到端在线编辑与调试体验：覆盖首次进入 Skill 详情页流式初始化（`skill/runtime/init`）、通过 `agent-sandbox-proxy` 连通实时文件树与 `uid=10001` 交互式终端、非法发布前置校验与合规发布成功、会话内非 HTML 与 HTML 预览差异展示，以及遗留未迁移记录在 Skill 详情页通过 SSE `event: error` 下发 `agentSandboxMigrationInProgress`（JSON 接口如 `getTicket` 返回 HTTP `409`）时前端 `<SandboxError>` 优雅兜底。

## 前置准备

- 环境与版本：本地 FastGPT Web 与 API 服务（已在 `system_instance_configs` 中启用 Agent Sandbox）、`agent-sandbox-proxy`、OpenSandbox Server、`volume-manager` 与最新 `fastgpt-agent-sandbox` 镜像全部就绪并互通。
- 身份与权限：使用已完成登录的测试团队管理员/拥有者账号。
- 测试数据：准备 2 个全新测试 Skill（等待 `creationStatus === 'ready'`）：`skillOkId`（正常 OpenSandbox 调试用例，运行态落于 `agent_sandbox_instances_v3`）与 `skillLegacyId`（确认 `system_migration_states` 中 `_id: '20261117_migrate_sandbox_to_opensandbox'` 不为 `succeeded`，在历史集合 `agent_sandbox_instances_v2` 中为其写入非 `deleting` 状态的未迁移记录，且 `agent_sandbox_instances_v3` 中无对应记录）；另准备 1 个已发布启用沙箱的简单应用（`appId` + `chatId`），其工作区预先上传 `hello.html` 与 `notes.txt`。
- 复位约定：C1～C3 彼此隔离使用独立资源ID；测试完成后立即删除测试 Skill、应用、沙箱实例与热卷。
- 验证能力：浏览器真实交互、控制台/网络请求与 SSE 事件流检查、`agent_sandbox_instances_v3`（运行态）与 `agent_sandbox_instances_v2`、`system_migration_states`（未迁移夹具）只读查询。
- 关联标识：记录本轮测试的 `skillOkId`、`skillLegacyId`、`appId` 与 `chatId`。
- 清理方式：调用 Skill 删除与应用删除接口，同时回收关联容器、卷和数据库测试文档。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 基础/边界场景；打开 `skillOkId` 对应 `/skill/detail?skillId=<skillOkId>` | 等待初始化完成后展开右侧 IDE 与文件树；打开底部交互终端并执行 `id && pwd`，随后执行一条不存在的命令（如 `nonexistent_cmd_xyz`）；先清空工作区 `SKILL.md` 及写入缺少有效 `name`/Frontmatter 的 `SKILL.md` 分别尝试点击发布以观察前置校验，随后在终端创建合规 `SKILL.md`（例如 `skills/sample/SKILL.md`，含合法 YAML `---` Frontmatter；实际发布扫描支持任意深度），确认文件树实时同步后再次点击发布并确认。 |
| C2 | 异常 UI 兜底场景；在 `system_migration_states` 中 `20261117_migrate_sandbox_to_opensandbox` 未 `succeeded` 的前提下，打开 `skillLegacyId`（`agent_sandbox_instances_v2` 含非 `deleting` 未迁移记录、`v3` 无记录）对应 `/skill/detail?skillId=<skillLegacyId>` | 观察页面发起 `POST /api/core/ai/skill/runtime/init` 的 SSE 响应流与页面渲染结果（等待 ≤15s）；可选对照调用 JSON 接口 `POST /api/core/ai/sandbox/getTicket` 检查 HTTP `409` 返回。 |
| C3 | UI 预览边界场景；打开 `/chat?appId=<appId>&chatId=<chatId>` | 点击会话顶部沙箱入口按钮打开沙箱弹窗，分别选中 `notes.txt` 与 `hello.html`，检查编辑区顶部工具栏按钮差异，并点击 `hello.html` 的新窗口预览按钮确认预览页渲染。 |

## 预期结果

公共断言：所有页面交互期间不得出现未捕获 JS 运行时异常或白屏崩溃；`skillLegacyId` 场景下 `POST /api/core/ai/skill/runtime/init` 仅产生预期的 SSE `event: error`（`agentSandboxMigrationInProgress`，载荷等价 `httpStatus: 409`），JSON 接口（如 `getTicket`）返回 HTTP `409`。

| 子场景 | 验证方式 | 特有预期 | 证据获取方式 |
| --- | --- | --- | --- |
| C1 | UI、响应 | `skill/runtime/init` 完成后文件树显示 `skills/` 等初始内容；终端提示 `uid=10001(sandbox)` 且工作目录 `pwd` 为 `/home/sandbox/workspace`（`/workspace` 为指向该目录的软链），不存在的命令在终端内输出 `command not found` 且终端连接不中断；工作区缺失 `SKILL.md` 时发布被拒绝（`missingSkillMd`），`SKILL.md` 缺少有效 `name` 或合法 YAML Frontmatter 时发布被拒绝（`noValidSkillMd`）（校验接受任意深度的 `SKILL.md`，不强制要求 `skills/<name>/` 布局）；终端写入合规 `SKILL.md` 后文件树通过 WebSocket 实时刷新，再次发布成功并弹出成功提示。 | 浏览器页面状态、终端输出文本、发布 Toast 提示与 `/skill/runtime/init` 响应。 |
| C2 | UI、响应、数据库 | `POST /api/core/ai/skill/runtime/init` 先响应 HTTP `200`（`Content-Type: text/event-stream`），随后在 SSE 流内通过 `event: error` 下发 `agentSandboxMigrationInProgress`（载荷内含 `httpStatus: 409`；JSON 接口如 `getTicket` 直接返回 HTTP `409`）；页面停止加载动画并渲染 `<SandboxError>` 组件，展示失败标题、迁移中中文/英文提示文案与重试按钮，不陷入死循环转圈或白屏，且 `agent_sandbox_instances_v3` 无新写入、`agent_sandbox_instances_v2` 记录保持只读未变。 | 浏览器 Network `/api/core/ai/skill/runtime/init` 的 HTTP `200` SSE `event: error` 事件流记录（及可选 `getTicket` HTTP `409` 响应）、`<SandboxError>` 可见文本截图，以及 `v3`/`v2`/`system_migration_states` 只读集合校验。 |
| C3 | UI、响应 | 选中 `notes.txt` 时编辑器加载正文内容且工具栏仅提供常规保存/下载等操作，不渲染 HTML 外部预览图标；选中 `hello.html` 时工具栏显示预览图标，点击后通过 `agent-sandbox-proxy` `/preview/...` URL 在新标签页正常渲染 HTML 标题与正文。 | 浏览器弹窗截图、工具栏按钮状态检查及新开预览标签页页面内容与 URL。 |
