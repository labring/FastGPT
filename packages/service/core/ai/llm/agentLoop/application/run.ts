import {
  normalizeAgentLoopUsages,
  type AgentLoopInput,
  type AgentLoopProvider,
  type AgentLoopResult,
  type AgentLoopRuntime,
  type AgentLoopUsage
} from '../domain';
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall
} from '@fastgpt/global/core/ai/llm/type';
import type { AgentLoopEvent } from '../domain/event';
import { SANDBOX_READ_FILE_TOOL_NAME } from '@fastgpt/global/core/ai/sandbox/tools';
import { posix } from 'node:path';
import { parseJsonArgs } from '../../../utils';

export type RunAgentLoopApplicationParams<TChildrenResponse = unknown> = {
  provider: AgentLoopProvider;
  input: AgentLoopInput<TChildrenResponse>;
  runtime: AgentLoopRuntime<TChildrenResponse>;
};

/**
 * Agent Loop 顶层统一入口。业务层只选择 provider，不直接 import 具体 loop 实现。
 *
 * provider 产生 usage 时仍只调用一次 `runtime.usagePush`。这里在转发账单回调的同时
 * 收集同一批 usage，并将其作为只读 result 返回，避免 provider 另行拼装汇总后遗漏
 * 工具/压缩用量，或由业务层为了补汇总再次触发计费。
 * 调用方显式配置的内部读取目录统一作用于事件及对外消息；未配置时完整透传，provider 内部上下文及恢复状态不做裁剪。
 */
export const runAgentLoopApplication = async <TChildrenResponse = unknown>({
  provider,
  input,
  runtime
}: RunAgentLoopApplicationParams<TChildrenResponse>): Promise<
  AgentLoopResult<TChildrenResponse>
