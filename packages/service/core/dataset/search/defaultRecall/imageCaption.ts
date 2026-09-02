import { createLLMResponse } from '../../../ai/llm/request';
import { getLogger, LogCategories } from '../../../../common/logger';
import { normalizeImageToBase64 } from '../utils';
import type { OpenaiAccountType } from '@fastgpt/global/support/user/team/type';
import type { LLMSystemModelDataType } from '@fastgpt/global/core/ai/model.schema';

const logger = getLogger(LogCategories.MODULE.DATASET.DATA);

type ImageCaptionQueries = {
  model?: string;
  queries: string[];
  requestIds: string[];
  inputTokens: number;
  outputTokens: number;
  seconds: number;
  usedUserOpenAIKey: boolean;
};

const emptyImageCaptionQueries = (): ImageCaptionQueries => ({
  queries: [],
  requestIds: [],
  inputTokens: 0,
  outputTokens: 0,
  seconds: 0,
  usedUserOpenAIKey: false
});

/**
 * 将图片 query 转成可参与文本召回的图片描述 query。
 * VLM 未配置或单张图片生成失败时只降级图片描述召回；显式配置的 VLM 不存在时由
 * 模型解析层抛出“模型不存在”，不能静默切换到其他模型。
 * 原始图片仍可能继续走图片向量召回，所以这里不会抛出错误中断搜索。
 */
export const getImageCaptionQueries = async ({
  vlmModel,
  imageQueries,
  userKey,
  teamId
}: {
  vlmModel?: LLMSystemModelDataType;
  imageQueries: string[];
  userKey?: OpenaiAccountType;
  teamId: string;
}): Promise<ImageCaptionQueries> => {
  if (!vlmModel || imageQueries.length === 0) {
    return emptyImageCaptionQueries();
  }

  const vlmModelData = vlmModel;

  const results = await Promise.all(
    imageQueries.map(async (url, index) => {
      try {
        const llmStartTime = Date.now();
        const {
          answerText,
          requestId,
          usage: { inputTokens, outputTokens, usedUserOpenAIKey }
        } = await createLLMResponse({
          userKey,
          teamId,
          saveLLMResponseRecord: false,
          body: {
            model: vlmModelData,
            stream: true,
            useVision: true,
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'image_url',
                    image_url: {
                      url: await normalizeImageToBase64(url)
                    }
                  },
                  {
                    type: 'text',
                    text: '请用一句话描述这张图片的主体、场景、颜色、文字和关键视觉特征。只输出描述，不要解释。'
                  }
                ]
              }
            ] as any
          }
        });

        return {
          query: answerText.trim(),
          requestId,
          inputTokens,
          outputTokens,
          seconds: +((Date.now() - llmStartTime) / 1000).toFixed(2),
          usedUserOpenAIKey
        };
      } catch (error) {
        logger.warn('Image caption generation failed during dataset search', {
          model: vlmModelData.model,
          imageIndex: index,
          error
        });

        return {
          query: '',
          requestId: '',
          inputTokens: 0,
          outputTokens: 0,
          seconds: 0,
          usedUserOpenAIKey: false
        };
      }
    })
  );
  const validResults = results.filter((item) => item.query);
  const billableResults = results.filter((item) => item.inputTokens > 0 || item.outputTokens > 0);

  return {
    model: vlmModelData.model,
    queries: validResults.map((item) => item.query),
    requestIds: results.map((item) => item.requestId).filter(Boolean),
    inputTokens: results.reduce((sum, item) => sum + item.inputTokens, 0),
    outputTokens: results.reduce((sum, item) => sum + item.outputTokens, 0),
    seconds: results.reduce((sum, item) => sum + item.seconds, 0),
    usedUserOpenAIKey:
      billableResults.length > 0 && billableResults.every((item) => item.usedUserOpenAIKey)
  };
};
