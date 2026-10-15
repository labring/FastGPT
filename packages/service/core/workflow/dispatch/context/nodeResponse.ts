import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { filterNodeResponseTreeData } from '@fastgpt/global/core/chat/utils';
import {
  childrenResponseFields,
  getNodeResponseIdentityKey,
  normalizeNodeResponseChildren
} from '@fastgpt/global/core/chat/utils/mergeNode';
import { workflowSseEvent } from '@fastgpt/global/core/workflow/runtime/sse';
import type { WorkflowResponseType } from '@fastgpt/global/core/workflow/runtime/sse';
import {
  createWorkflowNodeResponseWriter,
  type WorkflowNodeResponseWriter
} from '../../../chat/nodeResponseStorage';
import type { ChatSourceTypeEnum } from '@fastgpt/global/core/chat/constants';
import type { WorkflowNodeResponseWriteConfig } from '../utils/entry';
import type { WorkflowRuntimeSummaryType } from '../type';
import { createWorkflowRuntimeSummary, updateWorkflowRuntimeSummary } from '../utils/summary';

export type WorkflowNodeResponseInput = {
  response: ChatHistoryItemResType;
  /** 只给缺少 parentId 的响应补父级，保留响应内部已有的更细层级。 */
  parentId?: string;
  /** 当前响应是否写入请求级 writer。 */
  record?: boolean;
  /** 是否实时发布；仅在调用方明确隐藏该响应时设为 false。 */
  emit?: boolean;
};

export type WorkflowNodeResponseActivity = {
  publishedResponseCount: number;
};

type WorkflowNodeResponseScopeOptions = {
  workflowRuntimeSummary?: WorkflowRuntimeSummaryType;
  defaultParentId?: string;
  record?: boolean;
  emit?: boolean;
  activity?: WorkflowNodeResponseActivity;
};

/**
 * 删除已经作为独立响应发布过的内嵌 child，避免前端把同一节点当成增量再次累加。
 *
 * 父响应可能同时保留旧版 childrenResponses，而 child workflow 已经通过共享 sink 发布了
 * flat row；此时 flat row 是唯一实时来源，父响应只保留尚未独立发布的内嵌节点。
 */
const removePublishedChildren = (
  response: ChatHistoryItemResType,
  publishedResponseKeys: Set<string>
): ChatHistoryItemResType =>
  childrenResponseFields.reduce<ChatHistoryItemResType>((current, field) => {
    const children = current[field] as ChatHistoryItemResType[] | undefined;
    if (!children?.length) return current;

    const nextChildren = children
      .filter((child) => !child.id || !publishedResponseKeys.has(getNodeResponseIdentityKey(child)))
      .map((child) => removePublishedChildren(child, publishedResponseKeys));

    const nextResponse = { ...current };
    if (nextChildren.length > 0) {
      nextResponse[field] = nextChildren;
    } else {
      delete nextResponse[field];
    }
    return nextResponse;
  }, response);

/** 请求级输出 Adapter；只在入口构建时注入，不直接放进节点的运行 Context。 */
export type WorkflowNodeResponseOutputLike = {
  publish: (inputs: WorkflowNodeResponseInput[]) => Promise<ChatHistoryItemResType[]>;
  hasOutput?: boolean;
  close?: () => Promise<void> | void;
  getFlatNodeResponses?: () => ChatHistoryItemResType[];
};

/** 当前流程的完整响应能力；无输出时也保留独立 summary 和派生能力。 */
export type WorkflowNodeResponseContext = {
  publish: WorkflowNodeResponseOutputLike['publish'];
  readonly hasOutput: boolean;
  readonly workflowRuntimeSummary: WorkflowRuntimeSummaryType;
  getChildContext: (overrides?: WorkflowNodeResponseScopeOptions) => WorkflowNodeResponseContext;
};

/** 为一次节点 callback 创建发布归属计数，child workflow 会继承同一个 activity。 */
export const createWorkflowNodeResponseActivity = (): WorkflowNodeResponseActivity => ({
  publishedResponseCount: 0
});

/**
 * 唯一的响应 Context 入口工厂。业务入口传入写入配置，测试/受控调用可注入 writer 或 output；
 * 没有输出目标时创建 summary-only Context。只有入口拥有关闭 writer 和读取 flat rows 的能力。
 */
