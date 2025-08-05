# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

FastGPT is an AI Agent construction platform providing out-of-the-box data processing, model invocation capabilities, and visual workflow orchestration through Flow. This is a full-stack TypeScript application built on NextJS with MongoDB/PostgreSQL backends.

**Tech Stack**: NextJS + TypeScript + ChakraUI + MongoDB + PostgreSQL (PG Vector)/Milvus

## Architecture

This is a monorepo using pnpm workspaces with the following key structure:

### Packages (Library Code)
- `packages/global/` - Shared types, constants, utilities used across all projects
- `packages/service/` - Backend services, database schemas, API controllers, workflow engine
- `packages/web/` - Shared frontend components, hooks, styles, i18n
- `packages/templates/` - Application templates for the template market

### Projects (Applications)
- `projects/app/` - Main NextJS web application (frontend + API routes)
- `projects/sandbox/` - NestJS code execution sandbox service
- `projects/mcp_server/` - Model Context Protocol server implementation

### Key Directories
- `document/` - Documentation site (NextJS app with content)
- `plugins/` - External plugins (models, crawlers, etc.)
- `deploy/` - Docker and Helm deployment configurations
- `test/` - Centralized test files and utilities

## Development Commands

### Main Commands (run from project root)
- `pnpm dev` - Start development for all projects (uses package.json workspace scripts)
- `pnpm build` - Build all projects  
- `pnpm test` - Run tests using Vitest
- `pnpm test:workflow` - Run workflow-specific tests
- `pnpm lint` - Run ESLint across all TypeScript files with auto-fix
- `pnpm format-code` - Format code using Prettier

### Project-Specific Commands
**Main App (projects/app/)**:
- `cd projects/app && pnpm dev` - Start NextJS dev server
- `cd projects/app && pnpm build` - Build NextJS app
- `cd projects/app && pnpm start` - Start production server

**Sandbox (projects/sandbox/)**:
- `cd projects/sandbox && pnpm dev` - Start NestJS dev server with watch mode
- `cd projects/sandbox && pnpm build` - Build NestJS app
- `cd projects/sandbox && pnpm test` - Run Jest tests

**MCP Server (projects/mcp_server/)**:
- `cd projects/mcp_server && bun dev` - Start with Bun in watch mode
- `cd projects/mcp_server && bun build` - Build MCP server
- `cd projects/mcp_server && bun start` - Start MCP server

### Utility Commands
- `pnpm create:i18n` - Generate i18n translation files
- `pnpm api:gen` - Generate OpenAPI documentation
- `pnpm initIcon` - Initialize icon assets
- `pnpm gen:theme-typings` - Generate Chakra UI theme typings

## Testing

The project uses Vitest for testing with coverage reporting. Key test commands:
- `pnpm test` - Run all tests
- `pnpm test:workflow` - Run workflow tests specifically  
- Test files are located in `test/` directory and `projects/app/test/`
- Coverage reports are generated in `coverage/` directory

## Code Organization Patterns

### Monorepo Structure
- Shared code lives in `packages/` and is imported using workspace references
- Each project in `projects/` is a standalone application
- Use `@fastgpt/global`, `@fastgpt/service`, `@fastgpt/web` imports for shared packages

### API Structure
- NextJS API routes in `projects/app/src/pages/api/`
- Core business logic in `packages/service/core/`
- Database schemas in `packages/service/` with MongoDB/Mongoose

### Frontend Architecture
- React components in `projects/app/src/components/` and `packages/web/components/`
- Chakra UI for styling with custom theme in `packages/web/styles/theme.ts`
- i18n support with files in `packages/web/i18n/`
- State management using React Context and Zustand

### Workflow System
- Visual workflow editor using ReactFlow
- Workflow engine in `packages/service/core/workflow/`
- Node definitions in `packages/global/core/workflow/template/`
- Dispatch system for executing workflow nodes

## Development Notes

- **Package Manager**: Uses pnpm with workspace configuration
- **Node Version**: Requires Node.js >=18.16.0, pnpm >=9.0.0
- **Database**: Supports MongoDB, PostgreSQL with pgvector, or Milvus for vector storage
- **AI Integration**: Supports multiple AI providers through unified interface
- **Internationalization**: Full i18n support for Chinese, English, and Japanese

## Key File Patterns

- `.ts` and `.tsx` files use TypeScript throughout
- Database schemas use Mongoose with TypeScript
- API routes follow NextJS conventions
- Component files use React functional components with hooks
- Shared types defined in `packages/global/` with `.d.ts` files

## Environment Configuration

- Configuration files in `projects/app/data/config.json` 
- Environment-specific configs supported
- Model configurations in `packages/service/core/ai/config/`