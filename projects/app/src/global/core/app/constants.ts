import { AppSimpleEditConfigTemplateType } from '@fastgpt/global/core/app/type.d';

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
    dataset: {
      datasets: true,
      similarity: true,
      limit: true,
      rerank: true,
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
