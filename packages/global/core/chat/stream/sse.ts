import type {
  ChatHistoryItemResType,
  SandboxStatusItemType,
  SkillModuleResponseItemType,
  ToolModuleResponseItemType
} from '../type';
import type { AgentPlanStatusType, AgentPlanType } from '../../ai/agent/type';
import type { WorkflowInteractiveResponseType } from '../../workflow/template/system/interactive/type';
import { SseResponseEventEnum } from './constants';
import { createChatCompletionDeltaResponse } from '../../ai/llm/utils';

export type StreamAnswerChunk = ReturnType<typeof createChatCompletionDeltaResponse>;

export type StreamToolDeltaType = Pick<ToolModuleResponseItemType, 'id'> &
  Partial<Omit<ToolModuleResponseItemType, 'id'>>;

export type StreamSsePayloadMap = {
  [SseResponseEventEnum.error]: Record<string, any>;
  [SseResponseEventEnum.workflowDuration]: { durationSeconds: number };
  [SseResponseEventEnum.chatTitle]: { title: string };
  [SseResponseEventEnum.answer]: StreamAnswerChunk;
  [SseResponseEventEnum.fastAnswer]: StreamAnswerChunk;
  [SseResponseEventEnum.flowNodeStatus]: {
    status: 'running';
    name: string;
  };
  [SseResponseEventEnum.flowNodeResponse]: ChatHistoryItemResType;
  [SseResponseEventEnum.toolCall]: { tool: ToolModuleResponseItemType };
  [SseResponseEventEnum.toolParams]: { tool: StreamToolDeltaType };
  [SseResponseEventEnum.toolResponse]: { tool: StreamToolDeltaType };
  [SseResponseEventEnum.flowResponses]: Record<string, any>;
  [SseResponseEventEnum.updateVariables]: Record<string, any>;
  [SseResponseEventEnum.interactive]: { interactive: WorkflowInteractiveResponseType };
  [SseResponseEventEnum.plan]: { plan: AgentPlanType };
  [SseResponseEventEnum.planStatus]: { planStatus: AgentPlanStatusType };
  [SseResponseEventEnum.sandboxStatus]: SandboxStatusItemType;
  [SseResponseEventEnum.skillCall]: { skill: SkillModuleResponseItemType };
};

export type StreamTypedSseEvent<
  Event extends keyof StreamSsePayloadMap = keyof StreamSsePayloadMap
> = {
  id?: string;
  event: Event;
  data: StreamSsePayloadMap[Event];
};

export type StreamRawSseEvent = {
  id?: string;
  event?: SseResponseEventEnum;
  data: string;
};

export type StreamResponseItemType = StreamTypedSseEvent | StreamRawSseEvent;
export type StreamResponseType = (event: StreamResponseItemType) => void;

type AnswerEventParams = {
  text?: string | null;
  reasoningContent?: string | null;
  finishReason?: null | 'stop';
  event?: SseResponseEventEnum.answer | SseResponseEventEnum.fastAnswer;
  id?: string;
};

const answerEvent = ({
  text,
  reasoningContent,
  finishReason,
  event = SseResponseEventEnum.answer,
  id
}: AnswerEventParams): StreamTypedSseEvent<
  SseResponseEventEnum.answer | SseResponseEventEnum.fastAnswer
> => ({
  ...(id && { id }),
  event,
  data: createChatCompletionDeltaResponse({
    text,
    reasoningContent,
    finishReason
  })
});

