import type {
  AIChatItemValueItemType,
  ChatHistoryItemResType
} from '@fastgpt/global/core/chat/type';
import { normalizeAIChatValue } from '@fastgpt/global/core/chat/adapt';
import { FlowNodeTypeEnum } from '@fastgpt/global/core/workflow/node/constant';
import { isLangfuseEnabled, prepareLangfuseSpan, setActiveLangfuseAttributes } from './index';
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

type WorkflowLifecycleProps = {
  isRootRuntime: boolean;
  mode: string;
};

const isRootChatWorkflow = ({ isRootRuntime, mode }: WorkflowLifecycleProps) =>
  isRootRuntime && mode === 'chat';

/** 在 Langfuse 私有上下文中启动根工作流，不把业务数据写入通用 OTEL span。 */
export const onWorkflowStart = ({
  isRootRuntime,
  mode,
  ...traceProps
}: WorkflowLifecycleProps & Parameters<typeof getLangfuseTraceAttributes>[0]) => {
  const enabled = isRootChatWorkflow({ isRootRuntime, mode }) && isLangfuseEnabled();
  prepareLangfuseSpan(enabled ? getLangfuseTraceAttributes(traceProps) : undefined);
};

/** 记录工作流最终可见回复，不上传内部推理消息。 */
export const onWorkflowEnd = ({
  output,
  ...lifecycleProps
}: WorkflowLifecycleProps & {
  output: AIChatItemValueItemType[];
}) => {
  if (!isRootChatWorkflow(lifecycleProps) || !isLangfuseEnabled()) return;
  const serializedOutput = serializeLangfuseValue(
    getLangfuseAssistantOutput(normalizeAIChatValue(output))
  );
  if (serializedOutput !== undefined) {
    setActiveLangfuseAttributes({ 'langfuse.trace.output': serializedOutput });
  }
};

/** 在 Langfuse 私有上下文中启动节点，不把 observation 标记写入通用 OTEL span。 */
export const onWorkflowNodeStart = ({
  appId,
  ...lifecycleProps
}: WorkflowLifecycleProps & { appId: string }) => {
  const enabled = isRootChatWorkflow(lifecycleProps) && isLangfuseEnabled();
  prepareLangfuseSpan(enabled ? getLangfuseStepStartAttributes(appId) : undefined);
};

/** 记录有界节点输入输出；仅模型节点附加 generation 和 token 计量。 */
export const onWorkflowNodeEnd = ({
  nodeType,
  input,
  output,
  response,
  ...lifecycleProps
}: WorkflowLifecycleProps & {
  nodeType: FlowNodeTypeEnum;
  input: unknown;
  output: unknown;
  response?: Pick<ChatHistoryItemResType, 'model' | 'inputTokens' | 'outputTokens'>;
}) => {
  if (!isRootChatWorkflow(lifecycleProps) || !isLangfuseEnabled()) return;

  const serializedInput = serializeLangfuseValue(input);
  const serializedOutput = serializeLangfuseValue(output ?? {});
  const attributes: Record<string, string> = {};
  if (serializedInput !== undefined) {
    attributes['langfuse.observation.input'] = serializedInput;
  }
  if (serializedOutput !== undefined) {
    attributes['langfuse.observation.output'] = serializedOutput;
  }
  if (llmNodeTypes.has(nodeType) && response?.model) {
    attributes['langfuse.observation.type'] = 'generation';
    attributes['langfuse.observation.model.name'] = String(response.model);
    const usage: Record<string, number> = {};
    if (response.inputTokens != null) usage.input = response.inputTokens;
    if (response.outputTokens != null) usage.output = response.outputTokens;
    if (Object.keys(usage).length) {
      attributes['langfuse.observation.usage_details'] = JSON.stringify(usage);
    }
  }
  setActiveLangfuseAttributes(attributes);
};
