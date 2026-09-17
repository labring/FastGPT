import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { filterNodeResponseTreeData } from '@fastgpt/global/core/chat/utils';
import { workflowSseEvent } from '@fastgpt/global/core/workflow/runtime/sse';
import type { WorkflowResponseType } from '@fastgpt/global/core/workflow/runtime/sse';
import type { WorkflowNodeResponseWriter } from '../../chat/nodeResponseStorage';
import type { WorkflowRuntimeSummaryType } from './type';
import { createWorkflowRuntimeSummary, updateWorkflowRuntimeSummary } from './utils/summary';

export type WorkflowNodeResponseInput = {
  response: ChatHistoryItemResType;
  /** 只给缺少 parentId 的响应补父级，保留响应内部已有的更细层级。 */
  parentId?: string;
  /** 当前响应是否写入请求级 writer。 */
  record?: boolean;
  /** 父节点只入库不实时展示时设为 false，避免与已展示的内部明细重复。 */
  emit?: boolean;
};

export type WorkflowNodeResponseActivity = {
  publishedResponseCount: number;
};

type WorkflowNodeResponseScopeOptions = {
  workflowRuntimeSummary: WorkflowRuntimeSummaryType;
  defaultParentId?: string;
  record?: boolean;
  emit?: boolean;
};

type WorkflowNodeResponseOutputPolicy = {
  record?: boolean;
  emit?: boolean;
};

export type WorkflowNodeResponseSinkLike = {
  publish: (inputs: WorkflowNodeResponseInput[]) => Promise<ChatHistoryItemResType[]>;
  /** 是否存在请求级 writer/SSE output；summary-only scope 为 false。 */
  hasOutput?: boolean;
  createScope?: (options: WorkflowNodeResponseScopeOptions) => WorkflowNodeResponseSinkLike;
  withActivity?: (activity: WorkflowNodeResponseActivity) => WorkflowNodeResponseSinkLike;
  withOutputPolicy?: (policy: WorkflowNodeResponseOutputPolicy) => WorkflowNodeResponseSinkLike;
};

/** 为一次节点 callback 创建发布归属计数，child workflow 会继承同一个 activity。 */
export const createWorkflowNodeResponseActivity = (): WorkflowNodeResponseActivity => ({
  publishedResponseCount: 0
});

/**
 * 为当前 workflow 创建独立 response scope。
 *
 * scope 直接共享请求级 output，不经过 parent scope 转发，因此一条 response 只会更新
 * 当前 workflow summary 一次。child scope 会继承 activity 和已经收紧的输出策略。
 */
export const createWorkflowNodeResponseScope = ({
  sink,
  workflowRuntimeSummary,
  defaultParentId,
  record = true,
  emit = true
}: WorkflowNodeResponseScopeOptions & {
  sink?: WorkflowNodeResponseSinkLike;
}): WorkflowNodeResponseSinkLike => {
  if (sink?.createScope) {
    return sink.createScope({
      workflowRuntimeSummary,
      defaultParentId,
      record,
      emit
    });
  }

  return new WorkflowNodeResponseScope({
    output: sink,
    workflowRuntimeSummary,
    defaultParentId,
    record,
    emit
  });
};

/** 把 callback 及其派生 child workflow 的发布归到当前节点执行。 */
export const bindWorkflowNodeResponseActivity = ({
  sink,
  activity
}: {
  sink?: WorkflowNodeResponseSinkLike;
  activity: WorkflowNodeResponseActivity;
}): WorkflowNodeResponseSinkLike | undefined => {
  if (!sink) return undefined;
  if (sink.withActivity) return sink.withActivity(activity);

  return new WorkflowNodeResponseScope({
    output: sink,
    workflowRuntimeSummary: createWorkflowRuntimeSummary(),
    activity
  });
};

/**
 * 收紧当前分支的详情输出策略。
 *
 * policy 只能与 parent policy 做 AND，隐藏的 system workflow 不允许在更深层重新开启
 * writer 或 SSE。
 */
export const withWorkflowNodeResponseOutputPolicy = ({
  sink,
  record = true,
  emit = true
}: WorkflowNodeResponseOutputPolicy & {
  sink?: WorkflowNodeResponseSinkLike;
}): WorkflowNodeResponseSinkLike | undefined => {
  if (!sink) return undefined;
  if (sink.withOutputPolicy) return sink.withOutputPolicy({ record, emit });

  return new WorkflowNodeResponseScope({
    output: sink,
    workflowRuntimeSummary: createWorkflowRuntimeSummary(),
    record,
    emit
  });
};

/** 当前 workflow 层的 summary 与 response 上下文；底层 output 在请求内共享。 */
class WorkflowNodeResponseScope implements WorkflowNodeResponseSinkLike {
  private readonly output?: WorkflowNodeResponseSinkLike;
  private readonly workflowRuntimeSummary: WorkflowRuntimeSummaryType;
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
    output?: WorkflowNodeResponseSinkLike;
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

  createScope({
    workflowRuntimeSummary,
    defaultParentId,
    record = true,
    emit = true
  }: WorkflowNodeResponseScopeOptions): WorkflowNodeResponseSinkLike {
    return new WorkflowNodeResponseScope({
      output: this.output,
      workflowRuntimeSummary,
      defaultParentId: defaultParentId ?? this.defaultParentId,
      record: this.record && record,
      emit: this.emit && emit,
      activity: this.activity
    });
  }

  withActivity(activity: WorkflowNodeResponseActivity): WorkflowNodeResponseSinkLike {
    return new WorkflowNodeResponseScope({
      output: this.output,
      workflowRuntimeSummary: this.workflowRuntimeSummary,
      defaultParentId: this.defaultParentId,
      record: this.record,
      emit: this.emit,
      activity
    });
  }

  withOutputPolicy({
    record = true,
    emit = true
  }: WorkflowNodeResponseOutputPolicy): WorkflowNodeResponseSinkLike {
    return new WorkflowNodeResponseScope({
      output: this.output,
      workflowRuntimeSummary: this.workflowRuntimeSummary,
      defaultParentId: this.defaultParentId,
      record: this.record && record,
      emit: this.emit && emit,
      activity: this.activity
    });
  }
}

/**
 * 协调请求内 nodeResponse 的规范化、writer 写入和 V2 实时发布。
 *
 * 这个对象在一次请求内共享，不持有任何 workflow summary。每层 workflow 通过独立
 * WorkflowNodeResponseScope 更新自己的 summary，并直接调用这个 output。
 */
export class WorkflowNodeResponseSink implements WorkflowNodeResponseSinkLike {
  readonly hasOutput = true;
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

      return {
        ...response,
        ...(normalizedParentId !== undefined ? { parentId: normalizedParentId } : {})
      };
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

  createScope(options: WorkflowNodeResponseScopeOptions): WorkflowNodeResponseSinkLike {
    return new WorkflowNodeResponseScope({
      output: this,
      ...options
    });
  }

  async close() {
    await this.writer.close();
  }

  getFlatNodeResponses(): ChatHistoryItemResType[] {
    return this.writer.getFlatNodeResponses();
  }
}
