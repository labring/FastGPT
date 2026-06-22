---
capability_label: "OpenAPI 文档"
doc_type: "12"
doc_label: "API索引"
generated_at: "2026-06-18T00:00:00.000Z"
parent_module: null
roles: []
router_paths: ["/openapi"]
---

# OpenAPI 文档 — API索引

## 说明

本模块为纯展示页面，前端组件不直接发起自定义 API 请求。页面加载后，由 Scalar API Reference 组件内部请求 `/api/openapi.json` 获取 OpenAPI 规范数据。

## 涉及的 API 端点

### 文档数据

| API 路径 | 方法 | 用途 | 调用位置 | 调用场景 |
|---------|------|------|---------|---------|
| `/api/openapi.json` | GET | 返回 FastGPT 完整 OpenAPI 3.1.0 规范 JSON | `projects/app/src/pages/api/openapi.json.ts:4` → `@fastgpt/global/openapi/index.ts:12` | OpenAPI 文档→API 文档查阅→页面加载时由 Scalar 组件内部调用 |

### `/api/openapi.json` 调用链

```
Scalar ApiReferenceReact 组件
  ├── 触发: 组件挂载后自动请求
  ├── 参数: 无（直接请求 /api/openapi.json）
  └── 响应处理: Scalar 组件内部解析 OpenAPI JSON，渲染交互式文档 UI

服务端 handler (projects/app/src/pages/api/openapi.json.ts)
  ├── 触发: HTTP GET 请求
  ├── 参数: 无
  └── 响应: res.status(200).json(openAPIDocument)，其中 openAPIDocument
       由 @fastgpt/global/openapi 的 createDocument() 构建，
       合并 AppPath、ChatPath、DatasetPath、PluginPath、SupportPath、
       AIPath、AgentSkillsPath、AgentSkillsPackagePath 等路径定义
```

### 规范文档覆盖的 API 标签分组

OpenAPI 规范文档覆盖以下 API 分组（由 `x-tagGroups` 定义）：

| 分组 | 包含标签 |
|------|---------|
| 我的应用/工具管理 | 应用通用、MCP 工具、HTTP 工具、应用权限 |
| Agent 应用 | 应用日志、发布渠道、MCP 服务器 |
| AI 相关 | AI 技能、代码沙箱、模型管理 |
| 对话模块配置 | 对话设置、对话页面、对话输入引导 |
| 对话模块使用 | 对话历史、对话反馈、对话文件、对话记录、对话控制 |
| 知识库 | 知识库通用、集合管理、数据管理、文件管理、训练管理、API 数据集、标签、同义词、协作者 |
| 插件系统 | 插件工具标签、插件团队 |
| 用户体系 | 用户通知、钱包账单、优惠券、用户登录 |
| 通用-核心功能 | AI 通用 |
| 通用-辅助功能 | 自定义域名、API Key |
| 管理员-插件管理 | 插件管理、插件市场、插件工具管理 |
| 系统接口 | 辅助机器人 |
