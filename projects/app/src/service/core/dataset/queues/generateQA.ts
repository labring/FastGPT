import type { ChatCompletionMessageParam } from '@fastgpt/global/core/ai/llm/type';
import { Prompt_AgentQA } from '@fastgpt/global/core/ai/prompt/agent';
import type { PushDataChunkType } from '@fastgpt/global/openapi/core/dataset/data/api';
import { replaceVariable } from '@fastgpt/service/common/string/replaceVariable';

import type { LLMModelDataType } from '@fastgpt/global/core/ai/model/schema';
import {
  chunkAutoChunkSize,
  getLLMMaxChunkSize
} from '@fastgpt/global/core/dataset/training/utils';
import { createLLMResponse } from '@fastgpt/service/core/ai/llm/request';
import { text2Chunks } from '@fastgpt/service/worker/function';

/** 将一个原文块转换为 QA 分块并返回模型用量。调用方在成功持久化分块后记账。 */
export async function generateDatasetQa({
  teamId,
  text,
  qaPrompt,
  model
}: {
  teamId: string;
  text: string;
  qaPrompt?: string;
  model: LLMModelDataType;
}) {
  const prompt = `${qaPrompt || Prompt_AgentQA.description}
  ${replaceVariable(Prompt_AgentQA.fixedText, { text })}`;
  const messages: ChatCompletionMessageParam[] = [{ role: 'user', content: prompt }];
  const { answerText, usage } = await createLLMResponse({
    teamId,
    saveLLMResponseRecord: false,
    body: { model, messages, stream: true }
  });

  const answer = answerText.replace(/\\n/g, '\n');
  const regex = /Q\d+:(\s*)(.*)(\s*)A\d+:(\s*)([\s\S]*?)(?=Q\d|$)/g; // 匹配Q和A的正则表达式
  const matches = answer.matchAll(regex); // 获取所有匹配到的结果

  const result: PushDataChunkType[] = []; // 存储最终的结果
  for (const match of matches) {
    const q = match[2] || '';
    const a = match[5] || '';
    if (q) {
      result.push({
        q,
        a
      });
    }
  }

  // empty result. direct split chunk
  if (result.length === 0) {
    const { chunks } = await text2Chunks({
      text,
      chunkSize: chunkAutoChunkSize,
      maxSize: getLLMMaxChunkSize(model)
    });
    chunks.forEach((chunk) => {
      result.push({
        q: chunk,
        a: ''
      });
    });
  }

  return { chunks: result, usage };
}
