import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import { countPromptTokens } from '../../../../common/string/tiktoken/index';

/**
 * 根据搜索模式分配每条召回链路的候选数量。
 * mixed 模式会让 embedding 与 full-text 都多取一批候选，再交给 RRF/权重融合；
 * 单一路径模式则关闭另一条召回，避免无意义查询。
 */
export const countRecallLimit = (searchMode: DatasetSearchModeEnum) => {
  if (searchMode === DatasetSearchModeEnum.embedding) {
    return {
      embeddingLimit: 100,
      fullTextLimit: 0
    };
  }

  if (searchMode === DatasetSearchModeEnum.fullTextRecall) {
    return {
      embeddingLimit: 0,
      fullTextLimit: 100
    };
  }

  return {
    embeddingLimit: 80,
    fullTextLimit: 60
  };
};

/**
 * 按模型上下文 token 上限截断最终引用列表。
 * 至少保留第一条结果：否则高质量但单条超长的命中会被全部过滤，导致用户看到
 * “无引用”，这比返回一条可裁剪引用更难排查。
 */
export const filterDatasetDataByMaxTokens = async (
  data: SearchDataResponseItemType[],
  maxTokens: number
) => {
  const tokensScoreFilter = await Promise.all(
    data.map(async (item) => ({
      ...item,
      tokens: await countPromptTokens(item.q + item.a)
    }))
  );

  const results: SearchDataResponseItemType[] = [];
  let totalTokens = 0;

  for await (const item of tokensScoreFilter) {
    results.push(item);

    totalTokens += item.tokens;

    if (totalTokens > maxTokens) {
      break;
    }
  }

  return results.length === 0 ? data.slice(0, 1) : results;
};
