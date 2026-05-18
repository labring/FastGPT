import { getLLMModel } from '../../../ai/model';
import { createLLMResponse } from '../../../ai/llm/request';
import { getLogger, LogCategories } from '../../../../common/logger';
import { normalizeImageToBase64 } from '../utils';

const logger = getLogger(LogCategories.MODULE.DATASET.DATA);

type ImageCaptionQueries = {
  model?: string;
  queries: string[];
  inputTokens: number;
  outputTokens: number;
};

const emptyImageCaptionQueries = (): ImageCaptionQueries => ({
  queries: [],
  inputTokens: 0,
  outputTokens: 0
});

/**
 * 将图片 query 转成可参与文本召回的图片描述 query。
 * VLM 未配置、模型不支持 vision 或单张图片生成失败时都只降级图片描述召回；
 * 原始图片仍可能继续走图片向量召回，所以这里不会抛出错误中断搜索。
 */
export const getImageCaptionQueries = async ({
  vlmModel,
  imageQueries
}: {
  vlmModel?: string;
  imageQueries: string[];
}): Promise<ImageCaptionQueries> => {
  if (!vlmModel || imageQueries.length === 0) {
    return emptyImageCaptionQueries();
  }

  const vlmModelData = getLLMModel(vlmModel);
  if (!vlmModelData?.vision) {
    return emptyImageCaptionQueries();
  }

  const results = await Promise.all(
    imageQueries.map(async (url, index) => {
      try {
        const {
          answerText,
          usage: { inputTokens, outputTokens }
        } = await createLLMResponse({
          body: {
            model: vlmModelData.model,
            temperature: 0.1,
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
          inputTokens,
          outputTokens
        };
      } catch (error) {
        logger.warn('Image caption generation failed during dataset search', {
          model: vlmModelData.model,
          imageIndex: index,
          error
        });

        return {
          query: '',
          inputTokens: 0,
          outputTokens: 0
        };
      }
    })
  );

  return {
    model: vlmModelData.model,
    queries: results.map((item) => item.query).filter(Boolean),
    inputTokens: results.reduce((sum, item) => sum + item.inputTokens, 0),
    outputTokens: results.reduce((sum, item) => sum + item.outputTokens, 0)
  };
};