export const streamSseEvent = {
  /**
   * 输出标准答案文本增量，对应主回答气泡的逐字追加内容。
   */
  answerDelta(text: string, id?: string): StreamTypedSseEvent<SseResponseEventEnum.answer> {
    return answerEvent({ text, id }) as StreamTypedSseEvent<SseResponseEventEnum.answer>;
  },

  /**
   * 输出快速回答文本增量，用于 stream 正式执行结果之外的即时提示内容。
   */
  fastAnswerDelta(text: string, id?: string): StreamTypedSseEvent<SseResponseEventEnum.fastAnswer> {
    return answerEvent({
      text,
      id,
      event: SseResponseEventEnum.fastAnswer
    }) as StreamTypedSseEvent<SseResponseEventEnum.fastAnswer>;
  },

  /**
   * 输出模型思考内容增量，复用 answer 事件承载 reasoning_content。
   */
  reasoningDelta(text: string, id?: string): StreamTypedSseEvent<SseResponseEventEnum.answer> {
    return answerEvent({
      reasoningContent: text,
      id
    }) as StreamTypedSseEvent<SseResponseEventEnum.answer>;
  },

  /**
   * 输出回答结束标记，通知前端当前 answer 或 fastAnswer 文本流已经停止。
   */
  answerStop(
    event:
      | SseResponseEventEnum.answer
      | SseResponseEventEnum.fastAnswer = SseResponseEventEnum.answer
  ): StreamTypedSseEvent<SseResponseEventEnum.answer | SseResponseEventEnum.fastAnswer> {
    return answerEvent({
      text: null,
      finishReason: 'stop',
      event
    });
  },

  /**
   * 输出 SSE 完成标记，data 固定为 [DONE] 以兼容现有前端和 OpenAI 风格流。
   */
  done(event?: SseResponseEventEnum): StreamRawSseEvent {
    return {
      event,
      data: '[DONE]'
    };
  },

  /**
   * 输出已经序列化好的底层事件，用于动态事件名或必须保持旧 wire 格式的兼容场景。
   */
  raw({ event, data, id }: StreamRawSseEvent): StreamRawSseEvent {
    return {
      ...(id && { id }),
      event,
      data
    };
  },

  /**
   * 输出工作流节点运行状态，前端据此展示当前正在执行的节点名称。
   */
  flowNodeStatus(name: string): StreamTypedSseEvent<SseResponseEventEnum.flowNodeStatus> {
    return {
      event: SseResponseEventEnum.flowNodeStatus,
      data: {
        status: 'running',
        name
      }
    };
  },

  /**
   * 输出单个节点响应结果，承载最终会进入 chat history 的节点级响应数据。
   */
  flowNodeResponse(
    nodeResponse: ChatHistoryItemResType
  ): StreamTypedSseEvent<SseResponseEventEnum.flowNodeResponse> {
    return {
      event: SseResponseEventEnum.flowNodeResponse,
      data: nodeResponse
    };
  },

  /**
   * 输出工具调用开始事件，需要包含完整工具展示信息用于初始化工具运行卡片。
   */
  toolCall(tool: ToolModuleResponseItemType): StreamTypedSseEvent<SseResponseEventEnum.toolCall> {
    return {
      id: tool.id,
      event: SseResponseEventEnum.toolCall,
      data: { tool }
    };
  },

  /**
   * 输出工具参数增量，只要求携带工具 id 和本次变化字段，前端按 id 合并。
   */
  toolParams(tool: StreamToolDeltaType): StreamTypedSseEvent<SseResponseEventEnum.toolParams> {
    return {
      id: tool.id,
      event: SseResponseEventEnum.toolParams,
      data: { tool }
    };
  },

  /**
   * 输出工具响应增量，只要求携带工具 id 和本次响应片段，前端按 id 合并。
   */
  toolResponse(tool: StreamToolDeltaType): StreamTypedSseEvent<SseResponseEventEnum.toolResponse> {
    return {
      id: tool.id,
      event: SseResponseEventEnum.toolResponse,
      data: { tool }
    };
  },

  /**
   * 输出完整 stream 响应集合，通常用于请求结束前同步最终节点响应列表。
   */
  flowResponses(
    data: Record<string, any>
  ): StreamTypedSseEvent<SseResponseEventEnum.flowResponses> {
    return {
      event: SseResponseEventEnum.flowResponses,
      data
    };
  },

  /**
   * 输出变量更新结果，前端据此刷新 stream 运行后产生的变量值。
   */
  updateVariables(
    variables: Record<string, any>
  ): StreamTypedSseEvent<SseResponseEventEnum.updateVariables> {
    return {
      event: SseResponseEventEnum.updateVariables,
      data: variables
    };
  },

  /**
   * 输出交互节点配置，前端据此渲染需要用户继续操作的交互表单。
   */
  interactive(
    interactive: WorkflowInteractiveResponseType
  ): StreamTypedSseEvent<SseResponseEventEnum.interactive> {
    return {
      event: SseResponseEventEnum.interactive,
      data: { interactive }
    };
  },

  /**
   * 输出工作流总耗时，供前端或调试界面展示本轮执行时长。
   */
  workflowDuration(
    durationSeconds: number
  ): StreamTypedSseEvent<SseResponseEventEnum.workflowDuration> {
    return {
      event: SseResponseEventEnum.workflowDuration,
      data: { durationSeconds }
    };
  },

  /**
   * 输出 Agent 计划内容，使用固定 id 时前端会替换同一条计划展示。
   */
  plan(plan: AgentPlanType, id?: string): StreamTypedSseEvent<SseResponseEventEnum.plan> {
    return {
      ...(id && { id }),
      event: SseResponseEventEnum.plan,
      data: { plan }
    };
  },

  /**
   * 输出 Agent 计划状态，通常用于标记计划生成、运行或完成状态。
   */
  planStatus(
    planStatus: AgentPlanStatusType,
    id?: string
  ): StreamTypedSseEvent<SseResponseEventEnum.planStatus> {
    return {
      ...(id && { id }),
      event: SseResponseEventEnum.planStatus,
      data: { planStatus }
    };
  },

  /**
   * 输出沙箱执行状态，前端据此展示代码沙箱的运行阶段和结果。
   */
  sandboxStatus(
    sandboxStatus: SandboxStatusItemType
  ): StreamTypedSseEvent<SseResponseEventEnum.sandboxStatus> {
    return {
      event: SseResponseEventEnum.sandboxStatus,
      data: sandboxStatus
    };
  },

  /**
   * 输出技能调用信息，用于在聊天响应中展示 skill 的执行过程。
   */
  skillCall(
    skill: SkillModuleResponseItemType
  ): StreamTypedSseEvent<SseResponseEventEnum.skillCall> {
    return {
      event: SseResponseEventEnum.skillCall,
      data: { skill }
    };
  },

  /**
   * 输出自动生成的聊天标题，前端收到后更新当前会话标题。
   */
  chatTitle(title: string): StreamTypedSseEvent<SseResponseEventEnum.chatTitle> {
    return {
      event: SseResponseEventEnum.chatTitle,
      data: { title }
    };
  },

  /**
   * 输出 stream 业务错误对象；已序列化错误字符串应使用 raw 保持原格式。
   */
  error(data: Record<string, any>): StreamTypedSseEvent<SseResponseEventEnum.error> {
    return {
      event: SseResponseEventEnum.error,
      data
    };
  }
};
