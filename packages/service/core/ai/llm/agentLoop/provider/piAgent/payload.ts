import json5 from 'json5';
import { getLLMSupportParams } from '@fastgpt/global/core/ai/llm/utils';
import { getLLMModel } from '../../../../model';
import { computedMaxToken, computedTemperature } from '../../../../utils';
import type { AgentLoopRuntime } from '../../domain';

const normalizeResponseFormat = (
  responseFormat?: AgentLoopRuntime['llmParams']['responseFormat']
) => {
  if (!responseFormat?.type) return undefined;
  if (responseFormat.type !== 'json_schema') {
    return { type: responseFormat.type };
  }

  try {
    return {
      type: 'json_schema',
      json_schema:
        typeof responseFormat.json_schema === 'string'
          ? json5.parse(responseFormat.json_schema)
          : responseFormat.json_schema
    };
  } catch {
    throw new Error('Json schema error');
  }
};

/** 将统一模型参数按模型能力映射到 pi-agent-core 发出的底层请求 payload。 */
export const mergePiAgentPayload = <TChildrenResponse = unknown>({
  payload,
  runtime
}: {
  payload: unknown;
  runtime: AgentLoopRuntime<TChildrenResponse>;
}) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;

  const modelData = getLLMModel(runtime.llmParams.model);
  const supportParams = getLLMSupportParams(modelData);
  const responseFormat = supportParams.responseFormat
    ? normalizeResponseFormat(runtime.llmParams.responseFormat)
    : undefined;
  const stop = supportParams.stop
    ? runtime.llmParams.stop?.split('|').filter((item) => !!item.trim())
    : undefined;
  const maxTokens =
    typeof runtime.llmParams.maxTokens === 'number'
      ? computedMaxToken({ model: modelData, maxToken: runtime.llmParams.maxTokens })
      : undefined;
  const temperature =
    supportParams.temperature && typeof runtime.llmParams.temperature === 'number'
      ? computedTemperature({
          model: modelData,
          temperature: runtime.llmParams.temperature
        })
      : undefined;

  return {
    ...payload,
    ...(typeof maxTokens === 'number' ? { max_tokens: maxTokens } : {}),
    ...(typeof temperature === 'number' ? { temperature } : {}),
    ...(supportParams.topP && typeof runtime.llmParams.topP === 'number'
      ? { top_p: runtime.llmParams.topP }
      : {}),
    ...(stop?.length ? { stop } : {}),
    ...(responseFormat ? { response_format: responseFormat } : {})
  };
};
