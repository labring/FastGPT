# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在本仓库中工作时提供指导说明。

## 输出要求

1. 输出语言：中文
2. 输出的设计文档位置：.claude/design，以 Markdown 文件为主。
3. 输出 Plan 时，均需写入 .claude/plan 目录下，以 Markdown 文件为主。

## 项目概述

FastGPT 是一个 AI Agent 构建平台,通过 Flow 提供开箱即用的数据处理、模型调用能力和可视化工作流编排。这是一个基于 NextJS 构建的全栈 TypeScript 应用,后端使用 MongoDB/PostgreSQL。

**技术栈**: NextJS + TypeScript + ChakraUI + MongoDB + PostgreSQL (PG Vector)/Milvus

## 架构

这是一个使用 pnpm workspaces 的 monorepo,主要结构如下:

### Packages (库代码)
- `packages/global/` - 所有项目共享的类型、常量、工具函数
- `packages/service/` - 后端服务、数据库模型、API 控制器、工作流引擎
- `packages/web/` - 共享的前端组件、hooks、样式、国际化
- `packages/templates/` - 模板市场的应用模板

### Projects (应用程序)
- `projects/app/` - 主 NextJS Web 应用(前端 + API 路由)
- `projects/sandbox/` - NestJS 代码执行沙箱服务
- `projects/mcp_server/` - Model Context Protocol 服务器实现

### 关键目录
- `document/` - 文档站点(NextJS 应用及内容)
- `plugins/` - 外部插件(模型、爬虫等)
- `deploy/` - Docker 和 Helm 部署配置
- `test/` - 集中的测试文件和工具

## 开发命令

### 主要命令(从项目根目录运行)
- `pnpm dev` - 启动所有项目的开发环境(使用 package.json 的 workspace 脚本)
- `pnpm build` - 构建所有项目
- `pnpm test` - 使用 Vitest 运行测试
- `pnpm test:workflow` - 运行工作流相关测试
- `pnpm lint` - 对所有 TypeScript 文件运行 ESLint 并自动修复
- `pnpm format-code` - 使用 Prettier 格式化代码

### 项目专用命令
**主应用 (projects/app/)**:
- `cd projects/app && pnpm dev` - 启动 NextJS 开发服务器
- `cd projects/app && pnpm build` - 构建 NextJS 应用
- `cd projects/app && pnpm start` - 启动生产服务器

**沙箱 (projects/sandbox/)**:
- `cd projects/sandbox && pnpm dev` - 以监视模式启动 NestJS 开发服务器
- `cd projects/sandbox && pnpm build` - 构建 NestJS 应用
- `cd projects/sandbox && pnpm test` - 运行 Jest 测试

**MCP 服务器 (projects/mcp_server/)**:
- `cd projects/mcp_server && bun dev` - 使用 Bun 以监视模式启动
- `cd projects/mcp_server && bun build` - 构建 MCP 服务器
- `cd projects/mcp_server && bun start` - 启动 MCP 服务器

### 工具命令
- `pnpm create:i18n` - 生成国际化翻译文件
- `pnpm api:gen` - 生成 OpenAPI 文档
- `pnpm initIcon` - 初始化图标资源
- `pnpm gen:theme-typings` - 生成 Chakra UI 主题类型定义

## 测试

项目使用 Vitest 进行测试并生成覆盖率报告。主要测试命令:
- `pnpm test` - 运行所有测试
- `pnpm test:workflow` - 专门运行工作流测试
- 测试文件位于 `test/` 目录和 `projects/app/test/`
- 覆盖率报告生成在 `coverage/` 目录

## 代码组织模式

### Monorepo 结构
- 共享代码存放在 `packages/` 中,通过 workspace 引用导入
- `projects/` 中的每个项目都是独立的应用程序
- 使用 `@fastgpt/global`、`@fastgpt/service`、`@fastgpt/web` 导入共享包

### API 结构
- NextJS API 路由在 `projects/app/src/pages/api/`
- API 路由合约定义在`packages/global/openapi/`, 对应的
- 通用服务端业务逻辑在 `packages/service/`和`projects/app/src/service`
- 数据库模型在 `packages/service/` 中,使用 MongoDB/Mongoose

### 前端架构
- React 组件在 `projects/app/src/components/` 和 `packages/web/components/`
- 使用 Chakra UI 进行样式设计,自定义主题在 `packages/web/styles/theme.ts`
- 国际化支持文件在 `packages/web/i18n/`
- 使用 React Context 和 Zustand 进行状态管理

## 开发注意事项

- **包管理器**: 使用 pnpm 及 workspace 配置
- **Node 版本**: 需要 Node.js >=18.16.0, pnpm >=9.0.0
- **数据库**: 支持 MongoDB、带 pgvector 的 PostgreSQL 或 Milvus 向量存储
- **AI 集成**: 通过统一接口支持多个 AI 提供商
- **国际化**: 完整支持中文、英文和日文

## 关键文件模式

- `.ts` 和 `.tsx` 文件全部使用 TypeScript
- 数据库模型使用 Mongoose 配合 TypeScript
- API 路由遵循 NextJS 约定
- 组件文件使用 React 函数式组件和 hooks
- 共享类型定义在 `packages/global/` 的 `.d.ts` 文件中

## 环境配置

- 配置文件在 `projects/app/data/config.json`
- 支持特定环境配置
- 模型配置在 `packages/service/core/ai/config/`

## 代码规范

- 尽可能使用 type 进行类型声明，而不是 interface。

## Agent 设计规范

1. 对于功能的实习和复杂问题修复，优先进行文档设计，并于让用户确认后，再进行执行修复。
2. 采用"设计文档-测试示例-代码编写-测试运行-修正代码/文档"的工作模式，以测试为核心来确保设计的正确性。