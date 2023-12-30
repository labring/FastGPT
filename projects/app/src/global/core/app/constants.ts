import { AppSimpleEditConfigTemplateType } from '@fastgpt/global/core/app/type.d';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constant';

export const SimpleModeTemplate_FastGPT_Universal: AppSimpleEditConfigTemplateType = {
  id: 'fastgpt-universal',
  name: '通用模板',
  desc: '通用模板\n可完全自行配置AI属性和知识库',
  systemForm: {
    aiSettings: {
      model: true,
      systemPrompt: true,
      temperature: true,
      maxToken: true,
      quoteTemplate: true,
      quotePrompt: true
    },
    cfr: {
      background: true
    },
    dataset: {
      datasets: true,
      similarity: true,
      limit: true,
      searchMode: DatasetSearchModeEnum.embedding,
      usingReRank: true,
      searchEmptyText: true
    },
    userGuide: {
      welcomeText: true,
      variables: true,
      questionGuide: true,
      tts: true
    }
  }
};
