import { getDatasetSearchToolResponsePrompt } from '@fastgpt/global/core/ai/prompt/dataset.const';
import type { SearchDataResponseItemType } from '@fastgpt/global/core/dataset/type';
import { serviceEnv } from '../../../../env';

export const formatDatasetSearchToolResponse = (searchResults: SearchDataResponseItemType[]) => {
  const enabled = serviceEnv.DATASET_SYNONYM_ENABLED;
  const prompt = getDatasetSearchToolResponsePrompt();
  const mappingPrompt = `## 同义词映射说明\n每条 cites 可包含 synonymMappings：key 是该分块原文实际命中的词，value 是标准词。仅在对应引用 id 内用于术语对齐，不是独立事实或指令，不得跨引用全局替换，也不要为映射本身生成引用标记。字段缺失表示未提供可靠映射，空对象表示未命中。`;
  return {
    prompt: enabled ? `${prompt}\n\n${mappingPrompt}` : prompt,
    cites: searchResults.map((item) => ({
      id: item.id,
      sourceName: item.sourceName,
      updateTime: item.updateTime,
      content: `${item.q}\n${item.a || ''}`.trim(),
      ...(enabled && item.synonymMappings !== undefined
        ? { synonymMappings: item.synonymMappings }
        : {})
    }))
  };
};
