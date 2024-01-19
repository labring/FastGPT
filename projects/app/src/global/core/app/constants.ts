import { AppSimpleEditConfigTemplateType } from '@fastgpt/global/core/app/type.d';
import { DatasetSearchModeEnum } from '@fastgpt/global/core/dataset/constants';

export const SimpleModeTemplate_FastGPT_Universal: AppSimpleEditConfigTemplateType = {
  id: 'fastgpt-universal',
  name: 'core.app.template.Common template',
  desc: 'core.app.template.Common template tip',
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
