import { UserError } from '@fastgpt/global/common/error/utils';
import { getNanoid } from '@fastgpt/global/common/string/tools';
import {
  getModerationBlockErrorMessage,
  MODERATION_BLOCKED_ERROR_MESSAGE,
  ModerationActionEnum,
  ModerationStageEnum
} from '@fastgpt/global/core/plugin/moderation/constants';
import type {
  CheckContentByPolicyParams,
  SystemModerationPolicyType
} from '@fastgpt/global/core/plugin/moderation/type';
import type { ChatCompletionMessageToolCall } from '@fastgpt/global/core/ai/llm/type';
import { checkContentByPolicy, isModerationHookEnabled } from './checker';
import { ensureNodeModerationRecord } from './collector';
import { getModerationPolicy } from './service';

export type CheckOutputTextParams = {
  text?: string;
  targetField?: string;
  policy?: SystemModerationPolicyType;
  context?: CheckContentByPolicyParams['context'];
};

/**
 * 审查面向用户的最终文本输出（静态与非流式文本）
 *
 * 包括：AI 回答、指定回复 (answerNode)、用户选择 (userSelect)、表单提示等。
 * 违规时返回 isPass: false 并记录审计日志。
 */
export const checkOutputTextModeration = async ({
  text,
  targetField = 'output',
  policy: inputPolicy,
  context
}: CheckOutputTextParams): Promise<{
  isPass: boolean;
  action: ModerationActionEnum;
  text: string;
  blockErrorMessage?: string;
}> => {
  if (!text || !text.trim()) {
    return {
      isPass: true,
      action: ModerationActionEnum.pass,
      text: text || ''
    };
  }

  const policy = inputPolicy ?? (await getModerationPolicy());
  if (!isModerationHookEnabled({ stage: ModerationStageEnum.output, policy })) {
    return {
      isPass: true,
      action: ModerationActionEnum.pass,
      text
    };
  }

  const res = await checkContentByPolicy({
    text,
    stage: ModerationStageEnum.output,
    targetField,
    policy,
    context
  });

  if (res.action === ModerationActionEnum.block) {
    ensureNodeModerationRecord(res, {
      stage: ModerationStageEnum.output,
      targetField,
      content: text
    });
  }

  return {
    isPass: res.action === ModerationActionEnum.pass,
    action: res.action as ModerationActionEnum,
    text,
    ...(res.action === ModerationActionEnum.block
      ? { blockErrorMessage: getModerationBlockErrorMessage(res.verdict) }
      : {})
  };
};

/**
 * 审查模型生成的工具调用参数
 *
 * 若任意工具调用参数命中违规：终止模型调用并抛错，参数不返回客户端。
 */
export const checkToolParamsModeration = async ({
  toolCalls,
  policy: inputPolicy,
  context
}: {
  toolCalls?: ChatCompletionMessageToolCall[];
  policy?: SystemModerationPolicyType;
  context?: CheckContentByPolicyParams['context'];
}): Promise<{
  isPass: boolean;
  blockedToolName?: string;
  blockErrorMessage?: string;
}> => {
  if (!toolCalls || toolCalls.length === 0) {
    return { isPass: true };
  }

  const policy = inputPolicy ?? (await getModerationPolicy());
  if (!isModerationHookEnabled({ stage: ModerationStageEnum.output, policy })) {
    return { isPass: true };
  }

  for (const call of toolCalls) {
    const args = call.function?.arguments;
    if (args && args.trim()) {
      const targetField = `toolParams.${call.function.name}`;
      const res = await checkContentByPolicy({
        text: args,
        stage: ModerationStageEnum.output,
        targetField,
        policy,
        context
      });

      if (res.action === ModerationActionEnum.block) {
        ensureNodeModerationRecord(res, {
          stage: ModerationStageEnum.output,
          targetField,
          content: args
        });
        return {
          isPass: false,
          blockedToolName: call.function.name,
          blockErrorMessage: getModerationBlockErrorMessage(res.verdict)
        };
      }
    }
  }

  return { isPass: true };
};

export type StreamModerationBufferOptions = {
  streamInterval?: number;
  isEnabled?: boolean;
  context?: CheckContentByPolicyParams['context'];
  policy?: SystemModerationPolicyType;
  onApprovedText: (text: string) => void;
  onBlocked?: (reason: string) => void;
  abortController?: AbortController;
};

/**
 * 流式审查缓冲器（StreamModerationBuffer）
 *
 * 按 strategy.streamInterval（默认 50 字符/次）触发窗口审查，
 * 每次送审累积的完整内容以防止跨分块边界敏感词被截断漏检，并复用同一 sessionId 标记 partial。
 * 一旦命中拦截：立即停止向客户端发送后续 token，向客户端发送拦截中断事件，
 * 并立即调用 abortController.abort() 终止模型生成，丢弃未展示内容。
 */