> => {
  const pushedUsages: AgentLoopUsage[] = [];
  const systemTools = runtime.systemTools;
  const internalReadDirectories = systemTools?.sandbox?.enabled
    ? (systemTools.sandbox.internalReadDirectories ?? [])
        .filter((directory) => posix.isAbsolute(directory))
        .map((directory) => posix.normalize(directory).replace(/\/+$/, ''))
    : [];
  const hasVisibilityPolicy = internalReadDirectories.length > 0;
  const bufferedToolEvents = new Map<string, AgentLoopEvent[]>();
  const internalToolCallIds = new Map<string, boolean>();
  const toolActivityStatuses = new Map<string, 'running' | 'done'>();

  /** 复用沙箱的参数和路径解析规则，覆盖整个内部目录并避免误匹配同名前缀目录。 */
  const isInternalFileRead = (call: ChatCompletionMessageToolCall) => {
    const sandbox = systemTools?.sandbox;
    if (
      !sandbox?.enabled ||
      internalReadDirectories.length === 0 ||
      call.function.name !== SANDBOX_READ_FILE_TOOL_NAME
    )
      return false;

    try {
      const params = parseJsonArgs<unknown>(call.function.arguments ?? '{}');
      if (
        !params ||
        typeof params !== 'object' ||
        !('path' in params) ||
        typeof params.path !== 'string'
      )
        return false;
      const filePath = posix.normalize(
        sandbox.client.resolveRuntimePath(params.path, { allowAbsolutePath: true })
      );
      return internalReadDirectories.some(
        (directory) => filePath === directory || filePath.startsWith(`${directory}/`)
      );
    } catch {
      // 参数/路径错误仍由原执行器处理，可见性判断不能中断模型循环或改变工具执行结果。
      return false;
    }
  };

  /** 完整参数边界只计算一次，后续事件和返回消息复用同一次决定。 */
  const isInternalToolCall = (call: ChatCompletionMessageToolCall) => {
    const cached = internalToolCallIds.get(call.id);
    if (cached !== undefined) return cached;
    const internal = isInternalFileRead(call);
    internalToolCallIds.set(call.id, internal);
    return internal;
  };

  /** 只按白名单公开工具名称和状态，避免原事件的参数、错误或 metadata 被顺带透传。 */
  const emitToolActivity = (call: ChatCompletionMessageToolCall, status: 'running' | 'done') => {
    const previousStatus = toolActivityStatuses.get(call.id);
    if (previousStatus === status || previousStatus === 'done') return;
    toolActivityStatuses.set(call.id, status);
    runtime.emitEvent?.({
      type: 'tool_activity',
      callId: call.id,
      toolName: call.function.name,
      status
    });
  };

  /** 配置目录过滤的文件读取等待完整参数，其他工具完整透传。 */
  const emitEvent = (event: AgentLoopEvent) => {
    runtime.recordEvent?.(
      event.type === 'tool_run_end' && isInternalToolCall(event.call)
        ? { ...event, internalOnly: true }
        : event
    );
    if (!hasVisibilityPolicy) {
      runtime.emitEvent?.(event);
      return;
    }

    if (event.type === 'tool_call') {
      if (
        event.call.function.name === SANDBOX_READ_FILE_TOOL_NAME &&
        !internalToolCallIds.has(event.call.id)
      ) {
        bufferedToolEvents.set(event.call.id, [event]);
        return;
      }
      if (isInternalToolCall(event.call)) emitToolActivity(event.call, 'running');
      else runtime.emitEvent?.(event);
      return;
    }
    if (event.type === 'tool_params') {
      if (internalToolCallIds.get(event.callId)) return;
      const buffered = bufferedToolEvents.get(event.callId);
      if (buffered) {
        buffered.push(event);
        return;
      }
      runtime.emitEvent?.(event);
      return;
    }
    if (event.type === 'llm_request_end' && event.toolCalls?.length) {
      const visibleToolCalls = event.toolCalls.filter((call) => {
        const internal = isInternalToolCall(call);
        const buffered = bufferedToolEvents.get(call.id);
        bufferedToolEvents.delete(call.id);
        if (internal && buffered) emitToolActivity(call, 'running');
        if (!internal) buffered?.forEach((item) => runtime.emitEvent?.(item));
        return !internal;
      });
      runtime.emitEvent?.(
        visibleToolCalls.length === event.toolCalls.length
          ? event
          : {
              ...event,
              toolCalls: visibleToolCalls,
              assistantMessage: event.assistantMessage
                ? filterMessages([event.assistantMessage])[0]
                : undefined
            }
      );
      return;
    }
    if (event.type === 'tool_run_start' || event.type === 'tool_run_end') {
      const buffered = bufferedToolEvents.get(event.call.id);
      bufferedToolEvents.delete(event.call.id);
      if (isInternalToolCall(event.call)) {
        emitToolActivity(event.call, event.type === 'tool_run_start' ? 'running' : 'done');
        return;
      }
      buffered?.forEach((item) => runtime.emitEvent?.(item));
      runtime.emitEvent?.(event);
      return;
    }
    runtime.emitEvent?.(event);
  };

  /** 成对移除内部调用和响应；返回副本，保留 provider 的原始上下文及同条消息中的正文。 */
  const filterMessages = (messages: ChatCompletionMessageParam[]): ChatCompletionMessageParam[] => {
    if (!hasVisibilityPolicy) return messages;
    // 恢复/非流式路径可能没有重放调用事件，仍按消息里的完整参数统一识别。
    for (const message of messages) {
      if (message.role === 'assistant') message.tool_calls?.forEach(isInternalToolCall);
    }
    return messages.flatMap((message) => {
      if (message.role === 'tool' && internalToolCallIds.get(message.tool_call_id)) return [];
      if (message.role !== 'assistant' || !message.tool_calls?.length) return [message];
      const visibleToolCalls = message.tool_calls.filter(
        (call) => !internalToolCallIds.get(call.id)
      );
      if (visibleToolCalls.length === message.tool_calls.length) return [message];
      if (visibleToolCalls.length > 0) return [{ ...message, tool_calls: visibleToolCalls }];

      const { tool_calls: _toolCalls, ...messageWithoutToolCalls } = message;
      const hasOtherOutput =
        message.content !== null && message.content !== undefined
          ? true
          : Boolean(
              message.reasoning_content ||
              message.interactive ||
              message.audio ||
              message.function_call ||
              message.refusal
            );
      return hasOtherOutput ? [messageWithoutToolCalls] : [];
    });
  };

  try {
    const result = await provider.run({
      input,
      runtime: {
        ...runtime,
        emitEvent,
        usagePush: (usages) => {
          const normalizedUsages = normalizeAgentLoopUsages(usages);
          pushedUsages.push(...normalizedUsages);
          runtime.usagePush?.(normalizedUsages);
        }
      }
    });

    return {
      ...result,
      completeMessages: filterMessages(result.completeMessages),
      assistantMessages: filterMessages(result.assistantMessages),
      usages: pushedUsages.length > 0 ? pushedUsages : normalizeAgentLoopUsages(result.usages)
    };
  } catch (error) {
    // provider 应优先自行返回带部分 transcript 的 error result；这里是公共入口的最终契约兜底。
    return {
      status: 'error',
      error,
      activePlan: input.activePlan,
      providerState: provider.name === 'fastAgent' ? undefined : input.providerState,
      completeMessages: filterMessages(input.messages),
      assistantMessages: [],
      requestIds: [],
      finishReason: 'error',
      usages: pushedUsages
    };
  }
};
