import type { ChatHistoryItemResType } from '@fastgpt/global/core/chat/type';
import { filterNodeResponseTreeData } from '@fastgpt/global/core/chat/utils';
import { workflowSseEvent } from '@fastgpt/global/core/workflow/runtime/sse';
import type { WorkflowResponseType } from '@fastgpt/global/core/workflow/runtime/sse';
import type {
  NodeResponseWriteSummary,
  WorkflowNodeResponseWriter
} from '../../chat/nodeResponseStorage';

export type WorkflowNodeResponseInput = {
  response: ChatHistoryItemResType;
  /** 只给缺少 parentId 的响应补父级，保留响应内部已有的更细层级。 */
  parentId?: string;
  /** 父节点只入库不实时展示时设为 false，避免与已展示的内部明细重复。 */
  emit?: boolean;
};

export type WorkflowNodeResponseSinkLike = {
  publish: (inputs: WorkflowNodeResponseInput[]) => Promise<ChatHistoryItemResType[]>;
  getSummary?: () => NodeResponseWriteSummary;
};

/**
 * 协调请求内 nodeResponse 的规范化、持久化和 V2 实时发布。
 *
 * 完整响应始终先交给 writer；对外事件再根据 responseAllData/responseDetail 裁剪。
 * Sink 不参与 runtime summary、usage 或计费，调用方继续在自己的运行作用域内汇总。
 */
export class WorkflowNodeResponseSink implements WorkflowNodeResponseSinkLike {
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

  /**
   * 接收一批同一调度步骤产生的响应，保持 writer 的批量写入顺序，并逐条发布可见响应。
   */
  async publish(inputs: WorkflowNodeResponseInput[]): Promise<ChatHistoryItemResType[]> {
    if (inputs.length === 0) return [];

    const responses = inputs.map(({ response, parentId }) => ({
      ...response,
      ...(parentId && !response.parentId ? { parentId } : {})
    }));
    const recordedResponses = await this.writer.record(responses);

    if (this.apiVersion !== 'v2' || !this.workflowStreamResponse) {
      return recordedResponses;
    }

    const responsesToEmit = recordedResponses.filter((_, index) => inputs[index]?.emit !== false);
    const visibleResponses = this.responseAllData
      ? responsesToEmit
      : filterNodeResponseTreeData({
          nodeResponses: responsesToEmit,
          responseDetail: this.responseDetail
        });

    visibleResponses.forEach((response) => {
      this.workflowStreamResponse?.(workflowSseEvent.flowNodeResponse(response));
    });

    return recordedResponses;
  }

  async close() {
    await this.writer.close();
  }

  getSummary(): NodeResponseWriteSummary {
    return this.writer.getSummary();
  }

  getFlatNodeResponses(): ChatHistoryItemResType[] {
    return this.writer.getFlatNodeResponses();
  }
}
