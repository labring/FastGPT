import type { Span } from '@opentelemetry/api';
import type {
  AIChatItemValueItemType,
  ChatHistoryItemResType
} from '@fastgpt/global/core/chat/type';
import { normalizeAIChatValue } from '@fastgpt/global/core/chat/adapt';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { isLangfuseEnabled } from './index';
import {
  getLangfuseAssistantOutput,
  getLangfuseStepStartAttributes,
  getLangfuseTraceAttributes,
  serializeLangfuseValue
} from './utils';

const llmNodeTypes = new Set<FlowNodeTypeEnum>([
  FlowNodeTypeEnum.chatNode,
  FlowNodeTypeEnum.agent,
  FlowNodeTypeEnum.classifyQuestion,
  FlowNodeTypeEnum.contentExtract,
  FlowNodeTypeEnum.queryExtension
]);

/**
 * 封装单次工作流或节点执行的 Langfuse 观测，仅导出根聊天运行。
 * 启用状态在创建时固定，保证 span 初始标记与结束数据一致；属性必须在 span 创建时传入。
 */
export const createLangfuseWorkflowTracing = ({
  isRootRuntime,
  mode
}: {
  isRootRuntime: boolean;
  mode: string;
}) => {
  const enabled = isRootRuntime && mode === 'chat' && isLangfuseEnabled();

  return {
    getTraceAttributes: (props: Parameters<typeof getLangfuseTraceAttributes>[0]) =>
      enabled ? getLangfuseTraceAttributes(props) : {},
    getStepAttributes: (appId: string) => (enabled ? getLangfuseStepStartAttributes(appId) : {}),

    /** 写入有界节点输入输出；仅模型节点附加 generation 和 token 计量。 */
    recordStep({
      span,
      nodeType,
      input,
      output,
      response
    }: {
      span?: Span;
      nodeType: FlowNodeTypeEnum;
      input: unknown;
      output: unknown;
      response?: Pick<ChatHistoryItemResType, 'model' | 'inputTokens' | 'outputTokens'>;
    }) {
      if (!span || !enabled) return;
      const serializedInput = serializeLangfuseValue(input);
      const serializedOutput = serializeLangfuseValue(output ?? {});
      if (serializedInput !== undefined)
        span.setAttribute('langfuse.observation.input', serializedInput);
      if (serializedOutput !== undefined)
        span.setAttribute('langfuse.observation.output', serializedOutput);
      if (!llmNodeTypes.has(nodeType) || !response?.model) return;

      span.setAttribute('langfuse.observation.type', 'generation');
      span.setAttribute('langfuse.observation.model.name', String(response.model));
      const usage: Record<string, number> = {};
      if (response.inputTokens != null) usage.input = response.inputTokens;
      if (response.outputTokens != null) usage.output = response.outputTokens;
      if (Object.keys(usage).length)
        span.setAttribute('langfuse.observation.usage_details', JSON.stringify(usage));
    },

    /** 归一化最终回复并仅导出可见文本，不上传内部推理消息。 */
    recordOutput(span: Span, values: AIChatItemValueItemType[]) {
      if (!enabled) return;
      const output = serializeLangfuseValue(
        getLangfuseAssistantOutput(normalizeAIChatValue(values))
      );
      if (output !== undefined) span.setAttribute('langfuse.trace.output', output);
    }
  };
};
