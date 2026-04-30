# AGENTS.md

本文件为 Agent 在本仓库中工作时提供指导说明。

## 项目概述

FastGPT 是一个 AI Agent 构建平台,通过 Flow 提供开箱即用的数据处理、模型调用能力和可视化工作流编排。这是一个基于 NextJS 构建的全栈 TypeScript 应用,后端使用 MongoDB/PostgreSQL。

**技术栈**: NextJS + TypeScript + ChakraUI + MongoDB + VectorDB(PG, Milvus, Zilliz, OceanBase, SeekDB, OpenGauss......)

## 设计文档

你可以参考 [项目设计文档](./.codex/design/) 来了解 FastGPT 已有的设计方案。

## 架构

这是一个使用 pnpm workspaces 的 monorepo,主要结构如下:

### Packages (库代码)
- `packages/global/` - 所有项目共享的类型、常量、工具函数
- `packages/service/` - 后端服务、数据库模型、API 控制器、工作流引擎
- `packages/web/` - 共享的前端组件、hooks、样式、国际化

### Projects (应用程序)
- `projects/app/` - 主 NextJS Web 应用(前端 + API 路由)
- `projects/code-sandbox/` - Bun + Hono 代码执行沙箱服务
- `projects/mcp_server/` - Model Context Protocol 服务器实现

### 关键目录
- `document/` - 文档站点(NextJS 应用及内容)
- `plugins/` - 外部插件(模型、爬虫等)
- `deploy/` - Docker 和 Helm 部署配置
- `test/` - 集中的测试文件和工具

## 开发命令

### 项目专用命令
**主应用 (projects/app/)**:
- `cd projects/app && pnpm dev` - 启动 NextJS 开发服务器
- `cd projects/app && pnpm build` - 构建 NextJS 应用
- `cd projects/app && pnpm start` - 启动生产服务器

**代码沙箱 (projects/code-sandbox/)**:
- `cd projects/code-sandbox && pnpm dev` - 以监视模式启动（Bun）
- `cd projects/code-sandbox && pnpm build` - 构建沙箱服务
- `cd projects/code-sandbox && pnpm test` - 运行 Vitest 测试

**MCP 服务器 (projects/mcp_server/)**:
- `cd projects/mcp_server && bun dev` - 使用 Bun 以监视模式启动
- `cd projects/mcp_server && bun build` - 构建 MCP 服务器
- `cd projects/mcp_server && bun start` - 启动 MCP 服务器

### 工具命令
- `pnpm lint` - 对所有 TypeScript 文件运行 ESLint 并自动修复
- `pnpm initIcon` - 初始化图标资源
- `pnpm gen:theme-typings` - 生成 Chakra UI 主题类型定义

## 测试

项目使用 Vitest 进行测试并生成覆盖率报告。主要测试命令:
- `pnpm test` - 运行所有测试
- `pnpm test {file-path}` - 使用 Vitest 运行指定测试文件的指定测试
- 测试文件位于 `test/` 目录和 `projects/{{name}}/test/`，代表这`packages`和`单个 project`的测试文件目录。
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
- **Node 版本**: 需要 Node.js >=20.x, pnpm >=9.x
- **数据库**: 支持 MongoDB、带 pgvector 的 PostgreSQL 或 Milvus 向量存储
- **AI 集成**: 通过统一接口支持多个 AI 提供商
- **国际化**: 完整支持中文、英文和日文

## 关键文件模式

- `.ts` 和 `.tsx` 文件全部使用 TypeScript
- 数据库模型使用 Mongoose 配合 TypeScript
- API 路由遵循 NextJS 约定
- 组件文件使用 React 函数式组件和 hooks
- 共享类型定义在 `packages/global/`中

## 环境配置

- 配置文件在 `projects/app/data/config.json`
- 支持特定环境配置
- 模型配置在 `packages/service/core/ai/config/`

## 代码规范

[FastGPT 代码规范](./.codex/code/syntax.md)

## 运行要求

### 性格

1. 保持怀疑态度，要深入思考和分析现有代码，提出问题，并让用户确认。
2. 编写单个需求时，运行测试命令，中途不要运行全量测试，只需局部测试即可，只需最后运行全量测试，确保没有问题。

### 工作流程

对于简单任务，可以直接进行编写实现，对于复杂任务，遵循以下流程：

function agent_loop(用户需求){
   // 1. 需求文档编写
   while(需求文档编写未完成){
      用户需求分析
      编写需求分析文档;
      提出问题，让用户提供答案;
      调整需求文档;
   }
   
   // 2. 开发文档编写
   while(开发文档编写未完成){
      编写开发文档;
      提出问题，让用户提供答案;
      调整开发文档;
   }

   // 3. 列出 TODO
   while(TODO 列表编写未完成){
      编写 TODO 列表; // 包含写代码，运行测试等，需要与开发文档对应
      提出问题，让用户提供答案;
      调整 TODO 列表;
   }

   // 4. 执行 TODO List
   while(TODO List 执行未完成){
      执行 TODO List;
      更新 TODO List 状态;
   }
}

### 输出规范

1. 输出语言：中文
2. 输出文档位置:
   2.1. 设计文档: [.codex/design](.codex/design)，todo 跟在设计文档后面。
   2.2. 问题分析文档: [.codex/issue](.codex/issue)
3. 相同需求文档，尽量写在一起（内容超过 300 行，可以分批写入），或者创建要给目录一起管理，不要随意平铺一堆不同版本的相同问题的文档。
4. 文件输出，使用正确的编码格式，例如UTF-8。
5. 除非用户指明，否则不要编写总结报告。