export class StreamModerationBuffer {
  private buffer = '';
  private accumulatedText = '';
  private sessionId: string;
  private streamInterval: number;
  private isEnabled: boolean;
  private isBlocked = false;
  private context?: CheckContentByPolicyParams['context'];
  private policy?: SystemModerationPolicyType;
  private onApprovedText: (text: string) => void;
  private onBlocked?: (reason: string) => void;
  private abortController?: AbortController;

  constructor({
    streamInterval = 50,
    isEnabled = true,
    context,
    policy,
    onApprovedText,
    onBlocked,
    abortController
  }: StreamModerationBufferOptions) {
    this.streamInterval = Math.max(1, streamInterval);
    this.isEnabled = isEnabled;
    this.context = context;
    this.policy = policy;
    this.onApprovedText = onApprovedText;
    this.onBlocked = onBlocked;
    this.abortController = abortController;
    this.sessionId = context?.requestId || getNanoid(16);
  }

  get blocked(): boolean {
    return this.isBlocked;
  }

  /**
   * 推入新生成的流式增量文本
   */
  async push(deltaText: string): Promise<void> {
    if (this.isBlocked) return;

    if (!this.isEnabled) {
      this.onApprovedText(deltaText);
      return;
    }

    this.buffer += deltaText;

    while (this.buffer.length >= this.streamInterval) {
      const chunkToCheck = this.buffer.slice(0, this.streamInterval);
      const remaining = this.buffer.slice(this.streamInterval);
      const windowContent = this.accumulatedText + chunkToCheck;

      const checkRes = await checkContentByPolicy({
        text: windowContent,
        stage: ModerationStageEnum.output,
        targetField: 'streamOutput',
        policy: this.policy,
        sessionId: this.sessionId,
        partial: true,
        context: this.context
      });

      if (checkRes.action === ModerationActionEnum.block) {
        ensureNodeModerationRecord(checkRes, {
          stage: ModerationStageEnum.output,
          targetField: 'streamOutput',
          content: windowContent
        });
        const errMessage = getModerationBlockErrorMessage(checkRes.verdict);
        this.triggerBlock(errMessage);
        throw new UserError(errMessage);
      }

      this.accumulatedText = windowContent;
      this.onApprovedText(chunkToCheck);
      this.buffer = remaining;
    }
  }

  /**
   * 流式生成完毕后冲刷缓冲区残留内容
   */
  async flush(): Promise<void> {
    if (this.isBlocked) return;

    if (!this.isEnabled) {
      return;
    }

    if (this.buffer.length > 0) {
      const remainingChunk = this.buffer;
      this.buffer = '';
      const windowContent = this.accumulatedText + remainingChunk;

      const checkRes = await checkContentByPolicy({
        text: windowContent,
        stage: ModerationStageEnum.output,
        targetField: 'streamOutput',
        policy: this.policy,
        sessionId: this.sessionId,
        partial: false,
        context: this.context
      });

      if (checkRes.action === ModerationActionEnum.block) {
        ensureNodeModerationRecord(checkRes, {
          stage: ModerationStageEnum.output,
          targetField: 'streamOutput',
          content: windowContent
        });
        const errMessage = getModerationBlockErrorMessage(checkRes.verdict);
        this.triggerBlock(errMessage);
        throw new UserError(errMessage);
      }

      this.accumulatedText = windowContent;
      this.onApprovedText(remainingChunk);
    }
  }

  private triggerBlock(reason: string = MODERATION_BLOCKED_ERROR_MESSAGE) {
    this.isBlocked = true;
    this.buffer = '';
    this.abortController?.abort();
    this.onBlocked?.(reason);
  }
}

/**
 * 便捷工厂函数：自动读取全局策略初始化流式审查缓冲器
 */
export const createStreamModerationBuffer = async ({
  policy: inputPolicy,
  context,
  onApprovedText,
  onBlocked,
  abortController
}: {
  policy?: SystemModerationPolicyType;
  context?: CheckContentByPolicyParams['context'];
  onApprovedText: (text: string) => void;
  onBlocked?: (reason: string) => void;
  abortController?: AbortController;
}): Promise<StreamModerationBuffer> => {
  const policy = inputPolicy ?? (await getModerationPolicy());
  const isEnabled = isModerationHookEnabled({ stage: ModerationStageEnum.output, policy });
  const streamInterval = policy.strategy?.streamInterval ?? 50;

  return new StreamModerationBuffer({
    streamInterval,
    isEnabled,
    context,
    policy,
    onApprovedText,
    onBlocked,
    abortController
  });
};
