import { i18nT } from '../../../web/i18n/utils';

export type ModelProviderIdType =
  | 'OpenAI'
  | 'Claude'
  | 'Gemini'
  | 'Meta'
  | 'MistralAI'
  | 'Groq'
  | 'Grok'
  | 'Jina'
  | 'AliCloud'
  | 'Qwen'
  | 'Doubao'
  | 'DeepSeek'
  | 'ChatGLM'
  | 'Ernie'
  | 'Moonshot'
  | 'MiniMax'
  | 'SparkDesk'
  | 'Hunyuan'
  | 'Baichuan'
  | 'StepFun'
  | 'ai360'
  | 'Yi'
  | 'Siliconflow'
  | 'PPIO'
  | 'OpenRouter'
  | 'Ollama'
  | 'novita'
  | 'vertexai'
  | 'BAAI'
  | 'FishAudio'
  | 'Intern'
  | 'Moka'
  | 'Jina'
  | 'Other';

export type ModelProviderType = {
  id: ModelProviderIdType;
  name: any;
  avatar: string;
};

export const ModelProviderList: ModelProviderType[] = [
  {
    id: 'OpenAI',
    name: 'OpenAI',
    avatar: 'model/openai'
  },
  {
    id: 'Claude',
    name: 'Claude',
    avatar: 'model/claude'
  },
  {
    id: 'Gemini',
    name: 'Gemini',
    avatar: 'model/gemini'
  },
  {
    id: 'Meta',
    name: 'Meta',
    avatar: 'model/meta'
  },
  {
    id: 'MistralAI',
    name: 'MistralAI',
    avatar: 'model/mistral'
  },
  {
    id: 'Grok',
    name: 'Grok',
    avatar: 'model/grok'
  },
  {
    id: 'Groq',
    name: 'Groq',
    avatar: 'model/groq'
  },
  {
    id: 'Jina',
    name: 'Jina',
    avatar: 'model/jina'
  },
  {
    id: 'Qwen',
    name: i18nT('common:model_qwen'),
    avatar: 'model/qwen'
  },
  {
    id: 'Doubao',
    name: i18nT('common:model_doubao'),
    avatar: 'model/doubao'
  },
  {
    id: 'DeepSeek',
    name: 'DeepSeek',
    avatar: 'model/deepseek'
  },
  {
    id: 'ChatGLM',
    name: i18nT('common:model_chatglm'),
    avatar: 'model/chatglm'
  },
  {
    id: 'Ernie',
    name: i18nT('common:model_ernie'),
    avatar: 'model/ernie'
  },
  {
    id: 'Moonshot',
    name: i18nT('common:model_moonshot'),
    avatar: 'model/moonshot'
  },
  {
    id: 'MiniMax',
    name: 'MiniMax',
    avatar: 'model/minimax'
  },
  {
    id: 'SparkDesk',
    name: i18nT('common:model_sparkdesk'),
    avatar: 'model/sparkDesk'
  },
  {
    id: 'Hunyuan',
    name: i18nT('common:model_hunyuan'),
    avatar: 'model/hunyuan'
  },
  {
    id: 'Baichuan',
    name: i18nT('common:model_baichuan'),
    avatar: 'model/baichuan'
  },
  {
    id: 'StepFun',
    name: i18nT('common:model_stepfun'),
    avatar: 'model/stepfun'
  },
  {
    id: 'ai360',
    name: '360 AI',
    avatar: 'model/ai360'
  },
  {
    id: 'Yi',
    name: i18nT('common:model_yi'),
    avatar: 'model/yi'
  },
  {
    id: 'BAAI',
    name: i18nT('common:model_baai'),
    avatar: 'model/BAAI'
  },
  {
    id: 'FishAudio',
    name: 'FishAudio',
    avatar: 'model/fishaudio'
  },
  {
    id: 'Intern',
    name: i18nT('common:model_intern'),
    avatar: 'model/intern'
  },
  {
    id: 'Moka',
    name: i18nT('common:model_moka'),
    avatar: 'model/moka'
  },
  {
    id: 'Ollama',
    name: 'Ollama',
    avatar: 'model/ollama'
  },
  {
    id: 'OpenRouter',
    name: 'OpenRouter',
    avatar: 'model/openrouter'
  },
  {
    id: 'vertexai',
    name: 'vertexai',
    avatar: 'model/vertexai'
  },
  {
    id: 'novita',
    name: 'novita',
    avatar: 'model/novita'
  },
  {
    id: 'Jina',
    name: 'Jina',
    avatar: 'model/jina'
  },
  {
    id: 'AliCloud',
    name: i18nT('common:model_alicloud'),
    avatar: 'model/alicloud'
  },
  {
    id: 'Siliconflow',
    name: i18nT('common:model_siliconflow'),
    avatar: 'model/siliconflow'
  },
  {
    id: 'PPIO',
    name: i18nT('common:model_ppio'),
    avatar: 'model/ppio'
  },
  {
    id: 'Other',
    name: i18nT('common:model_other'),
    avatar: 'model/huggingface'
  }
];
export const ModelProviderMap = Object.fromEntries(
  ModelProviderList.map((item, index) => [item.id, { ...item, order: index }])
);

export const getModelProvider = (provider?: ModelProviderIdType) => {
  if (!provider) return ModelProviderMap.Other;
  return ModelProviderMap[provider] ?? ModelProviderMap.Other;
};