export const createWorkflowEntryNodeResponseSink = (
  props: WorkflowNodeResponseScopeOptions & {
    apiVersion?: 'v1' | 'v2';
    responseAllData?: boolean;
    responseDetail?: boolean;
    workflowStreamResponse?: WorkflowResponseType;
  } & (
      | { writer: WorkflowNodeResponseWriter }
      | { output: WorkflowNodeResponseOutputLike }
      | {
          teamId: string;
          sourceType: ChatSourceTypeEnum;
          sourceId: string;
          chatId: string;
          chatItemDataId: string;
          nodeResponseWriteConfig: WorkflowNodeResponseWriteConfig;
        }
      | { writer?: undefined; output?: undefined }
    ) = {}
): WorkflowNodeResponseContext & {
  close: () => Promise<void>;
  getFlatNodeResponses: () => ChatHistoryItemResType[];
} => {
  const output = (() => {
    if ('output' in props && props.output) return props.output;
    const writer = (() => {
      if ('writer' in props && props.writer) return props.writer;
      if ('nodeResponseWriteConfig' in props) {
        return createWorkflowNodeResponseWriter({
          teamId: props.teamId,
          sourceType: props.sourceType,
          sourceId: props.sourceId,
          chatId: props.chatId,
          chatItemDataId: props.chatItemDataId,
          persistToDb: props.nodeResponseWriteConfig.persistToDb,
          retainInMemory: props.nodeResponseWriteConfig.retainInMemory
        });
      }
    })();
    return writer ? new WorkflowNodeResponseOutput({ ...props, writer }) : undefined;
  })();
  const context = new WorkflowNodeResponseScope({
    ...props,
    output,
    workflowRuntimeSummary: props.workflowRuntimeSummary ?? createWorkflowRuntimeSummary()
  });
  return Object.assign(context, {
    close: async () => {
      await output?.close?.();
    },
    getFlatNodeResponses: () => output?.getFlatNodeResponses?.() ?? []
  });
};

/** 当前 workflow 层的 summary 与 response 上下文；底层 output 在请求内共享。 */
class WorkflowNodeResponseScope implements WorkflowNodeResponseContext {
  private readonly output?: WorkflowNodeResponseOutputLike;
  readonly workflowRuntimeSummary: WorkflowRuntimeSummaryType;
  private readonly defaultParentId?: string;
  private readonly record: boolean;
  private readonly emit: boolean;
  private readonly activity?: WorkflowNodeResponseActivity;
  readonly hasOutput: boolean;

  constructor({
    output,
    workflowRuntimeSummary,
    defaultParentId,
    record = true,
    emit = true,
    activity
  }: {
    output?: WorkflowNodeResponseOutputLike;
    workflowRuntimeSummary: WorkflowRuntimeSummaryType;
    defaultParentId?: string;
    record?: boolean;
    emit?: boolean;
    activity?: WorkflowNodeResponseActivity;
  }) {
    this.output = output;
    this.workflowRuntimeSummary = workflowRuntimeSummary;
    this.defaultParentId = defaultParentId;
    this.record = record;
    this.emit = emit;
    this.activity = activity;
    this.hasOutput = !!output && (output.hasOutput ?? true) && (record || emit);
  }

  async publish(inputs: WorkflowNodeResponseInput[]): Promise<ChatHistoryItemResType[]> {
    if (inputs.length === 0) return [];

    const normalizedInputs = inputs.map(({ response, parentId, record, emit }) => {
      const normalizedParentId = response.parentId ?? parentId ?? this.defaultParentId;

      return {
        response: {
          ...response,
          ...(normalizedParentId !== undefined ? { parentId: normalizedParentId } : {})
        },
        record: this.record && record !== false,
        emit: this.emit && emit !== false
      };
    });
    const responses = normalizedInputs.map((item) => item.response);

    updateWorkflowRuntimeSummary({
      summary: this.workflowRuntimeSummary,
      nodeResponses: responses
    });

    const outputResponseCount = normalizedInputs.filter((item) => item.record || item.emit).length;
    if (!this.output || outputResponseCount === 0) {
      return responses;
    }

    const outputResponses = await this.output.publish(normalizedInputs);
    if (this.activity) {
      this.activity.publishedResponseCount += outputResponseCount;
    }
    return outputResponses;
  }

