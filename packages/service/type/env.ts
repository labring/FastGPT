/**
 * 不再在此维护 `NodeJS.ProcessEnv`：服务侧环境变量请以 `@fastgpt/service/env`（`env.ts` 内 zod `createEnv`）为准。
 * 此处仅保留与 `process.env` 类型无关的全局声明。
 */
declare global {
  var countTrackQueue: Map<string, { event: string; count: number; data: Record<string, any> }>;
}

export {};
