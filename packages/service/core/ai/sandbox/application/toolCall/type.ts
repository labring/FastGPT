/**
 * 沙盒业务层：定义 sandbox tool 的内部注册结构。
 *
 * 只描述工具 schema 与执行函数类型，不负责运行态准备或对外接口导出。
 */
import type { z } from 'zod';
import type { SandboxClient } from '../runtime/client';
import type { ChatCompletionToolMessageContentPart } from '@fastgpt/global/core/ai/llm/type';
import { formatAgentDiskQuotaNotice, getSandboxDiskQuotaStatus } from '../quota';
import { isSandboxDiskFullError } from '../../infrastructure/opensandbox/errors';

/** 工具执行前的业务校验；返回拒绝原因时不访问沙箱。 */
export type SandboxToolCallValidator = (params: {
  toolName: string;
  args: string;
}) => string | undefined;

type ToolExecuteContext<P> = {
  sandboxInstance: SandboxClient;
  params: P;
  signal?: AbortSignal;
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
  /** 如 `exec()` 已内建 ensureAvailable + 降级契约的工具可跳过外层前置激活。 */
  skipEnsureAvailable?: boolean;
  /** 写/改工具启用：在 runWithRecovery 内确认容器可用后再探测 Docker 磁盘配额。 */
  requiresWritableDisk?: boolean;
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

/** 把带具体参数类型的工具擦除为统一 runner，统一负责参数解析、容器就绪恢复与写入配额门禁。 */
export const createToolRunner =
  <S extends z.ZodType<Record<string, unknown>>>(definition: ToolDefinition<S>) =>
  async (params: {
    sandboxInstance: SandboxClient;
    input: Record<string, unknown> | undefined;
    signal?: AbortSignal;
  }): Promise<ToolRunResult> => {
    if (params.signal?.aborted) {
      return { success: false, error: 'Command execution aborted' };
    }
    const parsed = definition.zodSchema.safeParse(params.input);
    if (!parsed.success) return { success: false, error: parsed.error.message };

    const recoveryOptions =
      definition.skipEnsureAvailable || params.signal
        ? {
            ...(definition.skipEnsureAvailable ? { skipEnsureAvailable: true } : {}),
            ...(params.signal ? { signal: params.signal } : {})
          }
        : undefined;

    const outcome = await params.sandboxInstance.runWithRecovery(async () => {
      if (definition.requiresWritableDisk) {
        const quota = await getSandboxDiskQuotaStatus(params.sandboxInstance.opensandbox, {
          rethrowRecoverable: true,
          signal: params.signal
        });
        if (quota.exceeded) {
          return { quotaExceededNotice: formatAgentDiskQuotaNotice(quota, 'write') };
        }
      }
      try {
        return {
          toolResult: await definition.execute({
            sandboxInstance: params.sandboxInstance,
            params: parsed.data,
            signal: params.signal
          })
        };
      } catch (error) {
        if (definition.requiresWritableDisk && isSandboxDiskFullError(error)) {
          return { quotaExceededNotice: formatAgentDiskQuotaNotice(undefined, 'write') };
        }
        throw error;
      }
    }, recoveryOptions);

    if ('quotaExceededNotice' in outcome && outcome.quotaExceededNotice !== undefined) {
      return {
        success: false,
        error: outcome.quotaExceededNotice
      };
    }

    return {
      success: true,
      input: parsed.data,
      response: outcome.toolResult.response,
      ...(outcome.toolResult.content?.length ? { content: outcome.toolResult.content } : {})
    };
  };
