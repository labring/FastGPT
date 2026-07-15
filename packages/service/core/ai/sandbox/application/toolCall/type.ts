/**
 * 沙盒业务层：定义 sandbox tool 的内部注册结构。
 *
 * 只描述工具 schema 与执行函数类型，不负责运行态准备或对外接口导出。
 */
import type { z } from 'zod';
import type { SandboxClient } from '../runtime/client';
import type { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';

type ToolExecuteContext<P> = {
  sourceType: ChatSourceTypeEnum;
  sourceId: string;
  userId: string;
  chatId: string;
  teamId: string;
  sandboxInstance: SandboxClient;
  params: P;
};

/**
 * sandbox 工具的声明式定义。
 *
 * zodSchema 负责约束 LLM 工具参数，execute 只接收已校验的 params 和运行态 SandboxClient。
 */
export type ToolDefinition<S extends z.ZodTypeAny = z.ZodTypeAny> = {
  zodSchema: S;
  execute: (ctx: ToolExecuteContext<z.infer<S>>) => Promise<{ response: string }>;
};

/**
 * 保留工具定义的泛型推导。
 */
export const defineTool = <S extends z.ZodTypeAny>(def: ToolDefinition<S>): ToolDefinition<S> =>
  def;
