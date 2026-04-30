import type { z } from 'zod';
import type { SandboxClient } from '../controller';

type ToolExecuteContext<P> = {
  appId: string;
  userId: string;
  chatId: string;
  sandboxInstance: SandboxClient;
  params: P;
};
// 声明式工具定义
export type ToolDefinition<S extends z.ZodTypeAny = z.ZodTypeAny> = {
  zodSchema: S;
  execute: (ctx: ToolExecuteContext<z.infer<S>>) => Promise<{ response: string }>;
};

export const defineTool = <S extends z.ZodTypeAny>(def: ToolDefinition<S>): ToolDefinition<S> =>
  def;
