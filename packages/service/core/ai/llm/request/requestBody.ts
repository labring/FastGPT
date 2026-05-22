import type { ChatCompletionCreateParams } from '@fastgpt/global/core/ai/llm/type';
import { getLLMSupportParams } from '@fastgpt/global/core/ai/llm/utils';
import json5 from 'json5';
import { computedMaxToken, computedTemperature } from '../../utils';
import { getLLMModel } from '../../model';
import type { InferCompletionsBody, LLMRequestBodyType } from './types';
import type { LLMModelItemType } from '@fastgpt/global/core/ai/model.schema';

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
  modelData: LLMModelItemType;
}> => {
  const { tools, tool_choice, parallel_tool_calls, toolCallMode, ...body } = input;
  // 这些字段只影响 FastGPT 自身逻辑，不能透传给模型供应商。
  delete body.retainDatasetCite;
  delete body.useVision;
  delete body.useAudio;
  delete body.useVideo;
  delete body.extractFiles;
  delete body.requestOrigin;

  const modelData = getLLMModel(body.model);
  if (!modelData) {
    // 保持旧行为：模型不存在时仍返回清理后的 body，由上层决定如何报错。
    return {
      requestBody: body as unknown as InferCompletionsBody<T>,
      modelData
    };
  }

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
      tools?.length && {
        tools,
        tool_choice,
        parallel_tool_calls
      })
  } as T;

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

  if (modelData.fieldMap) {
    Object.entries(modelData.fieldMap).forEach(([sourceKey, targetKey]) => {
      // 部分兼容模型使用非 OpenAI 字段名，通过 fieldMap 在最后一层做字段替换。
      // @ts-ignore
      requestBody[targetKey] = body[sourceKey];
      // @ts-ignore
      delete requestBody[sourceKey];
    });
  }

  // defaultConfig 作为模型配置的最终兜底，允许覆盖上面计算出的默认值。
  requestBody = {
    ...requestBody,
    ...modelData?.defaultConfig
  };

  return {
    requestBody: requestBody as unknown as InferCompletionsBody<T>,
    modelData
  };
};