  /**
   * 派生响应 Scope，不激活 ALS。新流程显式传入新 summary；策略/activity 视图继承当前 summary。
   * 直接共享底层 output，不经过父 Scope 转发；输出策略只允许 AND 收紧。
   */
  getChildContext(overrides: WorkflowNodeResponseScopeOptions = {}): WorkflowNodeResponseContext {
    return new WorkflowNodeResponseScope({
      output: this.output,
      workflowRuntimeSummary: overrides.workflowRuntimeSummary ?? this.workflowRuntimeSummary,
      defaultParentId:
        'defaultParentId' in overrides ? overrides.defaultParentId : this.defaultParentId,
      record: this.record && overrides.record !== false,
      emit: this.emit && overrides.emit !== false,
      activity: 'activity' in overrides ? overrides.activity : this.activity
    });
  }
}

/**
 * 协调请求内 nodeResponse 的规范化、writer 写入和 V2 实时发布。
 *
 * 这个对象在一次请求内共享，不持有任何 workflow summary。每层 workflow 通过独立
 * WorkflowNodeResponseScope 更新自己的 summary，并直接调用这个 output。
 */
class WorkflowNodeResponseOutput implements WorkflowNodeResponseOutputLike {
  readonly hasOutput = true;
  private readonly publishedResponseKeys = new Set<string>();
  private readonly writer: WorkflowNodeResponseWriter;
  private readonly apiVersion?: 'v1' | 'v2';
  private readonly responseAllData: boolean;
  private readonly responseDetail: boolean;
  private readonly workflowStreamResponse?: WorkflowResponseType;

  constructor({
    writer,
    apiVersion,
    responseAllData = true,
    responseDetail = true,
    workflowStreamResponse
  }: {
    writer: WorkflowNodeResponseWriter;
    apiVersion?: 'v1' | 'v2';
    responseAllData?: boolean;
    responseDetail?: boolean;
    workflowStreamResponse?: WorkflowResponseType;
  }) {
    this.writer = writer;
    this.apiVersion = apiVersion;
    this.responseAllData = responseAllData;
    this.responseDetail = responseDetail;
    this.workflowStreamResponse = workflowStreamResponse;
  }

  /** 接收一批同一调度步骤产生的响应，保持 writer 的批量写入顺序并发布可见响应。 */
  async publish(inputs: WorkflowNodeResponseInput[]): Promise<ChatHistoryItemResType[]> {
    if (inputs.length === 0) return [];

    const responses = inputs.map(({ response, parentId }) => {
      const normalizedParentId = response.parentId ?? parentId;

      const normalizedResponse = normalizeNodeResponseChildren({
        ...response,
        ...(normalizedParentId !== undefined ? { parentId: normalizedParentId } : {})
      });
      return removePublishedChildren(normalizedResponse, this.publishedResponseKeys);
    });
    const responsesToRecord = responses.filter((_, index) => inputs[index]?.record !== false);
    const recordedResponses =
      responsesToRecord.length > 0 ? await this.writer.record(responsesToRecord) : [];
    let recordedResponseIndex = 0;
    const outputResponses = responses.map((response, index) => {
      if (inputs[index]?.record === false) return response;
      const recordedResponse = recordedResponses[recordedResponseIndex];
      recordedResponseIndex += 1;
      return recordedResponse ?? response;
    });

    responses.forEach((response) => {
      if (response.id) {
        this.publishedResponseKeys.add(getNodeResponseIdentityKey(response));
      }
    });

    if (this.apiVersion !== 'v2' || !this.workflowStreamResponse) {
      return outputResponses;
    }

    const responsesToEmit = outputResponses.filter((_, index) => inputs[index]?.emit !== false);
    const visibleResponses = this.responseAllData
      ? responsesToEmit
      : filterNodeResponseTreeData({
          nodeResponses: responsesToEmit,
          responseDetail: this.responseDetail
        });

    visibleResponses.forEach((response) => {
      this.workflowStreamResponse?.(workflowSseEvent.flowNodeResponse(response));
    });

    return outputResponses;
  }

  async close() {
    await this.writer.close();
  }

  getFlatNodeResponses(): ChatHistoryItemResType[] {
    return this.writer.getFlatNodeResponses();
  }
}
