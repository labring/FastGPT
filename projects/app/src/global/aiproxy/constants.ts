import { type ModelProviderIdType } from '@fastgpt/global/core/ai/provider';
import { type ChannelInfoType } from './type';
import { i18nT } from '@fastgpt/web/i18n/utils';

export enum ChannelStatusEnum {
  ChannelStatusUnknown = 0,
  ChannelStatusEnabled = 1,
  ChannelStatusDisabled = 2,
  ChannelStatusAutoDisabled = 3
}
export const ChannelStautsMap = {
  [ChannelStatusEnum.ChannelStatusUnknown]: {
    label: i18nT('account_model:channel_status_unknown'),
    colorSchema: 'gray'
  },
  [ChannelStatusEnum.ChannelStatusEnabled]: {
    label: i18nT('account_model:channel_status_enabled'),
    colorSchema: 'green'
  },
  [ChannelStatusEnum.ChannelStatusDisabled]: {
    label: i18nT('account_model:channel_status_disabled'),
    colorSchema: 'red'
  },
  [ChannelStatusEnum.ChannelStatusAutoDisabled]: {
    label: i18nT('account_model:channel_status_auto_disabled'),
    colorSchema: 'gray'
  }
};

export const defaultChannel: ChannelInfoType = {
  id: 0,
  status: ChannelStatusEnum.ChannelStatusEnabled,
  type: 1,
  created_at: 0,
  models: [],
  model_mapping: {},
  key: '',
  name: '',
  base_url: '',
  priority: 0
};

export const aiproxyIdMap: Record<
  number,
  { label: string; provider: ModelProviderIdType; avatar?: string }
> = {
  1: {
    label: 'OpenAI',
    provider: 'OpenAI'
  },
  3: {
    avatar: 'model/azure',
    label: i18nT('account_model:azure'),
    provider: 'OpenAI'
  },
  4: {
    avatar: 'model/azure',
    label: `azure (model name support contain '.')`,
    provider: 'Other'
  },
  14: {
    label: 'Anthropic',
    provider: 'Claude'
  },
  12: {
    label: 'Google Gemini(OpenAI)',
    provider: 'Gemini'
  },
  24: {
    label: 'Google Gemini',
    provider: 'Gemini'
  },
  28: {
    label: 'Mistral AI',
    provider: 'MistralAI'
  },
  29: {
    label: 'Groq',
    provider: 'Groq'
  },
  17: {
    label: '阿里云',
    provider: 'Qwen'
  },
  40: {
    label: '豆包',
    provider: 'Doubao'
  },
  36: {
    label: 'DeepSeek AI',
    provider: 'DeepSeek'
  },
  13: {
    label: '百度智能云 V2',
    provider: 'Ernie'
  },
  15: {
    label: '百度智能云',
    provider: 'Ernie'
  },
  16: {
    label: '智谱 AI',
    provider: 'ChatGLM'
  },
  18: {
    label: '讯飞星火',
    provider: 'SparkDesk'
  },
  25: {
    label: '月之暗面',
    provider: 'Moonshot'
  },
  26: {
    label: '百川智能',
    provider: 'Baichuan'
  },
  27: {
    label: 'MiniMax',
    provider: 'MiniMax'
  },
  31: {
    label: '零一万物',
    provider: 'Yi'
  },
  32: {
    label: '阶跃星辰',
    provider: 'StepFun'
  },
  43: {
    label: 'SiliconFlow',
    provider: 'Siliconflow'
  },
  30: {
    label: 'Ollama',
    provider: 'Ollama'
  },
  23: {
    label: i18nT('account_model:Hunyuan'),
    provider: 'Hunyuan'
  },
  44: {
    label: 'doubao audio',
    provider: 'Doubao'
  },
  33: {
    label: 'AWS',
    provider: 'Other',
    avatar: 'model/aws'
  },
  35: {
    label: 'Cohere',
    provider: 'Other',
    avatar: 'model/cohere'
  },
  37: {
    label: 'Cloudflare',
    provider: 'Other',
    avatar: 'model/cloudflare'
  },
  20: {
    label: 'OpenRouter',
    provider: 'OpenRouter'
  },
  47: {
    label: 'JinaAI',
    provider: 'Jina'
  },
  19: {
    label: 'ai360',
    provider: 'ai360'
  },
  42: {
    label: 'vertexai',
    provider: 'vertexai'
  },
  41: {
    label: 'novita',
    provider: 'novita'
  },
  45: {
    label: 'Grok',
    provider: 'Grok'
  },
  46: {
    label: 'Doc2x',
    provider: 'Other',
    avatar: 'plugins/doc2x'
  },
  34: {
    label: 'Coze',
    provider: 'Other',
    avatar: 'model/coze'
  }
};
