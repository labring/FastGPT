/**
 * 沙盒业务层：定义 sandbox tool 的内部注册结构。
 *
 * 只描述工具 schema 与执行函数类型，不负责运行态准备或对外接口导出。
 */
import type { z } from 'zod';
import type { SandboxClient } from '../runtime/client';
import type { ChatCompletionToolMessageContentPart } from '@fastgpt/global/core/ai/llm/type';

type ToolExecuteContext<P> = {
  sandboxInstance: SandboxClient;
  params: P;
};

/**
 * sandbox 工具的声明式定义。
 *
 * zodSchema 负责约束 LLM 工具参数，execute 只接收已校验的 params 和运行态 SandboxClient。
 * 工具可返回结构化 content（text / image_url parts）作为下一轮模型的视觉输入。
 */
export type ToolDefinition<
  S extends z.ZodType<Record<string, unknown>> = z.ZodType<Record<string, unknown>>
> = {
  zodSchema: S;
  execute: (
    ctx: ToolExecuteContext<z.infer<S>>
  ) => Promise<{ response: string; content?: ChatCompletionToolMessageContentPart[] }>;
};

export type ToolRunResult =
  | { success: false; error: string }
  | {
      success: true;
      input: Record<string, unknown>;
      response: string;
      content?: ChatCompletionToolMessageContentPart[];
    };

/**
 * 保留工具定义的泛型推导。
 */
export const defineTool = <S extends z.ZodType<Record<string, unknown>>>(
  def: ToolDefinition<S>
): ToolDefinition<S> => def;

/** 把带具体参数类型的工具擦除为统一 runner，同时保留 schema 与 execute 的类型关联。 */
export const createToolRunner =
  <S extends z.ZodType<Record<string, unknown>>>(definition: ToolDefinition<S>) =>
  async (params: {
    sandboxInstance: SandboxClient;
    input: Record<string, unknown> | undefined;
  }): Promise<ToolRunResult> => {
    const parsed = definition.zodSchema.safeParse(params.input);
    if (!parsed.success) return { success: false, error: parsed.error.message };

    const result = await definition.execute({
      sandboxInstance: params.sandboxInstance,
      params: parsed.data
    });
    return {
      success: true,
      input: parsed.data,
      response: result.response,
      ...(result.content?.length ? { content: result.content } : {})
    };
  };
