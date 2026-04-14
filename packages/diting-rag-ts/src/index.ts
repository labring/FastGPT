// packages/diting-rag-ts/src/index.ts
// 主包导出

// Types
export * from './types/index';

// Ports (interfaces)
export * from './ports/index';
export * from './ports/agentic';

// Utils
export * from './utils/index';

// Agent
export { createAgenticSearch, AGENT_EVENTS } from './agent/runner';
export type { AgenticSearchResult, CreateAgenticSearchOptions } from './agent/runner';
export type { AgentEvent } from './agent/context';

// Testing
export * from './testing/index';
