# diting-rag-ts

> Agentic RAG implementation in TypeScript, based on langgraph-js

> **Monorepo 说明：** 本包已迁移到 FastGPT monorepo (`packages/diting-rag-ts`)。
>
> - **source-based**：tsc、Vitest、NextJS 均直接消费 TypeScript 源码，无需构建 dist
> - **独立测试**：`pnpm test`（在 `packages/diting-rag-ts/` 目录下）
> - **CI**：见 `.github/workflows/diting-rag-ts-test.yml`

智能企业知识库问答系统，通过 LLM 驱动的 Agent 自动进行查询改写、多轮检索、反思和答案生成。

## 特性

- **智能路由**: 自动识别问题类型（简单查询、对比分析、故障排查、深度研究、追问）
- **查询改写**: 支持多种改写策略（关键词扩展、查询分解、逐步深入、概念推理）
- **混合检索**: 向量检索 + 全文检索 + Rerank 融合
- **反思机制**: 检索结果评估与答案质量反思
- **依赖注入**: 面向接口设计，解耦具体实现

## 安装

```bash
npm install @sangfor/diting-rag-ts
```

## 快速开始

### CLI 方式

```bash
# 检索模式 - 只返回 chunks
diting-rag search -q "VPN如何配置" -d ds_123

# 问答模式 - 返回 chunks + 答案
diting-rag ask -q "VPN如何配置" -d ds_123

# 使用配置文件
diting-rag ask -q "VPN如何配置" -d ds_123 --use-config

# 启动 HTTP 服务
diting-rag serve --use-config
```

### 使用内置 Provider (调用真实 API)

```typescript
import { createAgenticSearch } from '@sangfor/diting-rag-ts';
import { createBuiltInLLMProvider, createBuiltInEmbeddingProvider, createBuiltInRerankProvider } from '@sangfor/diting-rag-ts/adapters/built-in';

// 从环境变量读取配置
const llm = createBuiltInLLMProvider({
  endpoint: process.env.LLM_BASE_URL,
  apiKey: process.env.LLM_API_KEY,
  model: process.env.LLM_MODEL,
});

const embed = createBuiltInEmbeddingProvider({
  endpoint: process.env.EMBEDDING_BASE_URL,
  apiKey: process.env.EMBEDDING_API_KEY,
  model: process.env.EMBEDDING_MODEL,
  dimension: 1024,
});

// Reranker 可选
const reranker = createBuiltInRerankProvider({
  endpoint: process.env.RERANKER_BASE_URL,
  apiKey: process.env.RERANKER_API_KEY,
  model: process.env.RERANKER_MODEL,
  topN: parseInt(process.env.RERANKER_TOP_K || '10'),
});

// 创建 Agent
const agent = createAgenticSearch({
  providers: {
    type: 'custom',
    llm,
    embed,
    reranker,
    // 可选: vectorSearch, fullTextSearch
  },
});

const result = await agent.invoke({
  query: 'VPN如何配置',
  datasetIds: ['ds_1'],
});
```

### 与 FastGPT 集成

```typescript
import { createAgenticSearch } from '@sangfor/diting-rag-ts';
import { createFastGPTProvider } from '@sangfor/diting-rag-ts/adapters/fastgpt';

// 使用 FastGPT 作为检索后端
const fastgpt = createFastGPTProvider({
  baseUrl: process.env.FASTGPT_API_BASE,
  apiKey: process.env.FASTGPT_API_KEY,
});

const agent = createAgenticSearch({
  providers: {
    type: 'fastgpt',
    ...fastgpt,
  },
});

const { chunks, reasoningText, answer } = await agent.invoke({
  query: userQuery,
  datasetIds,
  history: chatHistory,
});
```

## 配置

### 环境变量 (`.env`)

