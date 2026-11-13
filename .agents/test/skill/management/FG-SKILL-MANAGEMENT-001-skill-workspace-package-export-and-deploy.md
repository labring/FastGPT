---
case_version: 1
id: "FG-SKILL-MANAGEMENT-001"
title: "Skill 工作区 .gitignore 过滤打包、只读协作者导出与跨沙箱版本部署"
business: "skill/management"
types:
  - "api"
  - "integration"
category: "basic"
scenario: "success"
priority: "P0"
status: "ready"
automation:
  - runner: node
    script: .agents/test/skill/management/FG-SKILL-MANAGEMENT-001.mjs
    items: [C1, C2, C3]
tags:
  - "skill"
  - "export"
  - "package"
  - "deploy"
  - "覆盖基础场景"
  - "覆盖异常场景"
  - "覆盖边界场景"
evidence:
  - "response"
  - "storage"
  - "database"
sources:
  - "projects/app/src/pages/api/core/ai/skill/export.ts"
  - "packages/service/core/ai/sandbox/application/skillEdit/runtime.ts"
  - "packages/service/core/ai/sandbox/application/runtime/skill/core.ts"
  - "packages/service/core/ai/sandbox/application/runtime/skill/entrypoint.ts"
  - "projects/app/src/pageComponents/dashboard/skill/detail/Header.tsx"
routes:
  - "GET /api/core/ai/skill/export"
  - "POST /api/core/ai/skill/runtime/init"
  - "POST /api/core/ai/skill/save-deploy"
  - "POST /api/core/ai/skill/version/list"
  - "POST /api/core/ai/skill/version/switch"
  - "POST /api/core/ai/sandbox/fs/exec"
related:
  - "FG-SKILL-DEBUGGING-001"
baseline: "116dda3bc40b712a866899037ca3c74da3587091"
---

# Skill 工作区 .gitignore 过滤打包、只读协作者导出与跨沙箱版本部署

## 用例简介

验证 Skill 从调试沙箱打包导出、权限校验到发布部署进入 App 会话沙箱的完整链路：`GET /api/core/ai/skill/export` 直接从 Skill Edit 沙箱工作区打包并按系统默认与自定义 `.gitignore` 规则排除 `node_modules`、`.venv`、`package.zip`；只读协作者（`ReadPermissionVal`）可正常导出 Skill 包而无权限成员被拒绝；打包发布的新版本可注入 App 沙箱 `/workspace/projects/<versionId>` 并幂等执行 `entrypoint.sh`。

## 前置准备

- 本地启动 FastGPT App (`127.0.0.1:3000`)、Volume-Manager (`127.0.0.1:3005`)、OpenSandbox Server (`127.0.0.1:8090`)、MongoDB、Redis、MinIO。
- 通过 `create-skill-fixture` 创建测试 Skill，测试结束后通过 `cleanup-skill-fixture` 清理 Skill、版本包与沙箱实例。

## 测试步骤

| 子场景 | 类型与起始状态 | 输入与操作 |
| --- | --- | --- |
| C1 | 基础与边界；已初始化 Skill 沙箱 | 在 Skill 沙箱内创建 `src/new_tool.py` 以及应被忽略的 `node_modules/fake/index.js`、`.venv/pyvenv.cfg`、`package.zip`，调用 `GET /api/core/ai/skill/export?skillId=<skillId>` 下载导出包并解压检查。 |
| C2 | 权限边界；已初始化 Skill 沙箱 | 为成员 `B` 授予 Skill 只读权限 (`ReadPermissionVal`) 后调用 `GET /api/core/ai/skill/export`；为成员 `N` 设置无权限后调用同一导出接口。 |
| C3 | 跨沙箱部署；已修改 Skill 工作区 | 将修改后的 Skill 工作区打包发布为新版本，随后部署至宿主应用 `W` 的会话沙箱 `/workspace/projects/<versionId>`，连续两次调用 `runAgentSkillVersionEntrypoints` 并调用 `getAgentSkillInfos`。 |

## 预期结果

| 子场景 | 特有预期 | 证据 |
| --- | --- | --- |
| C1 | 导出返回 `200` 与 `application/zip`；解压后包含 `SKILL.md`、`src/new_tool.py`，且不包含 `node_modules/*`、`.venv/*`、`package.zip`。 | 导出 ZIP 条目列表。 |
| C2 | 只读协作者 `B` 成功导出 ZIP（`200`）；无权限成员 `N` 返回 `403` 拒绝。 | 协作者与无权限成员响应对比。 |
| C3 | 新版本成功部署至 App 沙箱 `/workspace/projects/<newVersionId>`，连续两次触发 `entrypoint.sh` 仅实际执行 1 次，`getAgentSkillInfos` 返回准确的 Skill 元信息。 | 部署目录、entrypoint 计数与解析信息。 |
