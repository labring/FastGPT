import type {
  ChatCompletionCreateParams,
  ChatCompletionTool
} from '@fastgpt/global/core/ai/llm/type';
import { getLLMSupportParams } from '@fastgpt/global/core/ai/llm/utils';
import json5 from 'json5';
import { computedMaxToken, computedTemperature } from '../../utils';
import type { InferCompletionsBody, LLMRequestBodyType } from './types';
import type { LLMSystemModelDataType } from '@fastgpt/global/core/ai/model.schema';

const privateToolSchemaKeys = new Set([
  'toolDescription',
  'x-tool-description',
  'isToolParam',
  'isSecret'
]);

/**
 * 清理 FastGPT 内部工具参数扩展字段，避免 OpenAI-compatible SDK 转成 Gemini 等原生
 * function declaration 时，把 toolDescription 这类非供应商 schema 字段透传出去。
 */
const sanitizeToolParametersSchema = (schema: unknown): unknown => {
  if (Array.isArray(schema)) {
    return schema.map(sanitizeToolParametersSchema);
  }
  if (!schema || typeof schema !== 'object') {
    return schema;
  }

  return Object.fromEntries(
    Object.entries(schema as Record<string, unknown>)
      .filter(([key]) => !privateToolSchemaKeys.has(key))
      .map(([key, value]) => [key, sanitizeToolParametersSchema(value)])
  );
};

const sanitizeCompletionTools = (tools?: ChatCompletionTool[]): ChatCompletionTool[] | undefined =>
  tools?.map((tool) => ({
    ...tool,
    function: {
      ...tool.function,
      parameters: sanitizeToolParametersSchema(
        tool.function.parameters
      ) as ChatCompletionTool['function']['parameters']
    }
  }));

/**
 * 把 FastGPT 内部 LLM body 转成 OpenAI SDK 可请求的 completions body。
 *
 * 这个函数只做“请求体格式化”：
 * - 移除 FastGPT 内部字段。
 * - 应用模型配置中的真实 model/defaultConfig/fieldMap。
 * - 根据模型能力裁剪不支持的参数。
 * - prompt tool 模式下不把 tools 直接传给模型。
 */
export const llmCompletionsBodyFormat = async <T extends ChatCompletionCreateParams>(
  input: LLMRequestBodyType<T>
): Promise<{
  requestBody: InferCompletionsBody<T>;
  modelData: LLMSystemModelDataType;
}> => {
  // 内部模型对象只参与配置计算，不能进入后续请求字段映射的数据源。
  const {
    model: modelData,
    tools,
    tool_choice,
    parallel_tool_calls,
    toolCallMode,
    ...body
  } = input;
  const sanitizedTools = sanitizeCompletionTools(tools);
  // 这些字段只影响 FastGPT 自身逻辑，不能透传给模型供应商。
  delete body.retainDatasetCite;
  delete body.useVision;
  delete body.useAudio;
  delete body.useVideo;
  delete body.extractFiles;
  delete body.requestOrigin;

  const response_format = (() => {
    if (!body.response_format?.type) return undefined;
    if (body.response_format.type === 'json_schema') {
      try {
        // json_schema 从配置/接口传入时是字符串，真正请求前需要恢复为 JSON 对象。
        return {
          type: 'json_schema',
          json_schema: json5.parse(body.response_format?.json_schema as unknown as string)
        };
      } catch {
        throw new Error('Json schema error');
      }
    }
    if (body.response_format.type) {
      return {
        type: body.response_format.type
      };
    }
    return undefined;
  })();
  const stop = body.stop ?? undefined;

  const maxTokens = computedMaxToken({
    model: modelData,
    maxToken: body.max_tokens || undefined
  });

  const formatStop = stop?.split('|').filter((item) => !!item.trim());
  let requestBody = {
    ...body,
    max_tokens: maxTokens,
    model: modelData.model,
    temperature:
      typeof body.temperature === 'number'
        ? computedTemperature({
            model: modelData,
            temperature: body.temperature
          })
        : undefined,
    response_format,
    stop: formatStop?.length ? formatStop : undefined,
    // prompt tool 模式通过 prompt 描述工具，直接传 tools 会让部分模型同时触发两套协议。
    ...(toolCallMode === 'toolChoice' &&
      sanitizedTools?.length && {
        tools: sanitizedTools,
        tool_choice,
        parallel_tool_calls
      })
  } as unknown as T;

  requestBody = Object.fromEntries(
    Object.entries(requestBody).filter(([, value]) => value !== null && value !== undefined)
  ) as T;

  // 按模型能力删除不支持的字段，避免不同供应商因为未知参数直接报错。
  const supportParams = getLLMSupportParams(modelData);
  if (!supportParams.temperature) {
    delete requestBody.temperature;
  }
  if (!supportParams.topP) {
    delete requestBody.top_p;
  }
  if (!supportParams.stop) {
    delete requestBody.stop;
  }
  if (!supportParams.responseFormat) {
    delete requestBody.response_format;
  }
  if (!supportParams.reasoningEffort) {
    delete requestBody.reasoning_effort;
  }

  if (modelData.config.fieldMap) {
    // 从归一化且经过能力裁剪的快照取值；先统一移除源字段再写目标，
    // 让同名、交换及链式映射不受配置声明顺序影响，也不恢复已裁剪字段。
    const snapshot: Record<string, unknown> = { ...requestBody };
    const mappings = Object.entries(modelData.config.fieldMap).filter(([sourceKey]) =>
      Object.hasOwn(snapshot, sourceKey)
    );
    const sourceKeys = new Set(mappings.map(([sourceKey]) => sourceKey));
    const targetKeys = new Set<string>();
    for (const [, targetKey] of mappings) {
      if (targetKeys.has(targetKey)) {
        throw new Error(`Duplicate model fieldMap target: ${targetKey}`);
      }
      targetKeys.add(targetKey);
    }
    requestBody = Object.fromEntries([
      ...Object.entries(snapshot).filter(([key]) => !sourceKeys.has(key)),
      ...mappings.map(([sourceKey, targetKey]) => [targetKey, snapshot[sourceKey]])
    ]) as T;
  }

  // defaultConfig 作为模型配置的最终兜底，允许覆盖上面计算出的默认值。
  requestBody = {
    ...requestBody,
    ...modelData.config.defaultConfig
  };

  return {
    requestBody: requestBody as unknown as InferCompletionsBody<T>,
    modelData
  };
};