```bash
# LLM (兼容 OPENAI_BASE_URL, OPENAI_API_KEY)
LLM_BASE_URL=http://10.74.124.118:30001/v1
LLM_API_KEY=sk-xxx
LLM_MODEL=Qwen3-Next-80B-A3B-Instruct-FP8

# Embedding
EMBEDDING_BASE_URL=http://10.57.1.91:30088/v1
EMBEDDING_API_KEY=sk-xxx
EMBEDDING_MODEL=bge-m3

# Reranker (可选)
RERANKER_BASE_URL=http://10.57.1.91:30089/v1
RERANKER_API_KEY=sk-xxx
RERANKER_MODEL=bge-reranker-large
RERANKER_TOP_K=50

# FastGPT 检索 (可选)
FASTGPT_API_BASE=https://10.57.2.100:19443/api
FASTGPT_API_KEY=openapi-xxx

# 向量数据库 (可选)
VECTOR_DB=pgvector  # pgvector | milvus
PG_URL=postgresql://postgres:password@localhost:5432/postgres

# 全文检索数据库 (可选)
FULLTEXT_DB=mongodb  # mongodb | opensearch
MONGODB_URL=mongodb://localhost:27017
MONGODB_DATABASE=fastgpt

# Agent (可选)
SEARCH_MODE=mixedRecall
MAX_SEARCH_ROUNDS=5
```

### YAML 配置 (`config.yaml`)

```yaml
llm:
  base_url: http://10.74.124.118:30001/v1
  model: Qwen3-Next-80B-A3B-Instruct-FP8
  api_key: sk-xxx

embedding:
  base_url: http://10.57.1.91:30088/v1
  model: bge-m3
  api_key: sk-xxx

reranker:
  base_url: http://10.57.1.91:30089/v1
  model: bge-reranker-large
  api_key: sk-xxx
  top_n: 50

vector_db:
  type: pgvector
  pg_url: postgresql://postgres:password@localhost:5432/postgres

fulltext_db:
  type: mongodb
  url: mongodb://localhost:27017
  database: fastgpt

fastgpt:
  base_url: https://10.57.2.100:19443/api
  api_key: openapi-xxx

agent:
  search_mode: mixedRecall
  max_search_rounds: 5

agent:
  search_mode: mixedRecall
  max_search_rounds: 5
```

## CLI 命令

| 命令 | 说明 |
|------|------|
| `diting-rag search -q <query> -d <dataset>` | 检索 chunks |
| `diting-rag ask -q <query> -d <dataset>` | 检索 + 生成答案 |
| `diting-rag config check` | 校验配置文件 |
| `diting-rag serve` | 启动 HTTP 服务 |

## Playbooks

| Playbook | 说明 | 触发关键词 |
|----------|------|-----------|
| `simple_query` | 简单直接查询 | 直接的事实问答 |
| `comparative_analysis` | 对比分析 | 对比、区别、vs |
| `troubleshooting` | 故障排查 | 报错、失败、error |
| `deep_research` | 深度研究 | 有哪些、list、all |
| `followup_query` | 追问 | 然后、还有、what about |

## 目录结构

```
src/
├── types/           # 基础类型
├── ports/           # 接口契约
├── skills/          # Skill 体系
│   ├── atomic/      # 原子技能
│   └── expertise/   # 专家技能
├── agent/           # Agent 核心
├── adapters/        # 适配器
│   ├── fastgpt/     # FastGPT 适配器
│   ├── mock/        # 测试用 Mock
│   └── built-in/    # 内置适配器
├── prompts/         # 提示词 YAML
├── config/          # 配置加载
├── utils/           # 工具函数
└── apps/            # 应用入口
    └── server/      # HTTP 服务

bin/
├── cli.ts           # CLI 入口
└── server.ts        # 服务入口
```

## 开发

```bash
# 安装依赖
npm install

# 类型检查
npm run typecheck

# 运行测试
npm test

# 构建
npm run build

# 开发模式
npm run dev
```

## License

Proprietary - All rights reserved
